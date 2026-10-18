import { redirect } from "next/navigation";
import { Suspense } from "react";

import { HomeTools } from "@/components/listing/HomeTools";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { resolveAddress } from "@/lib/load";

// Landing page from feature/frontend (Satwik), with real address search.

/** Old links (/?address=… or /?id=…) from the first version of the app still work. */
async function LegacyRedirect({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const id = first(sp.id);
  const address = first(sp.address);
  const r = first(sp.r);
  const suffix = r ? `?r=${encodeURIComponent(r)}` : "";
  if (id && /^\d+$/.test(id)) redirect(`/building/${id}${suffix}`);
  if (address?.trim()) {
    const [match] = await resolveAddress(address.trim());
    if (match) redirect(`/building/${match.address_point_id}${suffix}`);
  }
  return null;
}

export default function Home(props: PageProps<"/">) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#142D4E]">
      <Suspense fallback={null}><LegacyRedirect searchParams={props.searchParams} /></Suspense>
      <a href="#search" className="sr-only rounded bg-white p-3 focus:not-sr-only focus:absolute focus:z-10">Skip to address search</a>
      <SiteHeader>
        <a href="#how-it-works" className="rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">How it works</a>
      </SiteHeader>
      <main className="mx-auto max-w-[1600px] px-6 lg:px-10 pb-20 pt-14 sm:pt-24">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20 xl:gap-28">
          <section aria-labelledby="hero-title" className="lg:pt-5">
            <p className="mb-6 text-xs font-bold tracking-[0.18em] text-teal-700 uppercase">A little context. A better move.</p>
            <h1 id="hero-title" className="max-w-2xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl xl:text-7xl">Know your building before you sign.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">Search an address or paste a rental ad to see the building&apos;s City inspection score, how the rent compares, construction nearby, 311 requests, crime and neighbourhood figures, all from open data.</p>
            <p className="mt-6 max-w-md text-sm leading-6 text-slate-600">Every figure links back to the dataset row it came from. The AI summary only restates those records, and cites each one.</p>
          </section>
          <section id="search" aria-labelledby="search-title" className="scroll-mt-6 self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/40">
            <HomeTools />
          </section>
        </div>
        <section id="how-it-works" aria-labelledby="how-title" className="mt-20 border-t border-slate-200 pt-10">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight">Get to know the building. Then the block.</h2>
          <div className="mt-7 grid gap-7 sm:grid-cols-3">{[
            ["01", "Start with an address", "Search any Toronto address, or paste a rental ad, to open its brief."],
            ["02", "See the wider picture", "Inspections, permits, development applications, 311 requests, crime and census figures within walking distance."],
            ["03", "Know the limits", "Each panel says what its dataset can and can't tell you, and cites the rows it used."],
          ].map(([number, title, description]) => <div key={number}><p className="text-sm font-semibold text-teal-700">{number}</p><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>)}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
