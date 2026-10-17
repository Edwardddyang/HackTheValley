import "server-only";

import type { AskAnswer } from "@/lib/ai-types";
import { getBrief } from "@/lib/brief";
import { getExtras } from "@/lib/extras";

import { type AskKey, askResponseSchema, askSystemInstruction, askUserPrompt, validateAskOutput } from "./ask-core";
import { generateJson } from "./gemini";
import { buildEvidence, citesFor, groundingContext } from "./summary-core";

/**
 * Answers one question from the records alone. Rebuilds the brief and extras server-side, so nothing the browser
 * sends reaches the prompt except the delimited question and history. Null when the address point doesn't exist;
 * throws AiError when Gemini fails (the route maps it; there is no template for a free-form question).
 */
export async function getAsk(key: AskKey): Promise<AskAnswer | null> {
  const [brief, extras] = await Promise.all([
    getBrief(key.address_point_id, key.radius_m),
    getExtras(key.address_point_id).catch((e) => {
      console.warn(`[ask] ${key.address_point_id}:${key.radius_m}: bb_extras failed; continuing without it`, e);
      return null;
    }),
  ]);
  if (!brief) return null;

  const set = buildEvidence(brief, extras);
  const ctx = groundingContext(set);
  const { data, model } = await generateJson({
    systemInstruction: askSystemInstruction(brief.address.radius_m),
    contents: askUserPrompt(set.evidence, key.question, key.history),
    schema: askResponseSchema(set.evidence.items.map((i) => i.id)),
    temperature: 0.2,
  });
  const checked = validateAskOutput(data, set, ctx);
  if (checked.rejected.length) {
    console.warn(`[ask] ${key.address_point_id}:${key.radius_m}: dropped ${checked.rejected.length} line(s)`, checked.rejected);
  }
  return {
    lines: checked.lines.map((l) => ({ text: l.text, cites: citesFor(l.ids, set.cites) })),
    model,
    generated_at: new Date().toISOString(),
  };
}
