import type { Lang, Plan } from "../agent/types";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { RuleBasedProvider } from "./rule-based";
import type { LLMProvider, Narration } from "./types";

export * from "./types";
export { RuleBasedProvider, OpenAICompatibleProvider };
export { parseNarration } from "./openai-compatible";

/** LLM provider from env when LLM_BASE_URL/LLM_API_KEY/LLM_MODEL are all set, else the rule-based fallback. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): LLMProvider {
  return OpenAICompatibleProvider.fromEnv(env) ?? new RuleBasedProvider();
}

/** Run a provider; on any failure fall back to the deterministic one so the plan is never blocked by an LLM. */
export async function narrateSafely(
  primary: LLMProvider,
  plan: Plan,
  lang: Lang,
): Promise<{ narration: Narration; provider: string; warning?: string }> {
  try {
    return { narration: await primary.narrate(plan, lang), provider: primary.name };
  } catch (e) {
    const fb = new RuleBasedProvider();
    return {
      narration: await fb.narrate(plan, lang),
      provider: fb.name,
      warning: `LLM provider ${primary.name} failed (${e instanceof Error ? e.message : "error"}); used rule-based narration.`,
    };
  }
}
