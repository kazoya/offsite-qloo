/**
 * A/B/C experiment runner (docs/EXPERIMENT.md). Live Qloo calls go through the private response cache
 * (.cache/qloo, gitignored), so a re-run with a warm cache makes 0 HTTP calls. Prints and writes AGGREGATES ONLY:
 * no venue names or Qloo response data leave this process.
 *
 *   npx tsx --env-file=.env scripts/experiment.ts [--seed 20261024] [--per-city 6] [--budgets-usd 25,35,45,60,80]
 *     [--out docs/experiment-results.json] [--pace-ms 1500]
 */
import { writeFileSync } from "node:fs";
import { CUISINES, ACTIVITIES, cityProfile } from "../src/connectors/qloo/catalog";
import { QlooClient } from "../src/connectors/qloo/client";
import type { InsightsRequest, InsightsResult, QlooPlace } from "../src/connectors/qloo/types";
import { planOffsite, type QlooLike } from "../src/agent";
import {
  BUDGET_USD,
  METRIC_KEYS,
  aggregate,
  pairwise,
  rankBy,
  syntheticTeams,
  teamMetrics,
  type MetricKey,
  type SimpleOption,
  type TeamMetrics,
} from "../src/agent/baselines";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]! : def;
};
const SEED = Number(arg("--seed", "20261024"));
const PER_CITY = Number(arg("--per-city", "6"));
const OUT = arg("--out", "docs/experiment-results.json");
const BUDGETS = arg("--budgets-usd", "").split(",").filter(Boolean).map(Number);
const PACE_MS = Number(arg("--pace-ms", "1500")); // pause after every real (uncached) Qloo HTTP call

const client = QlooClient.fromEnv();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Forwards to the real client, paces uncached calls, and remembers the pools the planner received. */
class CapturingQloo implements QlooLike {
  calls: { req: InsightsRequest; places: QlooPlace[] }[] = [];
  get httpCalls() { return client.httpCalls; }
  async searchEntities(o: Parameters<QlooLike["searchEntities"]>[0]) {
    const before = client.httpCalls;
    const r = await client.searchEntities(o);
    if (client.httpCalls > before) await sleep(PACE_MS);
    return r;
  }
  async insights(req: InsightsRequest): Promise<InsightsResult> {
    const before = client.httpCalls;
    const r = await client.insights(req);
    if (client.httpCalls > before) await sleep(PACE_MS);
    this.calls.push({ req, places: r.places });
    return r;
  }
}

const ALL_CUISINE_TAGS = CUISINES.map((c) => c.tag);
const isDinnerQuery = (r: InsightsRequest) => r.filterTags?.length === ALL_CUISINE_TAGS.length && r.filterTags.every((t, i) => t === ALL_CUISINE_TAGS[i]);

/** A: one generic, signal-free query per city and kind (cached across teams in that city). */
const popularCache = new Map<string, { dinners: QlooPlace[]; activities: QlooPlace[] }>();
async function popularPools(city: string, q: CapturingQloo) {
  const hit = popularCache.get(city);
  if (hit) return hit;
  const base = { filterType: "urn:entity:place", locationQuery: cityProfile(city).qlooQuery } as const;
  const d = await q.insights({ ...base, filterTags: ALL_CUISINE_TAGS, take: 50 });
  const a = await q.insights({ ...base, filterTags: ACTIVITIES.map((x) => x.tag), take: 30 });
  const v = { dinners: d.places, activities: a.places };
  popularCache.set(city, v);
  return v;
}

type Strategy = "A" | "A+" | "B" | "C";
const STRATEGIES: Strategy[] = ["A", "A+", "B", "C"];
const rows: Record<Strategy, TeamMetrics[]> = { A: [], "A+": [], B: [], C: [] };
const byCity: Record<string, Record<Strategy, TeamMetrics[]>> = {};
const startHttp = client.httpCalls;
const startHits = client.cacheHits;
const teams = syntheticTeams(SEED, PER_CITY, BUDGETS.length ? BUDGETS : undefined);

