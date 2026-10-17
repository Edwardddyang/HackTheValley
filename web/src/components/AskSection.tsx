"use client";

import { type FormEvent, useId, useRef, useState } from "react";

import type { ApiError, AskAnswer, AskRequest } from "@/lib/ai-types";

import { Cite } from "./Cite";
import { Section } from "./ui";

// Ask the records a free-form question (POST /api/ask). Answers come only from the records the brief already
// shows, pass the same grounding checks as the summary, and carry the same cite chips. The last two Q/A turns go
// back as history so follow-ups make sense.

const MAX_QUESTION_CHARS = 300;

type Turn =
  | { question: string; status: "pending" }
  | { question: string; status: "answered"; answer: AskAnswer }
  | { question: string; status: "failed"; message: string };

/**
 * 3-4 suggested chips come from the brief's flags (low score, no AC, construction, nearby buildings). rent and beds
 * come from a pasted listing, so an answer can restate the asking rent against the CMHC average.
 */
export function AskSection({ addressPointId, radius, rent = null, beds = null, suggestions }: {
  addressPointId: number; radius: number; rent?: number | null; beds?: number | null; suggestions: string[];
}) {
  const ids = useId();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.status === "pending");

  async function ask(questionRaw: string) {
    const question = questionRaw.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
    if (!question || busy) return;
    setDraft("");
    // The chips and the Ask button disable themselves while the answer loads; keep keyboard focus in the form.
    input.current?.focus();

    const history = turns
      .filter((t): t is Extract<Turn, { status: "answered" }> => t.status === "answered")
      .slice(-2)
      .map((t) => ({ question: t.question, answer: t.answer.lines.map((l) => l.text).join(" ") }));
    setTurns((old) => [...old, { question, status: "pending" }]);
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ block: "nearest" }));

    const body: AskRequest = { address_point_id: addressPointId, radius_m: radius, rent, beds, question, history };
    let done: Turn;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as AskAnswer | ApiError | null;
      if (res.ok && json && "lines" in json) {
        done = { question, status: "answered", answer: json };
      } else {
        done = { question, status: "failed", message: failure(res.status, json && "error" in json ? json.error : null) };
      }
    } catch {
      done = { question, status: "failed", message: "RentReceipts couldn't be reached. Check your connection and ask again." };
    }
    setTurns((old) => old.map((t) => (t.status === "pending" && t.question === question ? done : t)));
    // A failed question goes back into the box so it needn't be retyped, unless something new is being typed there.
    if (done.status === "failed") setDraft((current) => (current.trim() ? current : question));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ask(draft);
  }

  const lastModel = [...turns].reverse().find((t): t is Extract<Turn, { status: "answered" }> => t.status === "answered")
    ?.answer.model;

  return (
    <Section id="ask" title="Ask the records"
      subtitle="Answers come only from the records on this page, with the same source tags. When the records can't answer, it says so.">
      {suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" disabled={busy} onClick={() => void ask(s)}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-ink-2 hover:border-ink hover:text-ink disabled:opacity-60">
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {turns.length > 0 && (
        <ul className="mt-4 flex max-w-[68ch] flex-col gap-4" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="text-[15px]">
              <p className="font-semibold text-ink">{t.question}</p>
              {t.status === "pending" && (
                <div className="mt-2" aria-hidden="true">
                  <div className="skeleton h-4" style={{ width: "88%" }} />
                  <div className="skeleton mt-2 h-4" style={{ width: "64%" }} />
                </div>
              )}
              {t.status === "pending" && <p className="sr-only" role="status">Reading the records…</p>}
              {t.status === "failed" && <p className="mt-1 text-brick" role="alert">{t.message}</p>}
              {t.status === "answered" && (
                <ul className="mt-1.5 flex flex-col gap-1.5 leading-relaxed text-ink">
                  {t.answer.lines.map((l, j) => (
                    <li key={j}>
                      {l.text}
                      {l.cites.map((c, k) => <Cite key={k} cite={c} />)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={listEnd} />

      <form onSubmit={onSubmit} className="mt-4 flex max-w-[68ch] flex-wrap items-center gap-2">
        <label htmlFor={`${ids}-q`} className="sr-only">Your question about this address</label>
        <input
          ref={input}
          id={`${ids}-q`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          placeholder="Ask about this address…"
          className="min-w-0 flex-1 rounded-md border-2 border-field bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3 focus:border-accent"
        />
        <button type="submit" disabled={busy || !draft.trim()}
          className="inline-flex h-10 items-center rounded-md bg-accent px-4 text-base font-bold text-accent-ink hover:opacity-90 disabled:cursor-progress disabled:opacity-60">
          {busy ? "Reading…" : "Ask"}
        </button>
      </form>

      <p className="mt-3 max-w-[68ch] text-sm text-ink-2">
        {lastModel
          ? `Answers are written by Google Gemini (${lastModel}) from the records on this page; each line cites the records it used. AI can misread a record, so check anything that matters with the landlord or the City.`
          : "Questions are answered by AI from the records on this page only; each line carries the same source tags as the rest of the brief."}
      </p>
    </Section>
  );
}

function failure(status: number, serverMessage: string | null): string {
  if (status === 404 || status === 503) {
    return serverMessage ?? "Asking the records needs the AI, which isn't set up on this server.";
  }
  if (status === 429) return "Too many questions from this connection. Wait a minute, then ask again.";
  if (status >= 400 && status < 500 && serverMessage) return serverMessage;
  return "That answer didn't come through. Try asking again.";
}
