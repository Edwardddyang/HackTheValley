"use client";

import { useEffect, useRef, useState } from "react";

import { Cite } from "@/components/Cite";
import type { AdCheck, AdCheckRequest, ApiError, Claim, Verdict } from "@/lib/ai-types";
import { date } from "@/lib/format";

// From integrate/best-of-both (Ariaz): one POST /api/adcheck per address, radius and set of claims. The server
// rebuilds the brief itself and judges each quoted claim against the records; every row carries the cites it
// used. Restyled to main's panel design; the fetch and provenance logic is unchanged.

type Failure = "rate_limited" | "failed";
type State =
  | { status: "loading" }
  | { status: "ready"; adCheck: AdCheck }
  | { status: "error"; failure: Failure };

/** Chip colours never stand alone: the verdict word and a shape are always shown. */
const VERDICTS: Record<Verdict, { label: string; icon: string; className: string }> = {
  confirmed: { label: "Confirmed", icon: "✓", className: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  challenged: { label: "Challenged", icon: "!", className: "border-red-300 bg-red-50 text-red-900" },
  cant_check: { label: "Can’t check", icon: "?", className: "border-slate-300 bg-slate-50 text-slate-700" },
};

export function AdCheckPanel({ addressPointId, radius, rent, beds, claims }: {
  addressPointId: number; radius: number; rent: number | null; beds: number | null; claims: Claim[];
}) {
  const body: AdCheckRequest = { address_point_id: addressPointId, radius_m: radius, rent, beds, claims };
  const requestKey = JSON.stringify(body);
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    // Next keeps a page mounted while it's hidden and re-runs effects when it's shown again; don't refetch then.
    if (loaded.current === `${requestKey}#${attempt}`) return;
    const controller = new AbortController();
    fetch("/api/adcheck", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestKey,
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as AdCheck | ApiError | null;
        // Aborted by the cleanup while the body was read: the next run owns the state; this isn't a failure.
        if (controller.signal.aborted) return;
        loaded.current = `${requestKey}#${attempt}`;
        if (res.ok && json && "rows" in json) {
          setState({ status: "ready", adCheck: json });
        } else {
          setState({ status: "error", failure: res.status === 429 ? "rate_limited" : "failed" });
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

  return (
    <section id="adcheck" aria-labelledby="adcheck-h"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <h2 id="adcheck-h" className="text-xl font-semibold tracking-tight text-[#142D4E]">Ad check</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Each claim from the ad, next to what the public records say. <strong className="font-semibold text-[#142D4E]">Can’t check</strong> is
        an honest answer: no loaded record speaks to that claim.
      </p>
      <p className="sr-only" role="status">
        {state.status === "loading" ? "Checking the ad's claims." : state.status === "ready" ? "The ad check is ready." : ""}
      </p>
      <div aria-busy={state.status === "loading"} className="mt-4">
        {state.status === "loading" && <RowSkeleton count={Math.min(claims.length, 4)} />}
        {state.status === "error" && (
          <div className="text-sm text-slate-700" role="alert">
            <p>
              {state.failure === "rate_limited"
                ? "Too many requests from this connection. Wait a minute, then try again."
                : "The ad couldn't be checked this time. The rest of the brief is unaffected."}
            </p>
            <button type="button" onClick={retry} className="mt-2 font-semibold text-teal-800 underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <ul className="space-y-3">
              {state.adCheck.rows.map((row, i) => {
                const v = VERDICTS[row.verdict];
                return (
                  <li key={i} className="rounded-xl border border-slate-200 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <blockquote className="min-w-0 italic text-slate-600">“{row.quote}”</blockquote>
                      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${v.className}`}>
                        <span aria-hidden>{v.icon}</span>{v.label}
                      </span>
                    </div>
                    <p className="mt-2 max-w-4xl leading-6 text-[#142D4E]">
                      {row.text}
                      {row.cites.map((c, j) => <Cite key={j} cite={c} />)}
                    </p>
                  </li>
                );
              })}
            </ul>
            <Provenance adCheck={state.adCheck} />
          </>
        )}
      </div>
    </section>
  );
}

/** Says honestly who wrote the verdict lines: Gemini, or the fixed rules used when the AI was unavailable. */
function Provenance({ adCheck }: { adCheck: AdCheck }) {
  const template = adCheck.model === "template";
  return (
    <p className="mt-4 max-w-4xl border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
      {template
        ? "Checked with fixed rules because the AI wasn't available. Each line only restates the records it cites."
        : `Checked by Google Gemini (${adCheck.model}) against the records on this page; each line cites the records it used. AI can misread a record, so check anything that matters with the landlord or the City.`}
      {adCheck.generated_at ? ` Checked ${date(adCheck.generated_at)}.` : ""}
    </p>
  );
}

function RowSkeleton({ count }: { count: number }) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">Checking the ad’s claims against the records…</p>
      <div aria-hidden="true" className="flex max-w-4xl flex-col gap-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="h-4 rounded bg-slate-200/80 motion-safe:animate-pulse" style={{ width: ["72%", "58%", "66%", "48%"][i % 4] }} />
            <div className="h-4 rounded bg-slate-200/80 motion-safe:animate-pulse" style={{ width: "92%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
