import Link from "next/link";
import type { ReactNode } from "react";

// Header and footer from feature/frontend (Satwik).
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-[1600px] px-6 lg:px-10 flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5">
        <Link href="/" className="inline-flex items-center gap-2 rounded text-xl font-bold tracking-tight text-[#142D4E] focus-visible:outline-2 focus-visible:outline-teal-700">
          <BlockMark />
          <span>Rent<span className="text-teal-700">Receipts.</span></span>
        </Link>
        {children}
      </nav>
    </header>
  );
}

/** A city block seen from above: four lots, one of them yours (in the wordmark's teal). From integrate/best-of-both. */
function BlockMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="5" y="5" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="12" y="5" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="5" y="12" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="12" y="12" width="5" height="5" fill="#0f766e" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 px-6 py-6 text-center text-xs text-slate-500">
      RentReceipts · Built for Toronto renters · Hack the Valley 11 · Data: City of Toronto Open Data, Toronto Police Service
    </footer>
  );
}
