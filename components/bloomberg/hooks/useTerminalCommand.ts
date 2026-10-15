"use client";

import { useState, useCallback } from "react";
import type { CommandResult } from "@/app/api/ai/command/route";

export function useTerminalCommand() {
  const [result, setResult] = useState<CommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCommand = useCallback(
    async (
      command: string,
      context?: { marketData?: Record<string, unknown>; watchlist?: string[] }
    ) => {
      if (!command.trim()) return;

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/ai/command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command,
            marketData: context?.marketData,
            watchlist: context?.watchlist,
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: CommandResult = await res.json();
        setResult(data);
        return data;
      } catch (err) {
        setError("Failed to interpret command.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { result, isLoading, error, runCommand };
}
