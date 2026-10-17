"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

import type { ApiError, Summary, SummaryLine, SummaryRequest } from "@/lib/ai-types";
import { date } from "@/lib/format";

import { Cite } from "./Cite";
import { Section } from "./ui";

// The plain-language summary and the viewing checklist both come from one POST /api/summary.
// The server rebuilds the brief itself and only restates facts in it; every line carries its cites.

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

/** Fetches the summary once per address and radius. Key it by address so a new address starts fresh. */
export function SummaryProvider({ addressPointId, radius, children }: { addressPointId: number; radius: number; children: ReactNode }) {
  const body: SummaryRequest = { address_point_id: addressPointId, radius_m: radius };
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

/** The plain-language summary at the top of the brief. */
export function SummaryPanel() {
  const { state, retry } = useSummary();
  return (
    <section id="summary" aria-labelledby="summary-h" className="rounded-2xl border border-accent/25 bg-accent-tint p-5 shadow-sm sm:p-6">
      <h2 id="summary-h" className="text-xl font-semibold tracking-tight text-ink">In plain language</h2>
      <p className="sr-only" role="status">
        {state.status === "loading" ? "Writing the summary." : state.status === "ready" ? "The summary is ready." : ""}
      </p>
      <div aria-busy={state.status === "loading"} className="mt-2">
        {state.status === "loading" && <Skeleton lines={4} label="Writing a summary from the records on this page…" />}
        {state.status === "error" && <Failed what="summary" failure={state.failure} onRetry={retry} />}
        {state.status === "ready" &&
          (state.summary.sentences.length === 0 ? (
            <p className="text-[15px] text-ink-2">The summary came back empty. The records below still apply.</p>
          ) : (
            <>
              <ul className="flex max-w-[68ch] flex-col gap-2.5 text-[1.0625rem] leading-relaxed text-ink">
                {state.summary.sentences.map((s, i) => (
                  <li key={i}><Line line={s} /></li>
                ))}
              </ul>
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
      "From RentReceipts, using City of Toronto open data.",
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

  const button = "rounded-lg border border-accent px-3 py-1 text-sm font-semibold text-accent transition hover:bg-accent hover:text-accent-ink";
  return (
    <Section id="checklist" title="Questions for the viewing"
      subtitle="Based on what the records flag. Take them to the viewing and tick them off as you ask."
      actions={ready ? (
        <div className="no-print flex gap-2">
          <button type="button" onClick={copy} className={button}>Copy list</button>
          <button type="button" onClick={print} className={button}>Print list</button>
        </div>
      ) : null}>
      <div aria-busy={state.status === "loading"}>
        {state.status === "loading" && <Skeleton lines={3} label="Writing your questions…" />}
        {state.status === "error" && <Failed what="questions" failure={state.failure} onRetry={retry} />}
        {state.status === "ready" && !ready && (
          <p className="text-[15px] text-ink-2">No questions came back. Start with the lowest-scoring inspection items above.</p>
        )}
        {ready && (
          <>
            <p className="hidden print:block print:font-bold">Questions for the viewing: {address}</p>
            <ul className="flex max-w-[68ch] flex-col">
              {items.map((q, i) => (
                <li key={i} className="flex gap-3 border-b border-hairline py-3">
                  <input id={`check-${i}`} type="checkbox" checked={!!done[i]}
                    onChange={(e) => setDone((d) => ({ ...d, [i]: e.target.checked }))}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" />
                  <div className="text-[15px]">
                    <label htmlFor={`check-${i}`} className={`cursor-pointer ${done[i] ? "text-ink-2 line-through" : "text-ink"}`}>
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
        <p className="mt-2 text-sm text-ink-2" role="status">{notice}</p>
      </div>
    </Section>
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
    <p className="mt-3 max-w-[68ch] text-sm text-ink-2">
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
      <p className="mb-3 text-sm text-ink-2">{label}</p>
      <div aria-hidden="true" className="flex max-w-[68ch] flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="skeleton h-4" style={{ width: widths[i % widths.length] }} />
        ))}
      </div>
    </div>
  );
}

function Failed({ what, failure, onRetry }: { what: "summary" | "questions"; failure: Failure; onRetry: () => void }) {
  const subject = what === "summary" ? "The plain-language summary" : "The viewing questions";
  const text =
    failure === "unavailable"
      ? `${subject} ${what === "summary" ? "is" : "are"} written by AI, which isn't set up on this server. Everything else on this page comes straight from the records.`
      : failure === "rate_limited"
        ? `Too many requests from this connection. Wait a minute, then try again.`
        : `${subject} couldn't be written this time. The rest of the brief is unaffected.`;
  return (
    <div className="text-[15px] text-ink" role={failure === "unavailable" ? undefined : "alert"}>
      <p>{text}</p>
      {failure !== "unavailable" && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold text-accent underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}
