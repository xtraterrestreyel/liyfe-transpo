// Liyfe Transpo API — deploy on Render (see README.md)
import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { AGREEMENT_TEXT, AGREEMENT_VERSION, COMPANY_LEGAL_NAME } from './agreement.js';
import { calculateFee, PRICING } from './pricing.js';
import { drivingMiles, autocomplete, PublicError } from './maps.js';

const env = process.env;
const REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 'GOOGLE_MAPS_SERVER_KEY', 'FRONTEND_URL', 'ADMIN_EMAILS',
];
const missing = REQUIRED.filter((k) => !env[k]);
if (missing.length) console.warn('⚠ Missing environment variables:', missing.join(', '));

const supabase = createClient(env.SUPABASE_URL || 'http://localhost:54321', env.SUPABASE_SERVICE_ROLE_KEY || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stripe = new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_missing');

const FRONTEND_ORIGINS = (env.FRONTEND_URL || 'http://localhost:5500')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const FRONTEND_BASE = FRONTEND_ORIGINS[0];
const ADMIN_EMAILS = (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const AGREEMENT_SHA256 = crypto.createHash('sha256').update(AGREEMENT_TEXT).digest('hex');

const ORDER_STATUSES = ['pending_payment', 'paid', 'pharmacy_confirmed', 'picked_up', 'out_for_delivery', 'delivered', 'issue', 'canceled'];
const COPAY_OPTIONS = ['no_copay', 'prepaid', 'need_help'];

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy; needed for real client IPs
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || FRONTEND_ORIGINS.includes(origin)),
}));

// ---------------------------------------------------------------------
// Stripe webhook (must read the raw body, so it comes before express.json)
// ---------------------------------------------------------------------
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (orderId && session.payment_status === 'paid') {
        await supabase.from('orders')
          .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: session.payment_intent })
          .eq('id', orderId)
          .eq('status', 'pending_payment');
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handling failed:', err.message);
    res.status(500).json({ error: 'webhook handling failed' });
  }
});

app.use(express.json({ limit: '50kb' }));

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function cleanText(value, max, { required = false, label = 'This field' } = {}) {
  const v = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (required && !v) throw new PublicError(`${label} is required.`);
  if (v.length > max) throw new PublicError(`${label} is too long (max ${max} characters).`);
  return v || null;
}

function normalizeName(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Your session expired. Please sign in again.' });
    req.user = data.user;
    next();
  } catch (err) {
    next(err);
  }
}

const isAdmin = (user) => ADMIN_EMAILS.includes((user?.email || '').toLowerCase());

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: 'Staff access only.' });
  next();
}

async function getProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getActiveAuthorization(userId) {
  const { data, error } = await supabase.from('authorizations')
    .select('*').eq('user_id', userId).is('revoked_at', null)
    .order('signed_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function profileComplete(p) {
  return Boolean(p && p.full_name && p.date_of_birth && p.phone && p.address_line1 && p.city && p.state && p.zip);
}

async function createCheckout(order, email) {
  const tierWord = order.tiers === 1 ? 'tier' : 'tiers';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: email || undefined,
    client_reference_id: order.id,
    metadata: { order_id: order.id }, // no health information goes to Stripe
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: order.delivery_fee_cents,
          product_data: { name: `Delivery LT-${order.order_number} (${order.miles} mi · ${order.tiers} ${tierWord})` },
        },
      },
      ...(order.service_fee_cents > 0 ? [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: order.service_fee_cents,
          product_data: { name: 'Service fee' },
        },
      }] : []),
    ],
    success_url: `${FRONTEND_BASE}/app.html?paid=1&order=${order.order_number}`,
    cancel_url: `${FRONTEND_BASE}/app.html?canceled=1&order=${order.order_number}`,
  });
  await supabase.from('orders').update({ stripe_session_id: session.id }).eq('id', order.id);
  return session.url;
}

// ---------------------------------------------------------------------
// Rate limits for public endpoints
// ---------------------------------------------------------------------
const quoteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false });
const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const placesLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });

// ---------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------
app.get('/', (req, res) => res.json({ service: 'Liyfe Transpo API', ok: true }));
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/config', (req, res) => {
  res.json({
    company: COMPANY_LEGAL_NAME,
    pricing: PRICING,
    agreementVersion: AGREEMENT_VERSION,
  });
});

app.get('/api/agreement', (req, res) => {
  res.json({ version: AGREEMENT_VERSION, sha256: AGREEMENT_SHA256, text: AGREEMENT_TEXT });
});

