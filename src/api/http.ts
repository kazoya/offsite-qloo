import { NextResponse } from "next/server";
import { clientKey, type RateLimiter } from "./guard";

/** 429 response when `limiter` refuses this client, otherwise null. */
export function refuseIfLimited(limiter: RateLimiter, request: Request): NextResponse | null {
  const r = limiter.hit(clientKey(request));
  if (r.ok) return null;
  return NextResponse.json(
    { code: "rate_limited", error: `Too many requests; retry in ${r.retryAfterS} s.` },
    { status: 429, headers: { "Retry-After": String(r.retryAfterS) } },
  );
}
