import {
  ACTIVITIES,
  CUISINES,
  DIETARY,
  cityProfile,
  type CatalogItem,
} from "../connectors/qloo/catalog";
import type { InsightsRequest, InsightsResult, QlooPlace, QlooSearchResult } from "../connectors/qloo/types";
import { narrateSafely, RuleBasedProvider, type LLMProvider } from "../llm";
import { activityCost, defaultApprovalThreshold, dinnerCost } from "./budget";
import { AuditLog } from "./policy";
import { buildGroupProfile, type ArtistSeed, type GroupProfile, type Vote } from "./taste";
import type { Candidate, Plan, PlanOption, PlanRequest, Reason, ScoreBreakdown } from "./types";

/** The slice of QlooClient the planner needs (lets tests inject a fake). */
export interface QlooLike {
  searchEntities(o: { query: string; types?: string[]; take?: number }): Promise<QlooSearchResult[]>;
  insights(r: InsightsRequest): Promise<InsightsResult>;
  readonly httpCalls: number;
}

export interface PlannerDeps {
  qloo: QlooLike;
  llm?: LLMProvider;
  now?: () => Date;
}

/**
 * Transparent scoring weights. Qloo affinity is the main term; member coverage keeps the group fair;
 * rating is a tie-breaker. Documented in docs/ARCHITECTURE.md.
 */
export const WEIGHTS = { qloo: 0.5, coverage: 0.25, teamFit: 0.15, rating: 0.1 } as const;
/** Dinner is the anchor of the evening, so it weighs more than the activity in the combined score. */
const COMBO = { dinner: 0.6, activity: 0.4 } as const;
const POOL_CUISINES = CUISINES.map((c) => c.tag);
/** Corporate-friendly broader categories used when no preferred activity has a venue in the city. */
const FALLBACK_ACTIVITY_KEYS = ["tourist", "museum", "park", "art_gallery", "amusement"];
const MAX_ARTIST_SEEDS = 5;

/** Qloo tags that signal a venue suits a team event; labels are ours. */
const FIT_TAGS: Record<string, { en: string; ar: string; kinds: ("dinner" | "activity")[] }> = {
  "urn:tag:event:place:work_dinner": { en: "work dinner", ar: "عشاء عمل", kinds: ["dinner"] },
  "urn:tag:ambience:place:large_group": { en: "large groups", ar: "مجموعات كبيرة", kinds: ["dinner", "activity"] },
  "urn:tag:customer_identity:qloo:groups_of_friends": { en: "groups", ar: "مجموعات", kinds: ["dinner", "activity"] },
  "urn:tag:service_type:qloo:private_dining": { en: "private dining", ar: "طعام خاص", kinds: ["dinner"] },
  "urn:tag:amenity:qloo:private_dining_room": { en: "private dining room", ar: "غرفة طعام خاصة", kinds: ["dinner"] },
  "urn:tag:service_type:qloo:private_events": { en: "private events", ar: "فعاليات خاصة", kinds: ["dinner", "activity"] },
  "urn:tag:activity_type:qloo:corporate_events": { en: "corporate events", ar: "فعاليات الشركات", kinds: ["activity"] },
  "urn:tag:activity_type:qloo:meetings_and_events": { en: "meetings & events", ar: "اجتماعات وفعاليات", kinds: ["activity"] },
};
const HOTEL_TAG = "urn:tag:genre:place:hotel";
const MAX_OPTIONS = 3;

const tagIds = (p: QlooPlace) => new Set(p.tags.map((t) => t.id));

function minMax(values: (number | undefined)[]): (v: number | undefined) => number {
  const nums = values.filter((v): v is number => v !== undefined);
  if (nums.length === 0) return () => 0.5;
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  return (v) => (v === undefined ? 0.5 : hi === lo ? 1 : (v - lo) / (hi - lo));
}

