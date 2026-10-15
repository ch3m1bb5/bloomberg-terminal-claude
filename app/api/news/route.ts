import { type NextRequest, NextResponse } from "next/server";

// Server-side proxy: the Alpha Vantage key never reaches the browser
const BASE_URL = "https://www.alphavantage.co/query";

// Topics accepted by Alpha Vantage NEWS_SENTIMENT
const TOPICS = new Set([
  "blockchain", "earnings", "ipo", "mergers_and_acquisitions", "financial_markets",
  "economy_fiscal", "economy_monetary", "economy_macro", "energy_transportation",
  "finance", "life_sciences", "manufacturing", "real_estate", "retail_wholesale", "technology",
]);
const ALIASES: Record<string, string> = {
  market: "financial_markets", markets: "financial_markets", economy: "economy_macro",
  tech: "technology", "m&a": "mergers_and_acquisitions", crypto: "blockchain", energy: "energy_transportation",
};

export async function GET(req: NextRequest) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ALPHA_VANTAGE_API_KEY not configured" }, { status: 503 });
  }

  const raw = (req.nextUrl.searchParams.get("q") || "market").trim().toLowerCase().slice(0, 40);
  const topic = ALIASES[raw] ?? (TOPICS.has(raw) ? raw : null);
  // Anything that is not a topic is treated as a ticker list (e.g. "AAPL" or "AAPL,MSFT")
  const filter = topic
    ? `topics=${topic}`
    : `tickers=${encodeURIComponent(raw.toUpperCase().replace(/[^A-Z0-9.,:]/g, ""))}`;

  try {
    const res = await fetch(`${BASE_URL}?function=NEWS_SENTIMENT&${filter}&limit=20&apikey=${apiKey}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ error: `Alpha Vantage error ${res.status}` }, { status: 502 });
    const data = await res.json();
    if (Array.isArray(data.feed)) return NextResponse.json({ feed: data.feed.slice(0, 20) });
    const msg = data.Note || data.Information || data["Error Message"] || "No news returned";
    return NextResponse.json({ error: String(msg) }, { status: 502 });
  } catch (error) {
    console.error("News fetch failed:", error);
    return NextResponse.json({ error: "Could not reach Alpha Vantage" }, { status: 502 });
  }
}
