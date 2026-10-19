// Google Maps Platform calls (server side, so the key stays secret).
// Needs these APIs enabled on the key: "Routes API" and "Places API (New)".

export class PublicError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

const key = () => process.env.GOOGLE_MAPS_SERVER_KEY;

// Center of the service area (Champaign, IL) — used to bias address suggestions.
const CENTER = { latitude: 40.1164, longitude: -88.2434 };

export async function drivingMiles(originAddress, destinationAddress) {
  if (!key()) throw new PublicError('Pricing is not set up yet. Please call us for a quote.', 503);
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key(),
      'X-Goog-FieldMask': 'routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { address: originAddress },
      destination: { address: destinationAddress },
      travelMode: 'DRIVE',
      units: 'IMPERIAL',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Routes API error:', res.status, data?.error?.status);
    throw new PublicError('We could not look up that route right now. Please check the addresses and try again.', 502);
  }
  const meters = data?.routes?.[0]?.distanceMeters;
  if (meters == null) {
    throw new PublicError('We could not find a driving route between those addresses. Please double-check them.', 422);
  }
  return meters / 1609.344;
}

// kind: "pharmacy" (pharmacy names + addresses) or "address" (any address)
export async function autocomplete(input, kind = 'address') {
  if (!key()) return [];
  const body = {
    input,
    includedRegionCodes: ['us'],
    locationBias: { circle: { center: CENTER, radius: 50000 } },
  };
  if (kind === 'pharmacy') body.includedPrimaryTypes = ['pharmacy', 'drugstore'];

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Places API error:', res.status, data?.error?.status);
    return [];
  }
  return (data.suggestions || [])
    .filter((s) => s.placePrediction)
    .slice(0, 5)
    .map((s) => {
      const p = s.placePrediction;
      return {
        main: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
        full: p.text?.text || '',
      };
    });
}
