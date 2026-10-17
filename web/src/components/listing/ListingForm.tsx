"use client";

import { useRouter } from "next/navigation";
import { type ClipboardEvent, type FormEvent, type RefObject, useId, useRef, useState, useTransition } from "react";

import type { ApiError, ListingExtraction, ListingRequest, ListingResponse } from "@/lib/ai-types";
import { isLinkOnly } from "@/lib/ai/listing-core";
import type { AddressMatch } from "@/lib/brief";
import { bedroomsLabel, date, money } from "@/lib/format";
import { buildingHref, listingQuery } from "@/lib/listing-params";

// From integrate/best-of-both (Ariaz): paste a rental ad (text and/or a screenshot) and Gemini reads the
// address, rent, bedrooms and claims; nothing is fetched from the listing site. Restyled to main's design;
// the brief opens at /building/<id> with the listing carried in the URL.

const SAMPLE_LISTING = `Bright 1 bedroom in a well-maintained Annex building – $2,350/month

375 Brunswick Ave, Toronto. Heat and water included, hydro extra. Stays cool in summer with A/C. Pets welcome. On-site laundry. Available November 1. Close to Bloor St, shops and the subway. No smoking. Message to book a viewing.`;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 12 * 1024 * 1024; // what we accept before downscaling
const MAX_PAYLOAD_CHARS = 3_000_000; // base64 sent to the server stays under 3 MB

type Screenshot = { name: string; data: string; mime_type: string; previewUrl: string };

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; searchInstead: boolean }
  | { kind: "result"; listing: ListingExtraction; matches: AddressMatch[] };

/** The listing's rent, bedrooms and claims as a query string for the brief page. */
function listingParams(listing?: Pick<ListingExtraction, "asking_rent" | "bedrooms" | "claims">) {
  if (!listing) return "";
  return listingQuery({
    rent: listing.asking_rent != null && listing.asking_rent > 0 ? listing.asking_rent : null,
    beds: listing.bedrooms != null && listing.bedrooms >= 0 ? listing.bedrooms : null,
    claims: listing.claims ?? [],
  });
}

/** The brief URL for a matched address, carrying the listing's rent, bedrooms and claims. */
function briefHref(match: Pick<AddressMatch, "address_point_id">, listing?: Pick<ListingExtraction, "asking_rent" | "bedrooms" | "claims">) {
  return buildingHref(match.address_point_id, { listing: listingParams(listing) });
}

