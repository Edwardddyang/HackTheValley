"use client";

import { type FormEvent, useId, useRef, useState } from "react";

import { Cite } from "@/components/Cite";
import type { ApiError, AskAnswer, AskRequest } from "@/lib/ai-types";

// From integrate/best-of-both (Ariaz), restyled to main's panels. POST /api/ask answers only from the records the
// brief shows, through the same grounding checks as What to flag; the last two Q/A turns go back as history so
// follow-ups make sense.

const MAX_QUESTION_CHARS = 300;

type Turn =
  | { question: string; status: "pending" }
  | { question: string; status: "answered"; answer: AskAnswer }
  | { question: string; status: "failed"; message: string };

export function AskPanel({ addressPointId, radius, rent = null, beds = null, suggestions }: {
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
      done = res.ok && json && "lines" in json
        ? { question, status: "answered", answer: json }
        : { question, status: "failed", message: failure(res.status, json && "error" in json ? json.error : null) };
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

  const answered = turns.some((t) => t.status === "answered");

  return (
    <section id="ask" aria-labelledby={`${ids}-h`}
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <h2 id={`${ids}-h`} className="text-xl font-semibold tracking-tight text-[#142D4E]">Ask about this address</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">Answered only from the records in this brief, with sources.</p>

      {suggestions.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Suggested questions">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" disabled={busy} onClick={() => void ask(s)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm transition hover:border-teal-700/40 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-teal-700">
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {turns.length > 0 && (
        <ul className="mt-6 flex max-w-3xl flex-col gap-5" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i} className="text-sm">
              <p className="font-semibold text-[#142D4E]">{t.question}</p>
              {t.status === "pending" && (
                <div className="mt-2 space-y-2" aria-hidden="true">
                  <div className="h-4 rounded bg-slate-100 motion-safe:animate-pulse" style={{ width: "88%" }} />
                  <div className="h-4 rounded bg-slate-100 motion-safe:animate-pulse" style={{ width: "64%" }} />
                </div>
              )}
              {t.status === "pending" && <p className="sr-only" role="status">Reading the records…</p>}
              {t.status === "failed" && <p className="mt-1 text-red-700" role="alert">{t.message}</p>}
              {t.status === "answered" && (
                <ul className="mt-2 flex flex-col gap-1.5 text-base leading-7 text-slate-800">
                  {t.answer.lines.map((l, j) => (
                    <li key={j}>{l.text}{l.cites.map((c, k) => <Cite key={k} cite={c} />)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={listEnd} />

      <form onSubmit={onSubmit} className="mt-6 flex max-w-3xl flex-wrap items-center gap-2">
        <label htmlFor={`${ids}-q`} className="sr-only">Your question about this address</label>
        <input ref={input} id={`${ids}-q`} type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_QUESTION_CHARS} placeholder="e.g. Has the inspection score improved?"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-700" />
        <button type="submit" disabled={busy || !draft.trim()}
          className="rounded-lg bg-[#142D4E] px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          {busy ? "Reading…" : "Ask"}
        </button>
      </form>

      {answered && (
        <p className="mt-4 border-t border-slate-200/70 pt-3 text-xs leading-5 text-slate-500">
          Written by Gemini from the cited records. Double-check anything important.
        </p>
      )}
    </section>
  );
}

function failure(status: number, serverMessage: string | null): string {
  if (status === 404 || status === 503) return serverMessage ?? "Asking needs the AI, which isn't set up on this server.";
  if (status === 429) return "Too many questions from this connection. Wait a minute, then ask again.";
  if (status >= 400 && status < 500 && serverMessage) return serverMessage;
  return "That answer didn't come through. Try asking again.";
}
