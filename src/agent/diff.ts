/**
 * "What changed" after a replan: option-by-option comparison of two plans (pure, no I/O).
 * Options are compared by rank. Costs are the planner's estimates; fairness numbers come from the Fairness Engine.
 */
import type { FairnessReport } from "./fairness";
import type { Plan } from "./types";

export interface VenueSide {
  id: string;
  nameEn: string;
  nameAr?: string;
}

export interface OptionSide {
  dinner: VenueSide;
  activity: VenueSide;
  costPerPerson: number;
  /** Team average satisfaction (0..1) and the lowest member's (0..1). */
  mean: number;
  min: number;
  covered: number;
  members: number;
  leftOut: string[];
}

export type ChangeStatus = "same" | "changed" | "added" | "removed";

export interface OptionChange {
  rank: number;
  status: ChangeStatus;
  before?: OptionSide;
  after?: OptionSide;
  dinnerChanged: boolean;
  activityChanged: boolean;
  /** after - before (estimate, local currency); 0 when one side is missing. */
  costDeltaPerPerson: number;
  meanDelta: number;
  minDelta: number;
  /** Members newly left out, and members no longer left out. */
  leftOutAdded: string[];
  leftOutRemoved: string[];
}

export interface PlanDiff {
  options: OptionChange[];
  changedCount: number;
  budgetBefore: number;
  budgetAfter: number;
  /** Cheapest option per person before and after (undefined with no options). */
  cheapestBefore?: number;
  cheapestAfter?: number;
  /** Venues that appear in no new option, and venues that are new (by entity id). */
  venuesDropped: VenueSide[];
  venuesAdded: VenueSide[];
}

type PlanLike = Pick<Plan, "options" | "request"> & { fairness?: FairnessReport };

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const venue = (c: { place: { entityId: string; nameEn: string; nameAr?: string } }): VenueSide =>
  c.place.nameAr ? { id: c.place.entityId, nameEn: c.place.nameEn, nameAr: c.place.nameAr } : { id: c.place.entityId, nameEn: c.place.nameEn };

function sides(p: PlanLike): Map<number, OptionSide> {
  const out = new Map<number, OptionSide>();
  for (const o of p.options) {
    const f = p.fairness?.options.find((x) => x.rank === o.rank);
    out.set(o.rank, {
      dinner: venue(o.dinner),
      activity: venue(o.activity),
      costPerPerson: r(o.costPerPerson),
      mean: f?.mean ?? 0,
      min: f?.min ?? 0,
      covered: f ? f.members.filter((m) => m.score > 0).length : 0,
      members: f?.members.length ?? 0,
      leftOut: f?.leftOut ?? [],
    });
  }
  return out;
}

export function diffPlans(before: PlanLike, after: PlanLike): PlanDiff {
  const b = sides(before);
  const a = sides(after);
  const ranks = [...new Set([...b.keys(), ...a.keys()])].sort((x, y) => x - y);
  const options = ranks.map((rank): OptionChange => {
    const x = b.get(rank);
    const y = a.get(rank);
    const dinnerChanged = !!x && !!y && x.dinner.id !== y.dinner.id;
    const activityChanged = !!x && !!y && x.activity.id !== y.activity.id;
    const status: ChangeStatus = !x ? "added" : !y ? "removed" : dinnerChanged || activityChanged ? "changed" : "same";
    return {
      rank,
      status,
      before: x,
      after: y,
      dinnerChanged,
      activityChanged,
      costDeltaPerPerson: x && y ? r(y.costPerPerson - x.costPerPerson) : 0,
      meanDelta: x && y ? r(y.mean - x.mean, 3) : 0,
      minDelta: x && y ? r(y.min - x.min, 3) : 0,
      leftOutAdded: x && y ? y.leftOut.filter((m) => !x.leftOut.includes(m)) : [],
      leftOutRemoved: x && y ? x.leftOut.filter((m) => !y.leftOut.includes(m)) : [],
    };
  });
  const venuesOf = (m: Map<number, OptionSide>) => {
    const v = new Map<string, VenueSide>();
    for (const s of m.values()) for (const x of [s.dinner, s.activity]) v.set(x.id, x);
    return v;
  };
  const vb = venuesOf(b);
  const va = venuesOf(a);
  const cheapest = (m: Map<number, OptionSide>) => (m.size ? Math.min(...[...m.values()].map((s) => s.costPerPerson)) : undefined);
  return {
    options,
    changedCount: options.filter((o) => o.status !== "same").length,
    budgetBefore: before.request.budgetPerPerson,
    budgetAfter: after.request.budgetPerPerson,
    cheapestBefore: cheapest(b),
    cheapestAfter: cheapest(a),
    venuesDropped: [...vb.values()].filter((v) => !va.has(v.id)),
    venuesAdded: [...va.values()].filter((v) => !vb.has(v.id)),
  };
}

export interface DiffViews {
  /** Latest plan vs the plan just before the last feedback. */
  vsPrevious?: PlanDiff;
  /** Latest plan vs the first plan of the session; omitted when the previous plan is the original (same diff). */
  vsOriginal?: PlanDiff;
}

/** Both "what changed" views for a feedback session. No diff without a previous plan. */
export function diffViews(original: PlanLike | null | undefined, previous: PlanLike | null | undefined, current: PlanLike | null | undefined): DiffViews {
  if (!current || !previous) return {};
  const vsPrevious = diffPlans(previous, current);
  return original && original !== previous ? { vsPrevious, vsOriginal: diffPlans(original, current) } : { vsPrevious };
}
