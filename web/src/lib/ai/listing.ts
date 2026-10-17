import "server-only";

import type { Part } from "@google/genai";

import type { ListingExtraction } from "@/lib/ai-types";
import { type AddressMatch, geocode } from "@/lib/brief";

import { generateJson } from "./gemini";
import {
  LISTING_RESPONSE_SCHEMA, type ListingInput, addressSearchQueries, listingSystemInstruction, listingTextPart,
  normaliseListingExtraction,
} from "./listing-core";

function torontoToday(): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());
}

/**
 * Reads a pasted rental listing (text, screenshot or both) with Gemini. The listing is untrusted: the prompt tells
 * the model to ignore instructions in it, and nothing in it is fetched. Throws AiError when Gemini isn't configured
 * or fails.
 */
export async function extractListing(input: ListingInput): Promise<ListingExtraction> {
  const parts: Part[] = [];
  if (input.text) parts.push({ text: listingTextPart(input.text) });
  if (input.image) parts.push({ inlineData: { mimeType: input.image.mime_type, data: input.image.data } });
  parts.push({ text: input.text ? "Extract the fields from the listing above." : "Extract the fields from the listing screenshot." });

  const { data } = await generateJson({
    systemInstruction: listingSystemInstruction(torontoToday()),
    contents: [{ role: "user", parts }],
    schema: LISTING_RESPONSE_SCHEMA,
    temperature: 0,
  });
  return normaliseListingExtraction(data);
}

/** Geocodes the listing's street address: the normalised form first, then number + street name. */
export async function matchListingAddress(address: string): Promise<AddressMatch[]> {
  for (const q of addressSearchQueries(address)) {
    const matches = await geocode(q);
    if (matches.length) return matches;
  }
  return [];
}
