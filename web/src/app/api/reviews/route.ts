import { clientIp, createRateLimiter } from "@/lib/ai/rate-limit";
import { parseNewReview, type Review, type ReviewList } from "@/lib/reviews-core";
import { supabase } from "@/lib/supabase";

// Tenant reviews for an address. GET lists them; POST { action: "post", ... } adds one and POST
// { action: "report", id } reports one. The bb_* database functions validate and throttle again.

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 8_000;
const postLimiter = createRateLimiter({ limit: 3, windowMs: 10 * 60_000 });
const reportLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60_000 });

const fail = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { ...NO_STORE, ...headers } });

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("address_point_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return fail(400, "Unknown address.");
  const { data, error } = await supabase().rpc("bb_reviews", { p_address_point_id: id });
  if (error) return fail(503, "Reviews aren't available right now.");
  return Response.json(data as ReviewList, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return fail(413, "That review is too long.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send JSON.");
  }
  const ip = clientIp(request.headers);

  if (body.action === "report") {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail(400, "Unknown review.");
    if (!reportLimiter.check(ip).ok) return fail(429, "Too many reports from this connection. Try again later.");
    const { error } = await supabase().rpc("bb_report_review", { p_id: id });
    if (error) return fail(503, "Couldn't send the report. Try again.");
    return Response.json({ ok: true }, { headers: NO_STORE });
  }

  const parsed = parseNewReview(body);
  // A filled honeypot gets a plain success, so bots learn nothing; nothing is stored.
  if (!parsed.ok && parsed.spam) return Response.json({ ok: true }, { headers: NO_STORE });
  if (!parsed.ok) return fail(400, parsed.error);

  const limit = postLimiter.check(ip);
  if (!limit.ok) {
    return fail(429, "You've posted a few reviews just now. Try again in a few minutes.", { "Retry-After": String(limit.retryAfterSeconds) });
  }
  const r = parsed.value;
  const { data, error } = await supabase().rpc("bb_add_review", {
    p_address_point_id: r.address_point_id, p_rating: r.rating, p_body: r.body, p_author: r.author,
  });
  if (error) {
    // The database's own validation and throttle messages are written for people; anything else isn't.
    const shown = error.code === "22023" || error.code === "P0001" ? error.message : "Couldn't post the review. Try again.";
    return fail(error.code === "P0001" ? 429 : error.code === "22023" ? 400 : 503, shown);
  }
  return Response.json({ review: data as Review }, { status: 201, headers: NO_STORE });
}
