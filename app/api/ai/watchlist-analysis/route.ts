import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { guardAiRequest } from "../guard";

export const maxDuration = 60;
export const runtime = "nodejs";

const requestSchema = z.object({
  watchlist: z.array(
    z.object({
      symbol: z.string(),
      name: z.string().optional(),
      price: z.number().optional(),
      change: z.number().optional(),
      changePercent: z.number().optional(),
      volume: z.number().optional(),
      marketCap: z.number().optional(),
    })
  ).max(30),
  marketContext: z.record(z.string(), z.any()).optional(),
});


export async function POST(req: NextRequest) {
  try {
    const blocked = await guardAiRequest(req, { maxRequests: 10, windowInSeconds: 60 });
    if (blocked) return blocked;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const body = await req.json();
    const validationResult = requestSchema.safeParse(body);

    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { watchlist, marketContext } = validationResult.data;

    const watchlistText = watchlist
      .map((asset) => {
        const parts = [`${asset.symbol}`];
        if (asset.name) parts.push(`(${asset.name})`);
        if (asset.price) parts.push(`Price: $${asset.price}`);
        if (asset.change !== undefined) parts.push(`Change: ${asset.change > 0 ? "+" : ""}${asset.change}`);
        if (asset.changePercent !== undefined) parts.push(`(${asset.changePercent > 0 ? "+" : ""}${asset.changePercent.toFixed(2)}%)`);
        if (asset.volume) parts.push(`Vol: ${(asset.volume / 1e6).toFixed(1)}M`);
        return parts.join(" ");
      })
      .join("\n");

    const contextStr = marketContext
      ? `\nBroader market context: ${JSON.stringify(marketContext).slice(0, 2000)}`
      : "";

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      system: `You are Claude, a quantitative financial analyst embedded in a Bloomberg Terminal.
Your task is to analyze a user's watchlist and provide a concise, professional summary.
Be direct, data-driven, and highlight the most actionable observations.
Never give specific investment advice. Focus on patterns, risks, and notable movements.`,
      messages: [
        {
          role: "user",
          content: `Analyze my watchlist and give me a brief market intelligence summary:\n\n${watchlistText}${contextStr}\n\nProvide:\n1. Top movers and their likely catalysts\n2. Sector/correlation observations\n3. Key risks to watch\n4. Overall sentiment of this portfolio basket\n\nBe concise — max 4 paragraphs.`,
        },
      ],
    });

    const analysis = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return new Response(JSON.stringify({ analysis }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Watchlist analysis error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze watchlist" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
