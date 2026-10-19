// Printable authorization letter the customer (or staff) can hand to a pharmacy.
document.addEventListener('DOMContentLoaded', async () => {
  const { C, esc, api, fmtDate, fmtDay, getSession, alertBox } = window.LT;
  const letter = document.getElementById('letter');
  const msg = document.getElementById('msg');
  const customerId = new URLSearchParams(window.location.search).get('customer');

  if (!(await getSession())) {
    letter.innerHTML = '<p>Please <a href="app.html">sign in</a> to view your authorization letter.</p>';
    return;
  }

  let profile;
  let authorization;
  try {
    if (customerId) {
      ({ profile, authorization } = await api(`/api/admin/customers/${encodeURIComponent(customerId)}`));
      document.querySelector('#actions a').href = 'admin.html';
      document.querySelector('#actions a').textContent = 'Back to staff dashboard';
    } else {
      ({ profile, authorization } = await api('/api/me'));
    }
  } catch (err) {
    letter.innerHTML = '';
    alertBox(msg, err.message);
    return;
  }

  if (!authorization) {
    letter.innerHTML = '<p>There is no active pickup authorization. Please sign it from your <a href="app.html">account</a> first.</p>';
    return;
  }

  const address = [profile.address_line1, profile.address_line2, profile.city, `${profile.state} ${profile.zip}`].filter(Boolean).join(', ');
  const pharmacy = profile.preferred_pharmacy_name
    ? `${esc(profile.preferred_pharmacy_name)}${profile.preferred_pharmacy_address ? '<br>' + esc(profile.preferred_pharmacy_address) : ''}`
    : '______________________________________';
  const today = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

  letter.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px">
      <img src="assets/img/logo.png" alt="" style="height:64px;width:auto" onerror="this.remove()">
      <div><strong style="font-size:1.15rem">${esc(C.LEGAL_NAME)}</strong><br>
        <span style="font-size:.9rem">${esc(C.PHONE)} · ${esc(C.EMAIL)}</span></div>
    </div>

    <h1>Authorization to Release Prescriptions to an Authorized Agent</h1>
    <p style="text-align:right">${esc(today)}</p>

    <p><strong>To the Pharmacist at:</strong><br>${pharmacy}</p>

    <p>I, <strong>${esc(profile.full_name)}</strong>, authorize <strong>${esc(C.LEGAL_NAME)}</strong> and its drivers to pick up
    prescriptions and pharmacy items that have been filled for me, and to deliver them to me. ${esc(C.BUSINESS_NAME)} is my
    personal pickup agent. It is hired by me and does not work for any pharmacy.</p>

    <p>Please add ${esc(C.BUSINESS_NAME)} as an authorized person to pick up on my behalf. This authorization stays in effect until I revoke it.</p>

    <table style="width:100%;border-collapse:collapse;margin:22px 0">
      <tr><td style="padding:6px 0;width:38%"><strong>Patient name</strong></td><td>${esc(profile.full_name)}</td></tr>
      <tr><td style="padding:6px 0"><strong>Date of birth</strong></td><td>${esc(fmtDay(profile.date_of_birth))}</td></tr>
      <tr><td style="padding:6px 0"><strong>Phone</strong></td><td>${esc(profile.phone)}</td></tr>
      <tr><td style="padding:6px 0"><strong>Address</strong></td><td>${esc(address)}</td></tr>
    </table>

    <p style="font-size:.92rem"><strong>Electronic signature on file:</strong> Signed electronically as
    "<em>${esc(authorization.signature_name)}</em>" on ${esc(fmtDate(authorization.signed_at))}
    (authorization version ${esc(authorization.agreement_version)}, ID ${esc(authorization.id.slice(0, 8).toUpperCase())}).</p>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:28px;margin-top:34px">
      <div><div class="sig-line"></div><div style="font-size:.85rem">Patient signature</div></div>
      <div><div class="sig-line"></div><div style="font-size:.85rem">Date</div></div>
    </div>

    <p style="font-size:.82rem;margin-top:34px;color:#555">${esc(C.BUSINESS_NAME)} is a delivery service, not a pharmacy, and does not
    dispense or give advice about medication. Questions for us: ${esc(C.PHONE)}.</p>`;
});
