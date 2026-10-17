import type { Claim } from "./ai-types";
import { encodeClaimsParam, parseClaimsParam } from "./ai/ad-check-core";
import { MAX_BEDROOMS, RENT_LIMITS } from "./ai/summary-core";

// A pasted listing's asking rent, bedrooms and claims travel between pages in the URL
// (?rent=2350&beds=1&claims=...), as on integrate/best-of-both.

export type ListingHints = { rent: number | null; beds: number | null; claims: Claim[] };

export const NO_LISTING: ListingHints = { rent: null, beds: null, claims: [] };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Ignore anything outside the bounds the AI routes accept, so a hand-edited link can't make the flags,
 * the checklist and the ad check fail.
 */
export function parseListingHints(sp: Params): ListingHints {
  const rentRaw = first(sp.rent);
  const rent = rentRaw && /^\d{1,6}$/.test(rentRaw) && Number(rentRaw) >= RENT_LIMITS.min && Number(rentRaw) <= RENT_LIMITS.max
    ? Number(rentRaw) : null;
  const bedsRaw = first(sp.beds);
  const beds = bedsRaw && /^\d{1,2}$/.test(bedsRaw) && Number(bedsRaw) <= MAX_BEDROOMS ? Number(bedsRaw) : null;
  return { rent, beds, claims: parseClaimsParam(first(sp.claims)) };
}

export const hasListing = (l: ListingHints) => l.rent != null || l.beds != null || l.claims.length > 0;

/** "rent=2350&beds=1&claims=..." (no leading separator); empty when there is no listing. */
export function listingQuery(l: Pick<ListingHints, "rent" | "beds" | "claims">): string {
  const parts: string[] = [];
  if (l.rent != null) parts.push(`rent=${Math.round(l.rent)}`);
  if (l.beds != null) parts.push(`beds=${Math.round(l.beds)}`);
  const claims = encodeClaimsParam(l.claims);
  if (claims) parts.push(`claims=${encodeURIComponent(claims)}`);
  return parts.join("&");
}

/** The brief page for an address point, with the radius (when not the default) and the listing. */
export function buildingHref(id: number | string, opts: { radius?: number | null; listing?: string } = {}): string {
  const q = [opts.radius ? `r=${opts.radius}` : "", opts.listing ?? ""].filter(Boolean).join("&");
  return `/building/${id}${q ? `?${q}` : ""}`;
}
