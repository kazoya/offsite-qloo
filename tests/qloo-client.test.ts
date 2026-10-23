import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildInsightsParams, parseInsights, parseSearch, QlooClient, QlooError, splitBilingualName } from "../src/connectors/qloo";
import { RAW_INSIGHTS, RAW_SEARCH, SEED_DIAB, SEED_FAIRUZ } from "./fixtures/qloo";

const KEY = "test-key-123";
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const mk = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof QlooClient>[0]> = {}) =>
  new QlooClient({ apiKey: KEY, fetchImpl, sleep: async () => {}, cacheMode: "off", ...extra });

describe("request building", () => {
  it("maps an insights request onto the documented hackathon parameters", () => {
    const p = buildInsightsParams({
      filterType: "urn:entity:place",
      locationQuery: "Amman, Jordan",
      filterTags: ["a", "b"],
      filterTagsOperator: "union",
      signalTags: ["c"],
      signalEntities: ["e1", "e2"],
      explainability: true,
      take: 50,
    });
    expect(p).toEqual({
      "filter.type": "urn:entity:place",
      take: "50",
      "filter.location.query": "Amman, Jordan",
      "filter.tags": "a,b",
      "operator.filter.tags": "union",
      "signal.interests.tags": "c",
      "signal.interests.entities": "e1,e2",
      "feature.explainability": "true",
    });
  });
  it("omits unset optional params", () => {
    expect(Object.keys(buildInsightsParams({ filterType: "urn:entity:place" })).sort()).toEqual(["filter.type", "take"]);
  });
});

describe("parsing", () => {
  it("parses insights: bilingual name, price, rating, affinity, explainability, locality, warnings", () => {
    const r = parseInsights(RAW_INSIGHTS);
    expect(r.locality).toBe("Amman, Jordan");
    expect(r.warnings).toHaveLength(1);
    const [a, b] = r.places;
    expect(a).toMatchObject({ entityId: "E1", nameEn: "Test Grill House", nameAr: "بيت المشاوي", priceLevel: 3, rating: 4.5, affinity: 0.71, city: "Amman" });
    expect(a!.explain).toEqual([{ entityId: SEED_FAIRUZ, score: 0.7 }, { entityId: SEED_DIAB, score: 0.3 }]);
    expect(b).toMatchObject({ nameEn: "Plain Cafe", priceLevel: undefined, rating: undefined });
  });
  it("parses search results", () => {
    expect(parseSearch(RAW_SEARCH)).toEqual([
      expect.objectContaining({ entityId: "S1", name: "Test Singer", tags: [{ name: "Pop", id: "urn:tag:genre:media:pop", type: "urn:tag:genre:media" }] }),
    ]);
  });
  it("splits bilingual names", () => {
    expect(splitBilingualName("Cafe X | مقهى إكس")).toEqual({ nameEn: "Cafe X", nameAr: "مقهى إكس" });
    expect(splitBilingualName("Royal Museum المتحف الملكي")).toEqual({ nameEn: "Royal Museum", nameAr: "المتحف الملكي" });
    expect(splitBilingualName("Only Latin")).toEqual({ nameEn: "Only Latin" });
    expect(splitBilingualName("مطعم")).toEqual({ nameEn: "مطعم", nameAr: "مطعم" });
  });
});

describe("QlooClient transport", () => {
  it("sends GET with the key only in the X-Api-Key header", async () => {
    const f = vi.fn(async () => json(RAW_INSIGHTS));
    await mk(f as unknown as typeof fetch).insights({ filterType: "urn:entity:place", locationQuery: "Amman, Jordan" });
    const [u, init] = f.mock.calls[0] as unknown as [URL | string, RequestInit];
    const url = String(u);
    expect(url.startsWith("https://hackathon.api.qloo.com/v2/insights?")).toBe(true);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
  });
  it("retries on 500/429 then succeeds, honouring Retry-After", async () => {
    const sleeps: number[] = [];
    const f = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({}, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(json(RAW_SEARCH));
    const c = mk(f as unknown as typeof fetch, { sleep: async (ms) => void sleeps.push(ms) });
    expect(await c.searchEntities({ query: "x" })).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([400, 2000]);
  });
  it("gives up after the retry budget", async () => {
    const f = vi.fn(async () => json({}, 503));
    await expect(mk(f as unknown as typeof fetch, { retries: 2 }).searchEntities({ query: "x" })).rejects.toThrow(/503/);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it("does not retry 4xx and redacts the key from error text", async () => {
    const f = vi.fn(async () => new Response(`bad key ${KEY}`, { status: 401 }));
    const err = await mk(f as unknown as typeof fetch).searchEntities({ query: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.message).not.toContain(KEY);
    expect(err.message).toContain("[redacted]");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("times out a hung request via AbortController and retries", async () => {
    let n = 0;
    const f = vi.fn((_u: string, init: RequestInit) => {
      n++;
      if (n === 1) return new Promise<Response>((_, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))));
      return Promise.resolve(json(RAW_SEARCH));
    });
    const c = mk(f as unknown as typeof fetch, { timeoutMs: 20 });
    expect(await c.searchEntities({ query: "x" })).toHaveLength(1);
    expect(n).toBe(2);
  });
  it("serves repeated identical requests from the private cache", async () => {
    const f = vi.fn(async () => json(RAW_SEARCH));
    const c = mk(f as unknown as typeof fetch, { cacheMode: "on", cacheDir: path.join(mkdtempSync(path.join(tmpdir(), "qc-")), "c") });
    await c.searchEntities({ query: "x" });
    await c.searchEntities({ query: "x" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(c.cacheHits).toBe(1);
  });
  it("replay mode never touches the network", async () => {
    const f = vi.fn();
    const c = mk(f as unknown as typeof fetch, { cacheMode: "replay", cacheDir: mkdtempSync(path.join(tmpdir(), "qc-")) });
    await expect(c.searchEntities({ query: "x" })).rejects.toThrow(/replay/);
    expect(f).not.toHaveBeenCalled();
  });
  it("refuses legacy endpoints and foreign hosts", async () => {
    const f = vi.fn();
    await expect(mk(f as unknown as typeof fetch).get("/recommendations", {})).rejects.toThrow(/Legacy/);
    await expect(mk(f as unknown as typeof fetch).get("/recs/x", {})).rejects.toThrow(/Legacy/);
    expect(() => new QlooClient({ apiKey: KEY, baseUrl: "https://example.com" })).toThrow(/non-hackathon/);
  });
});
