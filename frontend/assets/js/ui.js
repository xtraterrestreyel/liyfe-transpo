// Shared app UI: icons, toasts, bottom sheets, side drawers, confirmations, status helpers.
(function () {
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    chevR: '<path d="m9 6 6 6-6 6"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M5 12.5 10 17.5 19 7"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    store: '<path d="M4 10v10h16V10"/><path d="M3 10 5 4h14l2 6z"/><path d="M12 12.5v6M9 15.5h6"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    car: '<path d="M5 17h14v-5l-2-5H7l-2 5z"/><path d="M5 12h14"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.5 2.5 3.5 5.2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2.2-2.3 3.5M12 17h.01"/>',
  };
  const GOOGLE = '<svg class="google-g" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

  // Delivery stages, in order
  const STAGES = ['paid', 'pharmacy_confirmed', 'picked_up', 'out_for_delivery', 'delivered'];
  const STAGE_SHORT = { paid: 'Paid', pharmacy_confirmed: 'Pharmacy', picked_up: 'Picked up', out_for_delivery: 'On the way', delivered: 'Delivered' };
  const ACTIVE = ['pending_payment', 'paid', 'pharmacy_confirmed', 'picked_up', 'out_for_delivery', 'issue'];

  function pillClass(status) {
    if (status === 'delivered') return 'ok';
    if (status === 'pending_payment') return 'warn';
    if (status === 'canceled') return 'off';
    if (status === 'issue') return 'live';
    return 'live';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function telHref(phone) { return 'tel:' + String(phone || '').replace(/[^\d+]/g, ''); }

  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(today.getTime() - 86400000);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return 'Today, ' + time;
    if (d.toDateString() === yest.toDateString()) return 'Yesterday, ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  // ---------- toast
  let toastTimer;
  function toast(message, isError = false) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast' + (isError ? ' err' : '');
    t.setAttribute('role', isError ? 'alert' : 'status');
    t.textContent = message;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), isError ? 5200 : 3200);
  }

  // ---------- overlays (sheet = bottom/center modal, drawer = right panel)
  function openOverlay(kind, html, mount) {
    closeOverlay();
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.dataset.overlay = '1';
    const panel = document.createElement('div');
    panel.className = kind;
    panel.dataset.overlay = '1';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.innerHTML = html;
    document.body.append(scrim, panel);
    scrim.addEventListener('click', closeOverlay);
    panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    document.addEventListener('keydown', escClose);
    if (mount) mount(panel);
    const focusable = panel.querySelector('button, a, input, textarea, select');
    if (focusable) focusable.focus({ preventScroll: true });
    return panel;
  }
  function escClose(e) { if (e.key === 'Escape') closeOverlay(); }
  function closeOverlay() {
    document.querySelectorAll('[data-overlay]').forEach((n) => n.remove());
    document.removeEventListener('keydown', escClose);
  }
  const openSheet = (html, mount) => openOverlay('sheet', html, mount);
  const openDrawer = (html, mount) => openOverlay('drawer', html, mount);

  function confirmSheet({ title, body, action, danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      openSheet(`
        <div class="sheet-head"><h2>${window.LT.esc(title)}</h2></div>
        <p class="muted" style="margin:6px 0 22px">${window.LT.esc(body)}</p>
        <div style="display:grid;gap:8px">
          <button class="btn ${danger ? 'btn-danger' : 'btn-red'} btn-block" data-yes>${window.LT.esc(action)}</button>
          <button class="btn btn-ghost btn-block" data-close>Not now</button>
        </div>`, (el) => {
        el.querySelector('[data-yes]').addEventListener('click', () => { answered = true; closeOverlay(); resolve(true); });
        const obs = new MutationObserver(() => {
          if (!el.isConnected) { obs.disconnect(); if (!answered) resolve(false); }
        });
        obs.observe(document.body, { childList: true });
      });
    });
  }

  window.UI = { icon, GOOGLE, STAGES, STAGE_SHORT, ACTIVE, pillClass, initials, telHref, shortDate, toast, openSheet, openDrawer, closeOverlay, confirmSheet };
})();
