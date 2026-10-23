import type { Lang, Reason, Decision } from "../agent/types";

export const dir = (l: Lang) => (l === "ar" ? "rtl" : "ltr");

export const UI = {
  title: { en: "Offsite Planner", ar: "مخطط الفعاليات المؤسسية" },
  subtitle: {
    en: "Team taste profile from Qloo, filtered by budget and approval policy",
    ar: "ملف ذوق الفريق من Qloo، مفلتر حسب الميزانية وسياسة الموافقة",
  },
  city: { en: "City", ar: "المدينة" },
  date: { en: "Date", ar: "التاريخ" },
  headcount: { en: "Headcount", ar: "عدد الأشخاص" },
  budget: { en: "Budget per person", ar: "الميزانية للشخص" },
  threshold: { en: "Manager approval above (total)", ar: "موافقة المدير فوق (الإجمالي)" },
  team: { en: "Team members", ar: "أعضاء الفريق" },
  name: { en: "Name", ar: "الاسم" },
  cuisines: { en: "Cuisines", ar: "المطابخ" },
  activities: { en: "Activities", ar: "الأنشطة" },
  artists: { en: "Artists (comma separated)", ar: "فنانون (مفصولة بفاصلة)" },
  dietary: { en: "Dietary", ar: "نظام غذائي" },
  addMember: { en: "Add member", ar: "إضافة عضو" },
  remove: { en: "Remove", ar: "حذف" },
  plan: { en: "Plan the offsite", ar: "خطّط الفعالية" },
  planning: { en: "Asking Qloo...", ar: "جارٍ سؤال Qloo..." },
  dinner: { en: "Dinner", ar: "العشاء" },
  activity: { en: "Activity", ar: "النشاط" },
  perPerson: { en: "per person", ar: "للشخص" },
  total: { en: "total", ar: "الإجمالي" },
  estimate: { en: "estimate", ar: "تقدير" },
  option: { en: "Option", ar: "الخيار" },
  whyQloo: { en: "Why Qloo picked this", ar: "لماذا اختار Qloo هذا" },
  audit: { en: "Approval audit log", ar: "سجل التدقيق والموافقات" },
  warnings: { en: "Notes", ar: "ملاحظات" },
  seeds: { en: "Group taste signals sent to Qloo", ar: "إشارات ذوق المجموعة المرسلة إلى Qloo" },
  locality: { en: "Qloo matched location", ar: "الموقع الذي طابقه Qloo" },
  provider: { en: "Narration", ar: "الصياغة" },
  language: { en: "Language", ar: "اللغة" },
  error: { en: "Something went wrong", ar: "حدث خطأ" },
  score: { en: "score", ar: "الدرجة" },
  budgetNote: {
    en: "Costs are our estimates from Qloo price level and city factors, not menu prices.",
    ar: "التكاليف تقديرات منا مبنية على مستوى السعر من Qloo ومعاملات المدينة، وليست أسعار القوائم.",
  },
} satisfies Record<string, Record<Lang, string>>;

export const t = (key: keyof typeof UI, l: Lang): string => UI[key][l];

export const DECISION_LABEL: Record<Decision, Record<Lang, string>> = {
  auto_approved: { en: "Auto-approved", ar: "موافقة تلقائية" },
  needs_manager_approval: { en: "Needs manager approval", ar: "يحتاج موافقة المدير" },
  rejected_over_budget: { en: "Rejected: over budget", ar: "مرفوض: يتجاوز الميزانية" },
};

const list = (names: string[], l: Lang) =>
  names.length <= 1
    ? (names[0] ?? "")
    : l === "ar"
      ? `${names.slice(0, -1).join("، ")} و${names[names.length - 1]}`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const lab = (r: Reason, l: Lang) => (l === "ar" ? (r.labelAr ?? r.labelEn ?? "") : (r.labelEn ?? r.labelAr ?? ""));

/** Deterministic rendering of a structured reason. No LLM involved. */
export function renderReason(r: Reason, l: Lang): string {
  const who = list(r.members ?? [], l);
  const x = lab(r, l);
  const pct = Math.round((r.value ?? 0) * 100);
  switch (r.kind) {
    case "cuisine_match":
      return l === "ar" ? `يطابق اختيار ${who}: ${x}` : `Matches ${who}'s pick: ${x}`;
    case "activity_match":
      return l === "ar" ? `يطابق اختيار ${who}: ${x}` : `Matches ${who}'s pick: ${x}`;
    case "artist_link":
      return l === "ar"
        ? `يعزو Qloo ${pct}% من تطابق هذا المكان إلى فنان ${who} المفضل: ${x}`
        : `Qloo attributes ${pct}% of this match to ${who}'s favourite artist: ${x}`;
    case "team_fit":
      return l === "ar" ? `مناسب لمجموعات العمل بحسب وسوم Qloo: ${x}` : `Fits group/work events per Qloo tags: ${x}`;
    case "affinity":
      return l === "ar"
        ? `درجة التقارب مع ذوق المجموعة عند Qloo: ${pct}% (نسبة إلى باقي المرشحين)`
        : `Qloo taste affinity with the group: ${pct}% (relative to the other candidates)`;
    case "rating":
      return l === "ar" ? `تقييم ${(r.value ?? 0).toFixed(1)} من 5` : `Rated ${(r.value ?? 0).toFixed(1)} out of 5`;
    case "dietary_confirmed":
      return l === "ar" ? `موسوم لدى Qloo بـ: ${x}` : `Tagged by Qloo as: ${x}`;
    case "dietary_unconfirmed":
      return l === "ar"
        ? `لم يُؤكَّد (${x}) في بيانات Qloo، تحقق مع المطعم قبل الحجز`
        : `Not confirmed (${x}) in Qloo data, check with the venue before booking`;
    case "price_known":
      return l === "ar" ? `مستوى السعر عند Qloo: ${x}` : `Qloo price level: ${x}`;
    case "price_assumed":
      return l === "ar"
        ? "لا يوجد مستوى سعر لدى Qloo لهذا المكان؛ استخدمنا تقديراً افتراضياً"
        : "Qloo has no price level for this venue; we used a default estimate";
    case "fallback_category":
      return l === "ar"
        ? `لم يطابق أي نشاط مفضّل مكانًا في هذه المدينة، فاخترنا فئة أوسع: ${x}`
        : `No preferred activity had a venue in this city, so we used a broader category: ${x}`;
  }
}

export const money = (n: number, currency: string, l: Lang) =>
  `${n.toLocaleString(l === "ar" ? "ar-JO-u-nu-latn" : "en-US", { maximumFractionDigits: n < 10 ? 1 : 0 })} ${currency}`;

export const RULE_LABEL: Record<string, Record<Lang, string>> = {
  R1: { en: "Cost per person exceeds the budget per person", ar: "التكلفة للشخص تتجاوز الميزانية للشخص" },
  R2: { en: "Total spend exceeds the manager-approval threshold", ar: "إجمالي الإنفاق يتجاوز حد موافقة المدير" },
  R3: { en: "Within budget and under the approval threshold", ar: "ضمن الميزانية وتحت حد الموافقة" },
};
export const ruleText = (rule: string, l: Lang) => RULE_LABEL[rule.slice(0, 2)]?.[l] ?? rule;