app.post('/api/quote', quoteLimiter, wrap(async (req, res) => {
  const pickup = cleanText(req.body?.pickup_address, 250, { required: true, label: 'Pharmacy address' });
  const dropoff = cleanText(req.body?.delivery_address, 250, { required: true, label: 'Delivery address' });
  const miles = await drivingMiles(pickup, dropoff);
  res.json(calculateFee(miles));
}));

app.get('/api/public/pharmacies', wrap(async (req, res) => {
  const { data, error } = await supabase.from('pharmacies')
    .select('id,name,address,phone').eq('listed', true).order('name');
  if (error) throw error;
  res.json({ pharmacies: data || [] });
}));

app.post('/api/pharmacy-inquiries', formLimiter, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot field — bots fill it, people don't see it
  const row = {
    pharmacy_name: cleanText(b.pharmacy_name, 150, { required: true, label: 'Pharmacy name' }),
    contact_name: cleanText(b.contact_name, 120),
    email: cleanText(b.email, 200),
    phone: cleanText(b.phone, 40),
    message: cleanText(b.message, 2000),
  };
  if (!row.email && !row.phone) throw new PublicError('Please leave an email or phone number so we can reach you.');
  const { error } = await supabase.from('pharmacy_inquiries').insert(row);
  if (error) throw error;
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------
// Signed-in customer routes
// ---------------------------------------------------------------------
app.get('/api/places', placesLimiter, requireUser, wrap(async (req, res) => {
  const q = cleanText(req.query.q, 120) || '';
  if (q.length < 3) return res.json({ suggestions: [] });
  const kind = req.query.kind === 'pharmacy' ? 'pharmacy' : 'address';
  res.json({ suggestions: await autocomplete(q, kind) });
}));

app.get('/api/me', requireUser, wrap(async (req, res) => {
  const [profile, authorization] = await Promise.all([
    getProfile(req.user.id),
    getActiveAuthorization(req.user.id),
  ]);
  res.json({
    email: req.user.email,
    profile,
    profileComplete: profileComplete(profile),
    authorization,
    authorizationCurrent: Boolean(authorization && authorization.agreement_version === AGREEMENT_VERSION),
    isAdmin: isAdmin(req.user),
  });
}));

app.post('/api/authorizations', requireUser, wrap(async (req, res) => {
  const profile = await getProfile(req.user.id);
  if (!profileComplete(profile)) throw new PublicError('Please finish your personal information first.');
  if (req.body?.agree !== true) throw new PublicError('Please check the box to agree.');
  const signature = cleanText(req.body?.signature_name, 120, { required: true, label: 'Signature' });
  if (normalizeName(signature) !== normalizeName(profile.full_name)) {
    throw new PublicError(`Please type your full legal name exactly as entered: ${profile.full_name}`);
  }

  // Signing again replaces any earlier authorization
  await supabase.from('authorizations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', req.user.id).is('revoked_at', null);

  const { data, error } = await supabase.from('authorizations').insert({
    user_id: req.user.id,
    signature_name: signature,
    agreement_version: AGREEMENT_VERSION,
    agreement_sha256: AGREEMENT_SHA256,
    ip_address: req.ip,
    user_agent: (req.headers['user-agent'] || '').slice(0, 300),
  }).select().single();
  if (error) throw error;
  res.json({ authorization: data });
}));

app.post('/api/authorizations/revoke', requireUser, wrap(async (req, res) => {
  const { error } = await supabase.from('authorizations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', req.user.id).is('revoked_at', null);
  if (error) throw error;
  res.json({ ok: true });
}));

app.post('/api/orders', requireUser, wrap(async (req, res) => {
  const b = req.body || {};
  const profile = await getProfile(req.user.id);
  if (!profileComplete(profile)) throw new PublicError('Please finish your personal information first.');
  const auth = await getActiveAuthorization(req.user.id);
  if (!auth || auth.agreement_version !== AGREEMENT_VERSION) {
    throw new PublicError('Please sign the pickup authorization before placing an order.');
  }

  const copay = COPAY_OPTIONS.includes(b.copay_option) ? b.copay_option : null;
  if (!copay) throw new PublicError('Please tell us how the pharmacy copay is handled.');

  const order = {
    user_id: req.user.id,
    authorization_id: auth.id,
    pharmacy_name: cleanText(b.pharmacy_name, 150, { required: true, label: 'Pharmacy name' }),
    pharmacy_address: cleanText(b.pharmacy_address, 250, { required: true, label: 'Pharmacy address' }),
    pharmacy_phone: cleanText(b.pharmacy_phone, 40),
    rx_numbers: cleanText(b.rx_numbers, 300),
    rx_ready: b.rx_ready === true,
    controlled_substance: b.controlled_substance === true,
    copay_option: copay,
    delivery_address: cleanText(b.delivery_address, 250, { required: true, label: 'Delivery address' }),
    delivery_instructions: cleanText(b.delivery_instructions, 500),
  };

  // Price is always calculated here on the server — never trusted from the browser
  const fee = calculateFee(await drivingMiles(order.pharmacy_address, order.delivery_address));
  if (!fee.inArea) {
    throw new PublicError(`That delivery is ${fee.miles} miles away. We currently deliver up to ${fee.maxMiles} miles from the pharmacy. Call us and we'll see what we can do.`);
  }
  Object.assign(order, {
    miles: fee.miles,
    tiers: fee.tiers,
    delivery_fee_cents: fee.deliveryFeeCents,
    service_fee_cents: fee.serviceFeeCents,
    total_cents: fee.totalCents,
  });

  const { data: saved, error } = await supabase.from('orders').insert(order).select().single();
  if (error) throw error;
  const checkoutUrl = await createCheckout(saved, req.user.email);
  res.json({ order: saved, checkout_url: checkoutUrl });
}));

app.post('/api/orders/:id/pay', requireUser, wrap(async (req, res) => {
  const { data: order, error } = await supabase.from('orders')
    .select('*').eq('id', req.params.id).eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;
  if (!order) throw new PublicError('Order not found.', 404);
  if (order.status !== 'pending_payment') throw new PublicError('This order has already been paid or closed.');
  res.json({ checkout_url: await createCheckout(order, req.user.email) });
}));

app.post('/api/orders/:id/cancel', requireUser, wrap(async (req, res) => {
  const { data, error } = await supabase.from('orders')
    .update({ status: 'canceled' })
    .eq('id', req.params.id).eq('user_id', req.user.id).eq('status', 'pending_payment')
    .select().maybeSingle();
  if (error) throw error;
  if (!data) throw new PublicError('Only unpaid orders can be canceled here. For paid orders, please call us.');
  res.json({ order: data });
}));

// ---------------------------------------------------------------------
// Staff routes (emails listed in ADMIN_EMAILS)
// ---------------------------------------------------------------------
app.get('/api/admin/orders', requireUser, requireAdmin, wrap(async (req, res) => {
  let query = supabase.from('orders')
    .select('*, profile:profiles(full_name,date_of_birth,phone,email)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (req.query.status === 'active') {
    query = query.in('status', ['paid', 'pharmacy_confirmed', 'picked_up', 'out_for_delivery', 'issue']);
  } else if (ORDER_STATUSES.includes(req.query.status)) {
    query = query.eq('status', req.query.status);
  }
  const { data, error } = await query;
  if (error) throw error;
  res.json({ orders: data || [] });
}));

app.patch('/api/admin/orders/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const update = {};
  if (req.body?.status !== undefined) {
    if (!ORDER_STATUSES.includes(req.body.status)) throw new PublicError('Unknown status.');
    update.status = req.body.status;
    if (req.body.status === 'delivered') update.delivered_at = new Date().toISOString();
  }
  if (req.body?.staff_notes !== undefined) update.staff_notes = cleanText(req.body.staff_notes, 2000);
  if (!Object.keys(update).length) throw new PublicError('Nothing to update.');
  const { data, error } = await supabase.from('orders').update(update).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json({ order: data });
}));

