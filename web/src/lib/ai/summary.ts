import "server-only";

import type { Summary } from "@/lib/ai-types";
import { getBrief, type Brief } from "@/lib/brief";
import { getExtras, type Extras } from "@/lib/extras";

import { AiError, aiConfigured, generateJson } from "./gemini";
import {
  MIN_SENTENCES, type SummaryKey, buildEvidence, groundingContext, summaryCacheKey, summaryResponseSchema,
  summarySystemInstruction, summaryUserPrompt, templateLines, toSummary, TEMPLATE_MODEL, validateSummaryOutput,
} from "./summary-core";
import { createTtlCache } from "./ttl-cache";

const AI_TTL_MS = 60 * 60 * 1000;
/** The template (no key, a Gemini failure, or too little survived the checks) is kept for a minute only. */
const TEMPLATE_TTL_MS = 60 * 1000;

const cache = createTtlCache<Summary>({ maxEntries: 500 });
const inFlight = new Map<string, Promise<Summary | null>>();

/** A cached summary for this address and radius, if any (the route serves it without counting the rate limit). */
export function getCachedSummary(key: SummaryKey): Summary | undefined {
  return cache.get(summaryCacheKey(key));
}

/**
 * Cited summary and viewing checklist for one address. Rebuilds the brief server-side, so nothing the browser sends
 * reaches the prompt. Null when the address point doesn't exist; throws only when the brief can't be loaded.
 * Concurrent calls for the same address and radius share one database and Gemini round trip.
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
    // Extras only add facts; the summary still works without them.
    getExtras(key.address_point_id).catch((e) => {
      console.warn(`[summary] ${k}: bb_extras failed; continuing without it`, e);
      return null;
    }),
  ]);
  if (!brief) return null;
  const { summary, ttl } = await summarize(brief, extras, k);
  cache.set(k, summary, ttl);
  return summary;
}

/** Gemini's summary when it passes the checks, else the template. Never throws. */
async function summarize(brief: Brief, extras: Extras | null, k: string): Promise<{ summary: Summary; ttl: number }> {
  const set = buildEvidence(brief, extras);
  const template = () => ({
    summary: toSummary(templateLines(brief, extras, set), set.cites, TEMPLATE_MODEL),
    ttl: TEMPLATE_TTL_MS,
  });
  if (!aiConfigured() || set.evidence.items.length === 0) return template();

  try {
    const { data, model } = await generateJson({
      systemInstruction: summarySystemInstruction(brief.address.radius_m),
      contents: summaryUserPrompt(set.evidence),
      schema: summaryResponseSchema(set.evidence.items.map((i) => i.id)),
      temperature: 0.2,
    });
    const checked = validateSummaryOutput(data, groundingContext(set));
    if (checked.rejected.length) console.warn(`[summary] ${k}: dropped ${checked.rejected.length} line(s)`, checked.rejected);
    if (checked.sentences.length < MIN_SENTENCES) {
      console.warn(`[summary] ${k}: only ${checked.sentences.length} grounded sentence(s); using the template`);
      return template();
    }
    const fallback = templateLines(brief, extras, set);
    const checklist = checked.checklist.length ? checked.checklist : fallback.checklist;
    return { summary: toSummary({ sentences: checked.sentences, checklist }, set.cites, model), ttl: AI_TTL_MS };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("upstream", String(e));
    console.warn(`[summary] ${k}: Gemini failed (${err.kind}): ${err.message}; using the template`);
    return template();
  }
}
