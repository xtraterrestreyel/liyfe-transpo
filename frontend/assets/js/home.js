document.addEventListener('DOMContentLoaded', async () => {
  const { C, READY, esc, money, api, getSession, googleButton, alertBox } = window.LT;

  // Sign-in / account buttons
  const session = await getSession();
  const heroActions = document.getElementById('hero-actions');
  const cta = document.getElementById('cta-actions');
  if (session) {
    const a = '<a href="app.html" class="btn btn-primary">Go to my account</a>';
    heroActions.insertAdjacentHTML('afterbegin', a);
    cta.innerHTML = a;
  } else {
    if (READY) {
      heroActions.prepend(googleButton('Sign up with Google'));
      cta.appendChild(googleButton('Get started with Google'));
    } else {
      const tel = 'tel:' + C.PHONE.replace(/[^\d+]/g, '');
      heroActions.insertAdjacentHTML('afterbegin', `<a class="btn btn-primary" href="${tel}">Call to schedule a delivery</a>`);
      cta.innerHTML = `<a class="btn btn-primary" href="${tel}">Call ${esc(C.PHONE)}</a>`;
      const note = document.querySelector('.hero .small.muted');
      if (note) note.textContent = 'Online ordering is coming soon. Until then, call us and we handle everything.';
    }
  }

  // Hero price + towns
  document.getElementById('hero-price').textContent = '$' + C.TIER_PRICE.toFixed(2);
  document.getElementById('hero-price-note').textContent = `for the first ${C.TIER_MILES} miles from your pharmacy`;
  document.getElementById('hero-towns').innerHTML = C.SERVICE_TOWNS.map((t) => `<span class="chip">${esc(t)}</span>`).join('');

  // Tier table
  const tiers = Math.ceil(C.MAX_MILES / C.TIER_MILES);
  let rows = '<thead><tr><th>Distance from pharmacy</th><th>Tiers</th><th>Delivery fee</th></tr></thead><tbody>';
  for (let i = 1; i <= tiers; i++) {
    const from = i === 1 ? 0 : (i - 1) * C.TIER_MILES;
    const to = Math.min(i * C.TIER_MILES, C.MAX_MILES);
    rows += `<tr><td>${from === 0 ? 'Up to' : 'Over ' + from + ' up to'} ${to} miles</td><td>${i}</td><td>$${(C.TIER_PRICE * i).toFixed(2)}</td></tr>`;
  }
  rows += `<tr><td colspan="2">Service fee (every order)</td><td>+$${C.SERVICE_FEE.toFixed(2)}</td></tr></tbody>`;
  document.getElementById('tier-table').innerHTML = rows;

  // Estimate
  const form = document.getElementById('estimate-form');
  if (!READY) {
    form.outerHTML = `<p>Online estimates are coming soon. Use the price table, or call <a href="tel:${C.PHONE.replace(/[^\d+]/g, '')}">${esc(C.PHONE)}</a> and we'll quote it on the phone.</p>`;
  }
  const msg = document.getElementById('estimate-msg');
  const result = document.getElementById('estimate-result');
  if (READY) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox(msg, '');
    result.innerHTML = '';
    const from = document.getElementById('est-from').value.trim();
    const to = document.getElementById('est-to').value.trim();
    if (!from || !to) return alertBox(msg, 'Please enter both addresses.');
    const btn = form.querySelector('button');
    btn.disabled = true; btn.textContent = 'Calculating…';
    try {
      const q = await api('/api/quote', { method: 'POST', auth: false, body: { pickup_address: from, delivery_address: to } });
      if (!q.inArea) {
        alertBox(msg, `That's about ${q.miles} driving miles, beyond our current ${q.maxMiles}-mile range. Call us at ${C.PHONE} and we'll see what we can do.`, 'warn');
      } else {
        result.innerHTML = `
          <div class="quote-box">
            <div class="quote-row"><span>Driving distance</span><span>${q.miles} mi</span></div>
            <div class="quote-row"><span>Delivery (${q.tiers} × ${money(q.tierPriceCents)})</span><span>${money(q.deliveryFeeCents)}</span></div>
            <div class="quote-row"><span>Service fee</span><span>${money(q.serviceFeeCents)}</span></div>
            <div class="quote-row total"><span>Estimated total</span><span>${money(q.totalCents)}</span></div>
          </div>
          <p class="small muted" style="margin-top:10px">Pharmacy copay not included. Final price is confirmed when you place your order.</p>`;
      }
    } catch (err) {
      alertBox(msg, err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Get estimate';
    }
  });

  // Service-area map (OpenStreetMap via Leaflet, no API key needed)
  if (window.L) {
    const champaign = [40.1164, -88.2434];
    const map = L.map('service-map', { scrollWheelZoom: false }).setView([40.12, -87.95], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const colors = ['#c8102e', '#e0475c', '#5b6068', '#17181b'];
    for (let i = tiers; i >= 1; i--) {
      const miles = Math.min(i * C.TIER_MILES, C.MAX_MILES);
      L.circle(champaign, {
        radius: miles * 1609.344,
        color: colors[(i - 1) % colors.length],
        weight: 2,
        fillOpacity: 0.06,
      }).addTo(map).bindTooltip(`Tier ${i}: up to ${miles} mi · $${(C.TIER_PRICE * i).toFixed(2)}`);
    }
    const towns = {
      Champaign: [40.1164, -88.2434], Urbana: [40.1106, -88.2073], Savoy: [40.0548, -88.2517],
      Tolono: [39.9862, -88.2589], Tuscola: [39.7992, -88.2831], Rantoul: [40.3084, -88.1559],
      'St. Joseph': [40.1117, -88.0417], Danville: [40.1245, -87.6300],
    };
    Object.entries(towns).forEach(([name, ll]) => {
      L.circleMarker(ll, { radius: 6, color: '#15232c', weight: 2, fillColor: '#ffffff', fillOpacity: 1 })
        .addTo(map).bindTooltip(name, { permanent: false });
    });
  }
});
