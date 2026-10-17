"use client";

import Link from "next/link";
import { useState } from "react";

import { ListingForm } from "./ListingForm";
import { SearchBox } from "./SearchBox";

const EXAMPLES = ["375 Brunswick Ave", "200 Elm St", "326 Avenue Rd", "2000 Eglinton Ave E"];

/** The two ways in: paste a listing (primary) or search an address. A listing that can't be matched hands off to search. */
export function HomeTools() {
  const [prefill, setPrefill] = useState<{ address: string; keep: string; nonce: number } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="paste-h" className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Start here</p>
        <h2 id="paste-h" className="mt-1 text-2xl font-semibold tracking-tight text-ink">Paste a listing</h2>
        <div className="mt-3">
          <ListingForm onSearchInstead={(address, keep) => setPrefill({ address, keep, nonce: Date.now() })} />
        </div>
      </section>

      <section aria-labelledby="search-h" className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-6">
        <h2 id="search-h" className="text-xl font-semibold tracking-tight text-ink">Or look up an address</h2>
        {prefill?.keep ? (
          <p className="mt-1 text-[15px] text-ink-2">The listing&apos;s rent, bedrooms and claims carry over to the brief.</p>
        ) : null}
        <div className="mt-3 max-w-2xl">
          <SearchBox key={prefill?.nonce ?? 0} initialAddress={prefill?.address ?? ""} keep={prefill?.keep ?? ""}
            autoFocus={prefill != null} />
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-2 text-[15px] text-ink-2">
          <span>Try</span>
          {EXAMPLES.map((e) => (
            <Link key={e} href={`/?address=${encodeURIComponent(e)}`}
              className="inline-block rounded-full border border-hairline bg-surface px-3 py-1 text-sm font-medium text-ink-2 shadow-sm transition hover:border-accent/40 hover:bg-accent-tint hover:text-accent">
              {e}
            </Link>
          ))}
        </p>
      </section>
    </div>
  );
}