async function resolveArtists(qloo: QlooLike, req: PlanRequest, warnings: string[]): Promise<ArtistSeed[]> {
  const seeds: ArtistSeed[] = [];
  const perMember = req.team.map((m) => m.artists.filter(Boolean));
  // Round-robin across members so one person with many artists cannot dominate the signal.
  for (let round = 0; seeds.length < MAX_ARTIST_SEEDS; round++) {
    let any = false;
    for (let i = 0; i < req.team.length && seeds.length < MAX_ARTIST_SEEDS; i++) {
      const name = perMember[i]?.[round];
      if (!name) continue;
      any = true;
      try {
        const hit = (await qloo.searchEntities({ query: name, types: ["urn:entity:artist"], take: 1 }))[0];
        if (hit && !seeds.some((s) => s.entityId === hit.entityId)) {
          seeds.push({ entityId: hit.entityId, name: hit.name, member: req.team[i]!.name });
        } else if (!hit) warnings.push(`Qloo found no artist named "${name}".`);
      } catch (e) {
        warnings.push(`Artist lookup for "${name}" failed: ${e instanceof Error ? e.message : "error"}`);
      }
    }
    if (!any) break;
  }
  return seeds;
}

function categoryOf(place: QlooPlace, votes: Vote[], list: CatalogItem[]): CatalogItem | undefined {
  const ids = tagIds(place);
  return votes.find((v) => ids.has(v.item.tag))?.item ?? list.find((i) => ids.has(i.tag));
}

interface ScoreCtx {
  profile: GroupProfile;
  memberNames: string[];
  votes: Vote[];
  list: CatalogItem[];
  kind: "dinner" | "activity";
  city: string;
  fallbackKeys: Set<string>;
  needs: Vote[];
}

function teamFit(ids: Set<string>, kind: "dinner" | "activity") {
  const hits = Object.entries(FIT_TAGS).filter(([id, f]) => f.kinds.includes(kind) && ids.has(id)).map(([, f]) => f);
  return { hits, share: Math.min(hits.length, 2) / 2 };
}

