import type { AddressMatch, Cite } from "./brief";

// Request/response shapes for the AI routes (web/src/app/api/summary, web/src/app/api/listing).
// The summary only restates facts already in the brief or extras; every line carries the cites it used.

export type SummaryLine = { text: string; cites: Cite[] };

/** POST /api/summary with SummaryRequest. The server rebuilds the brief itself; it never trusts one from the browser. */
export type SummaryRequest = { address_point_id: number; radius_m?: number };
export type Summary = {
  sentences: SummaryLine[];
  /** Questions to ask at the viewing, grounded in the weak inspection items and other facts. */
  checklist: SummaryLine[];
  /** Gemini model id, or "template" when the AI was unavailable and the summary was built without it. */
  model: string;
  generated_at: string;
};

/** POST /api/listing: pasted Kijiji/Marketplace text, a screenshot (base64 without the data: prefix), or both. */
export type ListingRequest = { text?: string; image?: { data: string; mime_type: string } };
export type ListingExtraction = {
  address: string | null;
  unit: string | null;
  asking_rent: number | null;
  bedrooms: number | null; // 0 = bachelor
  utilities_included: string | null;
  available_from: string | null; // ISO date
  confidence: "high" | "medium" | "low";
};
export type ListingResponse = { listing: ListingExtraction; matches: AddressMatch[] };

export type ApiError = { error: string };
