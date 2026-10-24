/**
 * Team Fairness Engine (pure, no I/O).
 *
 * For each option, every member gets a satisfaction score from what the option actually matches for them:
 *   1   = both the dinner and the activity match that member's picks,
 *   0.5 = one of the two does,
 *   0   = neither (the member is "left out" / marginalised by that option).
 * "Match" is the same evidence the ranking uses: the member's cuisine/activity picks are tags on the venue, or Qloo
 * explainability attributes the venue to that member's favourite artist (Candidate.membersCovered).
 *
 * Team fit = mean satisfaction, fairness = minimum satisfaction. Across the shortlist we label
 *   Best fit  = the top-ranked option (highest blended score),
 *   Fairest   = highest minimum, then fewest members left out, then highest mean, then rank,
 *   Cheapest  = lowest cost per person, then rank.
 * When the fairest option is not the best-fit one, an explanation names who it adds and what it costs.
 */
import type { PlanOption } from "./types";

export type FairnessLabel = "best_fit" | "fairest" | "cheapest";

export interface MemberSatisfaction {
  name: string;
  /** 0, 0.5 or 1 (see module doc). */
  score: number;
  dinner: boolean;
  activity: boolean;
}

export interface OptionFairness {
  rank: number;
  members: MemberSatisfaction[];
  /** Mean satisfaction (0..1). */
  mean: number;
  /** Minimum satisfaction (0..1); 0 means somebody gets nothing they picked. */
  min: number;
  /** Share of members with satisfaction > 0. */
  coverage: number;
  /** Members with satisfaction 0, in team order. */
  leftOut: string[];
  labels: FairnessLabel[];
}

export interface FairnessExplanation {
  /** Rank of the fairest option and of the best-fit option it is compared with. */
  fairerRank: number;
  bestRank: number;
  /** Members left out by the best-fit option but matched by the fairer one. */
  gains: string[];
  /** Members the fairer option leaves out that the best-fit option matched (trade-off; often empty). */
  losses: string[];
  /** Cost per person of the fairer option minus the best-fit one (local currency, estimate; may be negative). */
  costDeltaPerPerson: number;
  /** Blended score difference (best - fairer), >= 0. */
  scoreGap: number;
}

export interface FairnessReport {
  members: string[];
  options: OptionFairness[];
  bestFitRank: number;
  fairestRank: number;
  cheapestRank: number;
  explanation?: FairnessExplanation;
  /** Members left out by every shortlisted option. */
  alwaysLeftOut: string[];
}

type OptionLike = Pick<PlanOption, "rank" | "costPerPerson" | "score"> & {
  dinner: { membersCovered: string[] };
  activity: { membersCovered: string[] };
};

const round = (x: number) => Math.round(x * 1000) / 1000;

export function optionFairness(o: OptionLike, members: string[]): OptionFairness {
  const d = new Set(o.dinner.membersCovered);
  const a = new Set(o.activity.membersCovered);
  const sat = members.map((name) => {
    const dinner = d.has(name);
    const activity = a.has(name);
    return { name, dinner, activity, score: (Number(dinner) + Number(activity)) / 2 };
  });
  const n = sat.length || 1;
  return {
    rank: o.rank,
    members: sat,
    mean: round(sat.reduce((s, m) => s + m.score, 0) / n),
    min: sat.length ? Math.min(...sat.map((m) => m.score)) : 0,
    coverage: round(sat.filter((m) => m.score > 0).length / n),
    leftOut: sat.filter((m) => m.score === 0).map((m) => m.name),
    labels: [],
  };
}

/** Returns undefined when there are no options. Option ranks must be 1..n in blended-score order. */
export function assessFairness(options: OptionLike[], members: string[]): FairnessReport | undefined {
  if (options.length === 0) return undefined;
  const per = options.map((o) => optionFairness(o, members));
  const byRank = (x: { rank: number }, y: { rank: number }) => x.rank - y.rank;

  const best = [...per].sort(byRank)[0]!;
  const fairest = [...per].sort(
    (x, y) => y.min - x.min || x.leftOut.length - y.leftOut.length || y.mean - x.mean || byRank(x, y),
  )[0]!;
  const cheapestOpt = [...options].sort((x, y) => x.costPerPerson - y.costPerPerson || byRank(x, y))[0]!;

  best.labels.push("best_fit");
  fairest.labels.push("fairest");
  per.find((p) => p.rank === cheapestOpt.rank)!.labels.push("cheapest");

  let explanation: FairnessExplanation | undefined;
  if (fairest.rank !== best.rank) {
    const bestO = options.find((o) => o.rank === best.rank)!;
    const fairO = options.find((o) => o.rank === fairest.rank)!;
    explanation = {
      fairerRank: fairest.rank,
      bestRank: best.rank,
      gains: best.leftOut.filter((m) => !fairest.leftOut.includes(m)),
      losses: fairest.leftOut.filter((m) => !best.leftOut.includes(m)),
      costDeltaPerPerson: round(fairO.costPerPerson - bestO.costPerPerson),
      scoreGap: round(Math.max(0, bestO.score - fairO.score)),
    };
  }

  return {
    members,
    options: per,
    bestFitRank: best.rank,
    fairestRank: fairest.rank,
    cheapestRank: cheapestOpt.rank,
    explanation,
    alwaysLeftOut: members.filter((m) => per.every((p) => p.leftOut.includes(m))),
  };
}
