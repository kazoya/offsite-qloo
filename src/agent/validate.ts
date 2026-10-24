import { CITIES } from "../connectors/qloo/catalog";
import type { Lang, Member, PlanRequest } from "./types";

export class ValidationError extends Error {}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, maxItems = 12) =>
  Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, maxItems) : [];

/** Validates untrusted JSON (API body) into a PlanRequest. Throws ValidationError with a readable message. */
export function parsePlanRequest(body: unknown): PlanRequest {
  if (typeof body !== "object" || body === null) throw new ValidationError("Body must be a JSON object.");
  const b = body as Record<string, unknown>;

  const rawTeam = Array.isArray(b.team) ? b.team : [];
  if (rawTeam.length < 1 || rawTeam.length > 30) throw new ValidationError("team must have 1-30 members.");
  const team: Member[] = rawTeam.map((m, i) => {
    const o = (m ?? {}) as Record<string, unknown>;
    return {
      name: str(o.name, 40) || `Member ${i + 1}`,
      cuisines: strs(o.cuisines),
      activities: strs(o.activities),
      artists: strs(o.artists, 4),
      dietary: strs(o.dietary),
    };
  });

  const city = str(b.city, 40);
  const known = CITIES.some((c) => c.name.toLowerCase() === city.toLowerCase() || c.ar === city);
  if (!known) throw new ValidationError(`city must be one of: ${CITIES.map((c) => c.name).join(", ")}.`);

  const budget = Number(b.budgetPerPerson);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 100_000) throw new ValidationError("budgetPerPerson must be a positive number.");
  const headcount = Math.trunc(Number(b.headcount));
  if (!Number.isFinite(headcount) || headcount < 1 || headcount > 1000) throw new ValidationError("headcount must be 1-1000.");
  const date = str(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new ValidationError("date must be yyyy-mm-dd.");
  const language: Lang = b.language === "ar" ? "ar" : "en";

  const req: PlanRequest = { team, city, budgetPerPerson: budget, headcount, date, language };
  if (b.startTime !== undefined && b.startTime !== "") {
    const st = str(b.startTime, 5);
    const m = st.match(/^(\d{2}):(\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new ValidationError("startTime must be HH:MM (24h).");
    req.startTime = st;
  }
  if (b.approvalThreshold !== undefined && b.approvalThreshold !== "") {
    const t = Number(b.approvalThreshold);
    if (!Number.isFinite(t) || t < 0) throw new ValidationError("approvalThreshold must be >= 0.");
    req.approvalThreshold = t;
  }
  return req;
}
