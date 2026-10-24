"use client";

import { useState } from "react";
import { money } from "@/i18n";
import { CHANGE_LABEL, d, STEP_LABEL } from "@/i18n/demo";
import type { Candidate, Feedback, Lang } from "@/agent/types";
import type { OptionFairness } from "@/agent/fairness";
import type { AgentReport } from "@/agent/loop";
import type { OptionSide, PlanDiff } from "@/agent/diff";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const names = (xs: string[], l: Lang) => xs.join(l === "ar" ? "، " : ", ");
const venueName = (v: { nameEn: string; nameAr?: string }, l: Lang) => (l === "ar" ? (v.nameAr ?? v.nameEn) : v.nameEn);

export function DemoBanner({ l, text }: { l: Lang; text?: string }) {
  return (
    <p className="demobanner" role="note">
      <span className="badge demo">DEMO</span> {text ?? d("banner", l)}
    </p>
  );
}

export function DemoSteps({ l, at }: { l: Lang; at: number }) {
  const steps = ["step1", "step2", "step3", "step4", "step5", "step6", "step7"] as const;
  return (
    <ol className="demosteps" aria-label={d("steps", l)}>
      {steps.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="n">{i + 1}</span> {d(s, l)}
        </li>
      ))}
    </ol>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="meterbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <span style={{ width: `${Math.max(2, Math.round(value * 100))}%` }} />
    </div>
  );
}

/** Team average, lowest member, coverage N/M and who is left out, plus one dot per member. */
export function FairnessMeter({ f, l }: { f: OptionFairness; l: Lang }) {
  const covered = f.members.filter((m) => m.score > 0).length;
  return (
    <div className="meter" aria-label={d("meter", l)}>
      <div className="meterrow">
        <span>{d("teamAvg", l)}</span>
        <Bar value={f.mean} label={d("teamAvg", l)} />
        <b>{pct(f.mean)}</b>
      </div>
      <div className="meterrow">
        <span>{d("lowest", l)}</span>
        <Bar value={f.min} label={d("lowest", l)} />
        <b>{pct(f.min)}</b>
      </div>
      <div className="meterfoot">
        <span>
          {d("coverage", l)}: <b dir="ltr">{covered}/{f.members.length}</b>
        </span>
        <span className="dots" aria-hidden="true">
          {f.members.map((m) => (
            <i key={m.name} title={`${m.name}: ${pct(m.score)}`} className={m.score === 0 ? "zero" : m.score >= 0.5 ? "high" : "mid"} />
          ))}
        </span>
        <span className={f.leftOut.length ? "warntext" : "muted"}>
          {d("leftOut", l)}: {f.leftOut.length ? <bdi>{names(f.leftOut, l)}</bdi> : d("nobody", l)}
        </span>
      </div>
    </div>
  );
}

/** Expandable numbers behind a venue's score: Qloo affinity, matched members, rating, group-fit tags. */
export function ScoreBreakdownView({ c, l }: { c: Candidate; l: Lang }) {
  const s = c.score;
  const rows: [string, number][] = [
    [d("affinity", l), s.qlooAffinity],
    [d("memberCoverage", l), s.memberCoverage],
    [d("rating", l), s.rating],
    [d("teamFit", l), s.teamFit],
  ];
  return (
    <div className="breakdown">
      <p className="kind">{d("breakdown", l)}</p>
      {rows.map(([k, v]) => (
        <div className="meterrow small" key={k}>
          <span>{k}</span>
          <Bar value={v} label={k} />
          <b>{pct(v)}</b>
        </div>
      ))}
      {s.dietPenalty > 0 && (
        <p className="warntext">
          {d("dietPenalty", l)}: −{s.dietPenalty.toFixed(2)}
        </p>
      )}
      {c.membersCovered.length > 0 && (
        <p className="muted">
          {d("matches", l)}: <bdi>{names(c.membersCovered, l)}</bdi>
        </p>
      )}
      <p className="muted">{d("priceEstimate", l)}</p>
    </div>
  );
}

export function feedbackLabel(fb: Feedback, l: Lang, venue: (id: string) => string, currency: string): string {
  switch (fb.type) {
    case "budget":
      return `${d("budgetLine", l)}: ${money(fb.budgetPerPerson, currency, l)}`;
    case "reject_venue":
      return `${d("rejectVenue", l)}: ${venue(fb.entityId)}`;
    case "not_fair":
      return `${d("notFairTo", l)} ${fb.member}`;
    case "manager_reject":
      return `${d("managerReject", l)}: ${venue(fb.dinnerId)} + ${venue(fb.activityId)} (${fb.reason})`;
  }
}

