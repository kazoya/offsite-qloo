import path from "node:path";
import { ResponseCache, type CacheMode } from "./cache";
import type {
  InsightsRequest,
  InsightsResult,
  QlooPlace,
  QlooSearchResult,
  QlooTag,
  QlooTagResult,
} from "./types";

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

export interface QlooClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  cacheDir?: string;
  cacheMode?: CacheMode;
  fetchImpl?: typeof fetch;
  /** Injectable for tests so retries do not wait. */
  sleep?: (ms: number) => Promise<void>;
}

const LEGACY_PATHS = [/^\/recommendations/, /^\/recs/];

type Params = Record<string, string>;

/** Minimal, dependency-free Qloo client: timeouts, retries, private cache. */
export class QlooClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly cache: ResponseCache;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Number of real HTTP requests issued (cache hits excluded); useful for tests and the demo. */
  httpCalls = 0;
  cacheHits = 0;

  constructor(opts: QlooClientOptions) {
    const base = (opts.baseUrl ?? HACKATHON_BASE_URL).replace(/\/+$/, "");
    if (base !== HACKATHON_BASE_URL && !opts.fetchImpl) {
      // Hackathon keys only work on the hackathon host; fail loudly instead of sending a 401.
      throw new QlooError(`Refusing non-hackathon base URL ${base}`);
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = base;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.retries = opts.retries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.cache = new ResponseCache(
      opts.cacheDir ?? path.join(process.cwd(), ".cache", "qloo"),
      opts.cacheMode ?? "on",
    );
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): QlooClient {
    const apiKey = env.QLOO_API_KEY;
    if (!apiKey) throw new QlooError("QLOO_API_KEY is not set (see .env.example)");
    const mode = (env.QLOO_CACHE as CacheMode | undefined) ?? "on";
    return new QlooClient({ apiKey, baseUrl: env.QLOO_BASE_URL, cacheMode: mode, cacheDir: env.QLOO_CACHE_DIR || undefined });
  }

  private redact(text: string): string {
    return text.split(this.apiKey).join("[redacted]");
  }

  /** GET <path>?<params>; params are sent as a query string, key only ever in the X-Api-Key header. */
  async get<T = unknown>(pathname: string, params: Params): Promise<T> {
    if (LEGACY_PATHS.some((re) => re.test(pathname))) {
      throw new QlooError(`Legacy endpoint ${pathname} is not supported in the hackathon`);
    }
    const key = ResponseCache.keyFor(pathname, params);
    const cached = await this.cache.get(key);
    if (cached !== undefined) {
      this.cacheHits++;
      return cached as T;
    }
    if (this.cache.mode === "replay") {
      throw new QlooError(`Cache miss in replay mode for ${pathname}`);
    }

    const url = new URL(pathname, this.baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), this.timeoutMs);
      try {
        this.httpCalls++;
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers: { "X-Api-Key": this.apiKey, accept: "application/json" },
          signal: ac.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("retry-after"));
          lastErr = new QlooError(`Qloo ${res.status} on ${pathname}`, res.status);
          if (attempt < this.retries) {
            await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 400 * 2 ** attempt);
            continue;
          }
          throw lastErr;
        }
        if (!res.ok) {
          const body = this.redact((await res.text()).slice(0, 300));
          throw new QlooError(`Qloo ${res.status} on ${pathname}: ${body}`, res.status);
        }
        const json = (await res.json()) as T;
        await this.cache.set(key, json);
        return json;
      } catch (e) {
        if (e instanceof QlooError && e.status && e.status < 500 && e.status !== 429) throw e;
        lastErr = e;
        if (attempt < this.retries) {
          await this.sleep(400 * 2 ** attempt);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw lastErr instanceof QlooError ? lastErr : new QlooError(this.redact(`Qloo request failed: ${msg}`));
  }

  /** GET /search: look up Qloo entity ids by name. */
  async searchEntities(opts: {
    query: string;
    types?: string[];
    take?: number;
    /** "lat,lon" bias for geo entities. */
    location?: string;
  }): Promise<QlooSearchResult[]> {
    const params: Params = { query: opts.query, take: String(opts.take ?? 5) };
    if (opts.types?.length) params.types = opts.types.join(",");
    if (opts.location) params["filter.location"] = opts.location;
    const raw = await this.get<RawSearch>("/search", params);
    return parseSearch(raw);
  }

  /** GET /v2/tags: find valid tag ids by keyword. */
  async searchTags(opts: {
    query?: string;
    tagTypes?: string[];
    parentTypes?: string[];
    take?: number;
  }): Promise<QlooTagResult[]> {
    const params: Params = { take: String(opts.take ?? 10) };
    if (opts.query) params["filter.query"] = opts.query;
    if (opts.tagTypes?.length) params["filter.tag.types"] = opts.tagTypes.join(",");
    if (opts.parentTypes?.length) params["filter.parents.types"] = opts.parentTypes.join(",");
    const raw = await this.get<{ results?: { tags?: QlooTagResult[] } }>("/v2/tags", params);
    return (raw.results?.tags ?? []).map((t) => ({ id: t.id, name: t.name, type: t.type }));
  }

  /** GET /v2/insights: the recommendation endpoint (taste signals + filters). */
  async insights(req: InsightsRequest): Promise<InsightsResult> {
    const params = buildInsightsParams(req);
    const raw = await this.get<RawInsights>("/v2/insights", params);
    return parseInsights(raw);
  }
}

