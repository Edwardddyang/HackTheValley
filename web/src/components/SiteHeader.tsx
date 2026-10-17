import Link from "next/link";
import type { ReactNode } from "react";

/** Site header. On brief pages it is sticky and carries the address search. */
export function SiteHeader({ search, sticky = false }: { search?: ReactNode; sticky?: boolean }) {
  return (
    <header className={`no-print border-b border-border bg-page/95 backdrop-blur ${sticky ? "sticky-header z-20 sm:sticky sm:top-0" : ""}`}>
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" aria-label="RentReceipts home"
          className="plate flex shrink-0 items-center gap-2 text-[1.4rem] font-bold text-ink no-underline">
          <BlockMark />
          RentReceipts
          <span className="sr-only">, Toronto</span>
        </Link>
        {search ? <div className="order-3 w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-2xl">{search}</div> : null}
        <nav aria-label="Site" className="ml-auto">
          <ul className="flex items-center gap-5 text-[15px] font-semibold">
            <li><Link href="/" className="rounded text-ink underline-offset-4 transition hover:text-accent hover:underline">New search</Link></li>
            <li><Link href="/sources" className="rounded text-ink underline-offset-4 transition hover:text-accent hover:underline">Sources</Link></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

/** A city block seen from above: four lots, one of them yours. */
function BlockMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="5" y="5" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="12" y="5" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="5" y="12" width="5" height="5" fill="currentColor" opacity="0.35" />
      <rect x="12" y="12" width="5" height="5" fill="var(--accent)" />
    </svg>
  );
}
