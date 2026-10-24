"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { alwaysLeftOutText, coverageLine, DECISION_LABEL, ERROR_TEXT, FAIRNESS_LABEL, fairnessExplanationText, money, renderReason, ruleText, t, warningText, WEEKDAY_LABEL, type ErrorCode } from "@/i18n";
import type { Candidate, Feedback, Lang, Plan, PlanOption } from "@/agent/types";
import type { AgentReport } from "@/agent/loop";
import { diffPlans } from "@/agent/diff";
import { DEMO_COMPANY } from "@/demo/company";
import { d } from "@/i18n/demo";
import { DecisionLog, DemoBanner, DemoSteps, DiffView, FairnessMeter, feedbackLabel, ManagerReject, ScoreBreakdownView } from "./DemoParts";
import { WEEKDAYS } from "@/agent/hours";

interface Opt { key: string; label: string }
interface Props {
  lang: Lang;
  cities: (Opt & { currency: string })[];
  unsupported: (Opt & { reason: string })[];
  cuisines: Opt[];
  activities: Opt[];
  dietary: Opt[];
}
interface MemberForm { name: string; cuisines: string[]; activities: string[]; artists: string; dietary: string[] }
interface UiError { code: ErrorCode; detail?: string }
type AgentPlanView = Plan & { agent?: AgentReport };
type SendState = { state: "sending" } | { state: "sent" } | { state: "error"; msg: string };

const SAMPLE: MemberForm[] = [
  { name: "Lina", cuisines: ["lebanese", "italian"], activities: ["escape_room", "museum"], artists: "Fairuz", dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["grill", "middle_eastern"], activities: ["bowling"], artists: "Amr Diab", dietary: ["halal"] },
  { name: "Sara", cuisines: ["japanese", "italian"], activities: ["art_gallery", "tourist"], artists: "", dietary: [] },
];

const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
const UNSUPPORTED_PREFIX = "unsupported:";