app.get('/api/admin/stats', requireUser, requireAdmin, wrap(async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = new Date(Math.min(weekAgo.getTime(), monthStart.getTime()));

  const [{ data: orders, error: oErr }, { data: profiles, error: pErr }] = await Promise.all([
    supabase.from('orders').select('status,total_cents,created_at,paid_at').gte('created_at', since.toISOString()),
    supabase.from('profiles').select('created_at'),
  ]);
  if (oErr) throw oErr;
  if (pErr) throw pErr;
  const { count: activeCount, error: aErr } = await supabase.from('orders')
    .select('id', { count: 'exact', head: true })
    .in('status', ['paid', 'pharmacy_confirmed', 'picked_up', 'out_for_delivery', 'issue']);
  if (aErr) throw aErr;

  const paid = (o) => !['pending_payment', 'canceled'].includes(o.status);
  const sum = (list) => list.reduce((t, o) => t + (o.total_cents || 0), 0);
  const inRange = (o, from) => new Date(o.paid_at || o.created_at) >= from;
  const revenue7 = orders.filter((o) => paid(o) && inRange(o, weekAgo));
  const revenueMonth = orders.filter((o) => paid(o) && inRange(o, monthStart));

  // Revenue per day for the last 7 days (oldest first)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(startOfDay.getTime() - i * 24 * 3600 * 1000);
    const next = new Date(d.getTime() + 24 * 3600 * 1000);
    days.push({
      date: d.toISOString().slice(0, 10),
      cents: sum(orders.filter((o) => paid(o) && new Date(o.paid_at || o.created_at) >= d && new Date(o.paid_at || o.created_at) < next)),
    });
  }

  res.json({
    activeDeliveries: activeCount || 0,
    ordersToday: orders.filter((o) => new Date(o.created_at) >= startOfDay && o.status !== 'canceled').length,
    deliveredToday: orders.filter((o) => o.status === 'delivered' && new Date(o.created_at) >= startOfDay).length,
    revenue7Cents: sum(revenue7),
    revenueMonthCents: sum(revenueMonth),
    ordersMonth: revenueMonth.length,
    customers: profiles.length,
    newCustomers7: profiles.filter((p) => new Date(p.created_at) >= weekAgo).length,
    revenueByDay: days,
  });
}));

