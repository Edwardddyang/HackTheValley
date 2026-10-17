import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-border bg-page">
      <div className="mx-auto max-w-[1400px] px-4 py-8 text-[15px] text-ink-2">
        <p className="max-w-[72ch]">
          City data from{" "}
          <a href="https://open.toronto.ca/" className="text-ink underline underline-offset-2">Toronto Open Data</a>,
          used under the Open Government Licence – Toronto. Rent benchmarks from CMHC&apos;s Rental Market Survey.
          RentReceipts is an independent student project from Hack the Valley 11. It is not a City of Toronto service
          and isn&apos;t legal advice.{" "}
          <Link href="/sources" className="text-ink underline underline-offset-2">Where each number comes from</Link>.
        </p>
      </div>
    </footer>
  );
}
