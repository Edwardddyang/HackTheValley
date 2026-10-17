"use client";

import { useEffect, useRef, useState } from "react";

import type { AdCheck, AdCheckRequest, ApiError, Claim, Verdict } from "@/lib/ai-types";
import { date } from "@/lib/format";

import { Cite } from "./Cite";
import { Section } from "./ui";

// One POST /api/adcheck per address, radius and set of claims. The server rebuilds the brief itself and judges each
// quoted claim against the records; every row carries the cites it used.

type Failure = "rate_limited" | "failed";
type State =
  | { status: "loading" }
  | { status: "ready"; adCheck: AdCheck }
  | { status: "error"; failure: Failure };

/** Chip colours never stand alone: the verdict word is always written out. */
const VERDICTS: Record<Verdict, { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "border-moss bg-moss-tint" },
  challenged: { label: "Challenged", className: "border-brick bg-brick-tint" },
  cant_check: { label: "Can’t check", className: "border-border bg-surface-2" },
};

/** The ad's claims, each against what the loaded records say. Rendered under "Your listing" when an ad was pasted. */
export function AdCheckSection({ addressPointId, radius, rent, beds, claims }: {
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
    <Section id="adcheck" title="Ad check"
      subtitle={<>Each claim from the ad you pasted, next to what the public records say. <strong className="font-semibold text-ink">Can’t check</strong> is an honest answer: no loaded record speaks to that claim.</>}>
      <p className="sr-only" role="status">
        {state.status === "loading" ? "Checking the ad's claims." : state.status === "ready" ? "The ad check is ready." : ""}
      </p>
      <div aria-busy={state.status === "loading"}>
        {state.status === "loading" && <RowSkeleton count={Math.min(claims.length, 4)} />}
        {state.status === "error" && (
          <div className="text-[15px] text-ink" role="alert">
            <p>
              {state.failure === "rate_limited"
                ? "Too many requests from this connection. Wait a minute, then try again."
                : "The ad couldn't be checked this time. The rest of the brief is unaffected."}
            </p>
            <button type="button" onClick={retry} className="mt-2 font-semibold text-accent underline underline-offset-2">
              Try again
            </button>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <ul className="divide-y divide-hairline">
              {state.adCheck.rows.map((row, i) => (
                <li key={i} className="py-3.5 text-[15px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                    <blockquote className="min-w-0 italic text-ink-2">“{row.quote}”</blockquote>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold text-ink ${VERDICTS[row.verdict].className}`}>
                      {VERDICTS[row.verdict].label}
                    </span>
                  </div>
                  <p className="mt-1.5 max-w-[68ch] text-ink">
                    {row.text}
                    {row.cites.map((c, j) => <Cite key={j} cite={c} />)}
                  </p>
                </li>
              ))}
            </ul>
            <Provenance adCheck={state.adCheck} />
          </>
        )}
      </div>
    </Section>
  );
}

/** Says honestly who wrote the verdict lines: Gemini, or the fixed rules used when the AI was unavailable. */
function Provenance({ adCheck }: { adCheck: AdCheck }) {
  const template = adCheck.model === "template";
  return (
    <p className="mt-3 max-w-[68ch] text-sm text-ink-2">
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
      <p className="mb-3 text-sm text-ink-2">Checking the ad’s claims against the records…</p>
      <div aria-hidden="true" className="flex max-w-[68ch] flex-col gap-4">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="skeleton h-4" style={{ width: ["72%", "58%", "66%", "48%"][i % 4] }} />
            <div className="skeleton h-4" style={{ width: "92%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
