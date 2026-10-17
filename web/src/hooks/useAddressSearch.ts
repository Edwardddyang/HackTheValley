"use client";

import { useEffect, useState } from "react";

import type { AddressMatch } from "@/lib/brief";

// From feature/frontend (Satwik), now backed by GET /api/geocode.
type SearchResult = { query: string; attempt: number; matches: AddressMatch[]; error: string | null };

const MIN_LENGTH = 3;

export function useAddressSearch(query: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const q = query.trim();

  useEffect(() => {
    if (q.length < MIN_LENGTH) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Address search failed. Please try again.");
        if (!controller.signal.aborted) setResult({ query: q, attempt, matches: data.matches ?? [], error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ query: q, attempt, matches: [], error: error instanceof Error ? error.message : "Address search failed. Please try again." });
        }
      }
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [q, attempt]);

  const tooShort = q.length < MIN_LENGTH;
  // Hide earlier results as soon as the input changes, even before effect cleanup.
  const isLoading = !tooShort && (result === null || result.query !== q || result.attempt !== attempt);
  return {
    matches: tooShort || isLoading ? [] : result!.matches,
    isLoading,
    tooShort,
    error: tooShort || isLoading ? null : result!.error,
    retry: () => setAttempt((current) => current + 1),
  };
}