/** Manager rejects one option with a required reason. */
export function ManagerReject({ l, busy, onReject }: { l: Lang; busy: boolean; onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open)
    return (
      <button type="button" className="chip dangerchip" disabled={busy} onClick={() => setOpen(true)}>
        {d("managerReject", l)}
      </button>
    );
  return (
    <div className="mgrreject">
      <label>
        {d("rejectReason", l)}
        <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} autoFocus />
      </label>
      <button type="button" className="danger" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())}>
        {d("confirmReject", l)}
      </button>
      <button type="button" className="link" onClick={() => setOpen(false)}>
        {d("cancel", l)}
      </button>
    </div>
  );
}

function SideCell({ s, l, currency }: { s?: OptionSide; l: Lang; currency: string }) {
  if (!s) return <td className="muted">—</td>;
  return (
    <td>
      <bdi>{venueName(s.activity, l)}</bdi> + <bdi>{venueName(s.dinner, l)}</bdi>
      <br />
      <span className="muted">
        ~{money(s.costPerPerson, currency, l)} · {pct(s.mean)} / {pct(s.min)} · <span dir="ltr">{s.covered}/{s.members}</span>
      </span>
    </td>
  );
}

const signed = (n: number, fmt: (x: number) => string) => (Math.abs(n) < 1e-9 ? "±0" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`);

/** Old vs new per option: venues, cost per person and fairness. */
export function DiffView({ diff, l, currency, qloo }: { diff: PlanDiff; l: Lang; currency: string; qloo?: AgentReport["qloo"] }) {
  return (
    <div className="card diff" aria-live="polite">
      <h2>{d("whatChanged", l)}</h2>
      <p className="muted">
        {d("budgetLine", l)}: {money(diff.budgetBefore, currency, l)} → {money(diff.budgetAfter, currency, l)}
        {qloo && (
          <>
            {" "}· {d("qlooCalls", l)}: <b>{qloo.httpCalls}</b> · {d("reused", l)}: <b>{qloo.reusedResponses}</b>
          </>
        )}
      </p>
      {diff.changedCount === 0 && <p>{d("noChange", l)}</p>}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{d("before", l)}</th>
              <th>{d("after", l)}</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {diff.options.map((o) => (
              <tr key={o.rank} className={`chg ${o.status}`}>
                <td>
                  {o.rank}
                  <br />
                  <span className={`tag ${o.status === "same" ? "" : "warn"}`}>{CHANGE_LABEL[o.status][l]}</span>
                </td>
                <SideCell s={o.before} l={l} currency={currency} />
                <SideCell s={o.after} l={l} currency={currency} />
                <td>
                  {o.before && o.after ? (
                    <>
                      <span dir="ltr">{signed(o.costDeltaPerPerson, (x) => money(x, currency, l))}</span> {d("costPp", l)}
                      <br />
                      <span dir="ltr">{signed(o.meanDelta * 100, (x) => `${Math.round(x)}`)} / {signed(o.minDelta * 100, (x) => `${Math.round(x)}`)}</span> {d("fairness", l)}
                      {o.leftOutRemoved.length > 0 && (
                        <>
                          <br />
                          <span className="oktext">{d("nowIncluded", l)}: <bdi>{names(o.leftOutRemoved, l)}</bdi></span>
                        </>
                      )}
                      {o.leftOutAdded.length > 0 && (
                        <>
                          <br />
                          <span className="warntext">{d("nowLeftOut", l)}: <bdi>{names(o.leftOutAdded, l)}</bdi></span>
                        </>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Feedback checks plus collapsible decision steps (decision, reason, timing). */
export function DecisionLog({ agent, l }: { agent: AgentReport; l: Lang }) {
  return (
    <div className="card declog">
      <h2>{d("log", l)}</h2>
      <p className="muted">
        {d("logNote", l)} {d("logLangNote", l)} · {agent.elapsedMs} ms · {d("qlooCalls", l)}: {agent.qloo.httpCalls}
      </p>
      {agent.checks.length > 0 && (
        <ul className="checks">
          {agent.checks.map((c, i) => (
            <li key={i} className={c.satisfied ? "oktext" : "warntext"}>
              <b>{c.satisfied ? `✓ ${d("met", l)}` : `✗ ${d("notMet", l)}`}</b> <span dir="ltr">{c.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {agent.log.map((e) => (
        <details key={e.seq} className="logstep">
          <summary>
            <span className="n">{e.seq}</span> {STEP_LABEL[e.step]?.[l] ?? e.step}{" "}
            <span className={`tag ${e.pass === "replan" ? "warn" : ""}`}>{d(e.pass, l)}</span> <span className="muted" dir="ltr">{e.ms} ms</span>
          </summary>
          <dl dir="ltr">
            <dt>{d("decision", l)}</dt>
            <dd>{e.decision}</dd>
            <dt>{d("reason", l)}</dt>
            <dd>{e.reason}</dd>
            <dt>{d("inputs", l)}</dt>
            <dd>
              <code>{JSON.stringify(e.inputs)}</code>
            </dd>
          </dl>
        </details>
      ))}
    </div>
  );
}
