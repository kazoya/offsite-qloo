/**
 * Agent loop: understand → Qloo queries → rank → budget/time check → propose → explain → approval gate,
 * then, when the team gave feedback, apply it → replan → verify the feedback was honoured.
 *
 * Autonomy limits (enforced here, not just documented):
 *  - it only PROPOSES; it never books, reserves or pays for anything;
 *  - any option whose total crosses the manager-approval threshold (rule R2) waits for a human,
 *    even if an upstream step mislabelled it;
 *  - nothing is sent to the approvals queue automatically.
 *
 * The run is stateless: the client sends the original request plus the feedback list. Qloo responses are reused
 * inside a run (the replan makes no extra Qloo calls) and across runs through the client's disk cache.
 */
import { evaluatePolicy } from "./policy";
import { chainKey, planOffsite, type PlanConstraints, type PlannerDeps, type PlannerStep, type QlooLike, type StepFacts } from "./planner";
import type { Deadline } from "./deadline";
import { defaultApprovalThreshold } from "./budget";
import type { Feedback, Plan, PlanOption, PlanRequest } from "./types";

export type { Feedback };

export type AgentStepName = "understand" | PlannerStep | "approval_gate" | "apply_feedback" | "verify_feedback";

export interface DecisionLogEntry {
  seq: number;
  /** "initial" plan, or the "replan" after feedback. */
  pass: "initial" | "replan";
  step: AgentStepName;
  /** Short, structured summary of what the step looked at (counts and names, never raw Qloo payloads). */
  inputs: StepFacts;
  decision: string;
  reason: string;
  /** Wall time spent in this step. */
  ms: number;
}

export interface GateEntry {
  rank: number;
  /** "proposed": within policy, still only a proposal. "awaiting_human": R2, a manager must approve. */
  status: "proposed" | "awaiting_human";
  rule: string;
  /** True when the gate had to correct a decision computed upstream (should never happen). */
  corrected: boolean;
}

export interface FeedbackCheck {
  feedback: Feedback;
  satisfied: boolean;
  detail: string;
}

export interface OptionDigest {
  rank: number;
  dinner: string;
  dinnerId: string;
  activity: string;
  activityId: string;
  costPerPerson: number;
}

export const AUTONOMY = {
  proposesOnly: true,
  books: false,
  pays: false,
  r2RequiresHuman: true,
  autoSubmitsApprovals: false,
} as const;

export interface AgentReport {
  version: 1;
  autonomy: typeof AUTONOMY;
  log: DecisionLogEntry[];
  gate: GateEntry[];
  feedback: Feedback[];
  replanned: boolean;
  checks: FeedbackCheck[];
  /** The plan before feedback (only when there was feedback), to show what changed. */
  baseline?: OptionDigest[];
  /** True when the replanned options differ from the baseline. */
  changed?: boolean;
  qloo: { httpCalls: number; reusedResponses: number };
  elapsedMs: number;
  deadlineMs?: number;
}

export type AgentPlan = Plan & { agent: AgentReport };

export interface AgentDeps extends Omit<PlannerDeps, "onStep"> {
  deadline?: Deadline;
  /** Monotonic clock in ms for step timings (injectable for tests). */
  clock?: () => number;
}

