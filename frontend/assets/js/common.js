// Shared code for every page: Supabase sign-in, API calls, header/footer, helpers.
(function () {
  const C = window.LT_CONFIG;
  // Online ordering turns on automatically once config.js has real Supabase + Render values.
  const READY = !/YOUR-|your-supabase|liyfe-transpo-api\.onrender\.com\/?$/i.test(
    [C.SUPABASE_URL, C.SUPABASE_ANON_KEY].join(' ')
  ) && !!C.API_BASE;
  const sb = window.supabase && READY
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY)
    : null;

  const GOOGLE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  const STATUS = {
    pending_payment: 'Waiting for payment',
    paid: 'Scheduled',
    pharmacy_confirmed: 'Pharmacy confirmed',
    picked_up: 'Picked up',
    out_for_delivery: 'On the way',
    delivered: 'Delivered',
    issue: 'Needs attention',
    canceled: 'Canceled',
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function money(cents) {
    return '$' + (Number(cents || 0) / 100).toFixed(2);
  }

  function fmtDate(iso, withTime = true) {
    if (!iso) return '';
    const d = new Date(iso);
    return withTime
      ? d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // Date-only values (like date of birth) without timezone shifting
  function fmtDay(yyyyMmDd) {
    if (!yyyyMmDd) return '';
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  }

  async function getSession() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      const session = await getSession();
      if (session) headers.Authorization = 'Bearer ' + session.access_token;
    }
    let res;
    try {
      res = await fetch(C.API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error('We could not reach our server. Check your connection and try again (the first try after a quiet period can take up to a minute).');
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function signIn(redirectPage = 'app.html') {
    const redirectTo = new URL(redirectPage, window.location.href).href;
    return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  }

  async function signOut() {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  }

  function googleButton(label = 'Continue with Google', redirect = 'app.html') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-google';
    b.innerHTML = GOOGLE_ICON + '<span>' + esc(label) + '</span>';
    b.addEventListener('click', () => signIn(redirect));
    return b;
  }

  function alertBox(el, message, kind = 'error') {
    if (!el) return;
    if (!message) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="alert alert-${kind}" role="alert">${esc(message)}</div>`;
  }

  function renderChrome() {
    const header = document.getElementById('site-header');
    if (header) {
      header.className = 'site-header';
      header.innerHTML = `
        <div class="container">
          <a class="brand" href="index.html" aria-label="${esc(C.BUSINESS_NAME)} home">
            <img src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}" width="900" height="317"
                 onerror="this.nextElementSibling.hidden=false;this.remove()">
            <span hidden>${esc(C.BUSINESS_NAME)}</span>
          </a>
          <button class="nav-toggle" aria-label="Menu" aria-expanded="false">☰</button>
          <nav class="nav">
            <a href="index.html#how">How it works</a>
            <a href="index.html#pricing">Pricing</a>
            <a href="index.html#area">Service area</a>
            <a href="pharmacies.html">For pharmacies</a>
            <a href="app.html" class="btn btn-primary btn-sm" id="nav-account">Order a delivery</a>
          </nav>
        </div>`;
      const toggle = header.querySelector('.nav-toggle');
      const nav = header.querySelector('.nav');
      toggle.addEventListener('click', () => {
        const open = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open);
      });
    }

    const footer = document.getElementById('site-footer');
    if (footer) {
      footer.className = 'site-footer';
      const year = new Date().getFullYear();
      footer.innerHTML = `
        <div class="container">
          <div class="footer-grid">
            <div>
              <img class="footer-logo" src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}" onerror="this.remove()">
              <p>Local prescription pickup and delivery across Champaign County and Vermilion County, Illinois. We work for you, not the pharmacy.</p>
              <p class="small">We are a delivery service, not a pharmacy. For questions about your medication, talk to your pharmacist or doctor. In an emergency, call 911.</p>
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                <li><a href="tel:${esc(C.PHONE.replace(/[^\d+]/g, ''))}">${esc(C.PHONE)}</a></li>
                <li><a href="mailto:${esc(C.EMAIL)}">${esc(C.EMAIL)}</a></li>
                <li>${esc(C.HOURS)}</li>
              </ul>
            </div>
            <div>
              <h4>More</h4>
              <ul>
                <li><a href="pharmacies.html">For pharmacies</a></li>
                <li><a href="terms.html">Terms of Service</a></li>
                <li><a href="privacy.html">Privacy Policy</a></li>
                <li><a href="admin.html">Staff login</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">© ${year} ${esc(C.LEGAL_NAME)}. All rights reserved.</div>
        </div>`;
    }

    // Show "My account" in the header when signed in
    getSession().then((s) => {
      const link = document.getElementById('nav-account');
      if (s && link) link.textContent = 'My account';
    });
  }

  // Address / pharmacy suggestions powered by Google Places (through our backend)
  function attachAutocomplete(input, kind, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'ac-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('ul');
    list.className = 'ac-list hidden';
    list.setAttribute('role', 'listbox');
    wrap.appendChild(list);
    input.setAttribute('autocomplete', 'off');

    let timer = null;
    let items = [];
    let active = -1;
    let lastQuery = '';

    const close = () => { list.classList.add('hidden'); active = -1; };
    const pick = (i) => {
      const it = items[i];
      if (!it) return;
      onPick(it);
      close();
    };
    const render = () => {
      if (!items.length) return close();
      list.innerHTML = items.map((it, i) =>
        `<li role="option" data-i="${i}" class="${i === active ? 'active' : ''}">${esc(it.main)}<small>${esc(it.secondary)}</small></li>`
      ).join('');
      list.classList.remove('hidden');
    };

    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 3) { items = []; return close(); }
      timer = setTimeout(async () => {
        lastQuery = q;
        try {
          const { suggestions } = await api(`/api/places?kind=${kind}&q=${encodeURIComponent(q)}`);
          if (lastQuery !== q) return;
          items = suggestions || [];
          active = -1;
          render();
        } catch { close(); }
      }, 300);
    });
    input.addEventListener('keydown', (e) => {
      if (list.classList.contains('hidden')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li');
      if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
    });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }

  window.LT = { C, READY, sb, esc, money, fmtDate, fmtDay, api, getSession, signIn, signOut, googleButton, alertBox, renderChrome, attachAutocomplete, STATUS };
  document.addEventListener('DOMContentLoaded', renderChrome);
})();
