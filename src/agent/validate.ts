import { CITIES, unsupportedCity } from "../connectors/qloo/catalog";
import type { Feedback, Lang, Member, PlanRequest } from "./types";

const MAX_FEEDBACK = 10;

export class ValidationError extends Error {
  readonly code: "validation" | "unsupported_city" = "validation";
}

/** City we know about but Qloo cannot resolve at city level (see UNSUPPORTED_CITIES). */
export class UnsupportedCityError extends ValidationError {
  override readonly code = "unsupported_city" as const;
  constructor(readonly city: string, reason: string) {
    super(`${city} is not supported yet: ${reason}`);
  }
}

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
  const unsupported = unsupportedCity(city);
  if (unsupported) throw new UnsupportedCityError(unsupported.name, unsupported.reasonEn);
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

/** Validates the optional `feedback` list of a plan request against the (already validated) request. */
export function parseFeedback(raw: unknown, req: PlanRequest): Feedback[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError("feedback must be a list.");
  if (raw.length > MAX_FEEDBACK) throw new ValidationError(`feedback can have at most ${MAX_FEEDBACK} items.`);
  const names = new Set(req.team.map((m) => m.name));
  return raw.map((f, i): Feedback => {
    if (!f || typeof f !== "object") throw new ValidationError(`feedback[${i}] must be an object.`);
    const o = f as Record<string, unknown>;
    let reason: string | undefined;
    if (o.reason !== undefined) {
      if (typeof o.reason !== "string" || o.reason.length > 200) throw new ValidationError(`feedback[${i}].reason must be text up to 200 characters.`);
      reason = o.reason.trim() || undefined;
    }
    const withReason = <T extends object>(x: T) => (reason ? { ...x, reason } : x);
    switch (o.type) {
      case "budget": {
        const b = o.budgetPerPerson;
        if (typeof b !== "number" || !Number.isFinite(b) || b <= 0 || b > 100000) {
          throw new ValidationError(`feedback[${i}].budgetPerPerson must be a number between 0 and 100000.`);
        }
        return withReason({ type: "budget" as const, budgetPerPerson: b });
      }
      case "reject_venue": {
        const id = o.entityId;
        if (typeof id !== "string" || id.length === 0 || id.length > 80 || !/^[\w:-]+$/.test(id)) {
          throw new ValidationError(`feedback[${i}].entityId must be a Qloo entity id.`);
        }
        return withReason({ type: "reject_venue" as const, entityId: id });
      }
      case "not_fair": {
        if (typeof o.member !== "string" || !names.has(o.member)) throw new ValidationError(`feedback[${i}].member must be one of the team's names.`);
        return withReason({ type: "not_fair" as const, member: o.member });
      }
      default:
        throw new ValidationError(`feedback[${i}].type must be budget, reject_venue or not_fair.`);
    }
  });
}
