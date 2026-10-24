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
import { checkHours, fmtClock as fmt, parseClock, type HoursCheck } from "./hours";
import { assessFairness } from "./fairness";
import { exactNameMatch } from "./names";
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
/**
 * A missing Qloo dietary tag is NOT evidence that a venue cannot serve the need, so such venues are never dropped.
 * Each unconfirmed need subtracts this much from the venue score (capped), so confirmed venues rank higher and
 * an unconfirmed one only makes the shortlist when it is clearly the better match. It is always labelled.
 */
export const DIET_PENALTY_PER_NEED = 0.15;
const DIET_PENALTY_MAX = 0.3;
/** How many artist search hits to compare against the typed name. */
const ARTIST_SEARCH_TAKE = 5;
/** Evening shape used for the opening-hours check: activity first, then dinner (minutes). */
export const SCHEDULE = { defaultStart: "18:00", activityMinutes: 120, dinnerMinutes: 90 } as const;

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
        // Never trust the top search hit blindly (e.g. "X" can return a collaboration "Y & X" first).
        const hits = await qloo.searchEntities({ query: name, types: ["urn:entity:artist"], take: ARTIST_SEARCH_TAKE });
        const hit = exactNameMatch(name, hits);
        if (hit && !seeds.some((s) => s.entityId === hit.entityId)) {
          seeds.push({ entityId: hit.entityId, name: hit.name, member: req.team[i]!.name });
        } else if (!hit && hits.length > 0) {
          warnings.push(`Qloo has no exact artist match for "${name}" (closest: "${hits[0]!.name}"); it was skipped.`);
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
      const dietPenalty = Math.min(DIET_PENALTY_MAX, DIET_PENALTY_PER_NEED * unconfirmed.length);
      const total =
        WEIGHTS.qloo * aff + WEIGHTS.coverage * coverage + WEIGHTS.teamFit * fit.share + WEIGHTS.rating * rating - dietPenalty;
      const score: ScoreBreakdown = { qlooAffinity: aff, memberCoverage: coverage, rating, teamFit: fit.share, dietPenalty, total };
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
        membersCovered: ctx.memberNames.filter((m) => covered.has(m)),
        score,
        reasons,
      };
    })
    // Blended score (which already includes the dietary penalty), then name for determinism.
    .sort((a, b) => b.score.total - a.score.total || a.place.nameEn.localeCompare(b.place.nameEn));
}

/** Normalised venue name used to collapse branches of one chain into a single candidate (best-ranked branch wins). */
export const chainKey = (p: QlooPlace) =>
  p.nameEn.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();

