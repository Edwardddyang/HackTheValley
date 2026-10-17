import type { ApiError, ListingResponse } from "@/lib/ai-types";
import { AiError, aiConfigured } from "@/lib/ai/gemini";
import { extractListing, matchListingAddress } from "@/lib/ai/listing";
import { MAX_LISTING_BODY_BYTES, parseListingRequest } from "@/lib/ai/listing-core";
import { clientIp, createRateLimiter } from "@/lib/ai/rate-limit";
import type { AddressMatch } from "@/lib/brief";

// POST /api/listing { text?, image?: { data, mime_type } } -> { listing, matches }
//
// Gemini reads the pasted listing text or screenshot; nothing is fetched, not the listing site and not any URL in
// the listing. Without GEMINI_API_KEY this answers 503 rather than guessing.

export const maxDuration = 30;

const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const NO_STORE = { "Cache-Control": "no-store" };
const TOO_LARGE = "That upload is too large. Screenshots can be 4 MB at most.";

function error(status: number, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: message } satisfies ApiError, { status, headers: { ...NO_STORE, ...headers } });
}

const AI_ERRORS: Record<AiError["kind"], [number, string]> = {
  not_configured: [503, "Reading listings isn't set up on this server. Type the address instead."],
  timeout: [504, "Reading the listing took too long. Try again, or type the address instead."],
  rate_limited: [503, "The listing reader is busy right now. Try again in a minute, or type the address instead."],
  blocked: [422, "Couldn't read that listing. Paste the ad text, or type the address instead."],
  bad_output: [502, "Couldn't read that listing. Try again, or type the address instead."],
  upstream: [502, "Couldn't read that listing right now. Try again, or type the address instead."],
};

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LISTING_BODY_BYTES) return error(413, TOO_LARGE);
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_LISTING_BODY_BYTES) return error(413, TOO_LARGE);
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, "Send JSON with the listing text, a screenshot, or both.");
  }

  const parsed = parseListingRequest(body);
  if (!parsed.ok) return error(parsed.status, parsed.error);

  if (!aiConfigured()) {
    return error(503, "Reading listings needs GEMINI_API_KEY, which isn't set on this server. Type the address instead.");
  }

  const limit = limiter.check(clientIp(request.headers));
  if (!limit.ok) {
    return error(429, "Too many listings read from this connection. Wait a minute and try again.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let listing;
  try {
    listing = await extractListing(parsed.value);
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("upstream", String(e));
    console.warn(`[listing] Gemini failed (${err.kind}): ${err.message}`);
    const [status, message] = AI_ERRORS[err.kind];
    return error(status, message);
  }

  let matches: AddressMatch[] = [];
  if (listing.address) {
    try {
      matches = await matchListingAddress(listing.address);
    } catch (e) {
      // Still return the extraction so the UI can prefill the search box.
      console.error("[listing] geocode failed", e);
    }
  }
  return Response.json({ listing, matches } satisfies ListingResponse, { headers: NO_STORE });
}
