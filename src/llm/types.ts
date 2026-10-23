import type { Lang, Plan } from "../agent/types";

export interface Narration {
  /** One paragraph describing the team taste and what was picked. */
  overview: string;
  /** One short summary per plan option, same order as plan.options. */
  summaries: string[];
}

/**
 * Pluggable narration layer. Qloo and the rule engine decide WHAT is recommended; a provider only phrases it.
 * Providers must not invent venues, prices, or facts that are not in the plan.
 */
export interface LLMProvider {
  readonly name: string;
  narrate(plan: Plan, lang: Lang): Promise<Narration>;
}
