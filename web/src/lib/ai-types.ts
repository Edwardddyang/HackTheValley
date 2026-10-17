import type { AddressMatch, Cite } from "./brief";

// Request/response shapes for the AI routes (web/src/app/api/summary, web/src/app/api/listing).
// The flags only restate facts already in the brief or extras; every line carries the cites it used.

export type SummaryLine = { text: string; cites: Cite[] };

/**
 * POST /api/summary with SummaryRequest. The server rebuilds the brief itself; it never trusts one from the
 * browser. rent and beds (from a pasted listing) let the flags rank the asking rent against the CMHC average.
 */
export type SummaryRequest = { address_point_id: number; radius_m?: number; rent?: number | null; beds?: number | null };
export type Summary = {
  /** The What-to-flag bullets, worst first (at most 3); empty when nothing in the records stands out. */
  sentences: SummaryLine[];
  /** Questions to ask at the viewing, grounded in the weak inspection items and other facts. */
  checklist: SummaryLine[];
  /** Gemini model id, or "template" when the AI was unavailable and the flags were built without it. */
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
  /** Checkable claims the ad makes, quoted verbatim, for the ad check. */
  claims: Claim[];
  confidence: "high" | "medium" | "low";
};
export type ListingResponse = { listing: ListingExtraction; matches: AddressMatch[] };

// Ad check (POST /api/adcheck): the ad's claims, each judged against the loaded records. The server rebuilds the
// brief and extras itself; the only client facts that reach the prompt are the quoted claims, rent and bedrooms.

export type ClaimTopic =
  | "cooling" | "heating" | "pets" | "laundry" | "elevator" | "condition" | "noise_quiet" | "price_deal"
  | "rent_control" | "management" | "transit" | "other";
export type Claim = { quote: string; topic: ClaimTopic };

/** cant_check is a first-class honest outcome: no loaded record speaks to the claim. */
export type Verdict = "confirmed" | "challenged" | "cant_check";

export type AdCheckRequest = {
  address_point_id: number; radius_m?: number; rent?: number | null; beds?: number | null; claims: Claim[];
};
export type AdCheckRow = { quote: string; topic: ClaimTopic; verdict: Verdict; text: string; cites: Cite[] };
export type AdCheck = {
  rows: AdCheckRow[];
  /** Gemini model id, or "template" when every row was built without AI. */
  model: string;
  generated_at: string;
};

// Ask the records (POST /api/ask): a free-form question answered only from the loaded records. The question and
// history are untrusted text; every answer line cites the records it used, through the same checks as the summary.

export type AskRequest = {
  address_point_id: number;
  radius_m?: number;
  /** From a pasted listing, like SummaryRequest: lets an answer restate the asking rent against the CMHC average. */
  rent?: number | null;
  beds?: number | null;
  /** At most 300 characters. */
  question: string;
  /** The last turns (at most 2), so follow-ups make sense. */
  history?: { question: string; answer: string }[];
};
export type AskAnswer = { lines: SummaryLine[]; model: string; generated_at: string };

export type ApiError = { error: string };