function scoreCandidates(places: QlooPlace[], ctx: ScoreCtx): Candidate[] {
  const norm = minMax(places.map((p) => p.affinity));
  const lang = (l: CatalogItem) => ({ labelEn: l.en, labelAr: l.ar });
  return places
    .filter((p) => !p.isClosed)
    // Hotels carry tourist/spa tags but are not an "activity"; keep them only when matched as a spa.
    .filter((p) => ctx.kind === "dinner" || !tagIds(p).has(HOTEL_TAG) || categoryOf(p, ctx.votes, ctx.list)?.key === "spa")
    .map((p): Candidate => {
      const ids = tagIds(p);
      const reasons: Reason[] = [];
      const covered = new Set<string>();

      for (const v of ctx.votes) {
        if (ids.has(v.item.tag)) {
          v.members.forEach((m) => covered.add(m));
          reasons.push({ kind: ctx.kind === "dinner" ? "cuisine_match" : "activity_match", members: v.members, ...lang(v.item) });
        }
      }
      // Qloo explainability: which artist seeds drove this venue.
      const seedBy = new Map(ctx.profile.artists.map((a) => [a.entityId, a]));
      // Scores are each seed's share of the match (they sum to 1): with a single effective seed the share is trivially 100%,
      // so an explanation is only emitted when at least two seeds compete, and only for the dominant one.
      const linked = p.explain
        .filter((x) => seedBy.has(x.entityId))
        .sort((a, b) => b.score - a.score);
      for (const x of linked) covered.add(seedBy.get(x.entityId)!.member);
      const top = linked[0];
      if (top && linked.length >= 2 && top.score >= 0.5) {
        const a = seedBy.get(top.entityId)!;
        reasons.push({ kind: "artist_link", members: [a.member], labelEn: a.name, labelAr: a.name, value: top.score });
      }

      const cat = categoryOf(p, ctx.votes, ctx.list);
      const aff = norm(p.affinity);
      reasons.push({ kind: "affinity", value: aff });
      if (p.rating !== undefined) reasons.push({ kind: "rating", value: p.rating });
      if (cat && ctx.fallbackKeys.has(cat.key) && !ctx.votes.some((v) => v.item.key === cat.key)) {
        reasons.push({ kind: "fallback_category", ...lang(cat) });
      }

      const confirmed: string[] = [];
      const unconfirmed: string[] = [];
      if (ctx.kind === "dinner") {
        for (const need of ctx.needs) {
          const item = need.item;
          // A vegetarian-cuisine venue also counts as vegetarian evidence.
          const ok = ids.has(item.tag) || (item.key === "vegetarian" && ids.has("urn:tag:genre:place:restaurant:vegetarian"));
          (ok ? confirmed : unconfirmed).push(item.key);
          reasons.push({ kind: ok ? "dietary_confirmed" : "dietary_unconfirmed", members: need.members, ...lang(item) });
        }
      }

      const cost =
        ctx.kind === "dinner" ? dinnerCost(p.priceLevel, ctx.city) : activityCost(cat?.key ?? "tourist", ctx.city);
      if (ctx.kind === "dinner") {
        reasons.push(
          p.priceLevel
            ? { kind: "price_known", labelEn: "$".repeat(p.priceLevel), labelAr: "$".repeat(p.priceLevel) }
            : { kind: "price_assumed" },
        );
      }

      const coverage = ctx.memberNames.length ? covered.size / ctx.memberNames.length : 0;
      const rating = p.rating !== undefined ? p.rating / 5 : 0.5;
      const fit = teamFit(ids, ctx.kind);
      if (fit.hits.length) {
        reasons.push({ kind: "team_fit", labelEn: fit.hits.map((h) => h.en).join(", "), labelAr: fit.hits.map((h) => h.ar).join("، ") });
      }
      const total = WEIGHTS.qloo * aff + WEIGHTS.coverage * coverage + WEIGHTS.teamFit * fit.share + WEIGHTS.rating * rating;
      const score: ScoreBreakdown = { qlooAffinity: aff, memberCoverage: coverage, rating, teamFit: fit.share, total };
      return {
        kind: ctx.kind,
        place: p,
        categoryKey: cat?.key,
        categoryEn: cat?.en,
        categoryAr: cat?.ar,
        costPerPerson: cost.perPerson,
        costIsAssumed: cost.assumed,
        dietaryConfirmed: confirmed,
        dietaryUnconfirmed: unconfirmed,
        score,
        reasons,
      };
    })
    .sort((a, b) => {
      // Dietary-confirmed venues always outrank unconfirmed ones; then by blended score; then name for determinism.
      const d = a.dietaryUnconfirmed.length - b.dietaryUnconfirmed.length;
      return d || b.score.total - a.score.total || a.place.nameEn.localeCompare(b.place.nameEn);
    });
}

function humanWarnings(raw: string[], artists: ArtistSeed[]): string[] {
  return raw.map((w) => {
    const hit = artists.find((a) => w.includes(a.entityId));
    return hit ? `Qloo has no venue-graph data for artist "${hit.name}" (${hit.member}'s pick); it did not influence ranking.` : w;
  });
}

