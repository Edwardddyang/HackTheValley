"use client";

import Link from "next/link";

export default function BuildingError({ retry }: { error: unknown; retry: () => void }) {
  return <main className="min-h-screen bg-[#F8FAFC] px-6 py-20 text-[#142D4E]"><div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-semibold">We couldn’t load this report</h1><p role="alert" className="mt-4 text-sm leading-6 text-slate-600">Try again in a moment. If API mode is enabled, the backend connection must be configured and available. Failed requests are never replaced with demo data.</p><div className="mt-6 flex flex-wrap items-center gap-5"><button onClick={() => retry()} className="rounded-lg bg-[#142D4E] px-5 py-3 font-medium text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Try again</button><Link href="/" className="rounded text-sm underline focus-visible:outline-2 focus-visible:outline-teal-700">Back to addresses</Link></div></div></main>;
}
