// From feature/frontend (Satwik).
export default function Loading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-[#F8FAFC] px-6 py-16 text-[#142D4E]">
      <div className="mx-auto max-w-6xl">
        <p role="status" className="text-lg font-medium">Loading your building brief…</p>
        <div aria-hidden="true" className="mt-8 grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-44 rounded-2xl border border-slate-200 bg-slate-100 motion-safe:animate-pulse" />)}
        </div>
      </div>
    </main>
  );
}
