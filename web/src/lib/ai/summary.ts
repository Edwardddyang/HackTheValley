import "server-only";

import type { Summary } from "@/lib/ai-types";
import { getBrief, type Brief } from "@/lib/brief";
import { getExtras, type Extras } from "@/lib/extras";

import { adCheckContext, rentComparison } from "./ad-check-core";
import { AiError, aiConfigured, generateJson } from "./gemini";
import {
  type SummaryKey, buildEvidence, summaryCacheKey, summaryResponseSchema, summarySystemInstruction,
  summaryUserPrompt, templateLines, toSummary, TEMPLATE_MODEL, validateSummaryOutput,
} from "./summary-core";
import { createTtlCache } from "./ttl-cache";

const AI_TTL_MS = 60 * 60 * 1000;
/** The template (no key, a Gemini failure, or nothing survived the checks) is kept for a minute only. */
const TEMPLATE_TTL_MS = 60 * 1000;

const cache = createTtlCache<Summary>({ maxEntries: 500 });
const inFlight = new Map<string, Promise<Summary | null>>();

/** Cached flags for this address, radius and listing, if any (the route serves them without counting the rate limit). */
export function getCachedSummary(key: SummaryKey): Summary | undefined {
  return cache.get(summaryCacheKey(key));
}

/**
 * Cited What-to-flag bullets and viewing checklist for one address. Rebuilds the brief server-side, so nothing the
 * browser sends beyond rent and bedrooms reaches the prompt. Null when the address point doesn't exist; throws only
 * when the brief can't be loaded. Concurrent calls for the same key share one database and Gemini round trip.
 */
export function getSummary(key: SummaryKey): Promise<Summary | null> {
  const k = summaryCacheKey(key);
  const cached = cache.get(k);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(k);
  if (pending) return pending;
  const job = load(key, k).finally(() => inFlight.delete(k));
  inFlight.set(k, job);
  return job;
}

async function load(key: SummaryKey, k: string): Promise<Summary | null> {
  const [brief, extras] = await Promise.all([
    getBrief(key.address_point_id, key.radius_m),
    // Extras only add facts; the flags still work without them.
    getExtras(key.address_point_id).catch((e) => {
      console.warn(`[summary] ${k}: bb_extras failed; continuing without it`, e);
      return null;
    }),
  ]);
  if (!brief) return null;
  const { summary, ttl } = await summarize(brief, extras, key, k);
  cache.set(k, summary, ttl);
  return summary;
}

/** Gemini's flags when they pass the checks, else the template. Never throws. */
async function summarize(
  brief: Brief,
  extras: Extras | null,
  key: SummaryKey,
  k: string,
): Promise<{ summary: Summary; ttl: number }> {
  const set = buildEvidence(brief, extras);
  const cx = rentComparison(extras?.rent_benchmark ?? null, key.rent, key.beds);
  // The renter's own rent and beds join the allowed shared numbers, exactly as in the ad check.
  const ctx = adCheckContext(set, key.rent, key.beds, cx);
  const template = () => ({
    summary: toSummary(templateLines(brief, extras, set, cx), set.cites, TEMPLATE_MODEL),
    ttl: TEMPLATE_TTL_MS,
  });
  if (!aiConfigured() || set.evidence.items.length === 0) return template();

  try {
    const { data, model } = await generateJson({
      systemInstruction: summarySystemInstruction(brief.address.radius_m),
      contents: summaryUserPrompt(set.evidence, cx),
      schema: summaryResponseSchema(set.evidence.items.map((i) => i.id)),
      temperature: 0.2,
    });
    const checked = validateSummaryOutput(data, ctx);
    if (checked.rejected.length) console.warn(`[summary] ${k}: dropped ${checked.rejected.length} line(s)`, checked.rejected);
    // Zero flags is a valid answer (nothing stands out) - but if the model DID flag things and none survived the
    // checks, that's a failure, so the deterministic template stands in.
    const rawFlags = (data as { flags?: unknown })?.flags;
    if (Array.isArray(rawFlags) && rawFlags.length > 0 && checked.sentences.length === 0) {
      console.warn(`[summary] ${k}: no flagged line survived the checks; using the template`);
      return template();
    }
    const fallback = templateLines(brief, extras, set, cx);
    const checklist = checked.checklist.length ? checked.checklist : fallback.checklist;
    return { summary: toSummary({ sentences: checked.sentences, checklist }, set.cites, model), ttl: AI_TTL_MS };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("upstream", String(e));
    console.warn(`[summary] ${k}: Gemini failed (${err.kind}): ${err.message}; using the template`);
    return template();
  }
}
