// Tier pricing: every started tier of TIER_MILES costs TIER_PRICE_CENTS.
//   0–10 mi = 1 tier ($4.99), 10.1–20 mi = 2 tiers ($9.98), and so on.
// A flat service fee is added to every order no matter how the customer pays,
// so it is NOT a card surcharge (card rules forbid surcharging debit cards).

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const PRICING = {
  tierMiles: num(process.env.TIER_MILES, 10),
  tierPriceCents: num(process.env.TIER_PRICE_CENTS, 499),
  maxMiles: num(process.env.MAX_MILES, 40),
  serviceFeeCents: Number.isFinite(Number(process.env.SERVICE_FEE_CENTS))
    ? Math.max(0, Number(process.env.SERVICE_FEE_CENTS))
    : 50,
};

export function calculateFee(miles, p = PRICING) {
  const m = Number(miles);
  if (!Number.isFinite(m) || m < 0) throw new Error('Invalid distance');
  const roundedMiles = Math.round(m * 10) / 10;
  const tiers = Math.max(1, Math.ceil(roundedMiles / p.tierMiles));
  const deliveryFeeCents = tiers * p.tierPriceCents;
  return {
    miles: roundedMiles,
    inArea: roundedMiles <= p.maxMiles,
    maxMiles: p.maxMiles,
    tiers,
    tierMiles: p.tierMiles,
    tierPriceCents: p.tierPriceCents,
    deliveryFeeCents,
    serviceFeeCents: p.serviceFeeCents,
    totalCents: deliveryFeeCents + p.serviceFeeCents,
  };
}
