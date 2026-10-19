# Liyfe Transpo website

Prescription pickup and delivery. Customers sign in with Google, register, e-sign an authorization naming Liyfe Transpo as their **authorized pickup agent**, then request deliveries and pay online. You work for the customer, not the pharmacy.

```
Liyfe Transpo\
├─ frontend\    The website (GitHub Pages)
│   ├─ index.html                 Home: how it works, pricing, estimator, service-area map, FAQ
│   ├─ app.html                   Customer app: Google sign-in, step-by-step signup + authorization,
│   │                             home with live route tracker, activity, checkout, account
│   ├─ admin.html                 Owner dashboard: revenue + stats, live delivery board,
│   │                             orders, customers, pharmacies, messages
│   ├─ authorization-letter.html  Printable letter the customer gives the pharmacy
│   ├─ pharmacies.html            "For pharmacies" page + contact form
│   ├─ terms.html / privacy.html  DRAFTS: have a lawyer review
│   └─ assets\js\config.js        ← your settings go here
├─ backend\     The API (Render): pricing, Google Maps, Stripe, orders
├─ supabase\    schema.sql: the database (run once in Supabase)
├─ render.yaml  One-click Render setup
└─ .github\workflows\pages.yml   Auto-publishes the website on every push
```

**How pricing works:** the driving distance from pharmacy to customer (Google Maps) is split into 10-mile tiers at $4.99 each, plus a flat $0.50 service fee on every order. Because the service fee is the same for every payment method, it's legal with debit cards, credit cards, Apple Pay, and Cash App Pay. It is not a card surcharge. Max range is 40 miles. Change any of these on Render (environment variables) **and** in `config.js` (the display copy).

---

## Go-live steps (do them in this order)

You'll need free accounts at **Supabase**, **Google Cloud**, **Stripe**, **GitHub**, and **Render**.

### 1. Supabase: database and Google sign-in
1. supabase.com → **New project** (name it `liyfe-transpo`). Save the database password somewhere safe.
2. **SQL Editor → New query** → paste everything from `supabase\schema.sql` → **Run**.
3. **Project Settings → API**: copy the **Project URL**, the **anon public** key (goes in `config.js`), and the **service_role** key. The service_role key is secret and goes on Render only.

### 2. Google Cloud: sign-in and Maps
1. console.cloud.google.com → create a project called `Liyfe Transpo`. Add a billing account; Maps has a monthly free allowance.
2. **APIs & Services → OAuth consent screen**: choose External, app name *Liyfe Transpo*, your support email, and upload the logo. Then **Publish app**. In "Testing" mode only 100 test users can sign in.
3. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
   - Copy the Client ID and Client secret.
4. Back in Supabase: **Authentication → Sign In / Providers → Google** → turn it on → paste the Client ID and secret → Save.
5. **APIs & Services → Library**: enable **Routes API** and **Places API (New)**.
6. **Credentials → Create credentials → API key**. Edit it, and under *API restrictions* allow only Routes API and Places API (New). This is `GOOGLE_MAPS_SERVER_KEY`.

### 3. GitHub: code and website
1. github.com → **New repository** → `liyfe-transpo` → **Public**. Free GitHub Pages needs a public repo. No secrets are in the code; they all live on Render.
2. In PowerShell:
   ```powershell
   cd "D:\Liyfe Transpo"
   git init
   git add .
   git commit -m "Liyfe Transpo website"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/liyfe-transpo.git
   git push -u origin main
   ```
3. Repo **Settings → Pages → Source: GitHub Actions**. The site goes live at `https://YOUR-USERNAME.github.io/liyfe-transpo/` within a couple of minutes, and updates on every push.

