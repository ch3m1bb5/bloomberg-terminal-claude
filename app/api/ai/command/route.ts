import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { guardAiRequest } from "../guard";

export const maxDuration = 30;
export const runtime = "nodejs";

const requestSchema = z.object({
  command: z.string().max(500),
  marketData: z.record(z.string(), z.any()).optional(),
  watchlist: z.array(z.string()).optional(),
});


// Response shape from Claude for command interpretation
export interface CommandResult {
  intent: "alert" | "filter" | "analyze" | "compare" | "screen" | "unknown";
  summary: string;          // Human-readable interpretation
  conditions: string[];     // Parsed conditions (e.g. ["RSI < 30", "Volume > 1M"])
  symbols: string[];        // Affected symbols
  action: string;           // What the terminal should do
  raw: string;              // Claude's full explanation
}

export async function POST(req: NextRequest) {
  try {
    const blocked = await guardAiRequest(req, { maxRequests: 30, windowInSeconds: 60 });
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

    const { command, marketData, watchlist } = validationResult.data;

    const contextParts: string[] = [];
    if (watchlist && watchlist.length > 0)
      contextParts.push(`Current watchlist: ${watchlist.join(", ")}`);
    if (marketData)
      contextParts.push(`Market snapshot: ${JSON.stringify(marketData).slice(0, 1500)}`);

    const contextStr = contextParts.length > 0
      ? `\nContext:\n${contextParts.join("\n")}`
      : "";

    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: `You are Claude, a Bloomberg Terminal command interpreter.
The user types natural language commands and you translate them into structured actions.
Always respond with a valid JSON object and nothing else — no markdown, no explanation outside the JSON.

JSON schema:
{
  "intent": "alert" | "filter" | "analyze" | "compare" | "screen" | "unknown",
  "summary": "brief human-readable description of what was requested",
  "conditions": ["list of parsed conditions like RSI < 30, Price > 100"],
  "symbols": ["list of ticker symbols mentioned or inferred"],
  "action": "what the terminal UI should do (e.g. highlight_movers, set_alert, show_analysis)",
  "raw": "your full interpretation and any caveats in 1-2 sentences"
}`,
      messages: [
        {
          role: "user",
          content: `Interpret this terminal command:\n"${command}"${contextStr}`,
        },
      ],
    });

    const rawText = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    let result: CommandResult;
    try {
      result = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      result = {
        intent: "unknown",
        summary: "Could not parse command",
        conditions: [],
        symbols: [],
        action: "none",
        raw: rawText,
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Command interpreter error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to interpret command" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
