/**
 * Arabic rendering of the agent's decision log and feedback checks. The server writes English text; every entry also
 * carries the structured facts it was built from (`inputs`, check `code`/`values`), so the AR UI re-renders the same
 * template in Arabic. Venue names, member names and free-text reasons typed by a person are shown as given.
 */
import { cityProfile } from "../connectors/qloo/catalog";
import type { CheckCode, DecisionLogEntry, FeedbackCheck } from "../agent/loop";
import type { Feedback, Lang } from "../agent/types";

const list = (xs: unknown) => (Array.isArray(xs) ? (xs as string[]).join(" و") : "");
const num = (x: unknown) => Number(x ?? 0);
const cityAr = (x: unknown) => cityProfile(String(x ?? "")).ar;

const FEEDBACK_AR: Record<Feedback["type"], string> = {
  budget: "تغيير الميزانية",
  reject_venue: "رفض مكان",
  not_fair: "غير منصف لعضو",
  manager_reject: "رفض المدير",
};

/** Arabic decision + reason for one log entry, from its own inputs. */
export function logTextAr(e: Pick<DecisionLogEntry, "step" | "inputs">, feedback: Feedback[] = []): { decision: string; reason: string } {
  const f = e.inputs;
  switch (e.step) {
    case "understand":
      return {
        decision: `تخطيط أمسية واحدة لـ ${f.headcount} أشخاص في ${cityAr(f.city)} بتاريخ ${f.date} بميزانية ${f.budgetPerPerson} للشخص.`,
        reason: `المجموع فوق ${f.approvalThreshold} يحتاج موافقة المدير (R2)؛ الوكيل يقترح فقط ولا يحجز ولا يدفع.`,
      };
    case "qloo_queries":
      return {
        decision: `جلب ${f.restaurantsFromQloo} مطعماً و${f.activityVenuesFromQloo} مكان نشاط من Qloo.`,
        reason: `تمت مطابقة ${f.artistsResolved} فنان بالاسم الدقيق؛ ${f.activityFallbackUsed ? "الأنشطة المصوّت لها قليلة، فأضيفت مجموعة احتياطية آمنة" : "الأنشطة جاءت من تصويت الفريق"}.`,
      };
    case "rank":
      return {
        decision: `ترتيب ${f.restaurantsScored} مطعماً و${f.activityVenuesScored} نشاطاً${f.topRestaurant ? `؛ المطعم الأول "${f.topRestaurant}"` : ""}.`,
        reason:
          num(f.excludedByFeedback) > 0
            ? `استُبعد ${f.excludedByFeedback} مكان لأن الفريق رفضه؛ والباقي مرتب حسب ملاءمة Qloo وتغطية الأعضاء وملاءمة الفريق والتقييم.`
            : "الترتيب حسب ملاءمة Qloo وتغطية الأعضاء وملاءمة الفريق والتقييم.",
      };
    case "budget_time_check":
      return {
        decision: `${f.combosWithinBudget} من ${f.combosConsidered} تركيبة عشاء ونشاط ضمن ${f.budgetPerPerson} للشخص.`,
        reason: `استُبعد ${num(f.restaurantsClosed) + num(f.activityVenuesClosed)} مكان مغلق في الوقت المخطط؛ وبقي ${f.dietUnconfirmed} مطعم مع وسم "النظام الغذائي غير مؤكد".`,
      };
    case "propose": {
      const prio = list(f.prioritizedMembers);
      return {
        decision: `اقتراح ${f.options} خيار باستخدام ${f.distinctRestaurants} مطعم مختلف.`,
        reason: prio
          ? f.prioritizedCovered
            ? `رُتّبت الخيارات التي تشمل ${prio} أولاً كما طلبت الملاحظات.`
            : `لا يوجد خيار ضمن الميزانية يشمل ${prio}؛ فرُتّبت حسب النتيجة مع التصريح بذلك.`
          : "اختيار أعلى التركيبات المتنوعة نتيجةً ضمن الميزانية.",
      };
    }
    case "explain": {
      const out = list(f.bestFitLeavesOut);
      return {
        decision: `كتابة ${f.summaries} ملخصات للخيارات ${f.provider === "rule-based" ? "بالقواعد (دون نموذج لغوي)" : `بواسطة الراوي ${f.provider}`}.`,
        reason: out
          ? `فحص الإنصاف: الخيار الأنسب يستثني ${out}؛ والخيار ${f.fairestRank} هو الأكثر إنصافاً.`
          : "فحص الإنصاف: الخيار الأنسب يشمل كل من لديه تفضيل.",
      };
    }
    case "approval_gate":
      return {
        decision: num(f.awaitingHuman)
          ? `${f.awaitingHuman} خيار بانتظار المدير (R2)؛ والباقي اقتراحات فقط.`
          : "كل الخيارات اقتراحات ضمن السياسة؛ لم يُحجز أو يُدفع شيء.",
        reason: "الوكيل لا يحجز ولا يدفع أبداً؛ يرسل شخصٌ الخيار للموافقة ويقرر المدير إنفاق R2.",
      };
    case "apply_feedback":
      return {
        decision: "إعادة التخطيط بملاحظات الفريق كقيود ملزمة.",
        reason: feedback.map((x) => (x.reason ? `${FEEDBACK_AR[x.type]}: ${x.reason}` : FEEDBACK_AR[x.type])).join("؛ "),
      };
    case "verify_feedback":
      return {
        decision: `تحقق ${f.satisfied} من ${f.checks} ملاحظة؛ ${f.changed ? "تغيّرت الخطة" : "لم تتغيّر الخطة"}.`,
        reason: num(f.satisfied) === num(f.checks) ? "نُفّذ كل طلب ضمن السياسة." : "الطلبات غير المنفذة تُعرض كما هي ولا تُخفى.",
      };
  }
}

const CHECK_AR: Record<CheckCode, (c: FeedbackCheck) => string> = {
  budget_no_option: (c) => `لا يوجد خيار ضمن ${c.feedback.type === "budget" ? c.feedback.budgetPerPerson : ""} للشخص.`,
  budget: (c) => `أرخص خيار ${c.values?.before} ← ${c.values?.now} للشخص؛ ${c.values?.over ?? 0} خيار فوق الميزانية الجديدة.`,
  venue_gone: () => "المكان المرفوض لم يعد في أي خيار.",
  venue_still: (c) => `ما زال في ${c.values?.still ?? 0} خيار.`,
  pair_gone: () => "التركيبة المرفوضة لم تُقترح مجدداً.",
  pair_still: () => "التركيبة المرفوضة ما زالت مقترحة.",
  member_top: (c) => `الخيار 1 يشمل الآن شيئاً اختاره ${c.feedback.type === "not_fair" ? c.feedback.member : ""}.`,
  member_lower: (c) => `خيار أدنى ترتيباً فقط يشمل ${c.feedback.type === "not_fair" ? c.feedback.member : ""}.`,
  member_none: (c) => `لا يوجد خيار ضمن الميزانية يشمل اختيارات ${c.feedback.type === "not_fair" ? c.feedback.member : ""}.`,
};

export function checkText(c: FeedbackCheck, l: Lang): string {
  return l === "ar" && c.code ? CHECK_AR[c.code](c) : c.detail;
}

export function logText(e: DecisionLogEntry, l: Lang, feedback: Feedback[] = []): { decision: string; reason: string } {
  return l === "ar" ? logTextAr(e, feedback) : { decision: e.decision, reason: e.reason };
}
