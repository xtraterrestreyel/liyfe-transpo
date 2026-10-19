// =====================================================================
// Liyfe Transpo — website settings. Fill these in before going live.
// (These values are safe to be public. Secret keys go on Render only.)
// =====================================================================
window.LT_CONFIG = {
  // Supabase > Project Settings > API
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-SUPABASE-ANON-PUBLIC-KEY',

  // Your Render backend address (no trailing slash)
  API_BASE: 'https://liyfe-transpo-api.onrender.com',

  // Business details shown on the site
  BUSINESS_NAME: 'Liyfe Transpo',
  LEGAL_NAME: 'Liyfe Transpo LLC',
  PHONE: '(217) 555-0123',
  EMAIL: 'support@yourdomain.com',
  HOURS: 'Mon–Fri 9am–6pm · Sat 10am–2pm',

  // Display only — the real prices are set on the backend (Render environment)
  TIER_MILES: 10,
  TIER_PRICE: 4.99,
  MAX_MILES: 40,
  SERVICE_FEE: 0.50,

  SERVICE_TOWNS: ['Champaign', 'Urbana', 'Savoy', 'Tolono', 'Tuscola', 'Rantoul', 'St. Joseph', 'Danville'],
};
