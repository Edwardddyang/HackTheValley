"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";

import { Spinner } from "@/components/Spinner";
import { useAddressSearch } from "@/hooks/useAddressSearch";
import type { AddressMatch } from "@/lib/brief";
import { buildingHref } from "@/lib/listing-params";

// From feature/frontend (Satwik): accessible combobox, now searching all Toronto address points.
/** `keep` is a pasted listing's query string (rent, beds, claims), carried to the brief that opens. */
export default function AddressSearch({ compact = false, initial = "", keep = "", autoFocus = false }: {
  compact?: boolean; initial?: string; keep?: string; autoFocus?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initial);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // True from picking an address until its brief starts rendering, so the box shows it is opening.
  const [opening, startOpening] = useTransition();
  const { matches, isLoading, tooShort, error, retry } = useAddressSearch(query);
  const listId = `${id}-results`;
  const active = open && !isLoading ? matches[activeIndex] : undefined;

  function select(address: AddressMatch) {
    setOpen(false);
    setActiveIndex(-1);
    setQuery(address.address);
    startOpening(() => router.push(buildingHref(address.address_point_id, { listing: keep })));
  }

  function moveTo(index: number) {
    setActiveIndex(index);
    document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!matches.length) return;
      const next = event.key === "ArrowDown"
        ? (!open || activeIndex < 0 ? 0 : (activeIndex + 1) % matches.length)
        : (!open || activeIndex < 0 ? matches.length - 1 : (activeIndex - 1 + matches.length) % matches.length);
      moveTo(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Enter takes the highlighted match, or the best match when none is highlighted.
      const pick = active ?? (!isLoading ? matches[0] : undefined);
      if (pick) select(pick);
    }
  }

  return (
    <div
      className={compact ? "relative w-full" : "border-b border-slate-200 px-6 py-5"}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label htmlFor={`${id}-input`} className={compact ? "sr-only" : "block text-sm font-semibold"}>Search a Toronto address</label>
      {!compact && <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-slate-500">Include the street number. Use arrow keys to explore, Enter to select, and Escape to close.</p>}
      <div className={`${compact ? "" : "mt-3"} flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-1 focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700/20`}>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={active ? `${id}-option-${activeIndex}` : undefined}
          aria-describedby={compact ? undefined : `${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="Street number and name"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={handleKeyDown}
          className={`min-w-0 flex-1 rounded-md px-3 text-[#142D4E] outline-none placeholder:text-slate-400 ${compact ? "py-2 text-sm" : "py-3 text-base"}`}
        />
        {(opening || (open && !tooShort && isLoading)) && <Spinner className={compact ? "h-4 w-4" : "h-5 w-5"} />}
        {opening && <span role="status" className="sr-only">Opening the brief…</span>}
        {query && <button
          type="button"
          aria-label="Clear address search"
          className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
          onClick={() => {
            setQuery("");
            setActiveIndex(-1);
            setOpen(false);
            inputRef.current?.focus();
          }}
        >Clear</button>}
      </div>
      {open && !tooShort && (
        <div className={`mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${compact ? "absolute inset-x-0 z-40 shadow-lg" : ""}`}>
          <ul id={listId} role="listbox" aria-label="Matching addresses" aria-busy={isLoading} className="max-h-72 overflow-y-auto">
            {matches.map((address, index) => (
              <li key={address.address_point_id} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => select(address)}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 ${index === activeIndex ? "bg-teal-50 text-teal-900" : "text-[#142D4E] hover:bg-slate-50"}`}
                >
                  <span>{address.address}</span>
                  <span className="text-xs text-slate-500">{address.municipality}</span>
                </button>
              </li>
            ))}
          </ul>
          <p role="status" className="flex items-center gap-2 px-4 py-3 text-xs leading-5 text-slate-600">
            {isLoading && <Spinner className="h-3.5 w-3.5" />}
            {isLoading ? "Searching addresses…" : error ? "Address search is unavailable." : matches.length ? `${matches.length} ${matches.length === 1 ? "address" : "addresses"} found.` : "No matching Toronto address. Include the street number, e.g. 100 Queen St W."}
          </p>
          {error && <div className="border-t border-slate-200 px-4 py-3"><p className="text-xs leading-5 text-red-800">{error}</p><button type="button" onClick={() => {
            retry();
            inputRef.current?.focus();
          }} className="mt-2 rounded text-sm font-medium text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Retry search</button></div>}
        </div>
      )}
    </div>
  );
}
