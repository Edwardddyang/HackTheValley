"use client";

import { useEffect, useState } from "react";
import type { AddressMatch } from "@/contracts/types";
import { isDemoMode, searchAddresses } from "@/lib/api";

type SearchResult = {
  query: string;
  attempt: number;
  matches: AddressMatch[];
  error: string | null;
};

export function useAddressSearch(query: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Local fixtures respond immediately; future API adapters get a debounce.
    const timeout = setTimeout(async () => {
      try {
        const matches = await searchAddresses(query, controller.signal);
        // Also protect against adapters that finish after being cancelled.
        if (!controller.signal.aborted) {
          setResult({ query, attempt, matches, error: null });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({
            query,
            attempt,
            matches: [],
            error: error instanceof Error ? error.message : "Address search failed. Please try again.",
          });
        }
      }
    }, isDemoMode() ? 0 : 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, attempt]);

  // Hide earlier results as soon as the input changes, even before effect cleanup.
  const isLoading = result === null || result.query !== query || result.attempt !== attempt;
  return {
    matches: isLoading ? [] : result.matches,
    isLoading,
    error: isLoading ? null : result.error,
    retry: () => setAttempt((current) => current + 1),
  };
}
