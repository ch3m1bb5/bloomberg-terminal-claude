"use client";

import { useState, useCallback } from "react";

export interface WatchlistAsset {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  marketCap?: number;
}

export function useWatchlistAnalysis() {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeWatchlist = useCallback(
    async (watchlist: WatchlistAsset[], marketContext?: Record<string, unknown>) => {
      if (watchlist.length === 0) return;

      setIsLoading(true);
      setError(null);
      setAnalysis(null);

      try {
        const res = await fetch("/api/ai/watchlist-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watchlist, marketContext }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setAnalysis(data.analysis);
      } catch (err) {
        setError("Failed to analyze watchlist. Please try again.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { analysis, isLoading, error, analyzeWatchlist };
}