function dedupeByName(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => {
    const k = chainKey(c.place) || c.place.entityId;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface Combo { d: Candidate; a: Candidate; score: number }

/**
 * Picks up to `max` combos from a best-first list, relaxing variety constraints step by step:
 *  1. distinct dinner, distinct activity, distinct activity category
 *  2. distinct dinner, distinct activity
 *  3. distinct dinner (an activity may repeat)
 *  4. any unused combo (only when fewer distinct dinners exist than options)
 * A dinner is therefore only repeated when no other affordable dinner exists.
 */
export function pickDiverse<T extends Combo>(list: T[], max: number): T[] {
  const picked: T[] = [];
  const passes: ((c: T) => boolean)[] = [
    (c) => !usedD(c) && !usedA(c) && !(c.a.categoryKey && picked.some((p) => p.a.categoryKey === c.a.categoryKey)),
    (c) => !usedD(c) && !usedA(c),
    (c) => !usedD(c),
    () => true,
  ];
  function usedD(c: T) { return picked.some((p) => p.d.place.entityId === c.d.place.entityId); }
  function usedA(c: T) { return picked.some((p) => p.a.place.entityId === c.a.place.entityId); }
  for (const ok of passes) {
    for (const c of list) {
      if (picked.length >= max) return picked;
      if (!picked.includes(c) && ok(c)) picked.push(c);
    }
  }
  return picked;
}


/** Annotates candidates with an hours check, drops the ones closed in their slot, and keeps "unknown" (flagged). */
function applyHours(cands: Candidate[], date: string, start: number, minutes: number) {
  let excluded = 0;
  const kept: Candidate[] = [];
  let weekday = checkHours(undefined, date, start, minutes).weekday;
  for (const c of cands) {
    const h: HoursCheck = checkHours(c.place.hours, date, start, minutes);
    weekday = h.weekday;
    if (h.status === "closed_day" || h.status === "closed_at_time") {
      excluded++;
      continue;
    }
    const reason: Reason =
      h.status === "open"
        ? { kind: "hours_open", labelEn: `${h.from}–${h.to}`, labelAr: `${h.from}–${h.to}`, value: WEEKDAY_INDEX[h.weekday] }
        : { kind: "hours_unknown", value: h.allWeekClosed ? 1 : 0 };
    kept.push({ ...c, hours: h, reasons: [...c.reasons, reason] });
  }
  return { kept, excluded, weekday };
}
const WEEKDAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

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

  // ---- Opening hours: drop venues Qloo says are closed in their slot; flag unknown hours honestly ------
  const startMin = parseClock(req.startTime ?? SCHEDULE.defaultStart) ?? parseClock(SCHEDULE.defaultStart)!;
  const dinnerStart = startMin + SCHEDULE.activityMinutes;
  const actOpen = applyHours(activities, req.date, startMin, SCHEDULE.activityMinutes);
  const dinOpen = applyHours(dinners, req.date, dinnerStart, SCHEDULE.dinnerMinutes);
  for (const [n, one, many] of [[dinOpen.excluded, "restaurant", "restaurants"], [actOpen.excluded, "activity venue", "activity venues"]] as const) {
    if (n > 0) warnings.push(`${n} ${n === 1 ? `${one} was` : `${many} were`} left out because Qloo opening hours show them closed at the planned time.`);
  }
  const scoredDinnerCount = dinners.length;
  const scoredActivityCount = activities.length;
  dinners.splice(0, dinners.length, ...dinOpen.kept);
  activities.splice(0, activities.length, ...actOpen.kept);

  // ---- Combine, apply budget + approval policy ----------------------------------------------------
  // Branches of one chain (same name, different entity ids) count as one venue, so options stay distinct.
  const dinnersU = dedupeByName(dinners);
  const activitiesU = dedupeByName(activities);
  const cheapestActivity = activitiesU.length ? Math.min(...activitiesU.map((a) => a.costPerPerson)) : 0;
  const affordable = (d: Candidate) => d.costPerPerson + cheapestActivity <= req.budgetPerPerson;

  // Dietary evidence: venues without Qloo tags for every need stay in the pool (penalised + labelled, never dropped).
  const dinnerPool = dinnersU;
  const unconfirmedCount = needs.length > 0 ? dinnersU.filter((d) => d.dietaryUnconfirmed.length > 0).length : 0;
  if (unconfirmedCount > 0) {
    warnings.push(
      `${unconfirmedCount} restaurant${unconfirmedCount === 1 ? " has" : "s have"} no Qloo tag for every dietary need; they are kept, ranked lower and labelled "diet unconfirmed".`,
    );
  }
  // Shortlist affordable dinners first (so an expensive top-8 cannot crowd out every distinct option), plus the best
  // unaffordable ones so the audit log shows justified rejections.
  const topD = [...dinnerPool.filter(affordable).slice(0, 8), ...dinnerPool.filter((d) => !affordable(d)).slice(0, 3)];
  const byScore = (x: { score: number }, y: { score: number }) => y.score - x.score;
  const topA = activitiesU.slice(0, 8);
  const combos = topD
    .flatMap((d) => topA.map((a) => ({ d, a, score: COMBO.dinner * d.score.total + COMBO.activity * a.score.total })))
    .sort(byScore);

  const label = (d: Candidate, a: Candidate) => `${d.place.nameEn} + ${a.place.nameEn}`;
  const money = (d: Candidate, a: Candidate) => {
    const pp = d.costPerPerson + a.costPerPerson;
    return { pp, total: pp * req.headcount };
  };

  const within = combos.filter((c) => money(c.d, c.a).pp <= req.budgetPerPerson);
  const over = combos.filter((c) => money(c.d, c.a).pp > req.budgetPerPerson);

  const picked = pickDiverse(within, MAX_OPTIONS);
  const distinctDinners = new Set(picked.map((c) => c.d.place.entityId)).size;
  if (distinctDinners < picked.length) {
    warnings.push(
      `Only ${distinctDinners} restaurant${distinctDinners === 1 ? "" : "s"} fit the budget, so some options share a dinner.`,
    );
  }

  // Rank follows the blended score (selection order only decides which combos make the shortlist).
  picked.sort(byScore);

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

  if (scoredDinnerCount === 0) warnings.push("Qloo returned no restaurants for this location.");
  if (scoredActivityCount === 0) warnings.push("Qloo returned no activity venues for this location.");
  const unknownHours = new Set(
    options.flatMap((o) => [o.dinner, o.activity]).filter((c) => c.hours?.status === "unknown").map((c) => c.place.entityId),
  ).size;
  if (unknownHours > 0) warnings.push(`${unknownHours} suggested venue(s) have no opening hours in Qloo; confirm before booking.`);
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
    schedule: {
      weekday: actOpen.weekday,
      activity: { from: fmt(startMin), to: fmt(startMin + SCHEDULE.activityMinutes) },
      dinner: { from: fmt(dinnerStart), to: fmt(dinnerStart + SCHEDULE.dinnerMinutes) },
    },
    fairness: assessFairness(options, memberNames),
  };

  const n = await narrateSafely(deps.llm ?? new RuleBasedProvider(), plan, req.language);
  plan.provider = n.provider;
  plan.overview = n.narration.overview;
  plan.options.forEach((o, i) => (o.summary = n.narration.summaries[i]));
  if (n.warning) plan.warnings.push(n.warning);
  return plan;
}
