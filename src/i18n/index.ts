import type { Lang, Reason, Decision } from "../agent/types";
import type { FairnessExplanation, FairnessLabel, OptionFairness } from "../agent/fairness";

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
  startTime: { en: "Start time", ar: "وقت البدء" },
  schedule: { en: "Evening plan", ar: "برنامج الأمسية" },
  estPrice: { en: "Estimated price", ar: "سعر تقديري" },
  actPrice: { en: "Typical price, not from Qloo", ar: "سعر نموذجي، ليس من Qloo" },
  assumedPrice: { en: "Price level missing, assumed mid-range", ar: "مستوى السعر غير متوفر، افترضنا فئة متوسطة" },
  hoursOpen: { en: "Open at this time", ar: "مفتوح في هذا الوقت" },
  hoursUnknown: { en: "Hours unknown", ar: "ساعات العمل غير معروفة" },
  dietUnconfirmed: { en: "Diet unconfirmed", ar: "النظام الغذائي غير مؤكد" },
  fairnessTitle: { en: "Team fairness", ar: "عدالة الاختيار للفريق" },
  noArName: { en: "No Arabic name in Qloo; showing the English name", ar: "لا يوجد اسم عربي في Qloo؛ نعرض الاسم الإنجليزي" },
  noOptionsTitle: { en: "No plan fits yet", ar: "لا توجد خطة مناسبة بعد" },
  noOptionsHint: {
    en: "Try a higher budget per person, fewer dietary limits, another start time, or broader picks.",
    ar: "جرّب ميزانية أعلى للشخص، أو قيودًا غذائية أقل، أو وقت بدء آخر، أو اختيارات أوسع.",
  },
  loadingHint: { en: "Matching the team's taste with Qloo venues...", ar: "نطابق ذوق الفريق مع أماكن Qloo..." },
  retry: { en: "Try again", ar: "حاول مرة أخرى" },
  sendToManager: { en: "Send to manager", ar: "أرسل للمدير" },
  sending: { en: "Sending...", ar: "جارٍ الإرسال..." },
  sent: { en: "Sent for approval", ar: "أُرسلت للموافقة" },
  viewApprovals: { en: "Open approvals", ar: "افتح الموافقات" },
  approvals: { en: "Manager approvals", ar: "موافقات المدير" },
  approvalsSub: {
    en: "Plans whose total spend is above the approval threshold (default 400 USD in local currency).",
    ar: "الخطط التي يتجاوز إجمالي إنفاقها حد الموافقة (الافتراضي 400 دولار بالعملة المحلية).",
  },
  backToPlanner: { en: "Back to planner", ar: "العودة للمخطط" },
  pending: { en: "Pending", ar: "قيد الانتظار" },
  submitted: { en: "Submitted", ar: "أُرسلت" },
  approved: { en: "Approved", ar: "تمت الموافقة" },
  rejected: { en: "Rejected", ar: "مرفوض" },
  all: { en: "All", ar: "الكل" },
  approve: { en: "Approve", ar: "موافقة" },
  reject: { en: "Reject", ar: "رفض" },
  approver: { en: "Your name (approver)", ar: "اسمك (المعتمِد)" },
  note: { en: "Note (required to reject)", ar: "ملاحظة (مطلوبة عند الرفض)" },
  pin: { en: "Manager PIN", ar: "رمز المدير (PIN)" },
  pinHint: { en: "Approving or rejecting needs the demo manager PIN.", ar: "الموافقة أو الرفض تحتاج رمز المدير التجريبي." },
  noApprovals: { en: "Nothing here yet. Send an option that needs approval from the planner.", ar: "لا شيء هنا بعد. أرسل خيارًا يحتاج موافقة من المخطط." },
  thresholdLabel: { en: "threshold", ar: "الحد" },
  requestedBy: { en: "requested by", ar: "طلبها" },
  decidedBy: { en: "decided by", ar: "قرّرها" },
  approvalAudit: { en: "Approval audit trail", ar: "سجل تدقيق الموافقات" },
  people: { en: "people", ar: "أشخاص" },
  loading: { en: "Loading...", ar: "جارٍ التحميل..." },
} satisfies Record<string, Record<Lang, string>>;

export type ErrorCode = "bad_json" | "validation" | "unsupported_city" | "no_key" | "qloo_down" | "qloo_auth" | "internal" | "network";

/** Localised, honest error copy keyed by the API error code. */
export type PinErrorCode = "pin_required" | "pin_invalid" | "approvals_disabled" | "pin_locked";
export const PIN_TEXT: Record<PinErrorCode, Record<Lang, string>> = {
  pin_required: { en: "Enter the manager PIN to approve or reject.", ar: "أدخل رمز المدير للموافقة أو الرفض." },
  pin_invalid: { en: "That PIN is not correct.", ar: "رمز PIN غير صحيح." },
  pin_locked: { en: "Too many wrong PINs. Try again in 10 minutes.", ar: "محاولات خاطئة كثيرة. حاول بعد 10 دقائق." },
  approvals_disabled: {
    en: "Approving and rejecting are turned off on this server because no manager PIN is configured. You can still view the queue.",
    ar: "الموافقة والرفض معطّلان على هذا الخادم لأنه لم يُضبط رمز للمدير. ما زال بإمكانك عرض القائمة.",
  },
};

