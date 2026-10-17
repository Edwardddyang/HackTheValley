// Mirrors the loaded brief (address header, map card, tab bar, Overview's two-column panels) so the
// page doesn't jump when the data arrives. Same container classes as Report in page.tsx.
const bar = "rounded-full bg-slate-200 motion-safe:animate-pulse";
const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/30";

export default function Loading() {
  return (
    // The full-width background covers route-level loading, which renders without the page's shell.
    <div className="min-h-screen bg-[#F8FAFC]">
    <main aria-busy="true" className="mx-auto max-w-[1600px] px-6 py-10 text-[#142D4E] sm:py-14 lg:px-10">
      <p role="status" className="sr-only">Loading the brief…</p>
      <div aria-hidden="true">
        <div className={`${bar} h-9 w-72 sm:h-10`} />
        <div className={`${bar} mt-4 h-4 w-80`} />
        <div className="mt-5 flex gap-2">
          {[64, 64, 52].map((w, i) => <div key={i} className={`${bar} h-8`} style={{ width: w }} />)}
        </div>
        <div className={`${bar} mt-5 h-4 w-full max-w-3xl`} />

        <section className={`mt-8 ${card}`}>
          <div className={`${bar} h-6 w-44`} />
          <div className="mt-4 h-64 rounded-xl border border-slate-200 bg-[#F8FAFC] 2xl:h-48" />
          <div className="mt-4 h-96 rounded-xl border border-slate-200 bg-slate-100 motion-safe:animate-pulse lg:h-[30rem] 2xl:h-[36rem]" />
          <div className="mt-4 h-14 rounded-xl border border-slate-200 bg-white" />
        </section>

        <div className="mt-8 flex gap-1 overflow-hidden border-b border-slate-200">
          {[80, 48, 116, 56, 100, 128, 100, 72, 112].map((w, i) => (
            <div key={i} className="shrink-0 px-4 py-3.5"><div className={`${bar} h-4`} style={{ width: w }} /></div>
          ))}
        </div>

        <div className="grid gap-5 pt-6 md:grid-cols-2 xl:gap-6">
          {[3, 6, 5, 4].map((lines, i) => (
            <div key={i} className={card}>
              <div className={`${bar} h-6 w-48`} />
              <div className={`${bar} mt-3 h-3.5 w-3/4`} />
              <div className="mt-6 space-y-3">
                {Array.from({ length: lines }, (_, j) => <div key={j} className={`${bar} h-4`} style={{ width: `${92 - j * 9}%` }} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
    </div>
  );
}
