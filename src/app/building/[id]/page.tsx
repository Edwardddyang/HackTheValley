import Link from "next/link";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { getBuildingReport, isDemoMode } from "@/lib/api";
import Loading from "./loading";
import NeighbourhoodMap from "@/components/map/NeighbourhoodMap";
import BuildingSummaryPanel from "@/components/dashboard/BuildingSummaryPanel";
import InspectionPanel from "@/components/dashboard/InspectionPanel";
import NearbyConstructionPanel from "@/components/dashboard/NearbyConstructionPanel";
import AreaComplaintsPanel from "@/components/dashboard/AreaComplaintsPanel";
import RentBenchmarksPanel from "@/components/dashboard/RentBenchmarksPanel";

// Reviews remain reserved for Daniel's component integration.
function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6"><p className="mb-3 text-xs font-medium tracking-wide text-slate-500 uppercase">Temporary section placeholder</p><h2 className="text-xl font-semibold">{title}</h2><div className="mt-3 text-sm leading-6 text-slate-600">{children}</div></section>;
}

async function Report({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getBuildingReport(id);
  if (!report) return <main className="mx-auto max-w-3xl px-6 py-20"><h1 className="text-3xl font-semibold">Building not found</h1><p className="mt-4 text-slate-600">There is no report for this building ID. Choose an available address to continue.</p><Link href="/" className="mt-6 inline-block rounded-lg bg-[#142D4E] px-5 py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Choose another address</Link></main>;
  const { building, query, nearby, area, rent, ward, listing } = report;
  const demo = isDemoMode();
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <header><p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">Your building brief</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{building?.address ?? query.label}</h1>
        {isDemoMode() && <p className="mt-5 inline-block rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">Demo data — illustrative only</p>}
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Explore building information, inspection records and the surrounding area. Check the source notes and data limitations in each panel.</p>
      </header>
      <div className="mt-9 grid gap-5 md:grid-cols-2">
        <BuildingSummaryPanel building={building} address={query.label} demo={demo} />
        <InspectionPanel evaluation={building?.evaluation ?? null} demo={demo} />
        <section className="rounded-2xl border border-slate-200 bg-white p-6 md:col-span-2" aria-labelledby="map-title"><h2 id="map-title" className="text-xl font-semibold">Around the block</h2><NeighbourhoodMap report={report} demo={isDemoMode()} /></section>
        <NearbyConstructionPanel changes={nearby} demo={demo} />
        <AreaComplaintsPanel area={area} demo={demo} />
        <RentBenchmarksPanel rent={rent} listing={listing} demo={demo} />
        <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Your ward</h2><p className="mt-3 text-sm leading-6 text-slate-600">{ward.wardName} · Ward {ward.wardNumber}. Ward content is illustrative.</p><p className="mt-3 text-sm leading-6 text-slate-600">A question to consider: {ward.questions[0] ?? "What support is available to renters?"}</p></section>
        <div className="md:col-span-2"><Placeholder title="Tenant reviews"><p>Reviews section integration pending. No reviews are included in this demonstration. Seeded reviews will be labelled “sample data”.</p></Placeholder></div>
        <section className="rounded-2xl border border-slate-200 bg-slate-100 p-6 md:col-span-2" aria-labelledby="limitations-title"><h2 id="limitations-title" className="text-xl font-semibold">Sources and limitations</h2><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
      </div>
    </main>
  );
}

export default function BuildingPage({ params }: { params: Promise<{ id: string }> }) {
  return <div className="min-h-screen bg-[#F8FAFC] text-[#142D4E]"><nav aria-label="Report navigation" className="border-b border-slate-200 bg-white px-6 py-5"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4"><Link href="/" className="rounded text-xl font-bold focus-visible:outline-2 focus-visible:outline-teal-700">Block <span className="text-teal-700">Brief.</span></Link><Link href="/#demo-addresses" className="rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-teal-700">← Choose another address</Link></div></nav><Suspense fallback={<Loading />}><Report params={params} /></Suspense></div>;
}