export async function planOffsite(req: PlanRequest, deps: PlannerDeps): Promise<Plan> {
  const { qloo } = deps;
  const city = cityProfile(req.city);
  const startCalls = qloo.httpCalls;
  const warnings: string[] = [];
  const audit = new AuditLog(deps.now);
  const threshold = req.approvalThreshold ?? defaultApprovalThreshold(req.city);
  const memberNames = req.team.map((m) => m.name);

  if (req.team.length === 0) throw new Error("Team needs at least one member.");

  const artists = await resolveArtists(qloo, req, warnings);
  const profile = buildGroupProfile(req.team, artists);
  warnings.push(...profile.warnings);

  const signalCuisineTags = profile.cuisines.slice(0, 6).map((v) => v.item.tag);
  const needs = profile.dietary;

  // ---- Dinner: restaurants in the city, ranked by Qloo against the group signal ------------------
  const dinnerRes = await qloo.insights({
    filterType: "urn:entity:place",
    locationQuery: city.qlooQuery,
    filterTags: POOL_CUISINES,
    signalTags: signalCuisineTags,
    signalEntities: artists.map((a) => a.entityId),
    explainability: artists.length > 0,
    take: 50,
  });
  warnings.push(...humanWarnings(dinnerRes.warnings, artists));
  const dinners = scoreCandidates(dinnerRes.places, {
    profile,
    memberNames,
    votes: profile.cuisines,
    list: CUISINES,
    kind: "dinner",
    city: req.city,
    fallbackKeys: new Set(),
    needs,
  });

  // ---- Activity ------------------------------------------------------------------------------------
  const votedActivityTags = profile.activities.slice(0, 5).map((v) => v.item.tag);
  let activityPlaces: QlooPlace[] = [];
  let actFallback = new Set<string>();
  if (votedActivityTags.length > 0) {
    const r = await qloo.insights({
      filterType: "urn:entity:place",
      locationQuery: city.qlooQuery,
      filterTags: votedActivityTags,
      signalTags: votedActivityTags,
      signalEntities: artists.map((a) => a.entityId),
      explainability: artists.length > 0,
      take: 30,
    });
    activityPlaces = r.places;
  }
  if (activityPlaces.length < 4) {
    const fb = ACTIVITIES.filter((a) => FALLBACK_ACTIVITY_KEYS.includes(a.key));
    actFallback = new Set(fb.map((a) => a.key));
    const r = await qloo.insights({
      filterType: "urn:entity:place",
      locationQuery: city.qlooQuery,
      filterTags: fb.map((a) => a.tag),
      signalTags: votedActivityTags.length ? votedActivityTags : fb.map((a) => a.tag),
      take: 30,
    });
    const have = new Set(activityPlaces.map((p) => p.entityId));
    activityPlaces = [...activityPlaces, ...r.places.filter((p) => !have.has(p.entityId))];
  }
  const activities = scoreCandidates(activityPlaces, {
    profile,
    memberNames,
    votes: profile.activities,
    list: ACTIVITIES,
    kind: "activity",
    city: req.city,
    fallbackKeys: actFallback,
    needs: [],
  });

  // ---- Combine, apply budget + approval policy ----------------------------------------------------
  // Dietary safety: when venues with Qloo-confirmed dietary tags exist, venues without confirmation are left out
  // (a missing tag is not proof either way, so we never present them next to confirmed ones).
  const confirmedDinners = dinners.filter((d) => d.dietaryUnconfirmed.length === 0);
  let dinnerPool = dinners;
  if (needs.length > 0 && confirmedDinners.length > 0 && confirmedDinners.length < dinners.length) {
    dinnerPool = confirmedDinners;
    warnings.push(
      `${dinners.length - confirmedDinners.length} restaurants were left out because Qloo does not confirm all dietary needs for them.`,
    );
  }
  const topD = dinnerPool.slice(0, 8);
  const topA = activities.slice(0, 8);
  const combos = topD
    .flatMap((d) => topA.map((a) => ({ d, a, score: COMBO.dinner * d.score.total + COMBO.activity * a.score.total })))
    .sort((x, y) => y.score - x.score);

  const label = (d: Candidate, a: Candidate) => `${d.place.nameEn} + ${a.place.nameEn}`;
  const money = (d: Candidate, a: Candidate) => {
    const pp = d.costPerPerson + a.costPerPerson;
    return { pp, total: pp * req.headcount };
  };

  const within = combos.filter((c) => money(c.d, c.a).pp <= req.budgetPerPerson);
  const over = combos.filter((c) => money(c.d, c.a).pp > req.budgetPerPerson);

  // Distinct dinners/activities first; relax if the pool is too small.
  const picked: typeof combos = [];
  const usedD = new Set<string>();
  const usedA = new Set<string>();
  const usedCat = new Set<string>();
  for (const strict of [true, false]) {
    for (const c of within) {
      if (picked.length >= MAX_OPTIONS) break;
      if (picked.includes(c)) continue;
      if (usedD.has(c.d.place.entityId) || usedA.has(c.a.place.entityId)) continue;
      if (strict && c.a.categoryKey && usedCat.has(c.a.categoryKey)) continue;
      picked.push(c);
      usedD.add(c.d.place.entityId);
      usedA.add(c.a.place.entityId);
      if (c.a.categoryKey) usedCat.add(c.a.categoryKey);
    }
  }
  for (const c of within) {
    if (picked.length >= MAX_OPTIONS) break;
    if (!picked.includes(c) && !picked.some((p) => p.d === c.d && p.a === c.a)) picked.push(c);
  }

  // Rank follows the blended score (selection order only decides which combos make the shortlist).
  picked.sort((x, y) => y.score - x.score);

  // Audit every shortlisted decision plus the best rejected ones (so rejections are visible and justified).
  const options: PlanOption[] = picked.map((c, i) => {
    const m = money(c.d, c.a);
    const res = audit.record({
      subject: label(c.d, c.a),
      costPerPerson: m.pp,
      costTotal: m.total,
      budgetPerPerson: req.budgetPerPerson,
      approvalThreshold: threshold,
      currency: city.currency,
    });
    return {
      rank: i + 1,
      dinner: c.d,
      activity: c.a,
      costPerPerson: m.pp,
      costTotal: m.total,
      decision: res.decision,
      score: c.score,
    };
  });
  for (const c of over.slice(0, 3)) {
    const m = money(c.d, c.a);
    audit.record({
      subject: label(c.d, c.a),
      costPerPerson: m.pp,
      costTotal: m.total,
      budgetPerPerson: req.budgetPerPerson,
      approvalThreshold: threshold,
      currency: city.currency,
    });
  }

  if (dinners.length === 0) warnings.push("Qloo returned no restaurants for this location.");
  if (activities.length === 0) warnings.push("Qloo returned no activity venues for this location.");
  if (options.length === 0 && dinners.length > 0 && activities.length > 0) {
    warnings.push("No dinner + activity combination fits the budget per person.");
  }
  if (!dinnerRes.locality) warnings.push("Qloo did not report which locality it matched.");

  const seeds: Plan["seeds"] = [
    ...profile.cuisines.map((v) => ({ kind: "cuisine" as const, labelEn: v.item.en, labelAr: v.item.ar, members: v.members })),
    ...profile.activities.map((v) => ({ kind: "activity" as const, labelEn: v.item.en, labelAr: v.item.ar, members: v.members })),
    ...artists.map((a) => ({ kind: "artist" as const, labelEn: a.name, members: [a.member] })),
  ];
  // Dietary needs are shown as seeds too, since they constrain ranking.
  for (const v of needs) {
    const d = DIETARY.find((x) => x.key === v.item.key)!;
    seeds.push({ kind: "cuisine", labelEn: `${d.en} (dietary)`, labelAr: `${d.ar} (نظام غذائي)`, members: v.members });
  }

  const plan: Plan = {
    request: req,
    currency: city.currency,
    locality: dinnerRes.locality,
    options,
    audit: audit.all(),
    warnings,
    seeds,
    provider: "rule-based",
    qlooHttpCalls: qloo.httpCalls - startCalls,
  };

  const n = await narrateSafely(deps.llm ?? new RuleBasedProvider(), plan, req.language);
  plan.provider = n.provider;
  plan.overview = n.narration.overview;
  plan.options.forEach((o, i) => (o.summary = n.narration.summaries[i]));
  if (n.warning) plan.warnings.push(n.warning);
  return plan;
}
