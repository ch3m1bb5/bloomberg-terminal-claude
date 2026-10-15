"use client";

import { Input } from "@/components/ui/input";
import { RefreshCw, Send, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { BloombergButton } from "../core/bloomberg-button";
import type { MarketItem } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiMarketAnalysisProps {
  selectedSecurity?: MarketItem;
  benchmarkSecurity?: MarketItem;
  colors: {
    background: string;
    surface: string;
    text: string;
    border: string;
    accent: string;
    positive: string;
    negative: string;
  };
}

export function AiMarketAnalysis({ selectedSecurity, benchmarkSecurity, colors }: AiMarketAnalysisProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const streamMessage = useCallback(async (userMessages: Message[]) => {
    setIsLoading(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    abortRef.current = new AbortController();
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({ messages: userMessages, marketData: { selectedSecurity, benchmarkSecurity } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n").filter(Boolean)) {
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: updated[updated.length - 1].content + text };
                return updated;
              });
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to get response");
      setMessages((prev) => prev.filter((m) => !(m.role === "assistant" && m.content === "")));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSecurity, benchmarkSecurity]);

  const generateOverview = () => {
    const userMsg: Message = {
      role: "user",
      content: selectedSecurity
        ? `Give me a brief market overview for ${selectedSecurity.id}${benchmarkSecurity ? ` compared to ${benchmarkSecurity.id}` : ""}. Include price action, key levels, and risk factors.`
        : "Give me a brief overview of current global market conditions across the major indices shown.",
    };
    const newMessages = [userMsg];
    setMessages(newMessages);
    streamMessage(newMessages);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages.filter((m) => m.content !== ""), userMsg];
    setMessages(newMessages);
    setInput("");
    streamMessage(newMessages);
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
  };

  return (
    <div className="p-4 border rounded-sm" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold">AI Market Analysis</h3>
        <div className="flex gap-2">
          <BloombergButton color="accent" onClick={generateOverview} disabled={isLoading} className="flex items-center gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
            MARKET OVERVIEW
          </BloombergButton>
          {messages.length > 0 && (
            <BloombergButton color="red" onClick={clearChat} className="flex items-center gap-1 text-xs">
              <X className="h-3 w-3" />
              CLEAR
            </BloombergButton>
          )}
        </div>
      </div>

      <div className="p-3 mb-4 border rounded-sm text-xs overflow-y-auto" style={{ borderColor: colors.border, backgroundColor: colors.background, minHeight: "100px", maxHeight: "300px" }}>
        {error ? (
          <p style={{ color: colors.negative }}>Error: {error}. Please try again.</p>
        ) : messages.length === 0 ? (
          <p className="text-xs" style={{ color: colors.text, opacity: 0.5 }}>
            Click MARKET OVERVIEW to generate AI commentary on current market conditions, or ask a specific question below.
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div key={i}>
                {m.role === "user" ? (
                  <p className="text-xs font-bold mb-1" style={{ color: colors.accent }}>&gt; {m.content}</p>
                ) : (
                  <p className="text-xs whitespace-pre-line" style={{ color: colors.text }}>
                    {m.content}{isLoading && i === messages.length - 1 && <span className="animate-pulse">▋</span>}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold mb-2">Ask About Market Data</h4>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about market trends, top performers, sectors, etc."
            className="flex-1 h-8 text-xs font-mono rounded-none border focus:ring-0 focus:ring-offset-0"
            style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.text }}
            disabled={isLoading}
          />
          <BloombergButton type="submit" color="accent" disabled={isLoading || !input.trim()} className="flex items-center gap-1 text-xs">
            <Send className="h-3 w-3" />
            ASK
          </BloombergButton>
        </form>
      </div>
    </div>
  );
}
