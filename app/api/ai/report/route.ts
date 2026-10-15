import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { guardAiRequest } from "../guard";

export const maxDuration = 60;
export const runtime = "nodejs";

const requestSchema = z.object({
  reportType: z.enum(["market_summary", "volatility", "movers", "sector", "custom"]),
  data: z.record(z.string(), z.any()),
  customPrompt: z.string().max(500).optional(),
  format: z.enum(["brief", "detailed"]).default("brief"),
});


const REPORT_PROMPTS: Record<string, string> = {
  market_summary: `Generate a morning/EOD market summary report. Include:
- Overall market direction and key index performance
- Top themes and macro drivers
- Notable sector rotations
- Risk sentiment (risk-on/off indicators)
Format as a professional terminal report with clear sections.`,

  volatility: `Generate a volatility analysis report. Include:
- Current implied vs realized vol comparison
- Options market signals (put/call skew, term structure)
- VIX regime assessment
- Key events that could spike vol
Be quantitative where possible.`,

  movers: `Generate a market movers report. Include:
- Top gainers with catalyst assessment
- Top losers with catalyst assessment
- Unusual volume leaders
- After-hours/pre-market notable moves
Keep it scannable with bullet points.`,

  sector: `Generate a sector rotation analysis. Include:
- Outperforming sectors and likely reasons
- Underperforming sectors
- Rotation signals (growth vs value, defensive vs cyclical)
- Relative strength observations`,

  custom: `Generate a professional financial report based on the provided data and instructions.`,
};

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

    const { reportType, data, customPrompt, format } = validationResult.data;

    const basePrompt = reportType === "custom" && customPrompt
      ? customPrompt
      : REPORT_PROMPTS[reportType];

    const maxTokens = format === "detailed" ? 1200 : 600;

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      system: `You are Claude, a senior financial analyst generating Bloomberg Terminal reports.
Write in a professional, data-driven tone. Use terminal-style formatting (CAPS for headers, dashes for bullets).
Never give specific investment advice. Focus on observations, patterns, and risk factors.
Today's data: ${JSON.stringify(data).slice(0, 4000)}`,
      messages: [
        {
          role: "user",
          content: `${basePrompt}\n\nFormat: ${format === "detailed" ? "Full detailed report" : "Executive brief — max 300 words"}.`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (err) {
          console.error("Report stream error:", err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Report-Type": reportType,
      },
    });
  } catch (error) {
    console.error("Report generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate report" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