for (const t of teams) {
  const q = new CapturingQloo();
  const plan = await planOffsite(t.request, { qloo: q });
  const dinnerPool = q.calls.filter((c) => isDinnerQuery(c.req)).flatMap((c) => c.places);
  const activityPool = q.calls.filter((c) => !isDinnerQuery(c.req)).flatMap((c) => c.places);
  const pop = await popularPools(t.request.city, q);
  const opts: Record<Strategy, SimpleOption[]> = {
    A: rankBy("popularity", pop.dinners, pop.activities),
    "A+": rankBy("popularity", dinnerPool, activityPool),
    B: rankBy("affinity", dinnerPool, activityPool),
    C: plan.options.map((o) => ({ dinner: o.dinner.place, activity: o.activity.place })),
  };
  byCity[t.request.city] ??= { A: [], "A+": [], B: [], C: [] };
  for (const s of STRATEGIES) {
    const m = teamMetrics(t.request, opts[s]);
    rows[s].push(m);
    byCity[t.request.city]![s].push(m);
  }
  process.stdout.write(".");
}
console.log();

const LOWER_IS_BETTER = new Set<MetricKey>(["noPlan", "zeroShare", "leftOutEverywhere", "unknownHours", "closedAtSlot"]);
// Headline comparison: only teams where every strategy proposed at least one option (same teams for all).
const matchedIdx = teams.map((_, i) => i).filter((i) => STRATEGIES.every((s) => rows[s][i]!.options > 0));
const matched = (s: Strategy) => matchedIdx.map((i) => rows[s][i]!);
const result = {
  seed: SEED,
  teamsPerCity: PER_CITY,
  budgetsUsd: BUDGETS.length ? BUDGETS : BUDGET_USD,
  teams: teams.length,
  members: teams.reduce((s, t) => s + t.request.team.length, 0),
  teamsWithDietaryNeeds: teams.filter((t) => t.request.team.some((m) => m.dietary.length)).length,
  qloo: { httpCalls: client.httpCalls - startHttp, cacheHits: client.cacheHits - startHits },
  matchedTeams: matchedIdx.length,
  matched: Object.fromEntries(STRATEGIES.map((s) => [s, aggregate(matched(s))])),
  overall: Object.fromEntries(STRATEGIES.map((s) => [s, aggregate(rows[s])])),
  byCity: Object.fromEntries(Object.entries(byCity).map(([c, r]) => [c, Object.fromEntries(STRATEGIES.map((s) => [s, aggregate(r[s])]))])),
  // Per-team wins/ties/losses of C against each baseline on the matched teams.
  cVsB: Object.fromEntries(METRIC_KEYS.map((k) => [k, pairwise(matched("C"), matched("B"), k, LOWER_IS_BETTER.has(k))])),
  cVsA: Object.fromEntries(METRIC_KEYS.map((k) => [k, pairwise(matched("C"), matched("A"), k, LOWER_IS_BETTER.has(k))])),
};
writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");

console.log(`teams=${result.teams} members=${result.members} qloo http=${result.qloo.httpCalls} cache hits=${result.qloo.cacheHits}`);
for (const view of ["overall", "matched"] as const) {
  console.log(`\n${view} (${view === "matched" ? result.matchedTeams : result.teams} teams)`);
  console.log(["metric", ...STRATEGIES].join("\t"));
  for (const k of METRIC_KEYS) console.log([k, ...STRATEGIES.map((s) => { const m = result[view][s]!.metrics[k]; return `${m.mean.toFixed(3)} (n=${m.n})`; })].join("\t"));
  console.log(["options", ...STRATEGIES.map((s) => result[view][s]!.meanOptions.toFixed(2))].join("\t"));
}
console.log(`wrote ${OUT}`);
