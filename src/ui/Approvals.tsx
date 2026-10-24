"use client";

import { useCallback, useEffect, useState } from "react";
import { ERROR_TEXT, money, ruleText, t } from "@/i18n";
import { cityProfile } from "@/connectors/qloo/catalog";
import type { Lang } from "@/agent/types";
import type { ApprovalData, ApprovalRequest, ApprovalStatus } from "@/approvals/store";

const FILTERS: (ApprovalStatus | "all")[] = ["pending", "approved", "rejected", "all"];
const fmtTime = (iso: string, l: Lang) =>
  new Intl.DateTimeFormat(l === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Amman" }).format(new Date(iso));

function Row({ r, l, onDone }: { r: ApprovalRequest; l: Lang; onDone: () => void }) {
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = (v: { nameEn: string; nameAr?: string }) => (l === "ar" ? (v.nameAr ?? v.nameEn) : v.nameEn);

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(r.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, actor, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setErr(json.error ?? String(res.status));
      else onDone();
    } catch {
      setErr(ERROR_TEXT.network[l]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`card opt ${r.status === "pending" ? "needs_manager_approval" : r.status === "rejected" ? "rejected_over_budget" : ""}`}>
      <div className="opthead">
        <h2>{l === "ar" ? cityProfile(r.city).ar : r.city} · <bdi dir="ltr">{r.date}</bdi></h2>
        <span className={`badge st-${r.status}`}>{t(r.status, l)}</span>
      </div>
      <ul className="venues">
        <li><span className="kind">{t("activity", l)}</span> <bdi>{name(r.activity)}</bdi></li>
        <li><span className="kind">{t("dinner", l)}</span> <bdi>{name(r.dinner)}</bdi></li>
      </ul>
      <p className="muted">
        {r.startTime ? <><bdi dir="ltr">{r.startTime}</bdi> · </> : null}{r.headcount} {t("people", l)} · ~{money(r.costPerPerson, r.currency, l)} {t("perPerson", l)} ·{" "}
        <strong>~{money(r.costTotal, r.currency, l)} {t("total", l)}</strong> ({t("thresholdLabel", l)} {money(r.approvalThreshold, r.currency, l)})
      </p>
      <p className="muted">
        {t("requestedBy", l)} <bdi>{r.requestedBy}</bdi> · {fmtTime(r.createdAt, l)}
        {r.decidedBy && r.decidedAt && (
          <> · {t("decidedBy", l)} <bdi>{r.decidedBy}</bdi> · {fmtTime(r.decidedAt, l)}</>
        )}
      </p>
      {r.note && <p>“<bdi>{r.note}</bdi>”</p>}
      {r.status === "pending" && (
        <div className="decide">
          <div>
            <label htmlFor={`who-${r.id}`}>{t("approver", l)}</label>
            <input id={`who-${r.id}`} value={actor} onChange={(e) => setActor(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label htmlFor={`note-${r.id}`}>{t("note", l)}</label>
            <input id={`note-${r.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
          <div className="row">
            <button type="button" className="primary" disabled={busy || !actor.trim()} onClick={() => decide("approve")}>{t("approve", l)}</button>
            <button type="button" className="danger" disabled={busy || !actor.trim() || !note.trim()} onClick={() => decide("reject")}>{t("reject", l)}</button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
      )}
    </article>
  );
}

export function Approvals({ lang: l }: { lang: Lang }) {
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [data, setData] = useState<ApprovalData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/approvals${filter === "all" ? "" : `?status=${filter}`}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as ApprovalData);
    } catch {
      setErr(ERROR_TEXT.network[l]);
    }
  }, [filter, l]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="chips tabs" role="tablist" aria-label={t("approvals", l)}>
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" className="chip" aria-selected={filter === f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(f, l)}
          </button>
        ))}
      </div>
      {err && <div className="card errcard" role="alert"><p>{err}</p></div>}
      {!data && !err && <p className="muted loading"><span className="spinner" aria-hidden="true" /> {t("loading", l)}</p>}
      {data && data.requests.length === 0 && (
        <div className="card empty" role="status"><p className="muted">{t("noApprovals", l)}</p></div>
      )}
      {data?.requests.map((r) => <Row key={r.id} r={r} l={l} onDone={load} />)}
      {data && data.audit.length > 0 && (
        <div className="card">
          <h2>{t("approvalAudit", l)}</h2>
          <div className="tablewrap">
            <table>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.seq}>
                    <td>{a.seq}</td>
                    <td className="nowrap">{fmtTime(a.at, l)}</td>
                    <td>{t(a.action, l)}</td>
                    <td><bdi>{a.actor}</bdi></td>
                    <td className="muted">{ruleText(a.rule, l)}{a.note ? <> · <bdi>{a.note}</bdi></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
