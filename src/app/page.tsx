import Link from "next/link";
import { Suspense } from "react";
import { isDemoMode, searchAddresses } from "@/lib/api";
import type { AddressMatch } from "@/contracts/types";
import AddressSearch from "@/components/search/AddressSearch";

async function AddressChoices() {
  let addresses: AddressMatch[];
  try {
    addresses = await searchAddresses("");
  } catch {
    return <div role="alert" className="p-6"><p>Address search is unavailable. API mode requires confirmed backend configuration. Reload the page to try again.</p></div>;
  }
  if (!addresses.length) return <p role="status" className="p-6 text-slate-600">No addresses are available yet.</p>;
    return <ul className="divide-y divide-slate-200">{addresses.map((address) => (
      <li key={address.rsn ?? address.addressPointId ?? address.label}>
        {address.rsn !== null ? <Link href={`/building/${address.rsn}`} className="flex min-h-16 items-center justify-between gap-4 px-6 py-4 transition hover:bg-teal-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"><span className="font-medium">{address.label}</span><span aria-hidden="true" className="text-xl text-teal-700">↗</span></Link> : <p className="px-6 py-4">{address.label}<span className="block text-sm text-slate-600">No registered apartment report is available for this address.</span></p>}
      </li>
    ))}</ul>;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#142D4E]">
      <a href="#demo-addresses" className="sr-only rounded bg-white p-3 focus:not-sr-only focus:absolute focus:z-10">Skip to addresses</a>
      <header className="border-b border-slate-200 bg-white"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-6 py-6">
        <Link href="/" className="rounded text-xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-teal-700">Block <span className="text-teal-700">Brief.</span></Link>
        <a href="#how-it-works" className="rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">How it works</a>
      </nav></header>
      <main className="mx-auto max-w-6xl px-6 pb-20 pt-14 sm:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <section aria-labelledby="hero-title" className="lg:pt-5">
            <p className="mb-6 text-xs font-bold tracking-[0.18em] text-teal-700 uppercase">A little context. A better move.</p>
            <h1 id="hero-title" className="max-w-xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl">Know your building before you sign.</h1>
            <p className="mt-7 max-w-lg text-lg leading-8 text-slate-600">Explore Toronto building inspections, nearby construction, neighbourhood amenities, and rental information before choosing your next home.</p>
            {isDemoMode() && <p className="mt-8 inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">Demo data — illustrative only</p>}
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">Explore fictional buildings to preview the experience. These examples are not municipal records or rental advice.</p>
          </section>
          <section id="demo-addresses" aria-labelledby="addresses-title" className="scroll-mt-6 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40">
            <div className="border-b border-slate-200 px-6 py-6"><h2 id="addresses-title" className="text-xl font-semibold">Choose a demo address</h2><p className="mt-2 text-sm leading-6 text-slate-600">Five fictional buildings. Open a report to look around.</p></div>
            <AddressSearch />
            <p className="px-6 pt-5 pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Quick-select examples</p>
            <Suspense fallback={<p role="status" className="p-6 text-slate-600">Loading addresses…</p>}><AddressChoices /></Suspense>
            <p className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs leading-5 text-slate-500">Search by street name or number, or choose any example above.</p>
          </section>
        </div>
        <section id="how-it-works" aria-labelledby="how-title" className="mt-20 border-t border-slate-200 pt-10">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight">Get to know the building. Then the block.</h2>
          <div className="mt-7 grid gap-7 sm:grid-cols-3">{[
            ["01", "Start with an address", "Choose a fictional building to open its demonstration dashboard."],
            ["02", "See the wider picture", "Preview the space for inspections, area context and nearby changes."],
            ["03", "Know the limits", "Check what each dataset can tell you before making housing decisions."],
          ].map(([number, title, description]) => <div key={number}><p className="text-sm font-semibold text-teal-700">{number}</p><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>)}</div>
        </section>
      </main>
      <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-500">Block Brief · Built for Toronto renters · Hack the Valley 11</footer>
    </div>
  );
}
