import type { Lang, Plan } from "../agent/types";
import type { LLMProvider, Narration } from "./types";

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Works with any OpenAI-compatible /chat/completions endpoint (OpenAI, Azure proxy, vLLM, Ollama, ...). */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  constructor(private readonly o: OpenAICompatibleOptions) {
    this.name = `openai-compatible:${o.model}`;
  }

  static fromEnv(env: Record<string, string | undefined> = process.env): OpenAICompatibleProvider | null {
    const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = env;
    if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) return null;
    return new OpenAICompatibleProvider({ baseUrl: LLM_BASE_URL, apiKey: LLM_API_KEY, model: LLM_MODEL });
  }

  async narrate(plan: Plan, lang: Lang): Promise<Narration> {
    const facts = {
      city: plan.request.city,
      locality: plan.locality,
      currency: plan.currency,
      headcount: plan.request.headcount,
      seeds: plan.seeds,
      options: plan.options.map((o) => ({
        dinner: o.dinner.place.nameEn,
        dinnerAr: o.dinner.place.nameAr,
        activity: o.activity.place.nameEn,
        activityAr: o.activity.place.nameAr,
        costPerPersonEstimate: Math.round(o.costPerPerson),
        costTotalEstimate: Math.round(o.costTotal),
        decision: o.decision,
        reasons: [...o.dinner.reasons, ...o.activity.reasons],
      })),
    };
    const system =
      `You write short offsite-plan narration in ${lang === "ar" ? "Arabic (Modern Standard, clear)" : "English"}. ` +
      "Use ONLY the facts in the JSON. Never invent venues, prices, ratings or dietary claims. Costs are estimates. " +
      'Reply with JSON only: {"overview": string, "summaries": string[]} with exactly one summary per option, same order.';
    const f = this.o.fetchImpl ?? fetch;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.o.timeoutMs ?? 20_000);
    try {
      const res = await f(`${this.o.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.o.apiKey}` },
        body: JSON.stringify({
          model: this.o.model,
          temperature: 0.2,
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(facts) },
          ],
        }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return parseNarration(body.choices?.[0]?.message?.content ?? "", plan.options.length);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function parseNarration(content: string, expected: number): Narration {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("LLM returned no JSON");
  const j = JSON.parse(m[0]) as Partial<Narration>;
  if (typeof j.overview !== "string" || !Array.isArray(j.summaries) || j.summaries.length !== expected) {
    throw new Error("LLM JSON has wrong shape");
  }
  if (!j.summaries.every((s) => typeof s === "string")) throw new Error("LLM summaries must be strings");
  return { overview: j.overview, summaries: j.summaries };
}
