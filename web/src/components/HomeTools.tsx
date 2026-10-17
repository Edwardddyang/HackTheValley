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
    <div className="flex flex-col gap-10">
      <section aria-labelledby="paste-h" className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm sm:p-6">
        <h2 id="paste-h" className="plate text-[2rem] font-bold text-ink">Paste a listing</h2>
        <div className="mt-3">
          <ListingForm onSearchInstead={(address, keep) => setPrefill({ address, keep, nonce: Date.now() })} />
        </div>
      </section>

      <section aria-labelledby="search-h" className="px-1 sm:px-0">
        <h2 id="search-h" className="plate text-[1.6rem] font-bold text-ink">Or look up an address</h2>
        {prefill?.keep ? (
          <p className="mt-1 text-[15px] text-ink-2">The listing&apos;s rent, bedrooms and claims carry over to the brief.</p>
        ) : null}
        <div className="mt-3 max-w-2xl">
          <SearchBox key={prefill?.nonce ?? 0} initialAddress={prefill?.address ?? ""} keep={prefill?.keep ?? ""}
            autoFocus={prefill != null} />
        </div>
        <p className="mt-3 text-[15px] text-ink-2">
          Try{" "}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              {i > 0 ? ", " : ""}
              <Link className="text-accent underline underline-offset-2" href={`/?address=${encodeURIComponent(e)}`}>{e}</Link>
            </span>
          ))}
        </p>
      </section>
    </div>
  );
}
