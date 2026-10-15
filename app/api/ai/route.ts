import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";
import { guardAiRequest } from "./guard";

export const maxDuration = 30;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const blocked = await guardAiRequest(req, { maxRequests: 20, windowInSeconds: 60 });
    if (blocked) return blocked;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const body = await req.json();
    const messages = (body.messages || []).slice(0, 20);
    const marketData = body.marketData || {};
    const sanitizedMarketData = JSON.stringify(marketData).slice(0, 5000);

    const systemPrompt = `You are Claude, an AI financial analyst embedded in a Bloomberg Terminal. Provide concise, insightful commentary about market data. Current market data: ${sanitizedMarketData}. Keep responses brief and professional. Never provide specific investment advice.`;

    const anthropicMessages = messages
      .filter((m: { role: string; content: string }) => m.role !== "system")
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, 4000),
      }));

    const validMessages = anthropicMessages.length > 0 && anthropicMessages[0].role === "user"
      ? anthropicMessages
      : [{ role: "user" as const, content: "Hello" }, ...anthropicMessages];

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      system: systemPrompt,
      messages: validMessages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk.delta.text)}\n`));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
    });
  } catch (error) {
    console.error("AI API error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate AI response" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
