"use client";

import { useRouter } from "next/navigation";
import { type ClipboardEvent, type FormEvent, type RefObject, useId, useRef, useState, useTransition } from "react";

import type { ApiError, ListingExtraction, ListingRequest, ListingResponse } from "@/lib/ai-types";
import type { AddressMatch } from "@/lib/brief";
import { DEFAULT_RADIUS_M } from "@/lib/brief";
import { bedroomsLabel, date, money } from "@/lib/format";

const SAMPLE_LISTING = `Bright 1 bedroom in the Annex – $2,350/month

375 Brunswick Ave, Toronto. Heat and water included, hydro extra. Available November 1. Close to Bloor St, shops and the subway. No smoking. Message to book a viewing.`;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_BYTES = 12 * 1024 * 1024; // what we accept before downscaling
const MAX_PAYLOAD_CHARS = 3_000_000; // base64 sent to the server stays under 3 MB

type Screenshot = { name: string; data: string; mime_type: string; previewUrl: string };

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; searchInstead: boolean }
  | { kind: "result"; listing: ListingExtraction; matches: AddressMatch[] };

/** The brief URL for a matched address, carrying the listing's rent and bedrooms. */
function briefHref(match: Pick<AddressMatch, "address_point_id" | "address">, listing?: Pick<ListingExtraction, "asking_rent" | "bedrooms">) {
  return `/?id=${match.address_point_id}&address=${encodeURIComponent(match.address)}&r=${DEFAULT_RADIUS_M}${listingParams(listing)}`;
}

function listingParams(listing?: Pick<ListingExtraction, "asking_rent" | "bedrooms">) {
  if (!listing) return "";
  const rent = listing.asking_rent != null && listing.asking_rent > 0 ? `&rent=${Math.round(listing.asking_rent)}` : "";
  const beds = listing.bedrooms != null && listing.bedrooms >= 0 ? `&beds=${Math.round(listing.bedrooms)}` : "";
  return rent + beds;
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
    setState({ kind: "submitting" });
    const body: ListingRequest = {};
    if (text.trim()) body.text = text.trim();
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
    if (json.matches.length === 1 && json.listing.confidence !== "low") {
      open(json.matches[0], json.listing);
    } else {
      requestAnimationFrame(() => resultHeading.current?.focus());
    }
  }

  const busy = state.kind === "submitting" || isPending;

  return (
    <div>
      <form onSubmit={onSubmit} noValidate aria-busy={busy}>
        <label htmlFor={`${ids}-text`} className="block text-base font-semibold text-ink">Listing text</label>
        <p id={`${ids}-hint`} className="mt-0.5 max-w-[60ch] text-[15px] text-ink-2">
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
          className="mt-2 block w-full resize-y rounded-md border-2 border-field bg-surface px-3 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-3 focus:border-accent"
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <input ref={fileInput} id={`${ids}-file`} type="file" accept={ACCEPTED_TYPES.join(",")} className="peer sr-only"
            aria-describedby={`${ids}-file-hint`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void attach(f);
            }} />
          <label htmlFor={`${ids}-file`}
            className="inline-flex cursor-pointer items-center gap-2 rounded-md border-2 border-field bg-surface px-3 py-1.5 text-[15px] font-semibold text-ink hover:border-accent peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]">
            <PaperclipIcon />
            {shot ? "Replace screenshot" : "Add a screenshot"}
          </label>
          <span id={`${ids}-file-hint`} className="text-sm text-ink-2">Optional. You can also paste an image into the box.</span>
        </div>

        {shot && (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-border bg-surface-2 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
            <img src={shot.previewUrl} alt="" className="h-14 w-14 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-[15px]">{shot.name}</span>
            <button type="button" onClick={removeShot} className="rounded px-2 py-1 text-[15px] font-semibold text-accent underline underline-offset-2">
              Remove<span className="sr-only"> screenshot</span>
            </button>
          </div>
        )}
        {shotError && <p className="mt-2 text-[15px] text-brick" role="alert">{shotError}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy}
            className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-base font-bold text-accent-ink hover:opacity-90 disabled:cursor-progress disabled:opacity-75">
            {state.kind === "submitting" ? "Reading the listing…" : "Check this listing"}
          </button>
          <button type="button"
            onClick={() => {
              setText(SAMPLE_LISTING);
              setState({ kind: "idle" });
            }}
            className="rounded-md px-2 py-2 text-[15px] font-semibold text-accent underline underline-offset-2">
            Try a sample listing
          </button>
        </div>
      </form>

      <div className="mt-5 empty:hidden">
        {state.kind === "error" && (
          <div className="rounded-md border-l-4 border-brick bg-brick-tint px-4 py-3 text-[15px] text-ink" role="alert">
            <p>{state.message}</p>
            {state.searchInstead && (
              <button type="button" onClick={() => onSearchInstead("", "")}
                className="mt-2 font-semibold text-accent underline underline-offset-2">
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
    <section aria-labelledby="listing-read-h" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h3 id="listing-read-h" ref={headingRef} tabIndex={-1} className="plate text-[1.5rem] font-bold text-ink outline-none">
        What the listing says
      </h3>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[15px]">
        <dt className="text-ink-2">Address</dt>
        <dd className="font-semibold text-ink">
          {listing.address ?? "Not found in the listing"}
          {listing.unit ? `, unit ${listing.unit}` : ""}
        </dd>
        {listing.asking_rent != null && (
          <><dt className="text-ink-2">Asking rent</dt><dd className="num font-semibold text-ink">{money(listing.asking_rent)} a month</dd></>
        )}
        {listing.bedrooms != null && (
          <><dt className="text-ink-2">Bedrooms</dt><dd className="font-semibold text-ink">{bedroomsLabel(listing.bedrooms)}</dd></>
        )}
        {listing.utilities_included && (
          <><dt className="text-ink-2">Utilities included</dt><dd className="font-semibold text-ink">{listing.utilities_included}</dd></>
        )}
        {listing.available_from && (
          <><dt className="text-ink-2">Available</dt><dd className="font-semibold text-ink">{date(listing.available_from)}</dd></>
        )}
      </dl>

      {openingFor ? (
        <p className="mt-4 text-[15px] font-semibold text-ink" role="status">Opening the brief for {openingFor}…</p>
      ) : matches.length === 0 ? (
        <div className="mt-4 text-[15px] text-ink">
          <p>
            {listing.address
              ? "That address isn't in Toronto's address register. Search for it, or check the listing for a different spelling."
              : "The listing doesn't say where the apartment is. Ask the landlord for the street address, then search for it."}
          </p>
          <button type="button" onClick={onSearchInstead}
            className="mt-3 rounded-md border-2 border-accent px-4 py-2 font-semibold text-accent hover:bg-accent hover:text-accent-ink">
            {listing.address ? "Search for this address" : "Search for an address"}
          </button>
        </div>
      ) : (
        <div className="mt-4 text-[15px]">
          <p className="font-semibold text-ink">
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
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 rounded-md border-2 border-field bg-surface px-3 py-2 text-left hover:border-accent">
                  <span className="font-semibold text-ink">{low ? "Yes, it's " : ""}{m.address}</span>
                  {m.municipality ? (
                    <span className="text-sm text-ink-2">{m.municipality.charAt(0).toUpperCase() + m.municipality.slice(1)}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onSearchInstead} className="mt-3 rounded px-1 py-1 font-semibold text-accent underline underline-offset-2">
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
