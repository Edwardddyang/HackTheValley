import "server-only";

import type { AdCheck } from "@/lib/ai-types";
import { getBrief, type Brief } from "@/lib/brief";
import { essentialsNear } from "@/lib/essentials-server";
import { getExtras, type Extras } from "@/lib/extras";

import {
  type AdCheckKey, adCheckCacheKey, adCheckContext, adCheckResponseSchema, adCheckSystemInstruction,
  adCheckUserPrompt, fallbackRows, rentComparison, toAdCheck, validateAdCheckOutput,
} from "./ad-check-core";
import { AiError, aiConfigured, generateJson } from "./gemini";
import { TEMPLATE_MODEL, buildEvidence } from "./summary-core";
import { createTtlCache } from "./ttl-cache";

const AI_TTL_MS = 60 * 60 * 1000;
/** All-template rows (no key, or a Gemini failure) are kept for a minute only. */
const TEMPLATE_TTL_MS = 60 * 1000;

const cache = createTtlCache<AdCheck>({ maxEntries: 300 });
const inFlight = new Map<string, Promise<AdCheck | null>>();

/** A cached ad check for this address, radius and set of claims (served without counting the rate limit). */
export function getCachedAdCheck(key: AdCheckKey): AdCheck | undefined {
  return cache.get(adCheckCacheKey(key));
}

/**
 * One row per claim, each judged against the records. Rebuilds the brief and extras server-side like the summary, so
 * no client facts beyond the quoted claims, rent and bedrooms reach the prompt. Null when the address point doesn't
 * exist; throws only when the brief can't be loaded.
 */
export function getAdCheck(key: AdCheckKey): Promise<AdCheck | null> {
  const k = adCheckCacheKey(key);
  const cached = cache.get(k);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(k);
  if (pending) return pending;
  const job = load(key, k).finally(() => inFlight.delete(k));
  inFlight.set(k, job);
  return job;
}

async function load(key: AdCheckKey, k: string): Promise<AdCheck | null> {
  // A failed bb_extras call (unlike a legitimate "no registration") makes the rows read as if no record existed, so
  // that result is kept for a minute only and heals once the extras load again.
  let extrasFailed = false;
  const [brief, extras] = await Promise.all([
    getBrief(key.address_point_id, key.radius_m),
    getExtras(key.address_point_id).catch((e) => {
      console.warn(`[adcheck] ${k}: bb_extras failed; continuing without it`, e);
      extrasFailed = true;
      return null;
    }),
  ]);
  if (!brief) return null;
  const { adCheck, ttl } = await check(brief, extras, key, k);
  cache.set(k, adCheck, extrasFailed ? Math.min(ttl, TEMPLATE_TTL_MS) : ttl);
  return adCheck;
}

/** Gemini's rows where they pass the checks, the deterministic fallback everywhere else. Never throws. */
async function check(
  brief: Brief,
  extras: Extras | null,
  key: AdCheckKey,
  k: string,
): Promise<{ adCheck: AdCheck; ttl: number }> {
  const set = buildEvidence(brief, extras, essentialsNear(brief.address.lat, brief.address.lon));
  const cx = rentComparison(extras?.rent_benchmark ?? null, key.rent, key.beds);
  const ctx = adCheckContext(set, key.rent, key.beds, cx);
  const template = () => ({
    adCheck: toAdCheck(fallbackRows(key.claims, brief, extras, set, cx, ctx), set.cites, TEMPLATE_MODEL),
    ttl: TEMPLATE_TTL_MS,
  });
  if (!aiConfigured() || set.evidence.items.length === 0) return template();

  try {
    const { data, model } = await generateJson({
      systemInstruction: adCheckSystemInstruction(brief.address.radius_m),
      contents: adCheckUserPrompt(set.evidence, { rent: key.rent, beds: key.beds }, cx, key.claims),
      schema: adCheckResponseSchema(set.evidence.items.map((i) => i.id), key.claims.length),
      temperature: 0.2,
    });
    const checked = validateAdCheckOutput(data, key.claims, brief, extras, set, cx, ctx);
    if (checked.rejected.length) {
      console.warn(`[adcheck] ${k}: replaced ${checked.rejected.length} row(s) with the template`, checked.rejected);
    }
    // Every row replaced means the result is the template: label it so and keep it for a minute, like the template.
    const allReplaced = checked.replaced >= key.claims.length;
    return {
      adCheck: toAdCheck(checked.rows, set.cites, allReplaced ? TEMPLATE_MODEL : model),
      ttl: allReplaced ? TEMPLATE_TTL_MS : AI_TTL_MS,
    };
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("upstream", String(e));
    console.warn(`[adcheck] ${k}: Gemini failed (${err.kind}): ${err.message}; using the template`);
    return template();
  }
}