export const ERROR_TEXT: Record<ErrorCode, Record<Lang, string>> = {
  bad_json: { en: "The request could not be read.", ar: "تعذّرت قراءة الطلب." },
  validation: { en: "Please check the form", ar: "يرجى مراجعة النموذج" },
  unsupported_city: { en: "This city is not supported yet", ar: "هذه المدينة غير مدعومة بعد" },
  no_key: { en: "The server has no Qloo API key configured, so it cannot plan right now.", ar: "لا يوجد مفتاح Qloo على الخادم، لذا لا يمكن التخطيط الآن." },
  qloo_down: { en: "Qloo is not responding right now. Nothing was planned; please try again in a minute.", ar: "Qloo لا يستجيب الآن. لم يتم التخطيط؛ حاول مرة أخرى بعد دقيقة." },
  qloo_auth: { en: "Qloo rejected the server's API key.", ar: "رفض Qloo مفتاح الخادم." },
  internal: { en: "Unexpected server error.", ar: "خطأ غير متوقع في الخادم." },
  network: { en: "Could not reach the server. Check your connection.", ar: "تعذّر الوصول إلى الخادم. تحقق من الاتصال." },
};

/** Arabic rendering of the planner's English notes. Unknown notes are shown as-is (English) rather than guessed. */
const WARNING_AR: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\d+) (?:restaurant was|restaurants were) left out because Qloo opening hours show them closed at the planned time\.$/, (m) => `استبعدنا ${m[1]} من المطاعم لأن ساعات العمل في Qloo تظهر أنها مغلقة في الوقت المخطط.`],
  [/^(\d+) (?:activity venue was|activity venues were) left out because Qloo opening hours show them closed at the planned time\.$/, (m) => `استبعدنا ${m[1]} من أماكن الأنشطة لأن ساعات العمل في Qloo تظهر أنها مغلقة في الوقت المخطط.`],
  [/^(\d+) restaurants? (?:has|have) no Qloo tag for every dietary need; they are kept, ranked lower and labelled "diet unconfirmed"\.$/, (m) => `${m[1]} من المطاعم بلا وسم في Qloo لكل الاحتياجات الغذائية؛ أبقيناها بترتيب أدنى مع علامة "النظام الغذائي غير مؤكد".`],
  [/^Only (\d+) restaurants? fit the budget, so some options share a dinner\.$/, (m) => `${m[1]} مطعم فقط ضمن الميزانية، لذا تتشارك بعض الخيارات نفس العشاء.`],
  [/^(\d+) suggested venue\(s\) have no opening hours in Qloo; confirm before booking\.$/, (m) => `${m[1]} من الأماكن المقترحة بلا ساعات عمل في Qloo؛ تأكد قبل الحجز.`],
  [/^Qloo returned no restaurants for this location\.$/, () => "لم يُرجع Qloo أي مطاعم لهذا الموقع."],
  [/^Qloo returned no activity venues for this location\.$/, () => "لم يُرجع Qloo أي أماكن أنشطة لهذا الموقع."],
  [/^No dinner \+ activity combination fits the budget per person\.$/, () => "لا توجد تركيبة عشاء + نشاط ضمن الميزانية للشخص."],
  [/^Qloo did not report which locality it matched\.$/, () => "لم يحدد Qloo الموقع الذي طابقه."],
  [/^Qloo found no artist named "(.+)"\.$/, (m) => `لم يجد Qloo فنانًا باسم "${m[1]}".`],
  [/^Qloo has no exact artist match for "(.+)" \(closest: "(.+)"\); it was skipped\.$/, (m) => `لا يوجد في Qloo فنان يطابق "${m[1]}" تمامًا (الأقرب: "${m[2]}")؛ تم تجاهله.`],
  [/^Qloo has no venue-graph data for artist "(.+)" \((.+)'s pick\); it did not influence ranking\.$/, (m) => `لا توجد بيانات أماكن في Qloo للفنان "${m[1]}" (اختيار ${m[2]})؛ لم يؤثر على الترتيب.`],
  [/^Unknown (cuisine|activity|dietary need) "(.+)" from (.+) was ignored\.$/, (m) => `تم تجاهل قيمة غير معروفة "${m[2]}" من ${m[3]}.`],
  [/^LLM provider .+ failed .*; used rule-based narration\.$/, () => "تعذّر مزوّد النموذج اللغوي؛ استخدمنا الصياغة القائمة على القواعد."],
];

export function warningText(w: string, l: Lang): string {
  if (l === "en") return w;
  for (const [re, f] of WARNING_AR) {
    const m = w.match(re);
    if (m) return f(m);
  }
  return w;
}

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

export const WEEKDAY_LABEL: Record<number, Record<Lang, string>> = {
  0: { en: "Sunday", ar: "الأحد" },
  1: { en: "Monday", ar: "الاثنين" },
  2: { en: "Tuesday", ar: "الثلاثاء" },
  3: { en: "Wednesday", ar: "الأربعاء" },
  4: { en: "Thursday", ar: "الخميس" },
  5: { en: "Friday", ar: "الجمعة" },
  6: { en: "Saturday", ar: "السبت" },
};

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
    case "hours_open": {
      const day = WEEKDAY_LABEL[r.value ?? -1]?.[l] ?? "";
      const span = lab(r, l).trim();
      return l === "ar"
        ? `مفتوح يوم ${day} خلال ${span} بحسب ساعات العمل في Qloo`
        : `Open on ${day} during ${span} per Qloo opening hours`;
    }
    case "hours_unknown":
      if (r.value === 1) {
        return l === "ar"
          ? "يُظهر Qloo هذا المكان مغلقًا كل أيام الأسبوع، وهذا غالبًا نقص في البيانات؛ تأكد من الدوام قبل الحجز"
          : "Qloo lists this venue as closed every day, which looks like missing data; confirm hours before booking";
      }
      return l === "ar"
        ? "ساعات العمل غير معروفة لدى Qloo، تأكد من الدوام قبل الحجز"
        : "Opening hours unknown in Qloo, confirm before booking";
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
  M1: { en: "Manager approved spend above the threshold", ar: "وافق المدير على إنفاق فوق الحد" },
  M2: { en: "Manager rejected spend above the threshold", ar: "رفض المدير إنفاقًا فوق الحد" },
};
export const ruleText = (rule: string, l: Lang) => RULE_LABEL[rule.slice(0, 2)]?.[l] ?? rule;

