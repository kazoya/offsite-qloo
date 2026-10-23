import { cityProfile } from "../connectors/qloo/catalog";
import { money, renderReason } from "../i18n";
import type { Lang, Plan, PlanOption } from "../agent/types";
import type { LLMProvider, Narration } from "./types";

const placeName = (n: { nameEn: string; nameAr?: string }, l: Lang) => (l === "ar" ? (n.nameAr ?? n.nameEn) : n.nameEn);

function optionSummary(o: PlanOption, plan: Plan, l: Lang): string {
  const d = placeName(o.dinner.place, l);
  const a = placeName(o.activity.place, l);
  const cur = plan.currency;
  const top = [...o.dinner.reasons, ...o.activity.reasons].find((r) => r.kind === "artist_link" || r.kind === "cuisine_match");
  const why = top ? ` ${renderReason(top, l)}.` : "";
  return l === "ar"
    ? `عشاء في ${d} ثم ${a}. التكلفة التقديرية ${money(o.costPerPerson, cur, l)} للشخص (${money(o.costTotal, cur, l)} إجمالاً).${why}`
    : `Dinner at ${d}, then ${a}. Estimated ${money(o.costPerPerson, cur, l)} per person (${money(o.costTotal, cur, l)} total).${why}`;
}

/** Deterministic provider: works with no LLM key and gives identical output for identical input. */
export class RuleBasedProvider implements LLMProvider {
  readonly name = "rule-based";

  async narrate(plan: Plan, l: Lang): Promise<Narration> {
    const cuis = plan.seeds.filter((s) => s.kind === "cuisine").map((s) => (l === "ar" ? (s.labelAr ?? s.labelEn) : s.labelEn));
    const acts = plan.seeds.filter((s) => s.kind === "activity").map((s) => (l === "ar" ? (s.labelAr ?? s.labelEn) : s.labelEn));
    const city = l === "ar" ? cityAr(plan) : plan.request.city;
    const n = plan.request.team.length;
    let overview: string;
    if (plan.options.length === 0) {
      overview =
        l === "ar"
          ? `لم نجد خيارًا ضمن الميزانية في ${city}. جرّب رفع الميزانية أو تخفيف الاختيارات.`
          : `No option fits the budget in ${city}. Try raising the budget or relaxing the picks.`;
    } else {
      const joinC = cuis.slice(0, 3).join(l === "ar" ? "، " : ", ") || (l === "ar" ? "متنوع" : "varied");
      const joinA = acts.slice(0, 3).join(l === "ar" ? "، " : ", ") || (l === "ar" ? "متنوع" : "varied");
      overview =
        l === "ar"
          ? `جمعنا ذوق ${n} من أعضاء الفريق (مطابخ: ${joinC}؛ أنشطة: ${joinA}) وسألنا Qloo عن أفضل الأماكن المتقاربة مع ذوق المجموعة في ${city}، ثم رشّحناها حسب الميزانية وسياسة الموافقة.`
          : `We merged the tastes of ${n} team members (cuisines: ${joinC}; activities: ${joinA}), asked Qloo which venues in ${city} fit the group, then filtered by budget and approval policy.`;
    }
    return { overview, summaries: plan.options.map((o) => optionSummary(o, plan, l)) };
  }
}

function cityAr(plan: Plan): string {
  return cityProfile(plan.request.city).ar;
}
