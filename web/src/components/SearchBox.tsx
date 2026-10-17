"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Match = { address_point_id: number; address: string; municipality: string | null };

const RADII = [250, 500, 1000];

export function SearchBox({ initialAddress = "", initialRadius = 500, autoFocus = false, keep = "", keepFor }: {
  initialAddress?: string;
  initialRadius?: number;
  autoFocus?: boolean;
  /** Extra query string carried to the brief (e.g. "&rent=2350&beds=1" from a pasted listing). */
  keep?: string;
  /** Only carry `keep` when the searched address is this one (e.g. changing the radius of the same brief). */
  keepFor?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialAddress);
  const [radius, setRadius] = useState(RADII.includes(initialRadius) ? initialRadius : 500);
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = useRef(false); // only suggest after the user types, not for the prefilled address

  useEffect(() => {
    const q = query.trim();
    if (!typed.current || q.length < 3) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        setMatches(data.matches ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        /* aborted or offline: keep the previous suggestions */
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function go(match?: Match) {
    setOpen(false);
    const extra = (to: string) =>
      keep && (keepFor == null || keepFor.trim().toLowerCase() === to.trim().toLowerCase()) ? keep : "";
    if (match) {
      setQuery(match.address);
      router.push(`/?id=${match.address_point_id}&address=${encodeURIComponent(match.address)}&r=${radius}${extra(match.address)}`);
    } else if (query.trim()) {
      router.push(`/?address=${encodeURIComponent(query.trim())}&r=${radius}${extra(query)}`);
    }
  }

  return (
    <form
      role="search"
      className="relative flex w-full flex-wrap gap-2 sm:flex-nowrap"
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 ? matches[active] : undefined);
      }}
    >
      <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder="Enter a Toronto address, e.g. 200 Elm St"
          aria-label="Address"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="h-11 w-full min-w-0 rounded-lg border-2 border-field bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-accent"
          onChange={(e) => {
            typed.current = true;
            setQuery(e.target.value);
          }}
          onFocus={() => matches.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!open || !matches.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % matches.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && matches.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            {matches.map((m, i) => (
              <li
                key={m.address_point_id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2 text-sm ${
                  i === active ? "bg-surface-2" : "hover:bg-surface-2"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(m);
                }}
              >
                <span className="text-ink">{m.address}</span>
                <span className="text-xs text-ink-3">{m.municipality}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <select
        value={radius}
        onChange={(e) => setRadius(Number(e.target.value))}
        aria-label="Search radius"
        className="h-11 shrink-0 rounded-lg border-2 border-field bg-surface px-2 text-[15px] text-ink focus:border-accent"
      >
        {RADII.map((r) => (
          <option key={r} value={r}>
            {r < 1000 ? `${r} m` : "1 km"}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-11 flex-1 rounded-lg bg-accent px-4 text-[15px] font-semibold text-accent-ink hover:opacity-90 sm:flex-none sm:px-5"
      >
        Get the brief
      </button>
    </form>
  );
}