export const FAIRNESS_LABEL: Record<FairnessLabel, Record<Lang, string>> = {
  best_fit: { en: "Best fit", ar: "الأنسب" },
  fairest: { en: "Fairest", ar: "الأعدل" },
  cheapest: { en: "Cheapest", ar: "الأرخص" },
};

/** One line per option: whose picks it matches and who it leaves out. */
export function coverageLine(f: OptionFairness, l: Lang): string {
  const hit = f.members.filter((m) => m.score > 0).map((m) => m.name);
  const n = f.members.length;
  const base =
    l === "ar"
      ? `يطابق اختيارات ${hit.length} من ${n}${hit.length ? `: ${list(hit, l)}` : ""}`
      : `Matches the picks of ${hit.length} of ${n}${hit.length ? `: ${list(hit, l)}` : ""}`;
  if (!f.leftOut.length) return base;
  return l === "ar" ? `${base} · لا شيء من اختيارات: ${list(f.leftOut, l)}` : `${base} · Nothing picked by: ${list(f.leftOut, l)}`;
}

/** Why a lower-ranked option is the fairer one (costs are estimates). */
export function fairnessExplanationText(e: FairnessExplanation, currency: string, l: Lang): string {
  const d = e.costDeltaPerPerson;
  const cost =
    Math.abs(d) < 0.005
      ? l === "ar" ? "بنفس التكلفة التقديرية للشخص" : "at the same estimated cost per person"
      : l === "ar"
        ? `بتكلفة تقديرية ${d > 0 ? "أعلى" : "أقل"} بنحو ${money(Math.abs(d), currency, l)} للشخص`
        : `for about ${money(Math.abs(d), currency, l)} ${d > 0 ? "more" : "less"} per person (estimate)`;
  if (l === "ar") {
    const gains = e.gains.length
      ? `يشمل أيضًا ${list(e.gains, l)} ممن لا يطابق الخيار ${e.bestRank} أي شيء من اختياراتهم، `
      : "يوزّع اختيارات الفريق بشكل أعدل، ";
    const losses = e.losses.length ? ` لكنه لا يطابق اختيارات ${list(e.losses, l)}.` : "";
    return `الخيار ${e.fairerRank} أعدل من الخيار ${e.bestRank}: ${gains}${cost}، ودرجته أقل بـ ${e.scoreGap.toFixed(2)}.${losses}`;
  }
  const gains = e.gains.length
    ? `it also matches ${list(e.gains, l)}, who get${e.gains.length === 1 ? "s" : ""} none of their picks in option ${e.bestRank}, `
    : "it spreads the team's picks more evenly, ";
  const losses = e.losses.length ? ` It does leave out ${list(e.losses, l)}.` : "";
  return `Option ${e.fairerRank} is fairer than option ${e.bestRank}: ${gains}${cost}, with a ${e.scoreGap.toFixed(2)} lower score.${losses}`;
}

export function alwaysLeftOutText(names: string[], l: Lang): string {
  return l === "ar"
    ? `لا يطابق أي خيار اختيارات: ${list(names, l)}. جرّب إضافة مطبخ أو نشاط آخر لهم.`
    : `No option matches the picks of: ${list(names, l)}. Try adding another cuisine or activity for them.`;
}
