import type { ApiError, AskAnswer } from "@/lib/ai-types";
import { parseAskRequest } from "@/lib/ai/ask-core";
import { getAsk } from "@/lib/ai/ask";
import { AiError, aiConfigured } from "@/lib/ai/gemini";
import { clientIp, createRateLimiter } from "@/lib/ai/rate-limit";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/brief";

// POST /api/ask { address_point_id, radius_m?, question, history? } -> AskAnswer
//
// The server rebuilds the brief and extras itself; the question and history are untrusted text and stay inside
// delimiters. Every answer line passes the same grounding checks as the summary. A free-form question has no
// template, so without GEMINI_API_KEY this answers 503 rather than guessing.

export const maxDuration = 30;

// 10 questions per IP per minute: protects the free Gemini quota and the database.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
// Two history turns with full answers (2,000 characters each) plus the question, with room for non-ASCII text, which
// takes up to 3 bytes per character.
const MAX_BODY_BYTES = 16_384;
const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message } satisfies ApiError, { status, headers: { ...NO_STORE, ...headers } });
}

const AI_ERRORS: Record<AiError["kind"], [number, string]> = {
  not_configured: [503, "Asking the records isn't set up on this server."],
  timeout: [504, "The answer took too long. Try asking again."],
  rate_limited: [503, "The records reader is busy right now. Try again in a minute."],
  blocked: [422, "That question couldn't be answered. Try rephrasing it."],
  bad_output: [502, "The answer didn't come through. Try asking again."],
  upstream: [502, "The answer didn't come through. Try asking again."],
};

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error(413, "Request body too large.");
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return error(413, "Request body too large.");
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Send JSON: { address_point_id, radius_m?, question, history? }.");
  }

  const parsed = parseAskRequest(body, { min: MIN_RADIUS_M, max: MAX_RADIUS_M, default: DEFAULT_RADIUS_M });
  if (!parsed.ok) return error(400, parsed.error);
  const key = parsed.value;

  if (!aiConfigured()) {
    return error(503, "Asking the records needs GEMINI_API_KEY, which isn't set on this server.");
  }

  const limit = limiter.check(clientIp(request.headers));
  if (!limit.ok) {
    return error(429, "Too many questions from this connection. Wait a minute and try again.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let answer: AskAnswer | null;
  try {
    answer = await getAsk(key);
  } catch (e) {
    if (e instanceof AiError) {
      console.warn(`[ask] Gemini failed (${e.kind}): ${e.message}`);
      const [status, message] = AI_ERRORS[e.kind];
      return error(status, message);
    }
    // The brief itself failed to load.
    console.error("[ask]", e);
    return error(502, "Couldn't load the data for this address. Try again in a moment.");
  }
  if (!answer) return error(404, `No address point with id ${key.address_point_id}.`);
  return Response.json(answer satisfies AskAnswer, { headers: NO_STORE });
}
