"use client";

import { type FormEvent, useId, useState } from "react";

import { REVIEW_LIMITS, type Review } from "@/lib/reviews-core";

/** Post a review: star rating, comment and an optional name. `website` is a hidden honeypot for bots. */
export function ReviewForm({ addressPointId, address, onPosted, disabled = false }: {
  addressPointId: number; address: string; onPosted: (review: Review) => void; disabled?: boolean;
}) {
  const ids = useId();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "done"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!rating) return setMessage({ kind: "error", text: "Pick a rating." });
    if (body.trim().length < REVIEW_LIMITS.minBody) return setMessage({ kind: "error", text: `Write at least ${REVIEW_LIMITS.minBody} characters.` });
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "post", address_point_id: addressPointId, rating, body, author, website }),
      });
      const json = await res.json().catch(() => null) as { review?: Review; error?: string } | null;
      if (!res.ok || !json?.review) {
        setMessage({ kind: "error", text: json?.error ?? "Couldn't post the review. Try again." });
        return;
      }
      onPosted(json.review);
      setRating(0); setBody(""); setAuthor("");
      setMessage({ kind: "done", text: "Posted. Thanks for helping the next renter." });
    } catch {
      setMessage({ kind: "error", text: "RentReceipts couldn't be reached. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-teal-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-700";

  return (
    <form onSubmit={submit} aria-label={`Review ${address}`} className="h-fit space-y-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
      <h3 className="text-sm font-semibold text-[#142D4E]">Lived here? Leave a review</h3>
      <fieldset disabled={disabled || busy} className="space-y-3">
        <div role="radiogroup" aria-label="Rating" className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i === 1 ? "" : "s"}`}
              onClick={() => setRating(i)}
              className={`text-2xl leading-none transition focus-visible:outline-2 focus-visible:outline-teal-700 ${i <= rating ? "text-amber-500" : "text-slate-300 hover:text-amber-300"}`}>
              ★
            </button>
          ))}
        </div>
        <div>
          <label htmlFor={`${ids}-body`} className="sr-only">Your review</label>
          <textarea id={`${ids}-body`} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={REVIEW_LIMITS.maxBody}
            placeholder="Maintenance, management, noise, heat in winter…" className={field} />
          <p className="mt-0.5 text-right text-[11px] tabular-nums text-slate-500">{body.length} / {REVIEW_LIMITS.maxBody}</p>
        </div>
        <div>
          <label htmlFor={`${ids}-author`} className="mb-1 block text-xs text-slate-500">Name (optional)</label>
          <input id={`${ids}-author`} type="text" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={REVIEW_LIMITS.maxAuthor}
            placeholder="e.g. Unit 4B tenant" className={field} />
        </div>
        {/* Honeypot: hidden from people and screen readers; bots that fill it are dropped. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website}
          onChange={(e) => setWebsite(e.target.value)} className="hidden" />
        <button type="submit" className="w-full rounded-lg bg-[#142D4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
          {busy ? "Posting…" : "Post review"}
        </button>
      </fieldset>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className={`text-sm ${message.kind === "error" ? "text-red-700" : "text-teal-800"}`}>{message.text}</p>}
    </form>
  );
}
