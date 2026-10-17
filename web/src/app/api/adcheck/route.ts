import type { AdCheck, ApiError } from "@/lib/ai-types";
import { getAdCheck, getCachedAdCheck } from "@/lib/ai/ad-check";
import { parseAdCheckRequest } from "@/lib/ai/ad-check-core";
import { clientIp, createRateLimiter } from "@/lib/ai/rate-limit";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/brief";

// POST /api/adcheck { address_point_id, radius_m?, rent?, beds?, claims } -> AdCheck
//
// The server rebuilds the brief and extras itself; the only client facts that reach the prompt are the quoted
// claims (treated as untrusted ad text), rent and bedrooms. Rows are Gemini's when they pass the same grounding
// checks as the summary, otherwise the deterministic fallback, so it works without GEMINI_API_KEY too.

export const maxDuration = 30;

// 10 uncached ad checks per IP per minute: protects the free Gemini quota and the database. Cache hits don't count.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
// 12 claims x 200 chars plus the rest of the body fits comfortably in 16 KB.
const MAX_BODY_BYTES = 16_384;
const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message } satisfies ApiError, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error(413, "Request body too large.");
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return error(413, "Request body too large.");
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Send JSON: { address_point_id, radius_m?, rent?, beds?, claims }.");
  }

  const parsed = parseAdCheckRequest(body, { min: MIN_RADIUS_M, max: MAX_RADIUS_M, default: DEFAULT_RADIUS_M });
  if (!parsed.ok) return error(400, parsed.error);
  const key = parsed.value;

  const cached = getCachedAdCheck(key);
  if (cached) return Response.json(cached satisfies AdCheck, { headers: NO_STORE });

  const limit = limiter.check(clientIp(request.headers));
  if (!limit.ok) {
    return error(429, "Too many ad checks requested. Wait a minute and try again.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let adCheck: AdCheck | null;
  try {
    adCheck = await getAdCheck(key);
  } catch (err) {
    // Gemini failures fall back to the template inside getAdCheck; this is the brief itself failing to load.
    console.error("[adcheck]", err);
    return error(502, "Couldn't load the data for this address. Try again in a moment.");
  }
  if (!adCheck) return error(404, `No address point with id ${key.address_point_id}.`);
  return Response.json(adCheck satisfies AdCheck, { headers: NO_STORE });
}
