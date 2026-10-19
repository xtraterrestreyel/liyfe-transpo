// Liyfe Transpo owner dashboard: overview, delivery board, orders, customers, pharmacies, messages.
(function () {
  const { C, esc, money, fmtDate, fmtDay, api, getSession, signIn, signOut, STATUS } = window.LT;
  const { icon, GOOGLE, STAGES, STAGE_SHORT, pillClass, initials, telHref, shortDate, toast, openDrawer, openSheet, closeOverlay, confirmSheet } = window.UI;
  const root = document.getElementById('root');

  const NEXT = {
    paid: ['pharmacy_confirmed', 'Pharmacy confirmed'],
    pharmacy_confirmed: ['picked_up', 'Picked up'],
    picked_up: ['out_for_delivery', 'On the way'],
    out_for_delivery: ['delivered', 'Delivered'],
  };
  const LANES = [
    ['paid', 'To confirm'],
    ['pharmacy_confirmed', 'Ready to pick up'],
    ['picked_up', 'Picked up'],
    ['out_for_delivery', 'On the way'],
  ];
  const COPAY = { no_copay: 'No copay', prepaid: 'Customer paying the pharmacy', need_help: 'Not sure, call the customer' };
  const FILTERS = [['active', 'Active'], ['pending_payment', 'Unpaid'], ['issue', 'Needs attention'], ['delivered', 'Delivered'], ['canceled', 'Canceled'], ['', 'All']];

  let view = 'overview';
  let ordersFilter = 'active';
  let search = '';
  let refreshTimer = null;
  let cache = { orders: [], customers: [], pharmacies: [] };

  // ================================================================ boot
  async function boot() {
    if (!window.LT.READY) {
      root.innerHTML = `<div class="denied"><div>
        <img src="assets/img/logo.webp" alt="" style="width:200px;margin:0 auto 24px">
        <h1 style="font-family:var(--display)">Almost ready</h1>
        <p class="muted">The dashboard turns on once the Supabase and Render details are in assets/js/config.js.<br>Follow steps 1 to 6 in README.md.</p>
      </div></div>`;
      return;
    }
    if (!(await getSession())) return renderSignIn();
    let me;
    try { me = await api('/api/me'); } catch (err) { return renderSignIn(err.message); }
    if (!me.isAdmin) return renderDenied(me.email);
    renderShell();
  }

  function renderSignIn(problem) {
    root.innerHTML = `
      <div class="signin">
        <div class="signin-inner">
          <img class="signin-logo" src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}">
          <h1>Owner dashboard</h1>
          <p>${problem ? esc(problem) : 'Sign in with a staff Google account.'}</p>
          <button class="btn btn-white btn-block" id="google">${GOOGLE}<span>Continue with Google</span></button>
        </div><div></div>
      </div>`;
    document.getElementById('google').onclick = () => signIn('admin.html');
  }

  function renderDenied(email) {
    root.innerHTML = `
      <div class="denied"><div>
        <img src="assets/img/logo.webp" alt="" style="width:200px;margin:0 auto 24px">
        <h1 style="font-family:var(--display)">Staff only</h1>
        <p class="muted">${esc(email)} isn't on the staff list. Add it to ADMIN_EMAILS on Render to give access.</p>
        <button class="btn btn-dark" id="out">${icon('logout')} Sign out</button>
      </div></div>`;
    document.getElementById('out').onclick = signOut;
  }

  // ================================================================ shell
  const NAV = [
    ['overview', 'grid', 'Overview'],
    ['orders', 'receipt', 'Orders'],
    ['customers', 'users', 'Customers'],
    ['pharmacies', 'store', 'Pharmacies'],
    ['inbox', 'inbox', 'Messages'],
  ];

  function renderShell() {
    root.innerHTML = `
      <div class="shell">
        <aside class="rail" aria-label="Dashboard">
          <img class="rail-logo" src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}">
          ${NAV.map(([id, ic, label]) => `<a href="#" data-view="${id}">${icon(ic)} ${label}</a>`).join('')}
          <div class="rail-spacer"></div>
          <a href="index.html" target="_blank" rel="noopener">${icon('external')} View website</a>
          <button class="rail-item" data-signout>${icon('logout')} Sign out</button>
        </aside>
        <main class="main"><div id="view" style="max-width:1280px;margin:0 auto"></div></main>
        <nav class="tabbar" aria-label="Dashboard">
          ${NAV.map(([id, ic, label]) => `<button class="tab" data-view="${id}">${icon(ic)}${label}</button>`).join('')}
        </nav>
      </div>`;
    root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); go(b.dataset.view); }));
    root.querySelector('[data-signout]').addEventListener('click', signOut);
    go(view);
  }

  function go(v) {
    view = v;
    clearInterval(refreshTimer);
    root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    const el = document.getElementById('view');
    ({ overview: renderOverview, orders: renderOrders, customers: renderCustomers, pharmacies: renderPharmacies, inbox: renderInbox })[v](el);
    window.scrollTo(0, 0);
  }

  function header(title, sub, extra = '') {
    return `
      <div class="topbar" style="padding:18px 0 10px">
        <div>
          <h1 style="font-family:var(--display);font-weight:800;font-size:1.9rem;margin:0;line-height:1.1">${esc(title)}</h1>
          ${sub ? `<div class="muted">${esc(sub)}</div>` : ''}
        </div>
        <div class="row-actions">${extra}<button class="icon-btn" data-refresh aria-label="Refresh">${icon('refresh')}</button></div>
      </div>`;
  }

  const loading = (el) => { el.querySelector('[data-body]').innerHTML = '<p class="muted" style="padding:20px 4px">Loading…</p>'; };

  // ================================================================ overview
  async function renderOverview(el) {
    const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    el.innerHTML = header('Overview', today) + '<div data-body></div>';
    el.querySelector('[data-refresh]').onclick = () => go('overview');
    loading(el);
    try {
      const [stats, { orders }, { orders: unpaid }] = await Promise.all([
        api('/api/admin/stats'),
        api('/api/admin/orders?status=active'),
        api('/api/admin/orders?status=pending_payment'),
      ]);
      cache.orders = orders;
      const maxDay = Math.max(1, ...stats.revenueByDay.map((d) => d.cents));
      const attention = orders.filter((o) => o.status === 'issue' || o.copay_option === 'need_help' || (!o.rx_ready && o.status === 'paid'));
      const staleUnpaid = unpaid.filter((o) => Date.now() - new Date(o.created_at).getTime() > 30 * 60 * 1000).slice(0, 5);

      el.querySelector('[data-body]').innerHTML = `
        <div class="kpis">
          <div class="kpi hero-kpi">
            <div class="label">${icon('card', 'icon-sm')} Revenue, last 7 days</div>
            <div class="value">${money(stats.revenue7Cents)}</div>
            <div class="delta">${money(stats.revenueMonthCents)} this month from ${stats.ordersMonth} orders</div>
            <div class="spark" aria-hidden="true">${stats.revenueByDay.map((d) => `<i style="height:${Math.max(6, (d.cents / maxDay) * 100)}%" title="${d.date}: ${money(d.cents)}"></i>`).join('')}</div>
          </div>
          <div class="kpi">
            <div class="label">${icon('car', 'icon-sm')} Active deliveries</div>
            <div class="value">${stats.activeDeliveries}</div>
            <div class="delta">${stats.deliveredToday} delivered today</div>
          </div>
          <div class="kpi">
            <div class="label">${icon('receipt', 'icon-sm')} Orders today</div>
            <div class="value">${stats.ordersToday}</div>
            <div class="delta">${unpaid.length} waiting for payment</div>
          </div>
          <div class="kpi">
            <div class="label">${icon('users', 'icon-sm')} Customers</div>
            <div class="value">${stats.customers}</div>
            <div class="delta">${stats.newCustomers7} new this week</div>
          </div>
        </div>

        <div class="section-title" style="margin-top:26px">Delivery board <span class="muted small">Updates every 30 seconds</span></div>
        <div class="lanes">
          ${LANES.map(([status, label]) => {
            const list = orders.filter((o) => o.status === status);
            return `<div class="lane">
              <div class="lane-head"><span>${label}</span><span class="count">${list.length}</span></div>
              ${list.map(ticket).join('') || '<p class="faint small" style="padding:4px 6px">Nothing here</p>'}
            </div>`;
          }).join('')}
        </div>
        <div class="dash-grid">
          <div>
            <div class="section-title">Needs attention</div>
            <div class="feed">
              ${attention.map((o) => feedRow(o, o.status === 'issue' ? 'Flagged' : o.copay_option === 'need_help' ? 'Copay help needed' : 'Not confirmed ready')).join('')
                || '<div class="feed-empty">All clear.</div>'}
            </div>
          </div>
          <div>
            <div class="section-title">Unpaid for 30+ minutes</div>
            <div class="feed">
              ${staleUnpaid.map((o) => feedRow(o, 'Unpaid since ' + shortDate(o.created_at))).join('') || '<div class="feed-empty">None.</div>'}
            </div>
          </div>
        </div>`;
      bindOrderClicks(el, [...orders, ...unpaid]);
      refreshTimer = setInterval(() => { if (view === 'overview' && !document.querySelector('[data-overlay]')) go('overview'); }, 30000);
    } catch (err) {
      el.querySelector('[data-body]').innerHTML = `<div class="alert alert-red">${icon('alert')} ${esc(err.message)}</div>`;
    }
  }

  function ticket(o) {
    const p = o.profile || {};
    return `
      <button class="ticket" data-order="${o.id}">
        <div class="t-top"><span>LT-${o.order_number}</span><span>${esc(shortDate(o.paid_at || o.created_at))}</span></div>
        <div class="t-name">${esc(p.full_name || 'Customer')}</div>
        <div class="t-route">${esc(o.pharmacy_name)} to ${esc(cityOf(o.delivery_address))}</div>
        ${flags(o)}
      </button>`;
  }

  // "412 W Main St, Danville, IL 61832" -> "Danville"
  function cityOf(address) {
    const parts = String(address || '').split(',').map((x) => x.trim()).filter(Boolean);
    for (let i = parts.length - 1; i > 0; i--) {
      if (!/^(USA|United States|[A-Z]{2}(\s+\d{5}(-\d{4})?)?|\d{5})$/.test(parts[i])) return parts[i];
    }
    return parts[0] || '';
  }

  function flags(o) {
    const f = [];
    if (o.controlled_substance) f.push('<span class="pill warn">Controlled</span>');
    if (o.copay_option === 'need_help') f.push('<span class="pill live">Copay help</span>');
    if (!o.rx_ready && ['paid'].includes(o.status)) f.push('<span class="pill off">Not confirmed ready</span>');
    return f.length ? `<div class="flags">${f.join('')}</div>` : '';
  }

  function feedRow(o, sub) {
    const p = o.profile || {};
    return `
      <button class="feed-row" data-order="${o.id}">
        <span class="avatar" style="width:44px;height:44px">${esc(initials(p.full_name))}</span>
        <span style="min-width:0"><div class="feed-title">${esc(p.full_name || 'Customer')}</div><div class="feed-sub">${esc(sub)}</div></span>
        <span class="feed-amt"><div class="num">${money(o.total_cents)}</div><div class="feed-sub">LT-${o.order_number}</div></span>
      </button>`;
  }

  function bindOrderClicks(scope, list) {
    scope.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      const o = list.find((x) => x.id === b.dataset.order);
      if (o) openOrder(o);
    }));
  }

  // ================================================================ orders
  async function renderOrders(el) {
    el.innerHTML = header('Orders', 'Every delivery, newest first') + `
      <div class="toolbar">
        <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip-btn ${k === ordersFilter ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
        <label class="search">${icon('search')}<input type="search" placeholder="Search name, order number, pharmacy" value="${esc(search)}" aria-label="Search orders"></label>
      </div>
      <div data-body></div>`;
    el.querySelector('[data-refresh]').onclick = () => go('orders');
    el.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { ordersFilter = b.dataset.filter; go('orders'); }));
    const input = el.querySelector('.search input');
    input.addEventListener('input', () => { search = input.value; drawOrders(el); });
    loading(el);
    try {
      const { orders } = await api('/api/admin/orders' + (ordersFilter ? `?status=${ordersFilter}` : ''));
      cache.orders = orders;
      drawOrders(el);
    } catch (err) {
      el.querySelector('[data-body]').innerHTML = `<div class="alert alert-red">${icon('alert')} ${esc(err.message)}</div>`;
    }
  }

  function drawOrders(el) {
    const q = search.trim().toLowerCase();
    const list = cache.orders.filter((o) => !q || [o.profile?.full_name, 'lt-' + o.order_number, String(o.order_number), o.pharmacy_name, o.delivery_address]
      .some((v) => String(v || '').toLowerCase().includes(q)));
    el.querySelector('[data-body]').innerHTML = `
      <div class="table">
        <div class="trow head orders-cols"><span>Order</span><span>Customer</span><span>Pick up</span><span>Deliver to</span><span>Total</span><span>Status</span></div>
        ${list.map((o) => `
          <button class="trow orders-cols" data-order="${o.id}">
            <span class="num" style="font-weight:700">LT-${o.order_number}</span>
            <span class="who"><span class="avatar">${esc(initials(o.profile?.full_name))}</span><span style="min-width:0"><b>${esc(o.profile?.full_name || 'Customer')}</b><small>${esc(shortDate(o.created_at))}</small></span></span>
            <span>${esc(o.pharmacy_name)}</span>
            <span class="muted">${esc(o.delivery_address)}</span>
            <span class="num">${money(o.total_cents)}</span>
            <span><span class="pill ${pillClass(o.status)}">${esc(STATUS[o.status] || o.status)}</span></span>
          </button>`).join('') || '<div class="feed-empty">No orders match.</div>'}
      </div>`;
    bindOrderClicks(el, list);
  }

  // ================================================================ order drawer
  function openOrder(o) {
    const p = o.profile || {};
    let idx = STAGES.indexOf(o.status);
    const next = NEXT[o.status];
    const route = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o.pharmacy_address)}&destination=${encodeURIComponent(o.delivery_address)}`;
    openDrawer(`
      <div class="sheet-head">
        <div><h2>LT-${o.order_number}</h2><div class="muted small">Placed ${esc(fmtDate(o.created_at))}</div></div>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:16px">
        <span class="avatar">${esc(initials(p.full_name))}</span>
        <div style="flex:1;min-width:0"><b>${esc(p.full_name || 'Customer')}</b><div class="muted small">DOB ${esc(fmtDay(p.date_of_birth))}</div></div>
        <span class="pill ${pillClass(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
      </div>

      ${['pending_payment', 'canceled'].includes(o.status) ? '' : `
        <div class="stepper">${STAGES.map((s, i) => `<div class="${o.status === 'issue' ? '' : i < idx ? 'done' : i === idx ? 'now' : ''}"></div>`).join('')}</div>
        <div class="stepper-labels">${STAGES.map((s) => `<span>${STAGE_SHORT[s]}</span>`).join('')}</div>`}

      ${o.controlled_substance ? `<div class="alert alert-amber">${icon('alert', 'icon-sm')} Controlled medication. Get a signature or check ID at the door.</div>` : ''}
      ${o.copay_option === 'need_help' ? `<div class="alert alert-red">${icon('phone', 'icon-sm')} Customer needs help with the copay. Call before pickup.</div>` : ''}
      ${!o.rx_ready && o.status === 'paid' ? `<div class="alert alert-amber">${icon('clock', 'icon-sm')} Customer hasn't confirmed it's ready. Check with the pharmacy.</div>` : ''}
      ${o.status === 'issue' ? `<div class="alert alert-red">${icon('flag', 'icon-sm')} Flagged. Resolve it, then send it back to the board.</div>` : ''}

      <div style="display:grid;gap:8px;margin-top:16px">
        ${next ? `<button class="btn btn-red btn-block" data-status="${next[0]}">${icon('check')} Mark as ${esc(next[1].toLowerCase())}</button>` : ''}
        <div class="row-actions">
          <a class="btn btn-dark btn-sm" href="${telHref(p.phone)}">${icon('phone', 'icon-sm')} Call customer</a>
          ${o.pharmacy_phone ? `<a class="btn btn-dark btn-sm" href="${telHref(o.pharmacy_phone)}">${icon('store', 'icon-sm')} Call pharmacy</a>` : ''}
          <a class="btn btn-dark btn-sm" href="${route}" target="_blank" rel="noopener">${icon('route', 'icon-sm')} Route</a>
          <a class="btn btn-dark btn-sm" href="authorization-letter.html?customer=${o.user_id}" target="_blank" rel="noopener">${icon('file', 'icon-sm')} Letter</a>
        </div>
      </div>

      <div class="section-title">Pickup</div>
      <dl class="kv">
        <dt>Pharmacy</dt><dd>${esc(o.pharmacy_name)}</dd>
        <dt>Address</dt><dd>${esc(o.pharmacy_address)}</dd>
        <dt>Phone</dt><dd>${esc(o.pharmacy_phone || '—')}</dd>
        <dt>Rx number(s)</dt><dd>${esc(o.rx_numbers || '—')}</dd>
        <dt>Ready?</dt><dd>${o.rx_ready ? 'Customer says yes' : 'Not confirmed'}</dd>
        <dt>Copay</dt><dd>${esc(COPAY[o.copay_option] || o.copay_option)}</dd>
        <dt>Patient</dt><dd>${esc(p.full_name)}, born ${esc(fmtDay(p.date_of_birth))}</dd>
      </dl>

      <div class="section-title">Drop-off</div>
      <dl class="kv">
        <dt>Address</dt><dd>${esc(o.delivery_address)}</dd>
        <dt>Instructions</dt><dd>${esc(o.delivery_instructions || '—')}</dd>
        <dt>Phone</dt><dd><a href="${telHref(p.phone)}">${esc(p.phone || '—')}</a></dd>
      </dl>

      <div class="section-title">Payment</div>
      <div class="lines">
        <div class="line"><span>${o.miles} mi, ${o.tiers} tier${o.tiers > 1 ? 's' : ''}</span><span>${money(o.delivery_fee_cents)}</span></div>
        <div class="line"><span>Service fee</span><span>${money(o.service_fee_cents)}</span></div>
        <div class="line total"><span>Total</span><span>${money(o.total_cents)}</span></div>
        <div class="line"><span>Paid</span><span>${o.paid_at ? esc(fmtDate(o.paid_at)) : 'Not yet'}</span></div>
      </div>

      <div class="section-title">Staff notes</div>
      <div class="field"><textarea id="notes" aria-label="Staff notes" placeholder="Pharmacy said ready at 2pm, left at side door…">${esc(o.staff_notes || '')}</textarea></div>
      <button class="btn btn-dark btn-sm" data-save-notes>Save notes</button>

      <div class="row-actions" style="margin-top:26px;padding-top:18px;border-top:1px solid var(--line)">
        ${!['delivered', 'canceled', 'issue'].includes(o.status) ? `<button class="btn btn-ghost btn-sm" data-status="issue">${icon('flag', 'icon-sm')} Flag a problem</button>` : ''}
        ${o.status === 'issue' ? `<button class="btn btn-dark btn-sm" data-status="paid">Send back to the board</button>` : ''}
        ${!['delivered', 'canceled'].includes(o.status) ? `<button class="btn btn-ghost btn-sm" data-status="canceled" style="color:#ff6b7b">${icon('x', 'icon-sm')} Cancel order</button>` : ''}
      </div>`, (panel) => {
      panel.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
        const status = b.dataset.status;
        if (status === 'canceled') {
          const yes = await confirmSheet({ title: `Cancel LT-${o.order_number}?`, body: 'If the customer paid, issue the refund in your Stripe dashboard.', action: 'Cancel order', danger: true });
          if (!yes) return openOrder(o);
        }
        b.disabled = true;
        try {
          const { order } = await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { status, staff_notes: panel.querySelector('#notes')?.value ?? o.staff_notes } });
          toast(`LT-${o.order_number}: ${STATUS[status]}`);
          const updated = { ...o, ...order, profile: o.profile };
          go(view);
          if (status !== 'canceled') openOrder(updated);
        } catch (err) { toast(err.message, true); b.disabled = false; }
      }));
      panel.querySelector('[data-save-notes]').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        try {
          await api(`/api/admin/orders/${o.id}`, { method: 'PATCH', body: { staff_notes: panel.querySelector('#notes').value } });
          o.staff_notes = panel.querySelector('#notes').value;
          toast('Notes saved');
        } catch (err) { toast(err.message, true); }
        e.currentTarget.disabled = false;
      });
    });
  }

  // ================================================================ customers
  async function renderCustomers(el) {
    el.innerHTML = header('Customers', 'Everyone who has signed up') + `
      <div class="toolbar"><label class="search" style="margin-left:0">${icon('search')}<input type="search" placeholder="Search name, phone, email" aria-label="Search customers"></label></div>
      <div data-body></div>`;
    el.querySelector('[data-refresh]').onclick = () => go('customers');
    const input = el.querySelector('.search input');
    input.addEventListener('input', () => drawCustomers(el, input.value));
    loading(el);
    try {
      const { customers } = await api('/api/admin/customers');
      cache.customers = customers;
      drawCustomers(el, '');
    } catch (err) {
      el.querySelector('[data-body]').innerHTML = `<div class="alert alert-red">${icon('alert')} ${esc(err.message)}</div>`;
    }
  }

  function authPill(c) {
    if (!c.full_name || !c.date_of_birth) return '<span class="pill off">Signing up</span>';
    if (!c.authorization) return '<span class="pill warn">Not signed</span>';
    if (!c.authorizationCurrent) return '<span class="pill warn">Re-sign needed</span>';
    return '<span class="pill ok">Authorized</span>';
  }

  function drawCustomers(el, q) {
    q = q.trim().toLowerCase();
    const list = cache.customers.filter((c) => !q || [c.full_name, c.email, c.phone].some((v) => String(v || '').toLowerCase().includes(q)));
    el.querySelector('[data-body]').innerHTML = `
      <div class="table">
        <div class="trow head cust-cols"><span>Customer</span><span>Phone</span><span>City</span><span>Status</span><span>Orders</span><span>Spent</span></div>
        ${list.map((c) => `
          <button class="trow cust-cols" data-customer="${c.id}">
            <span class="who"><span class="avatar">${esc(initials(c.full_name || c.email))}</span><span style="min-width:0"><b>${esc(c.full_name || 'New sign-up')}</b><small>${esc(c.email || '')}</small></span></span>
            <span>${esc(c.phone || '—')}</span>
            <span class="muted">${esc(c.city || '—')}</span>
            <span>${authPill(c)}</span>
            <span class="num">${c.orders}</span>
            <span class="num">${money(c.spentCents)}</span>
          </button>`).join('') || '<div class="feed-empty">No customers yet.</div>'}
      </div>`;
    el.querySelectorAll('[data-customer]').forEach((b) => b.addEventListener('click', () => openCustomer(b.dataset.customer)));
  }

  async function openCustomer(id) {
    let data;
    try { data = await api(`/api/admin/customers/${id}`); } catch (err) { return toast(err.message, true); }
    const { profile: c, authorization: a, orders } = data;
    const addr = [c.address_line1, c.address_line2, c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const spent = orders.filter((o) => !['pending_payment', 'canceled'].includes(o.status)).reduce((t, o) => t + o.total_cents, 0);
    openDrawer(`
      <div class="sheet-head"><span></span><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="profile-head">
        <div class="avatar avatar-lg" style="margin:0 auto">${esc(initials(c.full_name || c.email))}</div>
        <h1>${esc(c.full_name || 'New sign-up')}</h1>
        <div class="muted">Customer since ${esc(fmtDate(c.created_at, false))}</div>
      </div>
      <div class="row-actions" style="justify-content:center;margin:12px 0 4px">
        ${c.phone ? `<a class="btn btn-dark btn-sm" href="${telHref(c.phone)}">${icon('phone', 'icon-sm')} Call</a>` : ''}
        ${c.email ? `<a class="btn btn-dark btn-sm" href="mailto:${esc(c.email)}">${icon('mail', 'icon-sm')} Email</a>` : ''}
        ${a ? `<a class="btn btn-dark btn-sm" href="authorization-letter.html?customer=${c.id}" target="_blank" rel="noopener">${icon('file', 'icon-sm')} Letter</a>` : ''}
      </div>
      <div class="kpis" style="grid-template-columns:1fr 1fr;margin-top:16px">
        <div class="kpi" style="background:var(--panel-2)"><div class="label">Orders</div><div class="value">${orders.filter((o) => o.status !== 'canceled').length}</div></div>
        <div class="kpi" style="background:var(--panel-2)"><div class="label">Spent</div><div class="value">${money(spent)}</div></div>
      </div>
      <div class="section-title">Details</div>
      <dl class="kv">
        <dt>Date of birth</dt><dd>${esc(fmtDay(c.date_of_birth) || '—')}</dd>
        <dt>Phone</dt><dd>${esc(c.phone || '—')}</dd>
        <dt>Email</dt><dd>${esc(c.email || '—')}</dd>
        <dt>Home</dt><dd>${esc(addr || '—')}</dd>
        <dt>Usual pharmacy</dt><dd>${esc([c.preferred_pharmacy_name, c.preferred_pharmacy_address].filter(Boolean).join(', ') || '—')}</dd>
        <dt>Told pharmacy</dt><dd>${c.pharmacy_notice_ack ? 'Yes' : 'Not yet'}</dd>
      </dl>
      <div class="section-title">Authorization</div>
      <dl class="kv">
        <dt>Status</dt><dd>${a ? 'Active' : 'Not signed'}</dd>
        ${a ? `<dt>Signed</dt><dd>${esc(fmtDate(a.signed_at))} as "${esc(a.signature_name)}"</dd><dt>Version</dt><dd>${esc(a.agreement_version)}</dd>` : ''}
      </dl>
      <div class="section-title">Order history</div>
      <div class="feed" style="background:var(--panel-2)">
        ${orders.map((o) => `
          <button class="feed-row" data-order="${o.id}">
            <span class="feed-icon" style="background:var(--panel)">${icon(o.status === 'delivered' ? 'check' : 'store')}</span>
            <span style="min-width:0"><div class="feed-title">${esc(o.pharmacy_name)}</div><div class="feed-sub">${esc(STATUS[o.status] || o.status)}, ${esc(shortDate(o.created_at))}</div></span>
            <span class="feed-amt"><div class="num">${money(o.total_cents)}</div><div class="feed-sub">LT-${o.order_number}</div></span>
          </button>`).join('') || '<div class="feed-empty">No orders yet.</div>'}
      </div>`, (panel) => {
      const withProfile = orders.map((o) => ({ ...o, profile: c }));
      bindOrderClicks(panel, withProfile);
    });
  }

  // ================================================================ pharmacies
  async function renderPharmacies(el) {
    el.innerHTML = header('Pharmacies', 'Pharmacies you work with', `<button class="btn btn-red btn-sm" data-add>${icon('plus', 'icon-sm')} Add pharmacy</button>`) + '<div data-body></div>';
    el.querySelector('[data-refresh]').onclick = () => go('pharmacies');
    el.querySelector('[data-add]').onclick = addPharmacy;
    loading(el);
    try {
      const { pharmacies } = await api('/api/admin/pharmacies');
      cache.pharmacies = pharmacies;
      el.querySelector('[data-body]').innerHTML = `
        <p class="muted small" style="margin:0 0 14px">Only show a pharmacy on the public website after it agrees to be listed.</p>
        <div class="table">
          <div class="trow head ph-cols"><span>Pharmacy</span><span>Address</span><span>Phone</span><span>Website</span></div>
          ${pharmacies.map((p) => `
            <button class="trow ph-cols" data-ph="${p.id}">
              <span class="who"><span class="feed-icon" style="width:38px;height:38px">${icon('store', 'icon-sm')}</span><b>${esc(p.name)}</b></span>
              <span class="muted">${esc(p.address || '—')}</span>
              <span>${esc(p.phone || '—')}</span>
              <span>${p.listed ? '<span class="pill ok">Listed</span>' : '<span class="pill off">Private</span>'}</span>
            </button>`).join('') || '<div class="feed-empty">Add the pharmacies you pick up from most.</div>'}
        </div>`;
      el.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => openPharmacy(cache.pharmacies.find((p) => p.id === b.dataset.ph))));
    } catch (err) {
      el.querySelector('[data-body]').innerHTML = `<div class="alert alert-red">${icon('alert')} ${esc(err.message)}</div>`;
    }
  }

  function addPharmacy() {
    openSheet(`
      <div class="sheet-head"><h2>Add a pharmacy</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field"><label for="ph-name">Name</label><input id="ph-name" placeholder="Walgreens, N Prospect"></div>
      <div class="field"><label for="ph-addr">Address</label><input id="ph-addr"></div>
      <div class="field"><label for="ph-phone">Phone</label><input id="ph-phone" type="tel"></div>
      <div class="field"><label for="ph-notes">Notes</label><textarea id="ph-notes" placeholder="Pickup policy, contact person, their authorization form"></textarea></div>
      <label class="toggle-row" style="background:var(--panel-2)">
        <span class="grow"><b>Show on the website</b><span class="muted small">Only if they agreed to be listed</span></span>
        <span class="switch"><input type="checkbox" id="ph-listed"><i></i></span>
      </label>
      <div class="inline-err" data-err></div>
      <button class="btn btn-red btn-block" data-save>Add pharmacy</button>`, (el) => {
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const v = (id) => el.querySelector('#' + id).value.trim();
        if (!v('ph-name')) { el.querySelector('[data-err]').textContent = 'Enter the pharmacy name.'; return; }
        e.currentTarget.disabled = true;
        try {
          await api('/api/admin/pharmacies', { method: 'POST', body: { name: v('ph-name'), address: v('ph-addr'), phone: v('ph-phone'), notes: v('ph-notes'), listed: el.querySelector('#ph-listed').checked } });
          closeOverlay();
          toast('Pharmacy added');
          go('pharmacies');
        } catch (err) { el.querySelector('[data-err]').textContent = err.message; e.currentTarget.disabled = false; }
      });
    });
  }

  function openPharmacy(p) {
    openDrawer(`
      <div class="sheet-head"><h2>${esc(p.name)}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <dl class="kv mt">
        <dt>Address</dt><dd>${esc(p.address || '—')}</dd>
        <dt>Phone</dt><dd>${p.phone ? `<a href="${telHref(p.phone)}">${esc(p.phone)}</a>` : '—'}</dd>
        <dt>Added</dt><dd>${esc(fmtDate(p.created_at, false))}</dd>
      </dl>
      <div class="section-title">Notes</div>
      <div class="field"><textarea id="ph-notes">${esc(p.notes || '')}</textarea></div>
      <button class="btn btn-dark btn-sm" data-save-notes>Save notes</button>
      <label class="toggle-row mt" style="background:var(--panel-2)">
        <span class="grow"><b>Show on the website</b><span class="muted small">Only if they agreed to be listed</span></span>
        <span class="switch"><input type="checkbox" id="ph-listed" ${p.listed ? 'checked' : ''}><i></i></span>
      </label>
      <button class="btn btn-ghost btn-sm mt" data-delete style="color:#ff6b7b">${icon('x', 'icon-sm')} Delete pharmacy</button>`, (panel) => {
      panel.querySelector('[data-save-notes]').addEventListener('click', async () => {
        try { await api(`/api/admin/pharmacies/${p.id}`, { method: 'PATCH', body: { notes: panel.querySelector('#ph-notes').value } }); toast('Notes saved'); go('pharmacies'); }
        catch (err) { toast(err.message, true); }
      });
      panel.querySelector('#ph-listed').addEventListener('change', async (e) => {
        try {
          await api(`/api/admin/pharmacies/${p.id}`, { method: 'PATCH', body: { listed: e.target.checked } });
          toast(e.target.checked ? 'Now shown on the website' : 'Removed from the website');
          p.listed = e.target.checked;
          const body = document.getElementById('view');
          if (body) renderPharmacies(body);
        } catch (err) { toast(err.message, true); e.target.checked = !e.target.checked; }
      });
      panel.querySelector('[data-delete]').addEventListener('click', async () => {
        const yes = await confirmSheet({ title: `Delete ${p.name}?`, body: "This removes it from your list. Past orders aren't affected.", action: 'Delete pharmacy', danger: true });
        if (!yes) return;
        try { await api(`/api/admin/pharmacies/${p.id}`, { method: 'DELETE' }); toast('Pharmacy deleted'); go('pharmacies'); }
        catch (err) { toast(err.message, true); }
      });
    });
  }

  // ================================================================ messages from pharmacies
  async function renderInbox(el) {
    el.innerHTML = header('Messages', 'Sent from the "For pharmacies" page') + '<div data-body></div>';
    el.querySelector('[data-refresh]').onclick = () => go('inbox');
    loading(el);
    try {
      const { inquiries } = await api('/api/admin/inquiries');
      el.querySelector('[data-body]').innerHTML = `
        <div class="feed">
          ${inquiries.map((q) => `
            <div class="feed-row" style="cursor:default;align-items:start">
              <span class="feed-icon">${icon('store')}</span>
              <span style="min-width:0">
                <div class="feed-title">${esc(q.pharmacy_name)}</div>
                <div class="feed-sub">${esc(q.contact_name || 'No name given')}, ${esc(shortDate(q.created_at))}</div>
                ${q.message ? `<p style="margin:8px 0 0">${esc(q.message)}</p>` : ''}
              </span>
              <span class="row-actions" style="justify-content:flex-end">
                ${q.phone ? `<a class="icon-btn" href="${telHref(q.phone)}" aria-label="Call ${esc(q.pharmacy_name)}">${icon('phone', 'icon-sm')}</a>` : ''}
                ${q.email ? `<a class="icon-btn" href="mailto:${esc(q.email)}" aria-label="Email ${esc(q.pharmacy_name)}">${icon('mail', 'icon-sm')}</a>` : ''}
              </span>
            </div>`).join('') || '<div class="feed-empty">No messages yet.</div>'}
        </div>`;
    } catch (err) {
      el.querySelector('[data-body]').innerHTML = `<div class="alert alert-red">${icon('alert')} ${esc(err.message)}</div>`;
    }
  }

  boot();
})();
