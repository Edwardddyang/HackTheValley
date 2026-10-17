import Link from "next/link";
import type { ReactNode } from "react";

// Header and footer from feature/frontend (Satwik).
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-[1600px] px-6 lg:px-10 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5">
        <Link href="/" className="rounded text-xl font-bold tracking-tight text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
          Read<span className="text-teal-700">Receipt.</span>
        </Link>
        {children}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-500">
      ReadReceipt · Built for Toronto renters · Hack the Valley 11 · Data: City of Toronto Open Data, Toronto Police Service
    </footer>
  );
}
