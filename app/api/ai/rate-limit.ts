import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// Rate limit configuration
type RateLimitConfig = {
  maxRequests: number; // Maximum requests per window
  windowInSeconds: number; // Time window in seconds
};

type RateLimitResult = { success: boolean; limit: number; remaining: number; reset: number };

// Upstash Redis when configured; otherwise an in-memory counter (fine for local use)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(
  req: NextRequest,
  config: RateLimitConfig = { maxRequests: 10, windowInSeconds: 60 },
): Promise<RateLimitResult> {
  // Get IP address from request headers
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "anonymous";
  const key = `rate-limit:ai:${ip}`;
  const now = Math.floor(Date.now() / 1000);

  if (redis) {
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, config.windowInSeconds);
      const ttl = await redis.ttl(key);
      return {
        success: count <= config.maxRequests,
        limit: config.maxRequests,
        remaining: Math.max(0, config.maxRequests - count),
        reset: now + (ttl > 0 ? ttl : config.windowInSeconds),
      };
    } catch (error) {
      console.error("Redis rate limit failed, using in-memory fallback:", error);
    }
  }

  const entry = memory.get(key);
  if (!entry || entry.reset <= now) {
    memory.set(key, { count: 1, reset: now + config.windowInSeconds });
    return { success: true, limit: config.maxRequests, remaining: config.maxRequests - 1, reset: now + config.windowInSeconds };
  }
  entry.count += 1;
  return {
    success: entry.count <= config.maxRequests,
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    reset: entry.reset,
  };
}
