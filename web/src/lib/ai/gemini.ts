import "server-only";

import { ApiError, GoogleGenAI, ThinkingLevel, type ContentListUnion, type GenerateContentConfig } from "@google/genai";

// Thin wrapper around @google/genai (v2) for JSON-only calls. GEMINI_API_KEY and GEMINI_MODEL are server-only:
// never give them a NEXT_PUBLIC_ prefix.

/** The SDK's examples and the Gemini models page use this alias for the newest Flash model. */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
export const GEMINI_TIMEOUT_MS = 20_000;

export type AiErrorKind = "not_configured" | "timeout" | "rate_limited" | "blocked" | "bad_output" | "upstream";

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status: number | undefined;
  constructor(kind: AiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.kind = kind;
    this.status = status;
  }
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

let client: { key: string; ai: GoogleGenAI } | undefined;

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiError("not_configured", "GEMINI_API_KEY is not set");
  if (client?.key !== key) {
    // No retries (the SDK only retries when retryOptions is set): a slow call falls back instead of piling up.
    client = { key, ai: new GoogleGenAI({ apiKey: key, httpOptions: { timeout: GEMINI_TIMEOUT_MS } }) };
  }
  return client.ai;
}

/** Gemini 3.x accepts thinkingLevel "low" (faster); 1.x and 2.x models use thinking budgets instead. */
function thinkingConfig(model: string): GenerateContentConfig["thinkingConfig"] {
  return /^(models\/)?gemini-[12](\.|-)/.test(model) ? undefined : { thinkingLevel: ThinkingLevel.LOW };
}

function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof ApiError) {
    if (e.status === 429) return new AiError("rate_limited", "Gemini quota or rate limit reached", 429);
    if ([400, 401, 403].includes(e.status) && /API[ _]KEY/i.test(e.message)) {
      return new AiError("not_configured", `Gemini rejected GEMINI_API_KEY (HTTP ${e.status})`, e.status);
    }
    return new AiError("upstream", `Gemini API error ${e.status}: ${e.message.slice(0, 300)}`, e.status);
  }
  if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError")) {
    return new AiError("timeout", `Gemini did not answer within ${GEMINI_TIMEOUT_MS / 1000} s`);
  }
  return new AiError("upstream", `Gemini request failed: ${e instanceof Error ? e.message : String(e)}`);
}

export type JsonCall = {
  systemInstruction: string;
  contents: ContentListUnion;
  /** JSON Schema for the response (sent as responseJsonSchema). */
  schema: unknown;
  temperature?: number;
};

/** One structured-output call. Resolves to the parsed JSON and the model version that answered; throws AiError. */
export async function generateJson(call: JsonCall): Promise<{ data: unknown; model: string }> {
  const ai = getClient();
  const model = geminiModel();
  const config: GenerateContentConfig = {
    systemInstruction: call.systemInstruction,
    temperature: call.temperature ?? 0.2,
    responseMimeType: "application/json",
    responseJsonSchema: call.schema,
    automaticContinuation: false,
    thinkingConfig: thinkingConfig(model),
  };

  // httpOptions.timeout bounds the attempt; the abort signal is a backstop for the whole call.
  const send = (cfg: GenerateContentConfig) =>
    ai.models.generateContent({
      model,
      contents: call.contents,
      config: { ...cfg, abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS + 2_000) },
    });

  let response;
  try {
    response = await send(config);
  } catch (e) {
    // A model that rejects thinkingLevel gets one retry without it.
    if (!(e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message) && config.thinkingConfig)) {
      throw toAiError(e);
    }
    try {
      response = await send({ ...config, thinkingConfig: undefined });
    } catch (e2) {
      throw toAiError(e2);
    }
  }

  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new AiError("blocked", `Gemini blocked the request (${blocked})`);
  const text = response.text;
  if (!text) {
    const reason = response.candidates?.[0]?.finishReason ?? "unknown";
    throw new AiError(reason === "SAFETY" ? "blocked" : "bad_output", `Gemini returned no text (finish reason ${reason})`);
  }
  try {
    return { data: JSON.parse(text), model: response.modelVersion || model };
  } catch {
    throw new AiError("bad_output", "Gemini returned invalid JSON");
  }
}
