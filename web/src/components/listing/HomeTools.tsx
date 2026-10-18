"use client";

import { useState } from "react";

import AddressSearch from "@/components/search/AddressSearch";

import { ListingForm } from "./ListingForm";

// From integrate/best-of-both (Ariaz): the two ways in, search an address or paste a listing. A listing that
// can't be matched hands off to the search box with its rent, bedrooms and claims kept. Laid out as sections of
// main's landing card.
export function HomeTools() {
  const [prefill, setPrefill] = useState<{ address: string; keep: string; nonce: number } | null>(null);

  return (
    <>
      <div className="px-6 pt-6">
        <h2 id="search-title" className="text-xl font-semibold">Look up an address</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {prefill?.keep
            ? "The listing's rent, bedrooms and claims carry over to the brief."
            : <>Any of Toronto&apos;s 525,000 address points. Apartment buildings also get their RentSafeTO inspection.</>}
        </p>
      </div>
      <AddressSearch key={prefill?.nonce ?? 0} initial={prefill?.address ?? ""} keep={prefill?.keep ?? ""} autoFocus={prefill != null} />
      <div className="px-6 py-6">
        <h2 id="paste-title" className="text-xl font-semibold">Or paste a listing</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Gemini reads the address, rent, bedrooms and claims from the ad, then the brief checks them against the records.</p>
        <div className="mt-4">
          <ListingForm onSearchInstead={(address, keep) => setPrefill({ address, keep, nonce: Date.now() })} />
        </div>
      </div>
    </>
  );
}