### 4. Render: the backend
1. render.com → **New → Blueprint** → connect the `liyfe-transpo` repo. Render reads `render.yaml`.
2. Fill in the values it asks for (explained in `backend\.env.example`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: from step 1
   - `GOOGLE_MAPS_SERVER_KEY`: from step 2
   - `FRONTEND_URL`: for now, `https://YOUR-USERNAME.github.io`
   - `ADMIN_EMAILS`: Gmail addresses of staff, comma separated
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`: next step (put `x` for now, then update)
3. Plan: **Starter** (about $7/mo) is recommended. The free plan sleeps when idle, so the first customer of the day waits about a minute.
4. Copy your API address, e.g. `https://liyfe-transpo-api.onrender.com`. Opening `/health` should show `{"ok":true}`.

### 5. Stripe: payments
1. dashboard.stripe.com → **Settings → Payment methods**: turn on Cards, Apple Pay, Google Pay, and Cash App Pay.
2. **Developers → API keys**: copy the **Secret key** (start with `sk_test_…`) → Render `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint**
   - URL: `https://YOUR-API.onrender.com/api/stripe/webhook`
   - Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`
   - Copy the **Signing secret** (`whsec_…`) → Render `STRIPE_WEBHOOK_SECRET`.

### 6. Connect the website to everything
Edit `frontend\assets\js\config.js`: Supabase URL, anon key, Render API address, phone, email, hours. (The logos are already in `frontend\assets\img`.) Then:
```powershell
git add . ; git commit -m "Settings" ; git push
```
In Supabase **Authentication → URL Configuration**, set:
- Site URL: your site address
- Redirect URLs: `https://YOUR-USERNAME.github.io/liyfe-transpo/**` (and later your own domain, e.g. `https://www.yourdomain.com/**`)

### 7. Test everything in test mode
Sign up with Google, fill in your info, sign the authorization, place an order, and pay with Stripe's test card `4242 4242 4242 4242` (any future date and any CVC). The order should turn **Paid** within seconds. Then open `admin.html` with a staff Gmail and walk it through to **Delivered**.

### 8. Your own domain
1. Buy the domain (Namecheap, Porkbun, Cloudflare, or similar).
2. DNS records:
   - `CNAME` `www` → `YOUR-USERNAME.github.io`
   - `A` records for the bare domain → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
3. GitHub repo **Settings → Pages → Custom domain**: `www.yourdomain.com` → Save → check **Enforce HTTPS**.
4. Update Render `FRONTEND_URL` to `https://www.yourdomain.com,https://yourdomain.com`, and add `https://www.yourdomain.com/**` to Supabase Redirect URLs.

### 9. Go live with real payments
Activate your Stripe account (business details, bank). Swap in the `sk_live_…` key, and create a live-mode webhook (same URL and events) with its new signing secret on Render.

---

## Before launch checklist
- [ ] Attorney review of the authorization text (`backend\agreement.js`), `terms.html` and `privacy.html`. If you change the authorization wording, raise `AGREEMENT_VERSION`; customers will be asked to sign again.
- [ ] Commercial auto insurance that covers delivering goods, plus general liability.
- [ ] Visit your main pharmacies: introduce yourselves, ask how they want customers to add you as an authorized pickup, and get any pharmacy-specific forms.
- [ ] Only mark a pharmacy as "listed publicly" in the staff dashboard after it agrees. Don't call pharmacies "partners" or say they "approve" or "endorse" you unless they've agreed to that in writing.
- [ ] Driver IDs or badges, and a policy for controlled medications (signature or ID at the door).

## Daily use: owner dashboard (`/admin.html`)
- **Overview** shows revenue, active deliveries, today's orders, and new customers, plus a live **delivery board** that refreshes every 30 seconds.
- Tap any order to open its panel. Confirm with the pharmacy that it's ready and the copay is handled, then press the red button to move it along: **Pharmacy confirmed** → **Picked up** → **On the way** → **Delivered**. Customers see each step move on their route tracker.
- Red and amber banners mean act first: call about the copay, or check ID for a controlled medication.
- **Customers** lists everyone who signed up, with their authorization status, orders, and total spent. **Letter** opens a customer's signed authorization for a pharmacist.
- Refunds are issued in the Stripe dashboard.

Customers can add the app to their phone's home screen (Share → Add to Home Screen) and it opens like a regular app.

## Local testing (optional)
```powershell
cd "D:\Liyfe Transpo\backend"
copy .env.example .env    # then fill it in
npm install
npm test                  # checks the tier pricing math
npm start                 # API on http://localhost:3000
```
Serve `frontend` with any static server (e.g. VS Code "Live Server") and point `API_BASE` at `http://localhost:3000`.