function Chips({ options, value, onChange, label }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.key} className="chip" aria-pressed={value.includes(o.key)} onClick={() => onChange(toggle(value, o.key))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function weekdayLabel(en: string | undefined, l: Lang) {
  const i = WEEKDAYS.indexOf((en ?? "").toLowerCase() as (typeof WEEKDAYS)[number]);
  return i >= 0 ? WEEKDAY_LABEL[i]![l] : (en ?? "");
}

function CandidateView({ c, plan, l, onReject, busy }: { c: Candidate; plan: Plan; l: Lang; onReject?: () => void; busy?: boolean }) {
  const missingAr = l === "ar" && !c.place.nameAr;
  const name = l === "ar" ? (c.place.nameAr ?? c.place.nameEn) : c.place.nameEn;
  return (
    <div className="cand">
      <p className="kind">{t(c.kind, l)}</p>
      <h3>
        <bdi>{name}</bdi>
      </h3>
      {missingAr && <p className="note">{t("noArName", l)}</p>}
      <p className="muted">
        {(l === "ar" ? c.categoryAr : c.categoryEn) ?? ""} · ~{money(c.costPerPerson, plan.currency, l)} {t("perPerson", l)}
        {c.place.neighborhood ? <> · <bdi>{c.place.neighborhood}</bdi></> : null}
      </p>
      <div className="tags">
        {c.kind === "activity" ? (
          <span className="tag warn" title={t("budgetNote", l)}>{t("actPrice", l)}</span>
        ) : c.costIsAssumed ? (
          <span className="tag warn">{t("assumedPrice", l)}</span>
        ) : (
          <span className="tag" title={t("budgetNote", l)}>{t("estPrice", l)}</span>
        )}
        {c.hours?.status === "open" && (
          <span className="tag ok">
            {t("hoursOpen", l)}
            {c.hours.dayHours?.length ? <> · <bdi dir="ltr">{c.hours.dayHours.join(", ")}</bdi></> : null}
          </span>
        )}
        {c.hours?.status === "unknown" && <span className="tag warn">{t("hoursUnknown", l)}</span>}
        {c.dietaryUnconfirmed.length > 0 && <span className="tag warn">{t("dietUnconfirmed", l)}</span>}
      </div>
      <details>
        <summary>{t("whyQloo", l)}</summary>
        <ul className="why">
          {c.reasons.map((r, i) => (
            <li key={i}>{renderReason(r, l)}</li>
          ))}
        </ul>
        <ScoreBreakdownView c={c} l={l} />
      </details>
      {onReject && (
        <button type="button" className="chip dangerchip small" disabled={busy} onClick={onReject}>
          ✕ {d("rejectVenue", l)}
        </button>
      )}
    </div>
  );
}

function Skeleton({ l }: { l: Lang }) {
  return (
    <section aria-busy="true" aria-live="polite">
      <p className="muted loading">
        <span className="spinner" aria-hidden="true" /> {t("loadingHint", l)}
      </p>
      {[0, 1, 2].map((i) => (
        <div className="card opt skel" key={i} aria-hidden="true">
          <div className="bar w40" />
          <div className="pair">
            <div><div className="bar w70" /><div className="bar w50" /><div className="bar w90" /></div>
            <div><div className="bar w70" /><div className="bar w50" /><div className="bar w90" /></div>
          </div>
        </div>
      ))}
    </section>
  );
}

export function Planner({ lang: l, cities, unsupported, cuisines, activities, dietary }: Props) {
  const [members, setMembers] = useState<MemberForm[]>(SAMPLE);
  const [city, setCity] = useState("Amman");
  const [budget, setBudget] = useState(30);
  const [headcount, setHeadcount] = useState(12);
  const [date, setDate] = useState("2026-11-12");
  const [startTime, setStartTime] = useState("18:00");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [plan, setPlan] = useState<AgentPlanView | null>(null);
  const [sends, setSends] = useState<Record<number, SendState>>({});
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [lastBody, setLastBody] = useState<Record<string, unknown> | null>(null);
  const [prevPlan, setPrevPlan] = useState<AgentPlanView | null>(null);
  const [replanBusy, setReplanBusy] = useState(false);
  const [newBudget, setNewBudget] = useState("");
  const [unfairTo, setUnfairTo] = useState("");
  const [opened, setOpened] = useState(false);

  const patch = (i: number, p: Partial<MemberForm>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const unsupportedPick = city.startsWith(UNSUPPORTED_PREFIX) ? unsupported.find((u) => UNSUPPORTED_PREFIX + u.key === city) : undefined;
  const currency = cities.find((c) => c.key === city)?.currency ?? "";

  function loadDemo() {
    setMembers(DEMO_COMPANY.members.map((m) => ({ ...m, cuisines: [...m.cuisines], activities: [...m.activities], dietary: [...m.dietary] })));
    setCity(DEMO_COMPANY.city);
    setBudget(DEMO_COMPANY.budgetPerPerson);
    setHeadcount(DEMO_COMPANY.headcount);
    setDate(DEMO_COMPANY.date);
    setStartTime(DEMO_COMPANY.startTime);
    setThreshold("");
    setDemoLoaded(true);
    setShowMembers(false);
  }

  /** POST the base request with the feedback so far. A replan keeps the current plan visible until the new one arrives. */
  async function run(body: Record<string, unknown>, fb: Feedback[]) {
    const replan = fb.length > 0 && !!plan;
    if (replan) setReplanBusy(true);
    else {
      setBusy(true);
      setPlan(null);
      setPrevPlan(null);
    }
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fb.length ? { ...body, feedback: fb } : body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = (json.code as ErrorCode | undefined) ?? "internal";
        setError({ code, detail: code === "validation" ? json.error : undefined });
        return;
      }
      setPrevPlan(replan ? plan : null);
      setPlan(json as AgentPlanView);
      setFeedback(fb);
      setSends({});
    } catch {
      setError({ code: "network" });
    } finally {
      setBusy(false);
      setReplanBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (unsupportedPick) return;
    const body = {
      team: members.map((m) => ({ ...m, artists: m.artists.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })),
      city,
      budgetPerPerson: budget,
      headcount,
      date,
      startTime,
      language: l,
      ...(threshold ? { approvalThreshold: Number(threshold) } : {}),
    };
    setLastBody(body);
    setFeedback([]);
    await run(body, []);
  }

  /** Add one feedback item (a new budget replaces an earlier one) and replan. */
  function giveFeedback(fb: Feedback) {
    if (!lastBody) return;
    const rest = fb.type === "budget" ? feedback.filter((x) => x.type !== "budget") : feedback;
    void run(lastBody, [...rest, fb]);
  }

  const venueNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of [prevPlan, plan]) for (const o of p?.options ?? []) for (const c of [o.dinner, o.activity]) m.set(c.place.entityId, l === "ar" ? (c.place.nameAr ?? c.place.nameEn) : c.place.nameEn);
    return m;
  }, [plan, prevPlan, l]);
  const diff = useMemo(() => (plan && prevPlan ? diffPlans(prevPlan, plan) : null), [plan, prevPlan]);
  const demoStep = !demoLoaded && !plan ? 0 : !plan ? 1 : !opened ? 2 : feedback.length === 0 ? 4 : 6;

  async function sendToManager(p: Plan, o: PlanOption) {
    setSends((s) => ({ ...s, [o.rank]: { state: "sending" } }));
    const subject = `${o.dinner.place.nameEn} + ${o.activity.place.nameEn}`;
    const thr = p.request.approvalThreshold ?? Number(p.audit.find((a) => a.subject === subject)?.detail.approvalThreshold);
    const ref = (c: Candidate) => ({ entityId: c.place.entityId, nameEn: c.place.nameEn, ...(c.place.nameAr ? { nameAr: c.place.nameAr } : {}) });
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          city: p.request.city,
          date: p.request.date,
          startTime: p.request.startTime,
          headcount: p.request.headcount,
          costPerPerson: o.costPerPerson,
          budgetPerPerson: p.request.budgetPerPerson,
          approvalThreshold: thr,
          dinner: ref(o.dinner),
          activity: ref(o.activity),
          requestedBy: members[0]?.name || "planner",
        }),
      });
      const json = await res.json().catch(() => ({}));
      setSends((s) => ({ ...s, [o.rank]: res.ok ? { state: "sent" } : { state: "error", msg: json.code && json.code in ERROR_TEXT ? ERROR_TEXT[json.code as ErrorCode][l] : (json.error ?? String(res.status)) } }));
    } catch {
      setSends((s) => ({ ...s, [o.rank]: { state: "error", msg: ERROR_TEXT.network[l] } }));
    }
  }

  return (
    <>
      <DemoBanner l={l} />
      <DemoSteps l={l} at={demoStep} />
      <form onSubmit={submit} className="card" aria-label={t("plan", l)}>
        <div className="row demorow">
          <button type="button" className="primary demo" onClick={loadDemo}>
            {d("loadDemo", l)}
          </button>
          {demoLoaded && (
            <span className="muted">
              ✓ {d("demoLoaded", l)}: <bdi>{l === "ar" ? DEMO_COMPANY.nameAr : DEMO_COMPANY.nameEn}</bdi> · {d("synthetic", l)}
            </span>
          )}
        </div>
        <div className="grid">
          <div>
            <label htmlFor="city">{t("city", l)}</label>
            <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
              {unsupported.map((u) => (
                <option key={u.key} value={UNSUPPORTED_PREFIX + u.key}>{u.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date">{t("date", l)}</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="start">{t("startTime", l)}</label>
            <input id="start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="hc">{t("headcount", l)}</label>
            <input id="hc" type="number" inputMode="numeric" min={1} max={1000} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} required />
          </div>
          <div>
            <label htmlFor="bud">{t("budget", l)} {currency && `(${currency})`}</label>
            <input id="bud" type="number" inputMode="decimal" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} required />
          </div>
          <div>
            <label htmlFor="thr">{t("threshold", l)} {currency && `(${currency})`}</label>
            <input id="thr" type="number" inputMode="decimal" min={0} placeholder={l === "ar" ? "تلقائي (400$)" : "auto (400 USD)"} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
        </div>
        {unsupportedPick && (
          <p className="notice" role="status">
            <strong>{ERROR_TEXT.unsupported_city[l]}:</strong> {unsupportedPick.reason}
          </p>
        )}

        <h2 style={{ marginTop: 18 }}>
          {t("team", l)} <span className="muted">({members.length})</span>
        </h2>
        {!showMembers && (
          <div className="teamsummary">
            {members.map((m, i) => (
              <span className="chip static" key={i}>
                <bdi>{m.name}</bdi>
                <span className="muted">
                  {" "}· {[...m.cuisines, ...m.activities].map((k) => cuisines.find((c) => c.key === k)?.label ?? activities.find((a) => a.key === k)?.label ?? k).join(l === "ar" ? "، " : ", ")}
                  {m.dietary.length ? ` · ${m.dietary.map((k) => dietary.find((x) => x.key === k)?.label ?? k).join(", ")}` : ""}
                </span>
              </span>
            ))}
            <button type="button" className="link" onClick={() => setShowMembers(true)}>{d("editMembers", l)}</button>
          </div>
        )}
        {showMembers && demoLoaded && (
          <button type="button" className="link" onClick={() => setShowMembers(false)}>{d("hideMembers", l)}</button>
        )}
        {showMembers && members.map((m, i) => (
          <fieldset className="member" key={i}>
            <legend className="sr">{m.name || `${t("name", l)} ${i + 1}`}</legend>
            <div className="grid">
              <div>
                <label htmlFor={`n${i}`}>{t("name", l)}</label>
                <input id={`n${i}`} value={m.name} onChange={(e) => patch(i, { name: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`a${i}`}>{t("artists", l)}</label>
                <input id={`a${i}`} value={m.artists} onChange={(e) => patch(i, { artists: e.target.value })} />
              </div>
            </div>
            <label>{t("cuisines", l)}</label>
            <Chips label={t("cuisines", l)} options={cuisines} value={m.cuisines} onChange={(v) => patch(i, { cuisines: v })} />
            <label style={{ marginTop: 8 }}>{t("activities", l)}</label>
            <Chips label={t("activities", l)} options={activities} value={m.activities} onChange={(v) => patch(i, { activities: v })} />
            <label style={{ marginTop: 8 }}>{t("dietary", l)}</label>
            <Chips label={t("dietary", l)} options={dietary} value={m.dietary} onChange={(v) => patch(i, { dietary: v })} />
            {members.length > 1 && (
              <button type="button" className="link" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}>
                {t("remove", l)}
              </button>
            )}
          </fieldset>
        ))}
        <div className="row">
          <button type="button" className="chip" onClick={() => { setShowMembers(true); setMembers((ms) => [...ms, { name: "", cuisines: [], activities: [], artists: "", dietary: [] }]); }}>
            + {t("addMember", l)}
          </button>
          <button className="primary" disabled={busy || !!unsupportedPick} type="submit">
            {busy ? t("planning", l) : t("plan", l)}
          </button>
        </div>
      </form>

      {error && (
        <div className="card errcard" role="alert">
          <h2>{t("error", l)}</h2>
          <p>
            {ERROR_TEXT[error.code]?.[l] ?? ERROR_TEXT.internal[l]}
            {error.detail ? <>: <bdi dir="ltr">{error.detail}</bdi></> : null}
          </p>
          {(error.code === "qloo_down" || error.code === "network") && (
            <button type="button" className="chip" onClick={() => (lastBody ? void run(lastBody, feedback) : undefined)}>{t("retry", l)}</button>
          )}
        </div>
      )}

      {busy && <Skeleton l={l} />}

      {plan && !busy && (
        <section aria-live="polite" onToggle={() => setOpened(true)} onClickCapture={(e) => { if ((e.target as HTMLElement).closest("summary")) setOpened(true); }}>
          {diff && <DiffView diff={diff} l={l} currency={plan.currency} qloo={plan.agent?.qloo} />}
          <div className="card">
            <p>{plan.overview}</p>
            {plan.schedule && (
              <p className="sched">
                <strong>{t("schedule", l)}:</strong> {weekdayLabel(plan.schedule.weekday, l)} · {t("activity", l)}{" "}
                <bdi dir="ltr">{plan.schedule.activity.from}–{plan.schedule.activity.to}</bdi> · {t("dinner", l)}{" "}
                <bdi dir="ltr">{plan.schedule.dinner.from}–{plan.schedule.dinner.to}</bdi>
              </p>
            )}
            <p className="muted">
              {t("locality", l)}: <bdi>{plan.locality ?? "?"}</bdi> · {t("provider", l)}: {plan.provider}
            </p>
            <p className="muted">{t("budgetNote", l)}</p>
            <div className="chips">
              {plan.seeds.map((s, i) => (
                <span className="chip static" key={i} title={s.members.join(", ")}>
                  {l === "ar" ? (s.labelAr ?? s.labelEn) : s.labelEn} · {s.members.join(l === "ar" ? "، " : ", ")}
                </span>
              ))}
            </div>
          </div>

          {plan.options.length === 0 && (
            <div className="card empty" role="status">
              <h2>{t("noOptionsTitle", l)}</h2>
              <p className="muted">{t("noOptionsHint", l)}</p>
            </div>
          )}

          {plan.fairness && (plan.fairness.explanation || plan.fairness.alwaysLeftOut.length > 0) && (
            <div className="card fairness" role="note">
              <h2>{plan.fairness.explanation ? d("whySuits", l, { n: plan.fairness.explanation.fairerRank }) : t("fairnessTitle", l)}</h2>
              {plan.fairness.explanation && <p>{fairnessExplanationText(plan.fairness.explanation, plan.currency, l)}</p>}
              {plan.fairness.alwaysLeftOut.length > 0 && <p className="muted">{alwaysLeftOutText(plan.fairness.alwaysLeftOut, l)}</p>}
            </div>
          )}

          {plan.options.map((o) => {
            const s = sends[o.rank];
            const f = plan.fairness?.options.find((x) => x.rank === o.rank);
            return (
              <article className={`card opt ${o.decision}`} key={o.rank}>
                <div className="opthead">
                  <h2>{t("option", l)} {o.rank}</h2>
                  <span className={`badge ${o.decision}`}>{DECISION_LABEL[o.decision][l]}</span>
                  {f?.labels.map((lb) => (
                    <span className={`tag fair ${lb}`} key={lb}>{FAIRNESS_LABEL[lb][l]}</span>
                  ))}
                  <span className="muted cost">
                    ~{money(o.costPerPerson, plan.currency, l)} {t("perPerson", l)} · ~{money(o.costTotal, plan.currency, l)} {t("total", l)} · {t("score", l)} {o.score.toFixed(2)}
                  </span>
                </div>
                {o.summary && <p>{o.summary}</p>}
                {f && <FairnessMeter f={f} l={l} />}
                {f && <p className="muted coverage">{coverageLine(f, l)}</p>}
                <div className="pair">
                  <CandidateView c={o.activity} plan={plan} l={l} busy={replanBusy} onReject={() => giveFeedback({ type: "reject_venue", entityId: o.activity.place.entityId })} />
                  <CandidateView c={o.dinner} plan={plan} l={l} busy={replanBusy} onReject={() => giveFeedback({ type: "reject_venue", entityId: o.dinner.place.entityId })} />
                </div>
                <div className="row">
                  <ManagerReject
                    key={`${o.dinner.place.entityId}|${o.activity.place.entityId}`}
                    l={l}
                    busy={replanBusy}
                    onReject={(reason) => giveFeedback({ type: "manager_reject", dinnerId: o.dinner.place.entityId, activityId: o.activity.place.entityId, reason })}
                  />
                </div>
                {o.decision === "needs_manager_approval" && (
                  <div className="row">
                    {s?.state === "sent" ? (
                      <>
                        <span className="tag ok">{t("sent", l)}</span>
                        <Link href={`/${l}/approvals`}>{t("viewApprovals", l)}</Link>
                      </>
                    ) : (
                      <button type="button" className="primary" disabled={s?.state === "sending"} onClick={() => sendToManager(plan, o)}>
                        {s?.state === "sending" ? t("sending", l) : t("sendToManager", l)}
                      </button>
                    )}
                    {s?.state === "error" && <span className="err" role="alert">{s.msg}</span>}
                  </div>
                )}
              </article>
            );
          })}

          {lastBody && (
            <div className="card feedbackbar">
              <h2>{d("feedback", l)}</h2>
              <p className="muted">{d("feedbackHint", l)}</p>
              <div className="fbgrid">
                <div>
                  <label htmlFor="fb-budget">{d("newBudget", l)} {plan.currency && `(${plan.currency})`}</label>
                  <div className="row">
                    <input id="fb-budget" type="number" inputMode="decimal" min={1} placeholder={String(plan.request.budgetPerPerson)} value={newBudget} onChange={(e) => setNewBudget(e.target.value)} />
                    <button type="button" className="chip" disabled={replanBusy || !(Number(newBudget) > 0)} onClick={() => giveFeedback({ type: "budget", budgetPerPerson: Number(newBudget) })}>
                      {d("applyBudget", l)}
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor="fb-unfair">{d("notFairTo", l)}</label>
                  <div className="row">
                    <select id="fb-unfair" value={unfairTo} onChange={(e) => setUnfairTo(e.target.value)}>
                      <option value="">—</option>
                      {plan.request.team.map((m) => (
                        <option key={m.name} value={m.name}>{m.name}{plan.fairness?.options[0]?.leftOut.includes(m.name) ? " ⚠" : ""}</option>
                      ))}
                    </select>
                    <button type="button" className="chip" disabled={replanBusy || !unfairTo} onClick={() => giveFeedback({ type: "not_fair", member: unfairTo })}>
                      {d("markNotFair", l)}
                    </button>
                  </div>
                </div>
              </div>
              {replanBusy && (
                <p className="muted loading" role="status"><span className="spinner" aria-hidden="true" /> {d("replanning", l)}</p>
              )}
              {feedback.length > 0 && (
                <div className="fbsofar">
                  <p className="kind">{d("feedbackSoFar", l)}</p>
                  <div className="chips">
                    {feedback.map((fb, i) => (
                      <span className="chip static" key={i}>{feedbackLabel(fb, l, (id) => venueNames.get(id) ?? id, plan.currency)}</span>
                    ))}
                  </div>
                  <button type="button" className="link" disabled={replanBusy} onClick={() => { setPrevPlan(null); void run(lastBody, []); setFeedback([]); }}>
                    {d("startOver", l)}
                  </button>
                </div>
              )}
            </div>
          )}

          {plan.agent && <DecisionLog agent={plan.agent} l={l} />}

          {plan.warnings.length > 0 && (
            <div className="card">
              <h2>{t("warnings", l)}</h2>
              <ul className="why">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{warningText(w, l)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <h2>{t("audit", l)}</h2>
            <div className="tablewrap">
              <table>
                <tbody>
                  {plan.audit.map((a) => (
                    <tr key={a.seq}>
                      <td>{a.seq}</td>
                      <td><bdi>{a.subject}</bdi></td>
                      <td>{DECISION_LABEL[a.decision][l]}</td>
                      <td className="muted">{ruleText(a.rule, l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