app.get('/api/admin/customers', requireUser, requireAdmin, wrap(async (req, res) => {
  const [{ data: profiles, error: pErr }, { data: auths, error: aErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('authorizations').select('user_id,signed_at,agreement_version').is('revoked_at', null),
    supabase.from('orders').select('user_id,total_cents,status,created_at'),
  ]);
  if (pErr) throw pErr;
  if (aErr) throw aErr;
  if (oErr) throw oErr;
  const authBy = new Map(auths.map((a) => [a.user_id, a]));
  const stats = new Map();
  for (const o of orders) {
    const s = stats.get(o.user_id) || { orders: 0, spentCents: 0, lastOrderAt: null };
    if (o.status !== 'canceled') s.orders += 1;
    if (!['pending_payment', 'canceled'].includes(o.status)) s.spentCents += o.total_cents || 0;
    if (!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
    stats.set(o.user_id, s);
  }
  res.json({
    customers: profiles.map((p) => ({
      ...p,
      authorization: authBy.get(p.id) || null,
      authorizationCurrent: authBy.get(p.id)?.agreement_version === AGREEMENT_VERSION,
      ...(stats.get(p.id) || { orders: 0, spentCents: 0, lastOrderAt: null }),
    })),
  });
}));

app.get('/api/admin/customers/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const profile = await getProfile(req.params.id);
  if (!profile) throw new PublicError('Customer not found.', 404);
  const [authorization, { data: orders, error }] = await Promise.all([
    getActiveAuthorization(req.params.id),
    supabase.from('orders').select('*').eq('user_id', req.params.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (error) throw error;
  res.json({ profile, authorization, orders: orders || [] });
}));

app.get('/api/admin/pharmacies', requireUser, requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('pharmacies').select('*').order('name');
  if (error) throw error;
  res.json({ pharmacies: data || [] });
}));

app.post('/api/admin/pharmacies', requireUser, requireAdmin, wrap(async (req, res) => {
  const row = {
    name: cleanText(req.body?.name, 150, { required: true, label: 'Pharmacy name' }),
    address: cleanText(req.body?.address, 250),
    phone: cleanText(req.body?.phone, 40),
    notes: cleanText(req.body?.notes, 1000),
    listed: req.body?.listed === true,
  };
  const { data, error } = await supabase.from('pharmacies').insert(row).select().single();
  if (error) throw error;
  res.json({ pharmacy: data });
}));

app.patch('/api/admin/pharmacies/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const update = {};
  if (typeof req.body?.listed === 'boolean') update.listed = req.body.listed;
  if (req.body?.notes !== undefined) update.notes = cleanText(req.body.notes, 1000);
  const { data, error } = await supabase.from('pharmacies').update(update).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json({ pharmacy: data });
}));

app.delete('/api/admin/pharmacies/:id', requireUser, requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('pharmacies').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

app.get('/api/admin/inquiries', requireUser, requireAdmin, wrap(async (req, res) => {
  const { data, error } = await supabase.from('pharmacy_inquiries')
    .select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  res.json({ inquiries: data || [] });
}));

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err.expose) return res.status(err.status || 400).json({ error: err.message });
  console.error('Unhandled error:', err.message || err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again or call us.' });
});

const PORT = Number(env.PORT) || 3000;
app.listen(PORT, () => console.log(`Liyfe Transpo API listening on port ${PORT}`));
