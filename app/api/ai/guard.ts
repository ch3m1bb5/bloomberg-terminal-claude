import type { NextRequest } from "next/server";
import { rateLimit } from "./rate-limit";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Shared protection for every /api/ai/* route:
 * API key present, per-IP rate limit and allowed-origin check.
 * Returns a Response to send back when the request must be rejected, or null when it may proceed.
 */
export async function guardAiRequest(
  req: NextRequest,
  limits = { maxRequests: 20, windowInSeconds: 60 },
): Promise<Response | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  const rl = await rateLimit(req, limits);
  if (!rl.success) {
    return json({ error: "Rate limit exceeded. Please try again later.", reset: rl.reset }, 429);
  }

  const origin = req.headers.get("origin") || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === "development" && allowed.length === 0) allowed.push("http://localhost:3000");
  if (allowed.length > 0 && !allowed.includes(origin)) {
    return json({ error: "Unauthorized origin" }, 403);
  }
  return null;
}
