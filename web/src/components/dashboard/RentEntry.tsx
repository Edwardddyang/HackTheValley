"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import type { ApiError, ListingResponse } from "@/lib/ai-types";
import { MAX_BEDROOMS, RENT_LIMITS } from "@/lib/ai/summary-core";
import { buildingHref, listingQuery } from "@/lib/listing-params";

const BEDROOMS = [
  { value: "0", label: "Bachelor" }, { value: "1", label: "1 bedroom" },
  { value: "2", label: "2 bedrooms" }, { value: "3", label: "3+ bedrooms" },
];

/**
 * Enter the asking rent right on the Rent tab. Typed numbers need no AI: they go into the page's link
 * (?rent=&beds=), exactly as a pasted listing's do, so the comparison and What to flag pick them up. Pasting the
 * ad instead runs the same extraction as the home page and also carries the ad's claims for the Ad check.
 */
export function RentEntry({ addressPointId, radius }: { addressPointId: number; radius: number }) {
  const router = useRouter();
  const ids = useId();
  const [rent, setRent] = useState("");
  const [beds, setBeds] = useState("1");
  const [pasting, setPasting] = useState(false);
  const [ad, setAd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(listing: { rent: number | null; beds: number | null; claims: ListingResponse["listing"]["claims"] }) {
    const r = radius === 500 ? null : radius;
    router.push(`${buildingHref(addressPointId, { radius: r, listing: listingQuery(listing) })}#rent`);
  }

  function submitNumbers(e: FormEvent) {
    e.preventDefault();
    const n = Number(rent.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < RENT_LIMITS.min || n > RENT_LIMITS.max) {
      setError(`Enter a monthly rent between $${RENT_LIMITS.min} and $${RENT_LIMITS.max.toLocaleString("en-CA")}.`);
      return;
    }
    setError(null);
    go({ rent: Math.round(n), beds: Math.min(Number(beds), MAX_BEDROOMS), claims: [] });
  }

  async function submitAd(e: FormEvent) {
    e.preventDefault();
    if (!ad.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/listing", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: ad }),
      });
      const json = (await res.json().catch(() => null)) as ListingResponse | ApiError | null;
      if (!res.ok || !json || !("listing" in json)) {
        setError(json && "error" in json ? json.error : "The ad couldn't be read this time. Enter the rent above instead.");
        return;
      }
      const l = json.listing;
      if (l.asking_rent == null) {
        setError("No rent found in that ad. Enter it above instead.");
        return;
      }
      go({ rent: l.asking_rent, beds: l.bedrooms, claims: l.claims });
    } catch {
      setError("RentReceipts couldn't be reached. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-teal-700 focus:outline-none focus-visible:outline-2 focus-visible:outline-teal-700";
  const button = "rounded-lg bg-[#142D4E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";

  return (
    <div className="mt-3">
      <form onSubmit={submitNumbers} className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${ids}-rent`} className="block text-xs text-slate-500">Asking rent / month</label>
          <input id={`${ids}-rent`} inputMode="numeric" placeholder="$2,350" value={rent} onChange={(e) => setRent(e.target.value)}
            className={`${field} mt-1 w-32 tabular-nums`} />
        </div>
        <div>
          <label htmlFor={`${ids}-beds`} className="block text-xs text-slate-500">Bedrooms</label>
          <select id={`${ids}-beds`} value={beds} onChange={(e) => setBeds(e.target.value)} className={`${field} mt-1`}>
            {BEDROOMS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <button type="submit" className={button}>Compare</button>
      </form>

      {pasting ? (
        <form onSubmit={submitAd} className="mt-4">
          <label htmlFor={`${ids}-ad`} className="block text-xs text-slate-500">Paste the ad</label>
          <textarea id={`${ids}-ad`} rows={4} value={ad} onChange={(e) => setAd(e.target.value)}
            placeholder="Bright 1 bedroom near Bloor – $2,350/month…" className={`${field} mt-1 w-full`} />
          <button type="submit" disabled={busy || !ad.trim()} className={`${button} mt-2`}>{busy ? "Reading the ad…" : "Read the ad"}</button>
        </form>
      ) : (
        <button type="button" onClick={() => setPasting(true)}
          className="mt-3 rounded text-sm font-medium text-teal-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-teal-700">
          Or paste the ad instead
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
