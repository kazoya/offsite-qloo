"use client";

import { useState } from "react";
import { DECISION_LABEL, money, renderReason, ruleText, t } from "@/i18n";
import type { Candidate, Lang, Plan } from "@/agent/types";

interface Opt { key: string; label: string }
interface Props {
  lang: Lang;
  cities: (Opt & { currency: string })[];
  cuisines: Opt[];
  activities: Opt[];
  dietary: Opt[];
}
interface MemberForm { name: string; cuisines: string[]; activities: string[]; artists: string; dietary: string[] }

const SAMPLE: MemberForm[] = [
  { name: "Lina", cuisines: ["lebanese", "italian"], activities: ["escape_room", "museum"], artists: "Fairuz", dietary: ["vegetarian"] },
  { name: "Omar", cuisines: ["grill", "middle_eastern"], activities: ["bowling"], artists: "Amr Diab", dietary: ["halal"] },
  { name: "Sara", cuisines: ["japanese", "italian"], activities: ["art_gallery", "tourist"], artists: "", dietary: [] },
];

const toggle = (arr: string[], k: string) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);

function Chips({ options, value, onChange }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o.key} className="chip" aria-pressed={value.includes(o.key)} onClick={() => onChange(toggle(value, o.key))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CandidateView({ c, plan, l }: { c: Candidate; plan: Plan; l: Lang }) {
  const name = l === "ar" ? (c.place.nameAr ?? c.place.nameEn) : c.place.nameEn;
  return (
    <div>
      <h3>
        {t(c.kind, l)}: {name}
      </h3>
      <p className="muted">
        {(l === "ar" ? c.categoryAr : c.categoryEn) ?? ""} · ~{money(c.costPerPerson, plan.currency, l)} {t("perPerson", l)} ({t("estimate", l)})
        {c.place.neighborhood ? ` · ${c.place.neighborhood}` : ""}
      </p>
      <strong>{t("whyQloo", l)}</strong>
      <ul className="why">
        {c.reasons.map((r, i) => (
          <li key={i}>{renderReason(r, l)}</li>
        ))}
      </ul>
    </div>
  );
}

export function Planner({ lang: l, cities, cuisines, activities, dietary }: Props) {
  const [members, setMembers] = useState<MemberForm[]>(SAMPLE);
  const [city, setCity] = useState("Amman");
  const [budget, setBudget] = useState(30);
  const [headcount, setHeadcount] = useState(12);
  const [date, setDate] = useState("2026-11-12");
  const [threshold, setThreshold] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const patch = (i: number, p: Partial<MemberForm>) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const currency = cities.find((c) => c.key === city)?.currency ?? "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          team: members.map((m) => ({ ...m, artists: m.artists.split(/[,،]/).map((s) => s.trim()).filter(Boolean) })),
          city,
          budgetPerPerson: budget,
          headcount,
          date,
          language: l,
          ...(threshold ? { approvalThreshold: Number(threshold) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "error");
      setPlan(json as Plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="card" aria-label={t("plan", l)}>
        <div className="grid">
          <div>
            <label htmlFor="city">{t("city", l)}</label>
            <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
              {cities.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date">{t("date", l)}</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="hc">{t("headcount", l)}</label>
            <input id="hc" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(Number(e.target.value))} required />
          </div>
          <div>
            <label htmlFor="bud">{t("budget", l)} ({currency})</label>
            <input id="bud" type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} required />
          </div>
          <div>
            <label htmlFor="thr">{t("threshold", l)} ({currency})</label>
            <input id="thr" type="number" min={0} placeholder="auto" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
        </div>

        <h2 style={{ marginTop: 18 }}>{t("team", l)}</h2>
        {members.map((m, i) => (
          <div className="member" key={i}>
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
            <Chips options={cuisines} value={m.cuisines} onChange={(v) => patch(i, { cuisines: v })} />
            <label style={{ marginTop: 8 }}>{t("activities", l)}</label>
            <Chips options={activities} value={m.activities} onChange={(v) => patch(i, { activities: v })} />
            <label style={{ marginTop: 8 }}>{t("dietary", l)}</label>
            <Chips options={dietary} value={m.dietary} onChange={(v) => patch(i, { dietary: v })} />
            {members.length > 1 && (
              <button type="button" className="link" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}>
                {t("remove", l)}
              </button>
            )}
          </div>
        ))}
        <div className="row">
          <button type="button" className="chip" onClick={() => setMembers((ms) => [...ms, { name: "", cuisines: [], activities: [], artists: "", dietary: [] }])}>
            + {t("addMember", l)}
          </button>
          <button className="primary" disabled={busy} type="submit">
            {busy ? t("planning", l) : t("plan", l)}
          </button>
        </div>
        {error && <p className="err" role="alert">{t("error", l)}: {error}</p>}
      </form>

      {plan && (
        <section aria-live="polite">
          <div className="card">
            <p>{plan.overview}</p>
            <p className="muted">
              {t("locality", l)}: {plan.locality ?? "?"} · {t("provider", l)}: {plan.provider}
            </p>
            <p className="muted">{t("budgetNote", l)}</p>
            <div className="chips">
              {plan.seeds.map((s, i) => (
                <span className="chip" key={i} title={s.members.join(", ")}>
                  {l === "ar" ? (s.labelAr ?? s.labelEn) : s.labelEn} · {s.members.join(l === "ar" ? "، " : ", ")}
                </span>
              ))}
            </div>
          </div>
          {plan.options.map((o) => (
            <article className="card opt" key={o.rank}>
              <div className="row" style={{ marginTop: 0 }}>
                <h2 style={{ margin: 0 }}>{t("option", l)} {o.rank}</h2>
                <span className={`badge ${o.decision}`}>{DECISION_LABEL[o.decision][l]}</span>
                <span className="muted">
                  ~{money(o.costPerPerson, plan.currency, l)} {t("perPerson", l)} · ~{money(o.costTotal, plan.currency, l)} {t("total", l)} · {t("score", l)} {o.score.toFixed(2)}
                </span>
              </div>
              {o.summary && <p>{o.summary}</p>}
              <div className="pair">
                <CandidateView c={o.dinner} plan={plan} l={l} />
                <CandidateView c={o.activity} plan={plan} l={l} />
              </div>
            </article>
          ))}
          <div className="card">
            <h2>{t("audit", l)}</h2>
            <table>
              <tbody>
                {plan.audit.map((a) => (
                  <tr key={a.seq}>
                    <td>{a.seq}</td>
                    <td>{a.subject}</td>
                    <td>{DECISION_LABEL[a.decision][l]}</td>
                    <td className="muted">{ruleText(a.rule, l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan.warnings.length > 0 && (
            <div className="card">
              <h2>{t("warnings", l)}</h2>
              <ul className="why">
                {plan.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </>
  );
}