/** Paste a rental ad (text and/or a screenshot); the AI reads the address, rent and bedrooms. */
export function ListingForm({ onSearchInstead }: { onSearchInstead: (address: string, keep: string) => void }) {
  const router = useRouter();
  const ids = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const [text, setText] = useState("");
  const [shot, setShot] = useState<Screenshot | null>(null);
  const [shotError, setShotError] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  async function attach(file: File) {
    setShotError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setShotError("Use a PNG, JPEG or WebP screenshot.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setShotError("That image is over 12 MB. Take a smaller screenshot or crop it.");
      return;
    }
    try {
      const encoded = await encodeImage(file);
      setShot((old) => {
        if (old) URL.revokeObjectURL(old.previewUrl);
        return { name: file.name || "Pasted screenshot", ...encoded, previewUrl: URL.createObjectURL(file) };
      });
    } catch {
      setShotError("That image couldn't be read or made small enough. Try a cropped screenshot, or paste the text.");
    }
  }

  function removeShot() {
    setShot((old) => {
      if (old) URL.revokeObjectURL(old.previewUrl);
      return null;
    });
    if (fileInput.current) fileInput.current.value = "";
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void attach(file);
    }
  }

  function open(match: AddressMatch, listing: ListingExtraction) {
    setOpeningFor(match.address);
    startTransition(() => router.push(briefHref(match, listing)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim() && !shot) {
      setState({ kind: "error", message: "Paste the listing text or add a screenshot first.", searchInstead: false });
      return;
    }
    // A bare link can't be read: Block Brief never visits listing sites. Ask for the ad itself.
    const linkOnly = isLinkOnly(text);
    if (linkOnly && !shot) {
      setState({
        kind: "error",
        message: "That looks like a link, not the ad. Block Brief never visits listing sites — open the listing and paste the ad's text here, or add a screenshot of it.",
        searchInstead: true,
      });
      return;
    }
    setState({ kind: "submitting" });
    const body: ListingRequest = {};
    // With a screenshot, a link-only paste is left out: the ad is read from the image, and the link adds nothing.
    if (text.trim() && !linkOnly) body.text = text.trim();
    if (shot) body.image = { data: shot.data, mime_type: shot.mime_type };
    let res: Response;
    try {
      res = await fetch("/api/listing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      setState({ kind: "error", message: "Block Brief couldn't be reached. Check your connection and try again.", searchInstead: false });
      return;
    }
    const json = (await res.json().catch(() => null)) as ListingResponse | ApiError | null;
    if (!res.ok || !json || !("listing" in json)) {
      setState({ kind: "error", ...failure(res.status, json && "error" in json ? json.error : null) });
      return;
    }
    setState({ kind: "result", listing: json.listing, matches: json.matches });
    // bb_geocode also returns fuzzy near-misses (375 Brock Ave for 375 Brunswick Ave); an exact
    // top match (similarity 1) is unambiguous, so open it directly unless the extraction was unsure.
    const [top, next] = json.matches;
    const exact = top && top.similarity >= 0.99 && (!next || next.similarity < 0.99);
    if ((json.matches.length === 1 || exact) && json.listing.confidence !== "low") {
      open(top, json.listing);
    } else {
      requestAnimationFrame(() => resultHeading.current?.focus());
    }
  }

  const busy = state.kind === "submitting" || isPending;

  return (
    <div>
      <form onSubmit={onSubmit} noValidate aria-busy={busy}>
        <label htmlFor={`${ids}-text`} className="block text-base font-semibold text-[#142D4E]">Listing text</label>
        <p id={`${ids}-hint`} className="mt-0.5 max-w-[60ch] text-sm text-slate-600">
          Copy the whole ad from Kijiji, Facebook Marketplace or anywhere else. Only what you paste here is read; the
          listing site is never visited.
        </p>
        <textarea
          id={`${ids}-text`}
          aria-describedby={`${ids}-hint`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          rows={6}
          placeholder={"Bright 1 bedroom near Bloor – $2,350/month\n123 Example St, Toronto. Heat included…"}
          className="mt-2 block w-full resize-y rounded-lg border-2 border-slate-300 bg-white px-3 py-2.5 text-base leading-relaxed text-[#142D4E] placeholder:text-slate-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/20"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <input ref={fileInput} id={`${ids}-file`} type="file" accept={ACCEPTED_TYPES.join(",")} className="peer sr-only"
            aria-describedby={`${ids}-file-hint`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void attach(f);
            }} />
          <label htmlFor={`${ids}-file`}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-[#142D4E] hover:border-teal-700 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700">
            <PaperclipIcon />
            {shot ? "Replace screenshot" : "Add a screenshot"}
          </label>
          <span id={`${ids}-file-hint`} className="text-sm text-slate-600">Optional. You can also paste an image into the box.</span>
        </div>

        {shot && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={shot.previewUrl} alt="" className="h-14 w-14 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-sm">{shot.name}</span>
            <button type="button" onClick={removeShot} className="rounded px-2 py-1 text-sm font-semibold text-teal-800 underline underline-offset-2">
              Remove<span className="sr-only"> screenshot</span>
            </button>
          </div>
        )}
        {shotError && <p className="mt-2 text-sm text-red-800" role="alert">{shotError}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy}
            className="inline-flex h-11 items-center rounded-lg bg-[#142D4E] px-5 text-base font-semibold text-white hover:opacity-90 disabled:cursor-progress disabled:opacity-75">
            {state.kind === "submitting" ? "Reading the listing…" : "Check this listing"}
          </button>
          <button type="button"
            onClick={() => {
              setText(SAMPLE_LISTING);
              setState({ kind: "idle" });
            }}
            className="rounded-lg px-2 py-2 text-sm font-semibold text-teal-800 underline underline-offset-2">
            Try a sample listing
          </button>
        </div>
      </form>

      <div className="mt-5 empty:hidden">
        {state.kind === "error" && (
          <div className="rounded-lg border-l-4 border-red-400 bg-red-50 px-4 py-3 text-sm text-[#142D4E]" role="alert">
            <p>{state.message}</p>
            {state.searchInstead && (
              <button type="button" onClick={() => onSearchInstead("", "")}
                className="mt-2 font-semibold text-teal-800 underline underline-offset-2">
                Search by address instead
              </button>
            )}
          </div>
        )}
        {state.kind === "result" && (
          <ListingResult
            headingRef={resultHeading}
            listing={state.listing}
            matches={state.matches}
            openingFor={isPending ? openingFor : null}
            onOpen={(m) => open(m, state.listing)}
            onSearchInstead={() => onSearchInstead(state.listing.address ?? "", listingParams(state.listing))}
          />
        )}
      </div>
    </div>
  );
}

function failure(status: number, serverMessage: string | null): { message: string; searchInstead: boolean } {
  if (status === 404 || status === 503) {
    return { message: "Reading listings needs the AI, which isn't set up on this server. You can still search by address.", searchInstead: true };
  }
  if (status === 429) return { message: "Too many listings checked from this connection. Wait a minute, then try again.", searchInstead: true };
  if (status === 413) return { message: "That screenshot is too large. Crop it, or paste the listing text instead.", searchInstead: false };
  if (status >= 400 && status < 500 && serverMessage) return { message: `The listing couldn't be read: ${serverMessage}`, searchInstead: true };
  return { message: "The listing couldn't be read this time. Try again, or search by address.", searchInstead: true };
}

function ListingResult({ headingRef, listing, matches, openingFor, onOpen, onSearchInstead }: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  listing: ListingExtraction;
  matches: AddressMatch[];
  openingFor: string | null;
  onOpen: (m: AddressMatch) => void;
  onSearchInstead: () => void;
}) {
  const low = listing.confidence === "low";
  return (
    <section aria-labelledby="listing-read-h" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
      <h3 id="listing-read-h" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-[#142D4E] outline-none">
        What the listing says
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
        <dt className="text-slate-600">Address</dt>
        <dd className="font-semibold text-[#142D4E]">
          {listing.address ?? "Not found in the listing"}
          {listing.unit ? `, unit ${listing.unit}` : ""}
        </dd>
        {listing.asking_rent != null && (
          <><dt className="text-slate-600">Asking rent</dt><dd className="tabular-nums font-semibold text-[#142D4E]">{money(listing.asking_rent)} a month</dd></>
        )}
        {listing.bedrooms != null && (
          <><dt className="text-slate-600">Bedrooms</dt><dd className="font-semibold text-[#142D4E]">{bedroomsLabel(listing.bedrooms)}</dd></>
        )}
        {listing.utilities_included && (
          <><dt className="text-slate-600">Utilities included</dt><dd className="font-semibold text-[#142D4E]">{listing.utilities_included}</dd></>
        )}
        {listing.available_from && (
          <><dt className="text-slate-600">Available</dt><dd className="font-semibold text-[#142D4E]">{date(listing.available_from)}</dd></>
        )}
      </dl>

      {openingFor ? (
        <p className="mt-4 text-sm font-semibold text-[#142D4E]" role="status">Opening the brief for {openingFor}…</p>
      ) : matches.length === 0 ? (
        <div className="mt-4 text-sm text-[#142D4E]">
          <p>
            {listing.address
              ? "That address isn't in Toronto's address register. Search for it, or check the listing for a different spelling."
              : "The listing doesn't say where the apartment is. Ask the landlord for the street address, then search for it."}
          </p>
          <button type="button" onClick={onSearchInstead}
            className="mt-3 rounded-lg border-2 border-teal-700 px-4 py-2 font-semibold text-teal-800 hover:bg-teal-700 hover:text-white">
            {listing.address ? "Search for this address" : "Search for an address"}
          </button>
        </div>
      ) : (
        <div className="mt-4 text-sm">
          <p className="font-semibold text-[#142D4E]">
            {low
              ? "The address in the listing was hard to read. Is it one of these?"
              : matches.length === 1
                ? "This is the address we matched."
                : "More than one address matches. Which one is it?"}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {matches.map((m) => (
              <li key={m.address_point_id}>
                <button type="button" onClick={() => onOpen(m)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-left hover:border-teal-700">
                  <span className="font-semibold text-[#142D4E]">{low ? "Yes, it's " : ""}{m.address}</span>
                  {m.municipality ? (
                    <span className="text-sm text-slate-600">{m.municipality.charAt(0).toUpperCase() + m.municipality.slice(1)}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onSearchInstead} className="mt-3 rounded px-1 py-1 font-semibold text-teal-800 underline underline-offset-2">
            {low ? "No, I'll search for the address" : "None of these: search instead"}
          </button>
        </div>
      )}
    </section>
  );
}

/** Read an image as base64 (no data: prefix), downscaling until the payload is under 3 MB. */
async function encodeImage(file: File): Promise<{ data: string; mime_type: string }> {
  if (file.size <= 1_500_000) {
    const data = stripDataPrefix(await readAsDataUrl(file));
    if (data.length < MAX_PAYLOAD_CHARS) return { data, mime_type: file.type };
  }
  const bitmap = await createImageBitmap(file);
  try {
    for (const edge of [1600, 1280, 1024, 800]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.85, 0.7]) {
        const data = stripDataPrefix(canvas.toDataURL("image/jpeg", quality));
        if (data.length < MAX_PAYLOAD_CHARS) return { data, mime_type: "image/jpeg" };
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("image too large");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripDataPrefix(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
      <path d="M21 11.5 12.6 19.9a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
