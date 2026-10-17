import type { ApiError, Summary } from "@/lib/ai-types";
import { clientIp, createRateLimiter } from "@/lib/ai/rate-limit";
import { getCachedSummary, getSummary } from "@/lib/ai/summary";
import { parseSummaryRequest } from "@/lib/ai/summary-core";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/brief";

// POST /api/summary { address_point_id, radius_m? } -> Summary
//
// The server rebuilds the brief and extras itself and never trusts facts sent by the browser. The summary is
// Gemini's when every line passes the grounding checks, otherwise the template (model "template"), so it works
// without GEMINI_API_KEY too.

export const maxDuration = 30;

// 10 uncached summaries per IP per minute: protects the free Gemini quota and the database. Cache hits don't count.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const MAX_BODY_BYTES = 4_096;
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
    return error(400, "Send JSON: { address_point_id, radius_m? }.");
  }

  const parsed = parseSummaryRequest(body, { min: MIN_RADIUS_M, max: MAX_RADIUS_M, default: DEFAULT_RADIUS_M });
  if (!parsed.ok) return error(400, parsed.error);
  const key = parsed.value;

  const cached = getCachedSummary(key);
  if (cached) return Response.json(cached satisfies Summary, { headers: NO_STORE });

  const limit = limiter.check(clientIp(request.headers));
  if (!limit.ok) {
    return error(429, "Too many summaries requested. Wait a minute and try again.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let summary: Summary | null;
  try {
    summary = await getSummary(key);
  } catch (err) {
    // Gemini failures fall back to the template inside getSummary; this is the brief itself failing to load.
    console.error("[summary]", err);
    return error(502, "Couldn't load the data for this address. Try again in a moment.");
  }
  if (!summary) return error(404, `No address point with id ${key.address_point_id}.`);
  return Response.json(summary satisfies Summary, { headers: NO_STORE });
}
