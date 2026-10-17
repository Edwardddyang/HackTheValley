"use client";

import { useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { AddressMatch } from "@/contracts/types";
import { useAddressSearch } from "@/hooks/useAddressSearch";

export default function AddressSearch() {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectionMessage, setSelectionMessage] = useState<string | null>(null);
  const { matches, isLoading, error, retry } = useAddressSearch(query);
  const listId = `${id}-results`;
  const active = open && !isLoading ? matches[activeIndex] : undefined;

  function select(address: AddressMatch) {
    setOpen(false);
    setActiveIndex(-1);
    setQuery(address.label);
    if (address.rsn === null) {
      setSelectionMessage("This address has no registered apartment report yet. Choose another address to continue.");
      return;
    }
    setSelectionMessage(null);
    router.push(`/building/${encodeURIComponent(String(address.rsn))}`);
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
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (active) select(active);
    }
  }

  return (
    <div
      className="border-b border-slate-200 px-6 py-5"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label htmlFor={`${id}-input`} className="block text-sm font-semibold">Search a Toronto address</label>
      <p id={`${id}-hint`} className="mt-1 text-xs leading-5 text-slate-500">Search the fictional examples below. Use arrow keys to explore, Enter to select, and Escape to close.</p>
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 bg-white p-1 focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-700/20">
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={active ? `${id}-option-${activeIndex}` : undefined}
          aria-describedby={`${id}-hint`}
          autoComplete="off"
          spellCheck={false}
          placeholder="Try “Example” or “202”"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
            setSelectionMessage(null);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 rounded-md px-3 py-3 text-base outline-none placeholder:text-slate-400"
        />
        {query && <button
          type="button"
          aria-label="Clear address search"
          className="rounded-md px-3 py-3 text-sm text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
          onClick={() => {
            setQuery("");
            setActiveIndex(-1);
            setSelectionMessage(null);
            setOpen(true);
            inputRef.current?.focus();
          }}
        >Clear</button>}
      </div>
      {open && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <ul id={listId} role="listbox" aria-label="Matching addresses" aria-busy={isLoading} className="max-h-72 overflow-y-auto">
            {matches.map((address, index) => (
              <li key={address.rsn ?? address.addressPointId ?? address.label} role="presentation">
                <button
                  id={`${id}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => select(address)}
                  className={`block w-full px-4 py-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700 ${index === activeIndex ? "bg-teal-50 text-teal-900" : "hover:bg-slate-50"}`}
                >{address.label}</button>
              </li>
            ))}
          </ul>
          <p role="status" className="px-4 py-3 text-xs leading-5 text-slate-600">
            {isLoading ? "Searching addresses…" : error ? "Address search is unavailable." : matches.length ? `${matches.length} ${matches.length === 1 ? "address" : "addresses"} found.` : "No matching addresses. Try Example, Sample, Illustration, Demo or Placeholder."}
          </p>
          {error && <div className="border-t border-slate-200 px-4 py-3"><p className="text-xs leading-5 text-red-800">{error}</p><button type="button" onClick={() => {
            retry();
            inputRef.current?.focus();
          }} className="mt-2 rounded text-sm font-medium text-teal-800 underline focus-visible:outline-2 focus-visible:outline-teal-700">Retry search</button></div>}
        </div>
      )}
      {selectionMessage && <p role="status" className="mt-3 text-sm leading-6 text-amber-900">{selectionMessage}</p>}
    </div>
  );
}