// ---------------------------------------------------------------------------------------------
// Request building and response parsing (exported for tests)
// ---------------------------------------------------------------------------------------------

export function buildInsightsParams(req: InsightsRequest): Params {
  const p: Params = { "filter.type": req.filterType, take: String(req.take ?? 20) };
  if (req.locationQuery) p["filter.location.query"] = req.locationQuery;
  if (req.strictLocation) p["filter.location.radius"] = "0";
  if (req.filterTags?.length) {
    p["filter.tags"] = req.filterTags.join(",");
    if (req.filterTagsOperator) p["operator.filter.tags"] = req.filterTagsOperator;
  }
  if (req.excludeTags?.length) p["filter.exclude.tags"] = req.excludeTags.join(",");
  if (req.signalTags?.length) p["signal.interests.tags"] = req.signalTags.join(",");
  if (req.signalEntities?.length) p["signal.interests.entities"] = req.signalEntities.join(",");
  if (req.priceLevelMin !== undefined) p["filter.price_level.min"] = String(req.priceLevelMin);
  if (req.priceLevelMax !== undefined) p["filter.price_level.max"] = String(req.priceLevelMax);
  if (req.ratingMin !== undefined) p["filter.properties.business_rating.min"] = String(req.ratingMin);
  if (req.popularityMin !== undefined) p["filter.popularity.min"] = String(req.popularityMin);
  if (req.explainability) p["feature.explainability"] = "true";
  return p;
}

interface RawSearch {
  results?: {
    name: string;
    entity_id: string;
    types?: string[];
    popularity?: number;
    properties?: { country?: string };
    location?: { lat: number; lon: number };
    tags?: { name: string; tag_id: string; type: string; value?: string }[];
  }[];
}

export function parseSearch(raw: RawSearch): QlooSearchResult[] {
  return (raw.results ?? []).map((r) => ({
    entityId: r.entity_id,
    name: r.name,
    types: r.types ?? [],
    popularity: r.popularity,
    country: r.properties?.country,
    location: r.location,
    tags: (r.tags ?? []).map((t) => ({ name: t.name, id: t.value ?? t.tag_id, type: t.type })),
  }));
}

interface RawInsights {
  results?: {
    entities?: RawEntity[];
  };
  query?: {
    localities?: { filter?: { name?: string; disambiguation?: string }[] };
    locality?: { signal?: { name?: string } };
  };
  warnings?: unknown;
}

interface RawEntity {
  name: string;
  entity_id: string;
  popularity?: number;
  location?: { lat: number; lon: number };
  tags?: QlooTag[];
  query?: {
    affinity?: number;
    explainability?: { "signal.interests.entities"?: { entity_id: string; score: number }[] };
  };
  properties?: {
    price_level?: number | null;
    business_rating?: number | null;
    address?: string;
    website?: string;
    phone?: string;
    description?: string;
    is_closed?: boolean;
    neighborhood?: string;
    geocode?: { city?: string; name?: string };
    keywords?: { name: string; count: number }[];
    hours?: Record<string, { opens: string; closes: string; closed: boolean }[]>;
  };
}

const ARABIC = /[\u0600-\u06FF]/;

/** Qloo names are frequently "English | عربي" or just one script; split them. */
export function splitBilingualName(name: string): { nameEn: string; nameAr?: string } {
  const parts = name.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { nameEn: name };
  const ar = parts.find((p) => ARABIC.test(p));
  const en = parts.find((p) => !ARABIC.test(p));
  if (ar && en) return { nameEn: en, nameAr: ar };
  // Mixed single string, e.g. "The Royal Tank Museum متحف الدبابات الملكي".
  if (ar && !en && parts.length === 1) {
    const m = name.match(/^(.*?)\s*([\u0600-\u06FF].*)$/);
    if (m && m[1]) return { nameEn: m[1].trim(), nameAr: m[2]!.trim() };
    return { nameEn: name, nameAr: name };
  }
  return ar ? { nameEn: name, nameAr: ar } : { nameEn: name };
}

export function parseInsights(raw: RawInsights): InsightsResult {
  const places: QlooPlace[] = (raw.results?.entities ?? []).map((e) => {
    const p = e.properties ?? {};
    const names = splitBilingualName(e.name);
    return {
      entityId: e.entity_id,
      name: e.name,
      ...names,
      popularity: e.popularity,
      affinity: e.query?.affinity,
      priceLevel: p.price_level ?? undefined,
      rating: p.business_rating ?? undefined,
      address: p.address,
      website: p.website,
      phone: p.phone,
      description: p.description,
      city: p.geocode?.city,
      neighborhood: p.neighborhood ?? p.geocode?.name,
      location: e.location ? { lat: e.location.lat, lon: e.location.lon } : undefined,
      tags: (e.tags ?? []).map((t) => ({ id: t.id, name: t.name, type: t.type, weight: t.weight })),
      keywords: p.keywords ?? [],
      isClosed: p.is_closed,
      explain: (e.query?.explainability?.["signal.interests.entities"] ?? []).map((x) => ({
        entityId: x.entity_id,
        score: x.score,
      })),
      hours: p.hours,
    };
  });
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map((w) => JSON.stringify(w)) : [];
  return { places, locality:
      raw.query?.localities?.filter?.[0]?.disambiguation ??
      raw.query?.localities?.filter?.[0]?.name ??
      raw.query?.locality?.signal?.name, warnings };
}
