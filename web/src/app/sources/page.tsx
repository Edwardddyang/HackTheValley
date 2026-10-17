import type { Metadata } from "next";
import Link from "next/link";

import { LIMITS } from "@/components/LimitsPanel";
import { SiteHeader } from "@/components/SiteHeader";

import { CITY_LICENCE, DATASETS } from "./datasets";

export const metadata: Metadata = {
  title: "Sources and limits",
  description: "Every dataset RentReceipts uses, what it's used for, its licence, and what it can't tell you.",
};

const navLink = "-ml-0.5 block border-l-2 border-transparent py-1 pl-3 text-[15px] text-ink-2 hover:border-ink hover:text-ink";

export default function SourcesPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 outline-none sm:px-6 sm:pt-14">
        <div className="max-w-[46rem]">
          <h1 className="plate text-[clamp(2.6rem,9vw,4.5rem)] font-bold text-ink">Sources and limits</h1>
          <p className="mt-4 text-[1.15rem] leading-snug text-ink-2">
            Every fact in a brief comes from one of the datasets below, loaded ahead of time into RentReceipts&apos; own
            database, so a brief never depends on a live City service. Listing sites are never visited or scraped: only
            the listing text or screenshot you paste is read.
          </p>
        </div>

        <div className="mt-12 lg:grid lg:grid-cols-[14rem_minmax(0,46rem)] lg:gap-12">
          <nav aria-label="Datasets on this page" className="no-print hidden lg:block">
            <div className="sticky top-6">
              <p className="plate text-[1.1rem] font-bold text-ink">On this page</p>
              <ul className="mt-2 flex flex-col border-l-2 border-hairline">
                {DATASETS.map((d) => (
                  <li key={d.key}><a href={`#${d.key}`} className={navLink}>{d.name}</a></li>
                ))}
                <li><a href="#ai" className={navLink}>How the AI parts work</a></li>
                <li><a href="#limits" className={navLink}>Limits on every brief</a></li>
              </ul>
            </div>
          </nav>

          <div className="flex min-w-0 flex-col gap-14">
            <section aria-labelledby="datasets-h">
              <h2 id="datasets-h" className="plate border-b-2 border-ink pb-2 text-[2rem] font-bold text-ink">Datasets</h2>
              <p className="mt-3 max-w-[64ch] text-[15px] text-ink-2">
                City of Toronto datasets are published on{" "}
                <a href="https://open.toronto.ca/" className="text-accent underline underline-offset-2">Toronto Open Data</a> under the{" "}
                <a href={CITY_LICENCE.url} className="text-accent underline underline-offset-2">{CITY_LICENCE.name}</a>. The CMHC
                rents are published by CMHC under its own terms. A source tag on a brief names the dataset, the file and
                the row a fact came from.
              </p>
              <div className="mt-4 flex flex-col">
                {DATASETS.map((d) => (
                  <article key={d.key} id={d.key} aria-labelledby={`${d.key}-name`} className="scroll-mt-6 border-b border-hairline py-6">
                    <h3 id={`${d.key}-name`} className="plate text-[1.5rem] font-bold text-ink">{d.name}</h3>
                    <p className="mt-1 text-[15px] text-ink-2">{d.publisher}</p>
                    <dl className="mt-4 flex flex-col gap-4 text-base">
                      <div>
                        <dt className="font-semibold text-ink">What the brief uses it for</dt>
                        <dd className="mt-1 max-w-[64ch] text-ink">{d.usedFor}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-ink">What it can&apos;t tell you</dt>
                        <dd className="mt-1">
                          <ul className="flex max-w-[64ch] list-disc flex-col gap-1 pl-5 text-ink marker:text-ink-2">
                            {d.limits.map((l) => <li key={l}>{l}</li>)}
                          </ul>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-ink">Licence</dt>
                        <dd className="mt-1 text-ink">
                          {d.licence.url ? <a href={d.licence.url} className="text-accent underline underline-offset-2">{d.licence.name}</a> : d.licence.name}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-ink">Original data</dt>
                        <dd className="mt-1 break-words">
                          <a href={d.url} className="text-accent underline underline-offset-2">{d.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            <section id="ai" aria-labelledby="ai-h" className="scroll-mt-6">
              <h2 id="ai-h" className="plate border-b-2 border-ink pb-2 text-[2rem] font-bold text-ink">How the AI parts work</h2>
              <ul className="mt-4 flex max-w-[64ch] list-disc flex-col gap-2 pl-5 text-base text-ink marker:text-ink-2">
                <li>
                  Google Gemini writes the plain-language summary and the viewing questions. The server builds the brief
                  itself and Gemini only sees those records, the same ones shown on the page.
                </li>
                <li>Every line must cite the records it&apos;s based on. Hover or focus a source tag to see the dataset, file and row.</li>
                <li>When Gemini isn&apos;t available, a fixed template restates the key facts instead, and the brief says so.</li>
                <li>
                  When you paste a listing, Gemini reads the address, unit, asking rent and bedrooms from your text or
                  screenshot. The address is then matched against the City&apos;s address register; nothing is fetched from
                  the listing site.
                </li>
                <li>AI can still misread a record. Check anything that matters to you with the landlord or the City.</li>
              </ul>
            </section>

            <section id="limits" aria-labelledby="limits-h" className="scroll-mt-6">
              <h2 id="limits-h" className="plate border-b-2 border-ink pb-2 text-[2rem] font-bold text-ink">Limits on every brief</h2>
              <ul className="mt-4 flex max-w-[64ch] list-disc flex-col gap-2 pl-5 text-base text-ink marker:text-ink-2">
                {LIMITS.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <p className="mt-6">
                <Link href="/" className="font-semibold text-accent underline underline-offset-2">Check a building</Link>
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
