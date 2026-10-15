"use client";

import { useState, useCallback } from "react";

export type ReportType = "market_summary" | "volatility" | "movers" | "sector" | "custom";

export function useReportGeneration() {
  const [report, setReport] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = useCallback(
    async (
      reportType: ReportType,
      data: Record<string, unknown>,
      options?: { customPrompt?: string; format?: "brief" | "detailed" }
    ) => {
      setIsStreaming(true);
      setError(null);
      setReport("");

      try {
        const res = await fetch("/api/ai/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportType,
            data,
            customPrompt: options?.customPrompt,
            format: options?.format ?? "brief",
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          setReport((prev) => prev + chunk);
        }
      } catch (err) {
        setError("Failed to generate report.");
        console.error(err);
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  return { report, isStreaming, error, generateReport };
}
