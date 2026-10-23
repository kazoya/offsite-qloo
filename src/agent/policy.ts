import type { AuditEntry, Decision } from "./types";

export interface PolicyInput {
  subject: string;
  costPerPerson: number;
  costTotal: number;
  budgetPerPerson: number;
  approvalThreshold: number;
  currency: string;
}

export interface PolicyResult {
  decision: Decision;
  rule: string;
}

/**
 * Corporate approval policy (simple, explicit, deterministic):
 *  1. cost per person above the budget  -> rejected
 *  2. total event cost above threshold  -> needs manager approval
 *  3. otherwise                         -> auto-approved
 */
export function evaluatePolicy(i: PolicyInput): PolicyResult {
  if (i.costPerPerson > i.budgetPerPerson) {
    return { decision: "rejected_over_budget", rule: "R1: cost per person exceeds budget per person" };
  }
  if (i.costTotal > i.approvalThreshold) {
    return { decision: "needs_manager_approval", rule: "R2: total spend exceeds manager-approval threshold" };
  }
  return { decision: "auto_approved", rule: "R3: within budget and under approval threshold" };
}

/** Append-only audit log: one entry per decision, sequence-numbered, injectable clock for tests. */
export class AuditLog {
  private entries: AuditEntry[] = [];
  constructor(private readonly now: () => Date = () => new Date()) {}

  record(i: PolicyInput): PolicyResult {
    const r = evaluatePolicy(i);
    this.entries.push({
      seq: this.entries.length + 1,
      at: this.now().toISOString(),
      subject: i.subject,
      decision: r.decision,
      rule: r.rule,
      detail: {
        costPerPerson: Math.round(i.costPerPerson * 100) / 100,
        costTotal: Math.round(i.costTotal * 100) / 100,
        budgetPerPerson: i.budgetPerPerson,
        approvalThreshold: Math.round(i.approvalThreshold * 100) / 100,
        currency: i.currency,
      },
    });
    return r;
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }
}
