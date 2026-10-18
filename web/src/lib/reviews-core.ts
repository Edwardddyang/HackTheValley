// Tenant reviews: request parsing shared by the route and its tests. The database functions
// (supabase/migrations/0005_reviews.sql) check the same limits again, since they can be called directly.

export type Review = { id: number; rating: number; body: string; author: string | null; created_at: string };
export type ReviewList = { count: number; average: number | null; items: Review[] };

export const REVIEW_LIMITS = { minBody: 20, maxBody: 1000, maxAuthor: 40 } as const;

export type NewReview = { address_point_id: number; rating: number; body: string; author: string | null };

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim() : "");

/** A posted review, or the message to show. `website` is a honeypot field people never fill in. */
export function parseNewReview(raw: unknown): { ok: true; value: NewReview } | { ok: false; error: string; spam?: true } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Send a review." };
  const r = raw as Record<string, unknown>;
  if (clean(r.website)) return { ok: false, error: "Couldn't post that review.", spam: true };
  const id = Number(r.address_point_id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "Unknown address." };
  const rating = Number(r.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Pick a rating from 1 to 5." };
  const body = clean(r.body);
  if (body.length < REVIEW_LIMITS.minBody || body.length > REVIEW_LIMITS.maxBody) {
    return { ok: false, error: `Write between ${REVIEW_LIMITS.minBody} and ${REVIEW_LIMITS.maxBody.toLocaleString("en-CA")} characters.` };
  }
  const author = clean(r.author) || null;
  if (author && author.length > REVIEW_LIMITS.maxAuthor) {
    return { ok: false, error: `Keep the name to ${REVIEW_LIMITS.maxAuthor} characters.` };
  }
  return { ok: true, value: { address_point_id: id, rating, body, author } };
}
