// Liyfe Transpo customer app: sign in, step-by-step registration, home + route tracker,
// activity, new delivery checkout, and account.
(function () {
  const { C, sb, esc, money, fmtDate, fmtDay, api, getSession, signIn, signOut, attachAutocomplete, STATUS } = window.LT;
  const { icon, GOOGLE, STAGES, STAGE_SHORT, ACTIVE, pillClass, initials, telHref, shortDate, toast, openSheet, closeOverlay, confirmSheet } = window.UI;
  const root = document.getElementById('root');

  let session = null;
  let me = null;
  let orders = [];
  let tab = 'home';

  const HEADLINE = {
    pending_payment: 'Waiting for payment',
    paid: 'Order received',
    pharmacy_confirmed: 'Pharmacy confirmed',
    picked_up: 'Picked up',
    out_for_delivery: 'On the way to you',
    delivered: 'Delivered',
    issue: 'We need to reach you',
    canceled: 'Canceled',
  };
  const SUBLINE = {
    pending_payment: 'Finish paying so we can schedule your pickup.',
    paid: "We're checking with your pharmacy.",
    pharmacy_confirmed: 'Your order is ready. A driver is heading to the pharmacy.',
    picked_up: 'Your sealed bag is with our driver.',
    out_for_delivery: 'Your driver is heading to your door.',
    delivered: 'Dropped off. Thanks for riding with Liyfe.',
    issue: 'Something needs your attention. We will call you, or you can call us.',
    canceled: 'This order was canceled.',
  };
  const COPAY = {
    no_copay: ['No copay', "It's $0 or already covered"],
    prepaid: ["I'll pay the pharmacy", 'By phone, before we pick up'],
    need_help: ['Not sure', "Call me and we'll sort it out"],
  };

  const firstName = () => ((me?.profile?.full_name || '').split(' ')[0]) || 'there';
  const homeAddress = (p) => [p.address_line1, p.address_line2, p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const normName = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

  // ================================================================ boot
  async function boot() {
    root.innerHTML = '';
    if (!window.LT.READY) return renderComingSoon();
    session = await getSession();
    if (!session) return renderSignIn();
    try {
      me = await api('/api/me');
    } catch (err) {
      return renderProblem(err.message);
    }
    if (!me.profileComplete) return startOnboarding('name');
    if (!me.authorizationCurrent) return startOnboarding('sign');
    if (!me.profile.pharmacy_notice_ack) return startOnboarding('notify');
    await loadOrders();
    renderShell();
    handleStripeReturn();
  }

  async function loadOrders() {
    const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100);
    orders = error ? [] : data;
  }

  function renderProblem(message) {
    root.innerHTML = `
      <div class="signin"><div class="signin-inner">
        <img class="signin-logo" src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}">
        <h1>We couldn't load your account</h1>
        <p>${esc(message)}</p>
        <button class="btn btn-white btn-block" id="retry">Try again</button>
      </div><div></div></div>`;
    document.getElementById('retry').onclick = boot;
  }

  function renderComingSoon() {
    root.innerHTML = `
      <div class="signin">
        <div class="signin-inner">
          <img class="signin-logo" src="assets/img/logo-full.webp" alt="${esc(C.LEGAL_NAME)}">
          <h1>Online ordering opens soon</h1>
          <p>Until then, call us. We'll take your details and handle the pickup.</p>
          <a class="btn btn-red btn-block" href="${telHref(C.PHONE)}">${icon('phone')} Call ${esc(C.PHONE)}</a>
        </div>
        <div class="signin-foot"><a href="index.html">Back to the home page</a></div>
      </div>`;
  }

  // ================================================================ sign in
  function renderSignIn() {
    root.innerHTML = `
      <div class="signin">
        <div class="signin-inner">
          <img class="signin-logo" src="assets/img/logo-full.webp" alt="${esc(C.LEGAL_NAME)}">
          <h1>Prescriptions, picked up and brought home.</h1>
          <p>Sign in to order a delivery or check on one.</p>
          <button class="btn btn-white btn-block" id="google">${GOOGLE}<span>Continue with Google</span></button>
        </div>
        <div class="signin-foot">
          By continuing you agree to our <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.<br>
          <a href="index.html">Back to the home page</a>
        </div>
      </div>`;
    document.getElementById('google').onclick = () => signIn('app.html');
  }

  // ================================================================ step-by-step flow engine
  function runFlow(cfg) {
    let i = cfg.startAt || 0;
    const state = cfg.state;
    const el = document.createElement('div');
    el.className = 'flow';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);

    function draw() {
      const s = cfg.steps[i];
      const canBack = i > 0 || cfg.closable;
      const pct = Math.round(((i + 1) / cfg.steps.length) * 100);
      const cta = typeof s.cta === 'function' ? s.cta(state) : (s.cta || 'Continue');
      el.innerHTML = `
        <div class="flow-head">
          ${canBack ? `<button class="icon-btn" data-back aria-label="${i > 0 ? 'Back' : 'Close'}">${icon(i > 0 ? 'chevL' : 'x')}</button>` : '<span style="width:44px"></span>'}
          ${s.hideProgress ? '<span style="flex:1"></span>' : `<div class="progress" aria-label="Step ${i + 1} of ${cfg.steps.length}"><i style="width:${pct}%"></i></div>`}
          ${cfg.closable && i > 0 ? `<button class="icon-btn" data-close-flow aria-label="Close">${icon('x')}</button>` : '<span style="width:44px"></span>'}
        </div>
        <div class="flow-body"><div class="flow-inner"><div class="flow-step">${s.html(state)}</div></div></div>
        <div class="flow-foot">
          <div class="inline-err" data-err role="alert"></div>
          <button class="btn btn-red btn-block" data-next>${cta}</button>
          ${s.skip ? `<button class="btn btn-ghost btn-block" data-skip>${esc(s.skip)}</button>` : ''}
        </div>`;
      if (s.mount) s.mount(el, state, { go, error: setErr });
      el.querySelector('[data-next]').addEventListener('click', next);
      el.querySelector('[data-back]')?.addEventListener('click', back);
      el.querySelector('[data-close-flow]')?.addEventListener('click', () => { close(); cfg.onClose && cfg.onClose(); });
      el.querySelector('[data-skip]')?.addEventListener('click', () => { s.onSkip && s.onSkip(state); go(i + 1); });
      el.querySelector('.flow-body').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && !e.target.closest('.ac-wrap')) {
          e.preventDefault();
          next();
        }
      });
      const first = el.querySelector('.flow-body [data-autofocus]');
      if (first) setTimeout(() => first.focus(), 60);
    }

    function setErr(msg) { const e = el.querySelector('[data-err]'); if (e) e.textContent = msg || ''; }

    async function next() {
      const s = cfg.steps[i];
      const btn = el.querySelector('[data-next]');
      setErr('');
      if (s.collect) s.collect(el, state);
      btn.disabled = true;
      try {
        const problem = s.validate ? await s.validate(state) : null;
        if (problem) { setErr(problem); return; }
        if (s.submit) {
          const r = await s.submit(state, btn);
          if (r === 'stay') return;
        }
        go(i + 1);
      } catch (err) {
        setErr(err.message);
      } finally {
        if (btn.isConnected && !btn.dataset.busy) btn.disabled = false;
      }
    }
    function go(n) {
      if (n >= cfg.steps.length) { close(); if (cfg.onDone) cfg.onDone(state); return; }
      i = Math.max(0, n);
      draw();
      el.querySelector('.flow-body').scrollTop = 0;
    }
    function back() {
      const s = cfg.steps[i];
      if (s.collect) s.collect(el, state);
      if (i === 0) { close(); if (cfg.onClose) cfg.onClose(); } else go(i - 1);
    }
    function close() { el.remove(); }
    draw();
    return { close, go };
  }

  const val = (el, id) => (el.querySelector('#' + id)?.value || '').trim();

  // ================================================================ registration
  function validateProfile(v) {
    if (!v.full_name || v.full_name.split(' ').filter(Boolean).length < 2) return 'Enter your first and last name.';
    if (!v.date_of_birth) return 'Enter your date of birth.';
    const age = (Date.now() - new Date(v.date_of_birth + 'T00:00:00').getTime()) / (365.25 * 86400000);
    if (!(age >= 18)) return 'You need to be 18 or older. A parent or guardian can sign up instead.';
    if (age > 120) return 'Check your date of birth.';
    const digits = (v.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (digits.length !== 10) return 'Enter a 10-digit phone number.';
    v.phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (!v.address_line1 || !v.city) return 'Enter your street address and city.';
    v.state = (v.state || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(v.state)) return 'Enter the 2-letter state, like IL.';
    if (!/^\d{5}(-\d{4})?$/.test(v.zip || '')) return 'Enter a 5-digit ZIP code.';
    return null;
  }

  function addressFields(p, prefix = 'p') {
    return `
      <div class="field"><label for="${prefix}-line1">Street address</label>
        <input id="${prefix}-line1" value="${esc(p.address_line1 || '')}" autocomplete="address-line1" placeholder="Start typing your address" data-autofocus></div>
      <div class="field"><label for="${prefix}-line2">Apt, suite, unit <span class="opt">(optional)</span></label>
        <input id="${prefix}-line2" value="${esc(p.address_line2 || '')}" autocomplete="address-line2"></div>
      <div class="field-row-3">
        <div class="field"><label for="${prefix}-city">City</label><input id="${prefix}-city" value="${esc(p.city || '')}" autocomplete="address-level2"></div>
        <div class="field"><label for="${prefix}-state">State</label><input id="${prefix}-state" value="${esc(p.state || 'IL')}" maxlength="2" autocomplete="address-level1"></div>
        <div class="field"><label for="${prefix}-zip">ZIP</label><input id="${prefix}-zip" value="${esc(p.zip || '')}" inputmode="numeric" maxlength="10" autocomplete="postal-code"></div>
      </div>`;
  }
  function mountAddress(el, prefix = 'p') {
    const line1 = el.querySelector(`#${prefix}-line1`);
    attachAutocomplete(line1, 'address', (it) => {
      line1.value = it.main;
      const parts = (it.secondary || '').split(',').map((s) => s.trim());
      if (parts[0]) el.querySelector(`#${prefix}-city`).value = parts[0];
      const st = (parts[1] || '').match(/^([A-Z]{2})(?:\s+(\d{5}))?/);
      if (st) {
        el.querySelector(`#${prefix}-state`).value = st[1];
        if (st[2]) el.querySelector(`#${prefix}-zip`).value = st[2];
      }
      el.querySelector(`#${prefix}-zip`).focus();
    });
  }
  function readAddress(el, v, prefix = 'p') {
    v.address_line1 = val(el, `${prefix}-line1`) || null;
    v.address_line2 = val(el, `${prefix}-line2`) || null;
    v.city = val(el, `${prefix}-city`) || null;
    v.state = (val(el, `${prefix}-state`) || '').toUpperCase() || null;
    v.zip = val(el, `${prefix}-zip`) || null;
  }

  async function saveProfile(v) {
    const row = {
      id: session.user.id, email: session.user.email,
      full_name: v.full_name, date_of_birth: v.date_of_birth, phone: v.phone,
      address_line1: v.address_line1, address_line2: v.address_line2, city: v.city, state: v.state, zip: v.zip,
      preferred_pharmacy_name: v.preferred_pharmacy_name || null, preferred_pharmacy_address: v.preferred_pharmacy_address || null,
    };
    const { error } = await sb.from('profiles').upsert(row);
    if (error) throw new Error("We couldn't save your information. Try again.");
    // A new name means the old signature no longer matches; they'll sign again.
    if (me.authorization && normName(me.authorization.signature_name) !== normName(v.full_name)) {
      await api('/api/authorizations/revoke', { method: 'POST' });
    }
    me = await api('/api/me');
  }

  function startOnboarding(startStep) {
    const p = { ...(me.profile || {}) };
    if (!p.state) p.state = 'IL';
    const ids = ['name', 'dob', 'phone', 'address', 'pharmacy', 'review', 'sign', 'notify', 'done'];

    const steps = [
      { // name
        html: (s) => `
          <h1>What's your legal name?</h1>
          <p class="lead">Use the name on your prescription labels. Pharmacies check it before handing anything over.</p>
          <div class="field"><label for="f-name">Full legal name</label>
            <input id="f-name" class="input-big" value="${esc(s.full_name || '')}" autocomplete="name" placeholder="First Last" data-autofocus></div>`,
        collect: (el, s) => { s.full_name = val(el, 'f-name').replace(/\s+/g, ' '); },
        validate: (s) => (!s.full_name || s.full_name.split(' ').length < 2 ? 'Enter your first and last name.' : null),
      },
      { // dob
        html: (s) => `
          <h1>When's your birthday?</h1>
          <p class="lead">Pharmacies use your date of birth to confirm it's really you.</p>
          <div class="field"><label for="f-dob">Date of birth</label>
            <input id="f-dob" type="date" class="input-big" value="${esc(s.date_of_birth || '')}" data-autofocus></div>`,
        collect: (el, s) => { s.date_of_birth = val(el, 'f-dob'); },
        validate: (s) => {
          if (!s.date_of_birth) return 'Enter your date of birth.';
          const age = (Date.now() - new Date(s.date_of_birth + 'T00:00:00').getTime()) / (365.25 * 86400000);
          if (!(age >= 18)) return 'You need to be 18 or older. A parent or guardian can sign up instead.';
          return age > 120 ? 'Check your date of birth.' : null;
        },
      },
      { // phone
        html: (s) => `
          <h1>What's your mobile number?</h1>
          <p class="lead">We'll call or text you about your deliveries. Nothing else.</p>
          <div class="field"><label for="f-phone">Mobile number</label>
            <input id="f-phone" type="tel" class="input-big" value="${esc(s.phone || '')}" autocomplete="tel" placeholder="(217) 555-0123" data-autofocus></div>`,
        mount: (el) => {
          const inp = el.querySelector('#f-phone');
          inp.addEventListener('input', () => {
            const d = inp.value.replace(/\D/g, '').slice(0, 10);
            inp.value = d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d;
          });
        },
        collect: (el, s) => { s.phone = val(el, 'f-phone'); },
        validate: (s) => (s.phone.replace(/\D/g, '').length !== 10 ? 'Enter a 10-digit phone number.' : null),
      },
      { // address
        html: (s) => `
          <h1>Where do you live?</h1>
          <p class="lead">This is your home address. We'll deliver here unless you choose somewhere else.</p>
          ${addressFields(s, 'p')}`,
        mount: (el) => mountAddress(el, 'p'),
        collect: (el, s) => readAddress(el, s, 'p'),
        validate: (s) => {
          if (!s.address_line1 || !s.city) return 'Enter your street address and city.';
          if (!/^[A-Z]{2}$/.test(s.state || '')) return 'Enter the 2-letter state, like IL.';
          return /^\d{5}(-\d{4})?$/.test(s.zip || '') ? null : 'Enter a 5-digit ZIP code.';
        },
      },
      { // usual pharmacy
        html: (s) => `
          <h1>Which pharmacy do you use?</h1>
          <p class="lead">Optional. We'll fill it in for you each time you order.</p>
          <div class="field"><label for="f-ph-name">Pharmacy</label>
            <input id="f-ph-name" value="${esc(s.preferred_pharmacy_name || '')}" placeholder="Search, like Walgreens Champaign" data-autofocus></div>
          <div class="field"><label for="f-ph-addr">Pharmacy address</label>
            <input id="f-ph-addr" value="${esc(s.preferred_pharmacy_address || '')}" placeholder="Fills in when you pick a pharmacy"></div>`,
        mount: (el) => attachAutocomplete(el.querySelector('#f-ph-name'), 'pharmacy', (it) => {
          el.querySelector('#f-ph-name').value = it.main;
          el.querySelector('#f-ph-addr').value = it.secondary || it.full;
        }),
        collect: (el, s) => {
          s.preferred_pharmacy_name = val(el, 'f-ph-name');
          s.preferred_pharmacy_address = val(el, 'f-ph-addr');
        },
        skip: 'Skip for now',
        onSkip: (s) => { s.preferred_pharmacy_name = ''; s.preferred_pharmacy_address = ''; },
      },
      { // review
        html: (s) => `
          <h1>Does this look right?</h1>
          <p class="lead">Pharmacies match these details to your prescriptions, so they need to be exact.</p>
          <div class="list">
            ${[
              ['name', 'Legal name', s.full_name],
              ['dob', 'Date of birth', fmtDay(s.date_of_birth)],
              ['phone', 'Mobile', s.phone],
              ['address', 'Home', homeAddress(s)],
              ['pharmacy', 'Usual pharmacy', s.preferred_pharmacy_name ? `${s.preferred_pharmacy_name}, ${s.preferred_pharmacy_address}` : 'None yet'],
            ].map(([id, k, v]) => `
              <button class="list-row" data-edit="${id}">
                <div class="grow"><small>${esc(k)}</small>${esc(v || '')}</div>
                <span class="chev">${icon('edit', 'icon-sm')}</span>
              </button>`).join('')}
          </div>`,
        mount: (el, s, ctl) => el.querySelectorAll('[data-edit]').forEach((b) =>
          b.addEventListener('click', () => ctl.go(ids.indexOf(b.dataset.edit)))),
        cta: 'Save and continue',
        validate: (s) => validateProfile(s),
        submit: (s) => saveProfile(s),
      },
      { // sign authorization
        html: (s) => `
          <h1>Make Liyfe Transpo your authorized pickup</h1>
          <p class="lead">You're hiring us to pick up your prescriptions for you. Read it, then sign with your name.</p>
          <div class="agreement" id="agreement" tabindex="0">Loading the authorization…</div>
          <label class="check-row"><input type="checkbox" id="f-agree"> <span>I've read and agree to this authorization.</span></label>
          <div class="sig-pad">
            <input id="f-sig" autocomplete="off" aria-label="Type your full legal name to sign" placeholder="Sign here">
            <small><span>Type your name to sign: ${esc(s.full_name || me.profile.full_name)}</span><span>${new Date().toLocaleDateString()}</span></small>
          </div>`,
        mount: async (el, s) => {
          try {
            const a = await api('/api/agreement', { auth: false });
            s.agreementVersion = a.version;
            const box = el.querySelector('#agreement');
            if (box) box.textContent = a.text;
          } catch {
            const box = el.querySelector('#agreement');
            if (box) box.textContent = "The authorization didn't load. Close the app and try again.";
          }
        },
        cta: 'Sign authorization',
        collect: (el, s) => { s.agree = el.querySelector('#f-agree').checked; s.sig = val(el, 'f-sig'); },
        validate: (s) => {
          if (!s.agree) return 'Check the box to agree.';
          const name = me.profile.full_name;
          return normName(s.sig) === normName(name) ? null : `Type your name exactly as: ${name}`;
        },
        submit: async (s) => {
          await api('/api/authorizations', { method: 'POST', body: { signature_name: s.sig, agree: true } });
          me = await api('/api/me');
        },
      },
      { // notify pharmacy
        html: () => `
          <h1>Tell your pharmacy we're your pickup</h1>
          <p class="lead">Pharmacies keep their own list of who can pick up for you. Call or stop by and say:</p>
          <div class="script-card">"I'd like to add <b>Liyfe Transpo</b> as an authorized person to pick up my prescriptions."</div>
          <div style="display:grid;gap:10px;margin-bottom:8px">
            <a class="btn btn-dark btn-block" href="authorization-letter.html" target="_blank" rel="noopener">${icon('file')} Open my authorization letter</a>
            <button class="btn btn-dark btn-block" id="copy-script" type="button">${icon('copy')} Copy what to say</button>
          </div>
          <p class="hint">Some pharmacies have their own form. Fill that out if they ask.</p>
          <label class="check-row"><input type="checkbox" id="f-told"> <span>I've told my pharmacy, or I will before my first delivery.</span></label>`,
        mount: (el) => el.querySelector('#copy-script').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText("I'd like to add Liyfe Transpo as an authorized person to pick up my prescriptions.");
            toast('Copied');
          } catch { toast("Couldn't copy on this device", true); }
        }),
        cta: 'Finish setup',
        collect: (el, s) => { s.told = el.querySelector('#f-told').checked; },
        validate: (s) => (s.told ? null : 'Check the box to confirm.'),
        submit: async () => {
          const { error } = await sb.from('profiles').update({ pharmacy_notice_ack: true }).eq('id', session.user.id);
          if (error) throw new Error("We couldn't save that. Try again.");
          me = await api('/api/me');
        },
      },
      { // done
        hideProgress: true,
        html: () => `
          <div class="success">
            <div class="success-mark"><svg class="icon" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></div>
            <h1>You're all set, ${esc(firstName())}</h1>
            <p class="lead" style="margin:0 auto">When your prescription is ready, order a delivery and we'll bring it home.</p>
          </div>`,
        cta: 'Go to my account',
      },
    ];

    runFlow({
      steps,
      state: p,
      startAt: Math.max(0, ids.indexOf(startStep)),
      onDone: () => boot(),
    });
  }

  // ================================================================ app shell
  function renderShell() {
    root.innerHTML = `
      <div class="shell">
        <aside class="rail" aria-label="Main">
          <img class="rail-logo" src="assets/img/logo.webp" alt="${esc(C.LEGAL_NAME)}">
          <button class="btn btn-red btn-block" data-new>${icon('plus')} New delivery</button>
          <a href="#" data-tab="home">${icon('home')} Home</a>
          <a href="#" data-tab="activity">${icon('receipt')} Activity</a>
          <a href="#" data-tab="account">${icon('user')} Account</a>
          <div class="rail-spacer"></div>
          <a href="${telHref(C.PHONE)}">${icon('phone')} Call ${esc(C.PHONE)}</a>
        </aside>
        <main class="main"><div class="screen" id="screen"></div></main>
        <nav class="tabbar" aria-label="Main">
          <button class="tab" data-tab="home">${icon('home')}Home</button>
          <button class="tab" data-tab="activity">${icon('receipt')}Activity</button>
          <button class="tab-new" data-new aria-label="New delivery">${icon('plus')}</button>
          <a class="tab" href="${telHref(C.PHONE)}">${icon('phone')}Call us</a>
          <button class="tab" data-tab="account">${icon('user')}Account</button>
        </nav>
      </div>`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); setTab(b.dataset.tab); }));
    root.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', startNewDelivery));
    setTab(tab);
  }

  function setTab(t) {
    tab = t;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    const screen = document.getElementById('screen');
    if (t === 'home') renderHome(screen);
    else if (t === 'activity') renderActivity(screen);
    else renderAccount(screen);
    window.scrollTo(0, 0);
  }

  function topbar() {
    return `
      <div class="topbar">
        <button class="avatar" data-go-account aria-label="Account">${esc(initials(me.profile.full_name))}</button>
        <img class="topbar-logo" src="assets/img/logo.webp" alt="${esc(C.BUSINESS_NAME)}">
        <a class="icon-btn" href="${telHref(C.PHONE)}" aria-label="Call us">${icon('phone')}</a>
      </div>`;
  }
  function bindTopbar(el) {
    el.querySelector('[data-go-account]')?.addEventListener('click', () => setTab('account'));
  }

  // ================================================================ home
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function currentOrder() {
    const active = orders.find((o) => ACTIVE.includes(o.status));
    if (active) return active;
    const recent = orders.find((o) => o.status === 'delivered');
    if (recent && Date.now() - new Date(recent.delivered_at || recent.updated_at).getTime() < 24 * 3600 * 1000) return recent;
    return null;
  }

  function trackerHTML(o) {
    let idx = STAGES.indexOf(o.status);
    if (o.status === 'issue') idx = 1;
    const pct = idx < 0 ? 0 : (idx / (STAGES.length - 1)) * 100;
    return `
      <div class="card tracker">
        <div class="tracker-top">
          <div>
            <div class="muted small">Order LT-${o.order_number}</div>
            <div class="tracker-status">${esc(HEADLINE[o.status] || o.status)}</div>
            <div class="tracker-sub">${esc(SUBLINE[o.status] || '')}</div>
          </div>
          <span class="pill ${pillClass(o.status)}">${esc(STATUS[o.status] || o.status)}</span>
        </div>
        <div class="road" data-pct="${pct}" role="img" aria-label="Delivery progress: ${esc(HEADLINE[o.status] || '')}">
          <div class="road-strip"></div>
          <div class="road-fill" style="width:0%"></div>
          <div class="road-car" style="left:4%">${icon('car')}</div>
        </div>
        <div class="road-stops">
          ${STAGES.map((s, i) => `<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${STAGE_SHORT[s]}</span>`).join('')}
        </div>
        <div class="tracker-route">
          <span class="dot dot-from"></span><div><b>${esc(o.pharmacy_name)}</b><div class="muted small">${esc(o.pharmacy_address)}</div></div>
          <span class="dot dot-to"></span><div><b>Your door</b><div class="muted small">${esc(o.delivery_address)}</div></div>
        </div>
        ${o.status === 'pending_payment' ? `<button class="btn btn-red btn-block mt" data-pay="${o.id}">${icon('card')} Pay ${money(o.total_cents)}</button>` : ''}
        ${o.status === 'issue' ? `<a class="btn btn-white btn-block mt" href="${telHref(C.PHONE)}">${icon('phone')} Call us</a>` : ''}
      </div>`;
  }

  function animateRoad(scope) {
    const road = scope.querySelector('.road');
    if (!road) return;
    const pct = Number(road.dataset.pct);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      road.querySelector('.road-fill').style.width = pct + '%';
      road.querySelector('.road-car').style.left = Math.min(96, Math.max(4, pct)) + '%';
    }));
  }

  function feedRow(o) {
    return `
      <button class="feed-row" data-order="${o.id}">
        <span class="feed-icon">${icon(o.status === 'delivered' ? 'check' : 'store')}</span>
        <span style="min-width:0">
          <div class="feed-title">${esc(o.pharmacy_name)}</div>
          <div class="feed-sub">${esc(STATUS[o.status] || o.status)}, ${esc(shortDate(o.created_at))}</div>
        </span>
        <span class="feed-amt"><div class="num">${money(o.total_cents)}</div><div class="feed-sub">LT-${o.order_number}</div></span>
      </button>`;
  }

  function bindFeed(scope) {
    scope.querySelectorAll('[data-order]').forEach((b) => b.addEventListener('click', () => {
      const o = orders.find((x) => x.id === b.dataset.order);
      if (o) openOrder(o);
    }));
    scope.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', () => payExisting(b.dataset.pay, b)));
  }

  function renderHome(screen) {
    const o = currentOrder();
    screen.innerHTML = `
      ${topbar()}
      <div class="greet">
        <h1>${greeting()}, ${esc(firstName())}</h1>
        <p>${o ? 'Here is where your delivery stands.' : 'Your prescriptions, picked up and brought home.'}</p>
      </div>
      ${o ? trackerHTML(o) : `
        <div class="card tracker empty-road">
          <div class="road" data-pct="0" aria-hidden="true">
            <div class="road-strip"></div><div class="road-fill" style="width:0%"></div>
            <div class="road-car" style="left:4%">${icon('car')}</div>
          </div>
          <h2>Nothing on the road right now</h2>
          <p>When your pharmacy says your prescription is ready, we'll go get it.</p>
          <button class="btn btn-red btn-block" data-new-home>${icon('plus')} New delivery</button>
        </div>`}
      <div class="quick">
        <button data-new-home>${'<span class="qi">' + icon('plus') + '</span>'}New</button>
        <a href="authorization-letter.html" target="_blank" rel="noopener"><span class="qi">${icon('file')}</span>My letter</a>
        <button data-prices><span class="qi">${icon('tag')}</span>Prices</button>
        <a href="${telHref(C.PHONE)}"><span class="qi">${icon('phone')}</span>Call us</a>
      </div>
      <div class="section-title">Recent activity ${orders.length ? '<button data-see-all>See all</button>' : ''}</div>
      <div class="feed">
        ${orders.length ? orders.slice(0, 4).map(feedRow).join('') : '<div class="feed-empty">Your deliveries will show up here.</div>'}
      </div>`;
    bindTopbar(screen);
    bindFeed(screen);
    animateRoad(screen);
    screen.querySelectorAll('[data-new-home]').forEach((b) => b.addEventListener('click', startNewDelivery));
    screen.querySelector('[data-prices]').addEventListener('click', openPrices);
    screen.querySelector('[data-see-all]')?.addEventListener('click', () => setTab('activity'));
  }

  function openPrices() {
    const tiers = Math.ceil(C.MAX_MILES / C.TIER_MILES);
    let rows = '';
    for (let n = 1; n <= tiers; n++) {
      rows += `<div class="line"><span>${n === 1 ? 'Up to' : `${(n - 1) * C.TIER_MILES}–`}${n === 1 ? ' ' : ''}${n * C.TIER_MILES} miles</span><span class="num">$${(C.TIER_PRICE * n).toFixed(2)}</span></div>`;
    }
    openSheet(`
      <div class="sheet-head"><h2>Delivery prices</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <p class="muted">Based on the driving distance from your pharmacy to your door, in ${C.TIER_MILES}-mile steps.</p>
      <div class="lines">${rows}<div class="line"><span>Service fee, every order</span><span class="num">+$${C.SERVICE_FEE.toFixed(2)}</span></div></div>
      <p class="hint">Your copay is separate and goes to the pharmacy. We deliver up to ${C.MAX_MILES} miles.</p>`);
  }

  // ================================================================ activity
  function renderActivity(screen) {
    let html = '';
    let month = '';
    for (const o of orders) {
      const m = new Date(o.created_at).toLocaleDateString([], { month: 'long', year: 'numeric' });
      if (m !== month) { html += `<div class="feed-group">${esc(m)}</div>`; month = m; }
      html += feedRow(o);
    }
    screen.innerHTML = `
      ${topbar()}
      <div class="greet"><h1>Activity</h1><p>Every delivery you've ordered.</p></div>
      <div class="feed">${html || `<div class="feed-empty">No deliveries yet.<br><br><button class="btn btn-red" data-new-act>${icon('plus')} New delivery</button></div>`}</div>`;
    bindTopbar(screen);
    bindFeed(screen);
    screen.querySelector('[data-new-act]')?.addEventListener('click', startNewDelivery);
  }

  function openOrder(o) {
    let idx = STAGES.indexOf(o.status);
    if (o.status === 'issue') idx = 1;
    const showTimeline = !['canceled', 'pending_payment'].includes(o.status);
    const [copayTitle] = COPAY[o.copay_option] || ['—'];
    openSheet(`
      <div class="sheet-head"><h2>Order LT-${o.order_number}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="amount" style="margin:14px 0 6px"><div class="num">${money(o.total_cents)}</div>
        <p><span class="pill ${pillClass(o.status)}">${esc(STATUS[o.status] || o.status)}</span></p></div>
      ${showTimeline ? `<ol class="timeline">${STAGES.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${esc(STAGE_SHORT[s])}</li>`).join('')}</ol>` : ''}
      <div class="lines">
        <div class="line"><span>From</span><span>${esc(o.pharmacy_name)}<br><small class="muted">${esc(o.pharmacy_address)}</small></span></div>
        <div class="line"><span>To</span><span>${esc(o.delivery_address)}</span></div>
        <div class="line"><span>Distance</span><span>${o.miles} mi</span></div>
        <div class="line"><span>Delivery (${o.tiers} × ${money(o.delivery_fee_cents / o.tiers)})</span><span>${money(o.delivery_fee_cents)}</span></div>
        <div class="line"><span>Service fee</span><span>${money(o.service_fee_cents)}</span></div>
        <div class="line total"><span>Total</span><span>${money(o.total_cents)}</span></div>
      </div>
      <div class="lines mt">
        ${o.rx_numbers ? `<div class="line"><span>Rx number(s)</span><span>${esc(o.rx_numbers)}</span></div>` : ''}
        <div class="line"><span>Copay</span><span>${esc(copayTitle)}</span></div>
        <div class="line"><span>Ordered</span><span>${esc(fmtDate(o.created_at))}</span></div>
        ${o.paid_at ? `<div class="line"><span>Paid</span><span>${esc(fmtDate(o.paid_at))}</span></div>` : ''}
        ${o.delivered_at ? `<div class="line"><span>Delivered</span><span>${esc(fmtDate(o.delivered_at))}</span></div>` : ''}
      </div>
      <div style="display:grid;gap:8px;margin-top:18px">
        ${o.status === 'pending_payment' ? `
          <button class="btn btn-red btn-block" data-pay="${o.id}">${icon('card')} Pay ${money(o.total_cents)}</button>
          <button class="btn btn-ghost btn-block" data-cancel>Cancel order</button>` : ''}
        <a class="btn btn-dark btn-block" href="${telHref(C.PHONE)}">${icon('phone')} Questions? Call us</a>
      </div>`, (el) => {
      el.querySelector('[data-pay]')?.addEventListener('click', (e) => payExisting(o.id, e.currentTarget));
      el.querySelector('[data-cancel]')?.addEventListener('click', async () => {
        closeOverlay();
        const yes = await confirmSheet({ title: 'Cancel this order?', body: "It hasn't been paid, so nothing will be charged.", action: 'Cancel order', danger: true });
        if (!yes) return;
        try {
          await api(`/api/orders/${o.id}/cancel`, { method: 'POST' });
          await loadOrders();
          setTab(tab);
          toast('Order canceled');
        } catch (err) { toast(err.message, true); }
      });
    });
  }

  async function payExisting(id, btn) {
    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Opening checkout…'; }
      const { checkout_url } = await api(`/api/orders/${id}/pay`, { method: 'POST' });
      window.location.href = checkout_url;
    } catch (err) {
      toast(err.message, true);
      if (btn) btn.disabled = false;
    }
  }

  // ================================================================ new delivery
  function startNewDelivery() {
    const p = me.profile;
    const home = homeAddress(p);
    const state = {
      pharmacy_name: p.preferred_pharmacy_name || '',
      pharmacy_address: p.preferred_pharmacy_address || '',
      pharmacy_phone: '',
      rx_numbers: '',
      rx_ready: false,
      controlled_substance: false,
      copay_option: null,
      delivery_address: home,
      delivery_instructions: '',
      quote: null,
    };

    const steps = [
      { // pharmacy
        html: (s) => `
          <h1>Where are we picking up?</h1>
          <p class="lead">Choose the pharmacy that has your prescription.</p>
          ${p.preferred_pharmacy_name ? `
            <button class="choice ${s.pharmacy_name === p.preferred_pharmacy_name ? 'on' : ''}" data-usual style="margin-bottom:16px">
              <span class="feed-icon">${icon('store')}</span>
              <span><b>${esc(p.preferred_pharmacy_name)}</b><span class="muted">${esc(p.preferred_pharmacy_address || 'Your usual pharmacy')}</span></span>
              <span class="tick"></span>
            </button>` : ''}
          <div class="field"><label for="n-ph">Pharmacy</label>
            <input id="n-ph" value="${esc(s.pharmacy_name)}" placeholder="Search, like CVS Urbana" ${p.preferred_pharmacy_name ? '' : 'data-autofocus'}></div>
          <div class="field"><label for="n-addr">Pharmacy address</label>
            <input id="n-addr" value="${esc(s.pharmacy_address)}" placeholder="Fills in when you pick a pharmacy"></div>
          <div class="field"><label for="n-phone">Pharmacy phone <span class="opt">(optional)</span></label>
            <input id="n-phone" type="tel" value="${esc(s.pharmacy_phone)}"></div>`,
        mount: (el) => {
          attachAutocomplete(el.querySelector('#n-ph'), 'pharmacy', (it) => {
            el.querySelector('#n-ph').value = it.main;
            el.querySelector('#n-addr').value = it.secondary || it.full;
            el.querySelector('[data-usual]')?.classList.remove('on');
          });
          attachAutocomplete(el.querySelector('#n-addr'), 'address', (it) => { el.querySelector('#n-addr').value = it.full; });
          el.querySelector('[data-usual]')?.addEventListener('click', (e) => {
            el.querySelector('#n-ph').value = p.preferred_pharmacy_name;
            el.querySelector('#n-addr').value = p.preferred_pharmacy_address || '';
            e.currentTarget.classList.add('on');
          });
        },
        collect: (el, s) => {
          s.pharmacy_name = val(el, 'n-ph');
          s.pharmacy_address = val(el, 'n-addr');
          s.pharmacy_phone = val(el, 'n-phone');
        },
        validate: (s) => (!s.pharmacy_name || !s.pharmacy_address ? 'Enter the pharmacy name and address.' : null),
      },
      { // prescription
        html: (s) => `
          <h1>About the prescription</h1>
          <p class="lead">You don't need to tell us the medication name.</p>
          <div class="field"><label for="n-rx">Prescription number(s) <span class="opt">(optional, but it helps)</span></label>
            <input id="n-rx" value="${esc(s.rx_numbers)}" placeholder="From your label or pharmacy text" data-autofocus></div>
          <label class="toggle-row">
            <span class="grow"><b>It's ready for pickup</b><span class="muted small">Your pharmacy told you it's ready</span></span>
            <span class="switch"><input type="checkbox" id="n-ready" ${s.rx_ready ? 'checked' : ''}><i></i></span>
          </label>
          <label class="toggle-row">
            <span class="grow"><b>Includes a controlled medication</b><span class="muted small">Some pain or ADHD medicines. We may ask for your signature or ID.</span></span>
            <span class="switch"><input type="checkbox" id="n-ctrl" ${s.controlled_substance ? 'checked' : ''}><i></i></span>
          </label>`,
        collect: (el, s) => {
          s.rx_numbers = val(el, 'n-rx');
          s.rx_ready = el.querySelector('#n-ready').checked;
          s.controlled_substance = el.querySelector('#n-ctrl').checked;
        },
      },
      { // copay
        html: (s) => `
          <h1>How's the copay handled?</h1>
          <p class="lead">Your copay goes to the pharmacy, not to us.</p>
          <div class="choices">
            ${Object.entries(COPAY).map(([k, [t, d]]) => `
              <button class="choice ${s.copay_option === k ? 'on' : ''}" data-copay="${k}">
                <span class="feed-icon">${icon(k === 'no_copay' ? 'check' : k === 'prepaid' ? 'card' : 'help')}</span>
                <span><b>${esc(t)}</b><span class="muted">${esc(d)}</span></span>
                <span class="tick"></span>
              </button>`).join('')}
          </div>`,
        mount: (el, s) => el.querySelectorAll('[data-copay]').forEach((b) => b.addEventListener('click', () => {
          s.copay_option = b.dataset.copay;
          el.querySelectorAll('[data-copay]').forEach((x) => x.classList.toggle('on', x === b));
        })),
        validate: (s) => (s.copay_option ? null : 'Choose one to continue.'),
      },
      { // drop-off
        html: (s) => `
          <h1>Where should we deliver?</h1>
          <p class="lead">Someone should be there to receive it.</p>
          <button class="choice ${s.delivery_address === home ? 'on' : ''}" data-home style="margin-bottom:16px">
            <span class="feed-icon">${icon('home')}</span>
            <span><b>Home</b><span class="muted">${esc(home)}</span></span>
            <span class="tick"></span>
          </button>
          <div class="field"><label for="n-to">Delivery address</label>
            <input id="n-to" value="${esc(s.delivery_address)}" placeholder="Or enter another address"></div>
          <div class="field"><label for="n-notes">Instructions for the driver <span class="opt">(optional)</span></label>
            <textarea id="n-notes" placeholder="Gate code, which door, best number to call">${esc(s.delivery_instructions)}</textarea></div>`,
        mount: (el) => {
          const to = el.querySelector('#n-to');
          const homeBtn = el.querySelector('[data-home]');
          attachAutocomplete(to, 'address', (it) => { to.value = it.full; homeBtn.classList.remove('on'); });
          to.addEventListener('input', () => homeBtn.classList.toggle('on', to.value.trim() === home));
          homeBtn.addEventListener('click', () => { to.value = home; homeBtn.classList.add('on'); });
        },
        collect: (el, s) => {
          s.delivery_address = val(el, 'n-to');
          s.delivery_instructions = val(el, 'n-notes');
        },
        validate: (s) => (s.delivery_address ? null : 'Enter where we should deliver.'),
        cta: 'See price',
        submit: async (s) => {
          s.quote = await api('/api/quote', { method: 'POST', body: { pickup_address: s.pharmacy_address, delivery_address: s.delivery_address } });
          if (!s.quote.inArea) {
            throw new Error(`That's ${s.quote.miles} driving miles. We deliver up to ${s.quote.maxMiles} miles from the pharmacy. Call ${C.PHONE} and we'll see what we can do.`);
          }
        },
      },
      { // review + pay
        html: (s) => {
          const q = s.quote;
          const [dollars, cents] = (q.totalCents / 100).toFixed(2).split('.');
          return `
            <div class="amount">
              <div class="num"><sup>$</sup>${dollars}<span style="font-size:.5em">.${cents}</span></div>
              <p>Pickup and delivery for ${esc(me.profile.full_name)}</p>
            </div>
            <div class="card tracker" style="padding:18px 20px;margin-bottom:14px">
              <div class="tracker-route" style="margin:0;padding:0;border:0">
                <span class="dot dot-from"></span><div><b>${esc(s.pharmacy_name)}</b><div class="muted small">${esc(s.pharmacy_address)}</div></div>
                <span class="dot dot-to"></span><div><b>${s.delivery_address === home ? 'Home' : 'Drop-off'}</b><div class="muted small">${esc(s.delivery_address)}</div></div>
              </div>
            </div>
            <div class="lines">
              <div class="line"><span>Driving distance</span><span>${q.miles} mi</span></div>
              <div class="line"><span>Delivery (${q.tiers} × ${money(q.tierPriceCents)})</span><span>${money(q.deliveryFeeCents)}</span></div>
              <div class="line"><span>Service fee</span><span>${money(q.serviceFeeCents)}</span></div>
              <div class="line total"><span>Total</span><span>${money(q.totalCents)}</span></div>
            </div>
            <p class="hint">Your pharmacy copay isn't included. Pay with card, Apple Pay, Google Pay, or Cash App Pay on the next screen.</p>
            ${s.rx_ready ? '' : '<div class="alert alert-amber">Wait until your pharmacy says it\'s ready, so the trip isn\'t wasted.</div>'}`;
        },
        cta: (s) => `${icon('card')} Pay ${money(s.quote.totalCents)}`,
        submit: async (s, btn) => {
          btn.dataset.busy = '1';
          btn.textContent = 'Opening secure checkout…';
          try {
            const body = { ...s };
            delete body.quote;
            const { checkout_url } = await api('/api/orders', { method: 'POST', body });
            window.location.href = checkout_url;
          } catch (err) {
            delete btn.dataset.busy;
            throw err;
          }
          return 'stay';
        },
      },
    ];

    runFlow({ steps, state, closable: true });
  }

  // ================================================================ account
  function renderAccount(screen) {
    const p = me.profile;
    const a = me.authorization;
    screen.innerHTML = `
      ${topbar()}
      <div class="profile-head">
        <div class="avatar avatar-lg" style="margin:0 auto">${esc(initials(p.full_name))}</div>
        <h1>${esc(p.full_name)}</h1>
        <div class="muted">${esc(me.email)}</div>
      </div>

      <div class="section-title">Personal info <button data-edit-info>Edit</button></div>
      <div class="list">
        ${[
          ['user', 'Legal name', p.full_name],
          ['clock', 'Date of birth', fmtDay(p.date_of_birth)],
          ['phone', 'Mobile', p.phone],
          ['home', 'Home', homeAddress(p)],
          ['store', 'Usual pharmacy', p.preferred_pharmacy_name ? `${p.preferred_pharmacy_name}, ${p.preferred_pharmacy_address || ''}` : 'Not set'],
        ].map(([ic, k, v]) => `<div class="list-row static">${icon(ic)}<div class="grow"><small>${esc(k)}</small>${esc(v || '')}</div></div>`).join('')}
      </div>

      <div class="section-title">Pickup authorization</div>
      <div class="list">
        <div class="list-row static">${icon('shield')}
          <div class="grow"><small>Status</small>${a ? `Active, signed ${esc(fmtDate(a.signed_at))}` : 'Not signed'}</div>
          <span class="pill ${a ? 'ok' : 'off'}">${a ? 'Active' : 'Off'}</span>
        </div>
        <a class="list-row" href="authorization-letter.html" target="_blank" rel="noopener">${icon('file')}<div class="grow">Authorization letter<small>Show or print it for your pharmacy</small></div><span class="chev">${icon('chevR')}</span></a>
        <button class="list-row danger" data-revoke>${icon('x')}<div class="grow">Revoke authorization<small>We'll stop picking up for you</small></div></button>
      </div>

      <div class="section-title">Help</div>
      <div class="list">
        <a class="list-row" href="${telHref(C.PHONE)}">${icon('phone')}<div class="grow">Call us<small>${esc(C.PHONE)}, ${esc(C.HOURS)}</small></div><span class="chev">${icon('chevR')}</span></a>
        <a class="list-row" href="mailto:${esc(C.EMAIL)}">${icon('mail')}<div class="grow">Email us<small>${esc(C.EMAIL)}</small></div><span class="chev">${icon('chevR')}</span></a>
        <a class="list-row" href="terms.html">${icon('file')}<div class="grow">Terms of Service</div><span class="chev">${icon('chevR')}</span></a>
        <a class="list-row" href="privacy.html">${icon('shield')}<div class="grow">Privacy Policy</div><span class="chev">${icon('chevR')}</span></a>
      </div>

      <div class="list mt">
        <button class="list-row danger" data-signout>${icon('logout')}<div class="grow">Sign out</div></button>
      </div>
      <p class="faint small" style="text-align:center;margin-top:22px">${esc(C.LEGAL_NAME)}. We're a delivery service, not a pharmacy.</p>`;
    bindTopbar(screen);
    screen.querySelector('[data-edit-info]').addEventListener('click', openEditInfo);
    screen.querySelector('[data-signout]').addEventListener('click', signOut);
    screen.querySelector('[data-revoke]').addEventListener('click', async () => {
      const yes = await confirmSheet({
        title: 'Revoke your authorization?',
        body: "We won't be able to pick up prescriptions for you until you sign again.",
        action: 'Revoke authorization',
        danger: true,
      });
      if (!yes) return;
      try {
        await api('/api/authorizations/revoke', { method: 'POST' });
        toast('Authorization revoked');
        boot();
      } catch (err) { toast(err.message, true); }
    });
  }

  function openEditInfo() {
    const p = me.profile;
    openSheet(`
      <div class="sheet-head"><h2>Edit personal info</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <p class="muted small">If you change your legal name, you'll sign the authorization again.</p>
      <div class="field"><label for="e-name">Legal name</label><input id="e-name" value="${esc(p.full_name || '')}"></div>
      <div class="field-row">
        <div class="field"><label for="e-dob">Date of birth</label><input id="e-dob" type="date" value="${esc(p.date_of_birth || '')}"></div>
        <div class="field"><label for="e-phone">Mobile</label><input id="e-phone" type="tel" value="${esc(p.phone || '')}"></div>
      </div>
      ${addressFields(p, 'e')}
      <div class="field"><label for="e-ph-name">Usual pharmacy <span class="opt">(optional)</span></label><input id="e-ph-name" value="${esc(p.preferred_pharmacy_name || '')}"></div>
      <div class="field"><label for="e-ph-addr">Pharmacy address</label><input id="e-ph-addr" value="${esc(p.preferred_pharmacy_address || '')}"></div>
      <div class="inline-err" data-err role="alert"></div>
      <button class="btn btn-red btn-block" data-save>Save changes</button>`, (el) => {
      mountAddress(el, 'e');
      attachAutocomplete(el.querySelector('#e-ph-name'), 'pharmacy', (it) => {
        el.querySelector('#e-ph-name').value = it.main;
        el.querySelector('#e-ph-addr').value = it.secondary || it.full;
      });
      el.querySelector('[data-save]').addEventListener('click', async (e) => {
        const v = {
          full_name: val(el, 'e-name').replace(/\s+/g, ' '), date_of_birth: val(el, 'e-dob'), phone: val(el, 'e-phone'),
          preferred_pharmacy_name: val(el, 'e-ph-name'), preferred_pharmacy_address: val(el, 'e-ph-addr'),
        };
        readAddress(el, v, 'e');
        const problem = validateProfile(v);
        if (problem) { el.querySelector('[data-err]').textContent = problem; return; }
        e.currentTarget.disabled = true;
        try {
          await saveProfile(v);
          closeOverlay();
          toast('Changes saved');
          if (!me.authorizationCurrent) boot(); else setTab('account');
        } catch (err) {
          el.querySelector('[data-err]').textContent = err.message;
          e.currentTarget.disabled = false;
        }
      });
    });
  }

  // ================================================================ back from Stripe checkout
  function handleStripeReturn() {
    const params = new URLSearchParams(window.location.search);
    if (!params.toString()) return;
    history.replaceState(null, '', 'app.html');
    if (params.get('paid')) {
      toast(`Payment received for LT-${params.get('order')}. We're on it.`);
      // The payment confirmation can take a few seconds to arrive
      setTimeout(async () => { await loadOrders(); if (tab === 'home' || tab === 'activity') setTab(tab); }, 3000);
    } else if (params.get('canceled')) {
      toast(`Payment wasn't finished. Your order is saved under Activity.`, true);
    }
  }

  boot();
})();
