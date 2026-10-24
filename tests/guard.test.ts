import { afterEach, describe, expect, it } from "vitest";
import { BadJsonError, BodyTooLargeError, clientKey, LIMITS, RateLimiter, readJsonCapped } from "../src/api/guard";
import { toApiError } from "../src/api/errors";
import { DeadlineError } from "../src/agent";
import { POST as planPOST } from "../app/api/plan/route";
import { POST as approvalsPOST, GET as approvalsGET } from "../app/api/approvals/route";

const post = (url: string, body: string, ip: string) =>
  new Request(url, { method: "POST", body, headers: { "content-type": "application/json", "x-forwarded-for": ip } });

describe("rate limiter", () => {
  it("allows `limit` requests per window per client, then answers with a retry time", () => {
    let now = 0;
    const rl = new RateLimiter(3, 60_000, () => now);
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a")].every((r) => r.ok)).toBe(true);
    const r = rl.hit("a");
    expect(r).toEqual({ ok: false, retryAfterS: 60 });
    expect(rl.hit("b").ok).toBe(true); // other clients are unaffected
    now = 30_000;
    expect(rl.hit("a")).toEqual({ ok: false, retryAfterS: 30 });
    now = 60_001;
    expect(rl.hit("a").ok).toBe(true); // window slid
  });

  it("keeps memory bounded", () => {
    const rl = new RateLimiter(1, 60_000, () => 0, 10);
    for (let i = 0; i < 50; i++) rl.hit(`ip${i}`);
    expect((rl as unknown as { hits: Map<string, number[]> }).hits.size).toBeLessThanOrEqual(10);
  });

  it("identifies the client from proxy headers", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } }))).toBe("203.0.113.5");
    expect(clientKey(new Request("http://x", { headers: { "x-real-ip": "203.0.113.6" } }))).toBe("203.0.113.6");
    expect(clientKey(new Request("http://x"))).toBe("local");
  });
});

describe("body cap", () => {
  it("parses small JSON and refuses large or invalid bodies", async () => {
    expect(await readJsonCapped(post("http://x", '{"a":1}', "1"), 100)).toEqual({ a: 1 });
    await expect(readJsonCapped(post("http://x", JSON.stringify({ a: "x".repeat(200) }), "1"), 100)).rejects.toBeInstanceOf(BodyTooLargeError);
    await expect(readJsonCapped(post("http://x", "{nope", "1"), 100)).rejects.toBeInstanceOf(BadJsonError);
  });
  it("maps guard and deadline errors to stable API codes", () => {
    expect(toApiError(new BodyTooLargeError(10))).toMatchObject({ status: 413, code: "too_large" });
    expect(toApiError(new BadJsonError())).toMatchObject({ status: 400, code: "bad_json" });
    expect(toApiError(new DeadlineError(25_000, "rank"))).toMatchObject({ status: 504, code: "timeout" });
  });
});

describe("routes (no Qloo key; synthetic bodies)", () => {
  const saved = process.env.QLOO_API_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.QLOO_API_KEY;
    else process.env.QLOO_API_KEY = saved;
  });

  it("/api/plan: 413 for an oversized body, 400 for bad feedback, 429 after the per-IP limit", async () => {
    delete process.env.QLOO_API_KEY;
    const big = await planPOST(post("http://x/api/plan", JSON.stringify({ pad: "x".repeat(LIMITS.planBodyBytes + 1) }), "198.51.100.1"));
    expect(big.status).toBe(413);
    expect((await big.json()).code).toBe("too_large");

    const valid = {
      team: [{ name: "Ana", cuisines: ["lebanese"], activities: [], artists: [], dietary: [] }],
      city: "Amman",
      budgetPerPerson: 30,
      headcount: 4,
      date: "2026-11-12",
      language: "en",
    };
    const badFb = await planPOST(post("http://x/api/plan", JSON.stringify({ ...valid, feedback: [{ type: "not_fair", member: "Zed" }] }), "198.51.100.2"));
    expect(badFb.status).toBe(400);
    expect((await badFb.json()).code).toBe("validation");
    // Valid feedback reaches the key check (backward-compatible request shape plus `feedback`).
    const noKey = await planPOST(post("http://x/api/plan", JSON.stringify({ ...valid, feedback: [{ type: "budget", budgetPerPerson: 20 }] }), "198.51.100.2"));
    expect(noKey.status).toBe(503);

    const ip = "198.51.100.3";
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.planPerMinute + 1; i++) statuses.push((await planPOST(post("http://x/api/plan", "{}", ip))).status);
    expect(statuses.slice(0, LIMITS.planPerMinute).every((s) => s === 400)).toBe(true);
    const last = await planPOST(post("http://x/api/plan", "{}", ip));
    expect(last.status).toBe(429);
    expect(last.headers.get("retry-after")).toMatch(/^\d+$/);
    expect((await last.json()).code).toBe("rate_limited");
    expect(statuses.at(-1)).toBe(429);
  });

  it("/api/approvals: 413 for an oversized body and 429 after the per-IP limit", async () => {
    const big = await approvalsPOST(post("http://x/api/approvals", JSON.stringify({ pad: "x".repeat(LIMITS.approvalsBodyBytes + 1) }), "198.51.100.9"));
    expect(big.status).toBe(413);
    const ip = "198.51.100.10";
    for (let i = 0; i < LIMITS.approvalsPerMinute; i++) await approvalsGET(new Request("http://x/api/approvals", { headers: { "x-forwarded-for": ip } }));
    const r = await approvalsGET(new Request("http://x/api/approvals", { headers: { "x-forwarded-for": ip } }));
    expect(r.status).toBe(429);
  });
});