/** Wraps Qloo so identical requests in one run are answered once, and every call respects the deadline. */
export class ReusingQloo implements QlooLike {
  reused = 0;
  private readonly memo = new Map<string, Promise<unknown>>();
  constructor(private readonly inner: QlooLike, private readonly deadline?: Deadline) {}
  get httpCalls() {
    return this.inner.httpCalls;
  }
  searchEntities: QlooLike["searchEntities"] = (p) => this.once("search", p, () => this.inner.searchEntities(p));
  insights: QlooLike["insights"] = (p) => this.once("insights", p, () => this.inner.insights(p));
  private once<T>(kind: string, params: unknown, call: () => Promise<T>): Promise<T> {
    const key = `${kind}:${JSON.stringify(params)}`;
    const hit = this.memo.get(key) as Promise<T> | undefined;
    if (hit) {
      this.reused++;
      return hit;
    }
    const p = this.deadline ? this.deadline.race(call(), `Qloo ${kind}`) : call();
    this.memo.set(key, p);
    p.catch(() => this.memo.delete(key));
    return p;
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const digest = (o: PlanOption): OptionDigest => ({
  rank: o.rank,
  dinner: o.dinner.place.nameEn,
  dinnerId: o.dinner.place.entityId,
  activity: o.activity.place.nameEn,
  activityId: o.activity.place.entityId,
  costPerPerson: r2(o.costPerPerson),
});

const sameOptions = (a: OptionDigest[], b: OptionDigest[]) =>
  a.length === b.length && a.every((x, i) => x.dinnerId === b[i]!.dinnerId && x.activityId === b[i]!.activityId);

/** Plain-English decision + reason for each planner step, built from the step's own counts. */
function describe(step: PlannerStep, f: StepFacts): { decision: string; reason: string } {
  switch (step) {
    case "qloo_queries":
      return {
        decision: `Got ${f.restaurantsFromQloo} restaurants and ${f.activityVenuesFromQloo} activity venues from Qloo.`,
        reason: `${f.artistsResolved} artist seed(s) resolved by exact name; ${f.activityFallbackUsed ? "too few voted activities, so a safe fallback set was added" : "activities came from the team's votes"}.`,
      };
    case "rank":
      return {
        decision: `Ranked ${f.restaurantsScored} restaurants and ${f.activityVenuesScored} activities${f.topRestaurant ? `; top restaurant "${f.topRestaurant}"` : ""}.`,
        reason: Number(f.excludedByFeedback) > 0
          ? `${f.excludedByFeedback} venue(s) removed because the team rejected them; the rest are scored by Qloo affinity, member coverage, team fit and rating.`
          : "Scored by Qloo affinity, member coverage, team fit and rating.",
      };
    case "budget_time_check":
      return {
        decision: `${f.combosWithinBudget} of ${f.combosConsidered} dinner + activity combinations fit ${f.budgetPerPerson} per person.`,
        reason: `${Number(f.restaurantsClosed) + Number(f.activityVenuesClosed)} venue(s) closed at the planned time were dropped; ${f.dietUnconfirmed} restaurant(s) kept but marked "diet unconfirmed".`,
      };
    case "propose": {
      const prio = f.prioritizedMembers as string[];
      return {
        decision: `Proposed ${f.options} option(s) using ${f.distinctRestaurants} different restaurant(s).`,
        reason: prio.length
          ? f.prioritizedCovered
            ? `Options covering ${prio.join(" and ")} were ranked first, as the feedback asked.`
            : `No affordable option covers ${prio.join(" and ")}; ranked by score instead and said so.`
          : "Picked the highest-scoring distinct combinations within budget.",
      };
    }
    case "explain":
      return {
        decision: `Wrote ${f.summaries} option summaries with the ${f.provider} narrator.`,
        reason: (f.bestFitLeavesOut as string[]).length
          ? `Fairness check: the best-fit option leaves out ${(f.bestFitLeavesOut as string[]).join(" and ")}; option ${f.fairestRank} is the fairest.`
          : "Fairness check: the best-fit option covers everyone with a preference.",
      };
  }
}

/** Runs the agent loop. With no feedback it is one pass; with feedback it plans, replans and verifies. */
export async function runAgent(req: PlanRequest, feedback: Feedback[], deps: AgentDeps): Promise<AgentPlan> {
  const clock = deps.clock ?? (() => performance.now());
  const t0 = clock();
  const qloo = new ReusingQloo(deps.qloo, deps.deadline);
  const startCalls = qloo.httpCalls;
  const log: DecisionLogEntry[] = [];
  let mark = clock();
  let pass: DecisionLogEntry["pass"] = "initial";
  const push = (step: AgentStepName, inputs: StepFacts, decision: string, reason: string) => {
    const now = clock();
    log.push({ seq: log.length + 1, pass, step, inputs, decision, reason, ms: Math.round(now - mark) });
    mark = now;
  };
  const onStep = (step: PlannerStep, facts: StepFacts) => {
    deps.deadline?.check(step);
    const inputs = step === "qloo_queries" ? { ...facts, reusedResponses: qloo.reused } : facts;
    const d = describe(step, inputs);
    push(step, inputs, d.decision, d.reason);
  };
  const plannerDeps: PlannerDeps = { qloo, llm: deps.llm, now: deps.now, onStep };

  const understand = (r: PlanRequest) => {
    const threshold = r.approvalThreshold ?? defaultApprovalThreshold(r.city);
    push(
      "understand",
      {
        members: r.team.length,
        city: r.city,
        budgetPerPerson: r.budgetPerPerson,
        headcount: r.headcount,
        date: r.date,
        startTime: r.startTime ?? "18:00",
        cuisineVotes: r.team.reduce((n, m) => n + m.cuisines.length, 0),
        activityVotes: r.team.reduce((n, m) => n + m.activities.length, 0),
        artistsTyped: r.team.reduce((n, m) => n + m.artists.length, 0),
        dietaryNeeds: r.team.reduce((n, m) => n + m.dietary.length, 0),
        approvalThreshold: threshold,
      },
      `Plan one evening for ${r.headcount} people in ${r.city} on ${r.date} within ${r.budgetPerPerson} per person.`,
      `Totals above ${threshold} need a manager (R2); the agent only proposes and never books or pays.`,
    );
  };

  const gate = (plan: Plan): GateEntry[] => {
    const threshold = plan.request.approvalThreshold ?? defaultApprovalThreshold(plan.request.city);
    const entries = plan.options.map((o) => {
      const p = evaluatePolicy({
        subject: o.rank.toString(),
        costPerPerson: o.costPerPerson,
        costTotal: o.costTotal,
        budgetPerPerson: plan.request.budgetPerPerson,
        approvalThreshold: threshold,
        currency: plan.currency,
      });
      const needsHuman = p.decision === "needs_manager_approval" || o.costTotal > threshold;
      const corrected = needsHuman && o.decision !== "needs_manager_approval";
      if (corrected) o.decision = "needs_manager_approval";
      return { rank: o.rank, status: needsHuman ? "awaiting_human" : "proposed", rule: p.rule.split(":")[0]!, corrected } as GateEntry;
    });
    const waiting = entries.filter((e) => e.status === "awaiting_human").length;
    push(
      "approval_gate",
      { options: entries.length, awaitingHuman: waiting, threshold, corrected: entries.filter((e) => e.corrected).length },
      waiting ? `${waiting} option(s) wait for a manager (R2); the rest are proposals only.` : "All options are proposals within policy; nothing was booked or paid.",
      "The agent never books or pays; a person sends an option for approval and a manager decides R2 spending.",
    );
    return entries;
  };

  // ---- Pass 1: the plan as requested --------------------------------------------------------------
  understand(req);
  let plan = await planOffsite(req, plannerDeps);
  let gates = gate(plan);
  const report: AgentReport = {
    version: 1,
    autonomy: AUTONOMY,
    log,
    gate: gates,
    feedback,
    replanned: false,
    checks: [],
    qloo: { httpCalls: 0, reusedResponses: 0 },
    elapsedMs: 0,
    deadlineMs: deps.deadline?.budgetMs,
  };

  // ---- Pass 2: replan from feedback ---------------------------------------------------------------
  if (feedback.length > 0) {
    const baseline = plan.options.map(digest);
    const baselinePlan = plan;
    const next: PlanRequest = { ...req };
    const constraints: Required<PlanConstraints> = { excludeEntityIds: [], prioritizeMembers: [], excludeCombos: [] };
    // A rejected venue is matched by id, and by chain name when it was one of the proposed options.
    const proposedById = new Map(baselinePlan.options.flatMap((o) => [o.dinner, o.activity]).map((c) => [c.place.entityId, c]));
    for (const f of feedback) {
      if (f.type === "budget") next.budgetPerPerson = f.budgetPerPerson;
      else if (f.type === "reject_venue") constraints.excludeEntityIds.push(f.entityId);
      else if (f.type === "manager_reject") constraints.excludeCombos.push({ dinnerId: f.dinnerId, activityId: f.activityId });
      else if (!constraints.prioritizeMembers.includes(f.member)) constraints.prioritizeMembers.push(f.member);
    }
    pass = "replan";
    push(
      "apply_feedback",
      {
        feedbackItems: feedback.length,
        budgetPerPerson: next.budgetPerPerson,
        previousBudgetPerPerson: req.budgetPerPerson,
        rejectedVenues: constraints.excludeEntityIds.length,
        managerRejectedOptions: constraints.excludeCombos.length,
        prioritizedMembers: constraints.prioritizeMembers,
      },
      "Replan with the team's feedback as hard constraints.",
      feedback.map((f) => (f.reason ? `${f.type}: ${f.reason}` : f.type)).join("; "),
    );
    understand(next);
    const callsBeforeReplan = qloo.httpCalls;
    const reusedBeforeReplan = qloo.reused;
    plan = await planOffsite(next, plannerDeps, constraints);
    const replanCalls = qloo.httpCalls - callsBeforeReplan;
    const replanReused = qloo.reused - reusedBeforeReplan;
    gates = gate(plan);
    report.gate = gates;
    report.replanned = true;
    report.baseline = baseline;
    const after = plan.options.map(digest);
    report.changed = !sameOptions(baseline, after);

    const rejectedChains = new Set(
      constraints.excludeEntityIds.map((id) => proposedById.get(id)).filter(Boolean).map((c) => chainKey(c!.place)).filter(Boolean),
    );
    report.checks = feedback.map((f): FeedbackCheck => {
      if (f.type === "budget") {
        const over = plan.options.filter((o) => o.costPerPerson > f.budgetPerPerson).length;
        const before = baseline.length ? Math.min(...baseline.map((o) => o.costPerPerson)) : 0;
        const now = after.length ? Math.min(...after.map((o) => o.costPerPerson)) : 0;
        return plan.options.length === 0
          ? { feedback: f, satisfied: false, detail: `No option fits ${f.budgetPerPerson} per person.` }
          : { feedback: f, satisfied: over === 0, detail: `Cheapest option ${r2(before)} → ${r2(now)} per person; ${over} option(s) over the new budget.` };
      }
      if (f.type === "reject_venue") {
        const still = plan.options.filter((o) =>
          [o.dinner, o.activity].some((c) => c.place.entityId === f.entityId || (chainKey(c.place) && rejectedChains.has(chainKey(c.place)))),
        ).length;
        return { feedback: f, satisfied: still === 0, detail: still === 0 ? "The rejected venue is no longer in any option." : `Still in ${still} option(s).` };
      }
      if (f.type === "manager_reject") {
        const still = plan.options.filter((o) => o.dinner.place.entityId === f.dinnerId && o.activity.place.entityId === f.activityId).length;
        return { feedback: f, satisfied: still === 0, detail: still === 0 ? "The rejected pairing is not proposed again." : "The rejected pairing is still proposed." };
      }
      const top = plan.fairness?.options[0]?.members.find((m) => m.name === f.member);
      const covered = (top?.score ?? 0) > 0;
      const anyCovered = plan.fairness?.options.some((o) => o.members.some((m) => m.name === f.member && m.score > 0)) ?? false;
      return {
        feedback: f,
        satisfied: covered,
        detail: covered
          ? `Option 1 now includes something ${f.member} picked.`
          : anyCovered
            ? `Only a lower-ranked option covers ${f.member}.`
            : `No option within budget covers ${f.member}'s picks.`,
      };
    });
    const ok = report.checks.filter((c) => c.satisfied).length;
    push(
      "verify_feedback",
      { checks: report.checks.length, satisfied: ok, changed: report.changed, qlooCallsDuringReplan: replanCalls, qlooResponsesReused: replanReused },
      `${ok} of ${report.checks.length} feedback item(s) satisfied; the plan ${report.changed ? "changed" : "did not change"}.`,
      ok === report.checks.length ? "Every request was honoured within policy." : "Unmet requests are reported as-is rather than hidden.",
    );
  }

  report.qloo = { httpCalls: qloo.httpCalls - startCalls, reusedResponses: qloo.reused };
  report.elapsedMs = Math.round(clock() - t0);
  plan.qlooHttpCalls = report.qloo.httpCalls;
  return Object.assign(plan, { agent: report });
}
