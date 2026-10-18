"use client";

import { useEffect, useState } from "react";

import type { Review, ReviewList } from "@/lib/reviews-core";

import { ReviewForm } from "./ReviewForm";

// Tenant reviews for this address: unverified opinions, kept visibly apart from the City records.

type State = { status: "loading" } | { status: "ready"; list: ReviewList } | { status: "error" };

export function ReviewsSection({ addressPointId, address }: { addressPointId: number; address: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [reported, setReported] = useState<Set<number>>(new Set());

  useEffect(() => {
    let gone = false;
    fetch(`/api/reviews?address_point_id=${addressPointId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((list: ReviewList) => !gone && setState({ status: "ready", list }))
      .catch(() => !gone && setState({ status: "error" }));
    return () => { gone = true; };
  }, [addressPointId]);

  function added(review: Review) {
    setState((s) => {
      if (s.status !== "ready") return s;
      const items = [review, ...s.list.items];
      const average = Math.round((items.reduce((t, r) => t + r.rating, 0) / items.length) * 10) / 10;
      return { status: "ready", list: { count: s.list.count + 1, average, items } };
    });
  }

  async function report(id: number) {
    setReported((r) => new Set(r).add(id));
    await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "report", id }) })
      .catch(() => undefined);
  }

  return (
    <section id="reviews" aria-labelledby="reviews-title"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="reviews-title" className="text-xl font-semibold tracking-tight text-[#142D4E]">Tenant reviews</h2>
        {state.status === "ready" && state.list.count > 0 && (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Stars rating={state.list.average ?? 0} />
            <span className="font-semibold tabular-nums text-[#142D4E]">{state.list.average}</span>
            <span>· {state.list.count} review{state.list.count === 1 ? "" : "s"}</span>
          </p>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">Unverified opinions from renters, not City records.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div aria-live="polite">
          {state.status === "loading" && (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 motion-safe:animate-pulse" />)}
            </div>
          )}
          {state.status === "error" && <p className="text-sm text-slate-600">Reviews aren&apos;t available right now.</p>}
          {state.status === "ready" && state.list.items.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">No reviews yet.</p>
          )}
          {state.status === "ready" && state.list.items.length > 0 && (
            <ul className="space-y-3">
              {state.list.items.map((r) => (
                <li key={r.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Stars rating={r.rating} />
                      <span className="text-xs text-slate-500">{r.author ?? "Anonymous"} · {new Date(r.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </span>
                    {reported.has(r.id)
                      ? <span className="text-xs text-slate-500">Reported</span>
                      : <button type="button" onClick={() => void report(r.id)} className="rounded text-xs text-slate-500 underline-offset-2 hover:text-red-700 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">Report</button>}
                  </div>
                  <p className="mt-2 whitespace-pre-line leading-6 text-slate-800">{r.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ReviewForm addressPointId={addressPointId} address={address} onPosted={added} disabled={state.status === "error"} />
      </div>
    </section>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex text-amber-500" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} aria-hidden className={i <= Math.round(rating) ? "" : "text-slate-300"}>★</span>)}
    </span>
  );
}
