"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import { Cite } from "@/components/Cite";
import type { ApiError, Summary, SummaryLine, SummaryRequest } from "@/lib/ai-types";
import { date } from "@/lib/format";

// From integrate/best-of-both (Ariaz): the What-to-flag bullets and the viewing checklist both come from one
// POST /api/summary. The server rebuilds the brief itself and only restates facts in it; every line carries its
// cites. Restyled to main's panel design; the fetch, failure and provenance logic is unchanged.

type Failure = "unavailable" | "rate_limited" | "failed";
type State =
  | { status: "loading" }
  | { status: "ready"; summary: Summary }
  | { status: "error"; failure: Failure };

const SummaryContext = createContext<{ state: State; retry: () => void } | null>(null);

function useSummary() {
  const ctx = useContext(SummaryContext);
  if (!ctx) throw new Error("useSummary must be used inside <SummaryProvider>");
  return ctx;
}

/** Fetches the flags once per address, radius and listing. Key it by address so a new address starts fresh. */
export function SummaryProvider({ addressPointId, radius, rent = null, beds = null, children }: {
  addressPointId: number; radius: number; rent?: number | null; beds?: number | null; children: ReactNode;
}) {
  const body: SummaryRequest = { address_point_id: addressPointId, radius_m: radius, rent, beds };
  const requestKey = JSON.stringify(body);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    // Next keeps a page mounted while it's hidden and re-runs effects when it's shown again; don't refetch then.
    if (loaded.current === `${requestKey}#${attempt}`) return;
    const controller = new AbortController();
    fetch("/api/summary", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestKey,
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as Summary | ApiError | null;
        // Aborted by the cleanup while the body was read: the next run owns the state; this isn't a failure.
        if (controller.signal.aborted) return;
        loaded.current = `${requestKey}#${attempt}`;
        if (res.ok && json && "sentences" in json) {
          setState({ status: "ready", summary: json });
        } else {
          setState({ status: "error", failure: failureFor(res.status) });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error", failure: "failed" });
      });
    return () => controller.abort();
  }, [requestKey, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  return <SummaryContext.Provider value={{ state, retry }}>{children}</SummaryContext.Provider>;
}

function failureFor(status: number): Failure {
  if (status === 404 || status === 503) return "unavailable"; // route not deployed, or the AI isn't configured
  if (status === 429) return "rate_limited";
  return "failed";
}

/** At most 3 standout deviations, worst first; zero flags is a valid, honest answer. */
export function SummaryPanel() {
  const { state, retry } = useSummary();
  return (
    <section id="summary" aria-labelledby="summary-h"
      className="min-w-0 rounded-2xl border border-teal-200 bg-teal-50/60 p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="summary-h" className="text-xl font-semibold tracking-tight text-[#142D4E]">What to flag</h2>
        <span className="rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-medium text-teal-800">AI summary of the records</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">The records&apos; standout deviations for this address, worst first.</p>
      <p className="sr-only" role="status">
        {state.status === "loading" ? "Picking what to flag." : state.status === "ready" ? "The flags are ready." : ""}
      </p>
      <div aria-busy={state.status === "loading"} className="mt-4">
        {state.status === "loading" && <Skeleton lines={3} label="Flagging what stands out in the records…" />}
        {state.status === "error" && <Failed what="summary" failure={state.failure} onRetry={retry} />}
        {state.status === "ready" &&
          (state.summary.sentences.length === 0 ? (
            <>
              <p className="max-w-3xl text-base leading-7 text-[#142D4E]">
                No red flags in the records for this address. The tabs below show how much the records cover.
              </p>
              <Provenance summary={state.summary} />
            </>
          ) : (
            <>
              <ol className="flex max-w-4xl flex-col gap-3">
                {state.summary.sentences.map((s, i) => (
                  <li key={i} className="flex gap-3 text-base leading-7 text-[#142D4E]">
                    <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[#142D4E] text-xs font-semibold text-white">{i + 1}</span>
                    <span><Line line={s} /></span>
                  </li>
                ))}
              </ol>
              <Provenance summary={state.summary} />
            </>
          ))}
      </div>
    </section>
  );
}

/** Questions to ask at the viewing, grounded in the weak inspection items and other facts. */
export function ChecklistPanel({ address }: { address: string }) {
  const { state, retry } = useSummary();
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [notice, setNotice] = useState("");
  const items = state.status === "ready" ? state.summary.checklist : [];
  const ready = items.length > 0;

  async function copy() {
    const text = [
      `Questions for the viewing: ${address}`,
      "",
      ...items.map((q) => `[ ] ${q.text}`),
      "",
      "From ReadReceipt, using City of Toronto open data.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Copied ${items.length} questions.`);
    } catch {
      setNotice("Couldn't copy automatically. Select the questions and copy them yourself.");
    }
  }

  function print() {
    const root = document.documentElement;
    root.dataset.print = "checklist";
    window.addEventListener("afterprint", () => delete root.dataset.print, { once: true });
    window.print();
  }

  const button = "rounded-lg border border-teal-700 px-3 py-1.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
  return (
    <section id="checklist" aria-labelledby="checklist-h"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id="checklist-h" className="text-xl font-semibold tracking-tight text-[#142D4E]">Questions for the viewing</h2>
        {ready && (
          <div className="no-print flex gap-2">
            <button type="button" onClick={copy} className={button}>Copy list</button>
            <button type="button" onClick={print} className={button}>Print list</button>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Based on what the records flag. Take them to the viewing and tick them off as you ask.</p>
      <div aria-busy={state.status === "loading"} className="mt-4">
        {state.status === "loading" && <Skeleton lines={3} label="Writing your questions…" />}
        {state.status === "error" && <Failed what="questions" failure={state.failure} onRetry={retry} />}
        {state.status === "ready" && !ready && (
          <p className="text-sm text-slate-600">No questions came back. Start with the lowest-scoring inspection items.</p>
        )}
        {ready && (
          <>
            <p className="hidden print:block print:font-bold">Questions for the viewing: {address}</p>
            <ul className="grid gap-x-10 lg:grid-cols-2">
              {items.map((q, i) => (
                <li key={i} className="flex gap-3 border-b border-slate-100 py-3">
                  <input id={`check-${i}`} type="checkbox" checked={!!done[i]}
                    onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))}
                    className="mt-1 size-4 shrink-0 accent-teal-700" />
                  <div className="text-sm leading-6">
                    <label htmlFor={`check-${i}`} className={`cursor-pointer ${done[i] ? "text-slate-500 line-through" : "text-[#142D4E]"}`}>
                      {q.text}
                    </label>
                    <span className="no-print">{q.cites.map((c, j) => <Cite key={j} cite={c} />)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <Provenance summary={state.status === "ready" ? state.summary : null} />
          </>
        )}
        <p className="mt-2 text-sm text-slate-600" role="status">{notice}</p>
      </div>
    </section>
  );
}

function Line({ line }: { line: SummaryLine }) {
  return (
    <>
      {line.text}
      {line.cites.map((c, i) => <Cite key={i} cite={c} />)}
    </>
  );
}

/** Says honestly who wrote the text: Gemini, or the fixed template used when the AI was unavailable. */
function Provenance({ summary }: { summary: Summary | null }) {
  if (!summary) return null;
  const template = summary.model === "template";
  return (
    <p className="mt-4 max-w-4xl border-t border-slate-200/70 pt-3 text-xs leading-5 text-slate-500">
      {template
        ? "Built from a fixed template because the AI wasn't available. It only restates the records on this page."
        : `Written by Google Gemini (${summary.model}) from the records on this page; each line cites the records it used. AI can misread a record, so check anything that matters with the landlord or the City.`}
      {summary.generated_at ? ` ${template ? "Built" : "Written"} ${date(summary.generated_at)}.` : ""}
    </p>
  );
}

function Skeleton({ lines, label }: { lines: number; label: string }) {
  const widths = ["96%", "88%", "92%", "70%", "84%"];
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">{label}</p>
      <div aria-hidden="true" className="flex max-w-4xl flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 rounded bg-slate-200/80 motion-safe:animate-pulse" style={{ width: widths[i % widths.length] }} />
        ))}
      </div>
    </div>
  );
}

function Failed({ what, failure, onRetry }: { what: "summary" | "questions"; failure: Failure; onRetry: () => void }) {
  const subject = what === "summary" ? "The What-to-flag panel" : "The viewing questions";
  const text =
    failure === "unavailable"
      ? `${subject} ${what === "summary" ? "is" : "are"} written by AI, which isn't set up on this server. Everything else on this page comes straight from the records.`
      : failure === "rate_limited"
        ? "Too many requests from this connection. Wait a minute, then try again."
        : `${subject} couldn't be written this time. The rest of the brief is unaffected.`;
  return (
    <div className="text-sm text-slate-700" role={failure === "unavailable" ? undefined : "alert"}>
      <p>{text}</p>
      {failure !== "unavailable" && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-teal-800 underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
