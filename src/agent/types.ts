import type { QlooPlace } from "../connectors/qloo/types";
import type { HoursCheck } from "./hours";

export type Lang = "ar" | "en";

export interface Member {
  name: string;
  /** Catalog keys or labels (EN/AR), e.g. "lebanese", "italian", "لبناني". */
  cuisines: string[];
  /** Catalog keys or labels: "bowling", "museums", ... */
  activities: string[];
  /** Free-text artist names resolved through Qloo /search (optional, strengthens the taste signal). */
  artists: string[];
  /** Catalog keys: halal | vegetarian | vegan | gluten_free. */
  dietary: string[];
}

export interface PlanRequest {
  team: Member[];
  /** City name (EN or AR); see CITIES in the catalog. */
  city: string;
  /** Budget per person for dinner + activity, in the city's local currency. */
  budgetPerPerson: number;
  headcount: number;
  /** ISO date (yyyy-mm-dd), local to the city. */
  date: string;
  /** Local start time "HH:MM" (activity first, then dinner). Defaults to 18:00. */
  startTime?: string;
  language: Lang;
  /** Total event spend (local currency) above which manager approval is required. */
  approvalThreshold?: number;
}

export type ReasonKind =
  | "cuisine_match"
  | "activity_match"
  | "artist_link"
  | "affinity"
  | "rating"
  | "dietary_confirmed"
  | "dietary_unconfirmed"
  | "price_known"
  | "price_assumed"
  | "fallback_category"
  | "team_fit"
  | "hours_open"
  | "hours_unknown";

/** Structured reason; rendered to text by the i18n layer (rule-based) or narrated by an LLM. */
export interface Reason {
  kind: ReasonKind;
  /** Member names the reason applies to. */
  members?: string[];
  /** Human labels (catalog en/ar pair) or values. */
  labelEn?: string;
  labelAr?: string;
  value?: number;
}

export interface ScoreBreakdown {
  /** Min-max normalised Qloo affinity within the candidate set (0..1). */
  qlooAffinity: number;
  /** Share of team members whose picks match this venue (0..1). */
  memberCoverage: number;
  /** Venue rating / 5 (0..1), 0.5 when unknown. */
  rating: number;
  /** Share of group-event fit tags present (work dinner, large group, private dining/events), 0..1. */
  teamFit: number;
  total: number;
}

export interface Candidate {
  kind: "dinner" | "activity";
  place: QlooPlace;
  /** Catalog key of cuisine/activity category this candidate was matched to. */
  categoryKey?: string;
  categoryEn?: string;
  categoryAr?: string;
  costPerPerson: number; // local currency, ESTIMATE
  costIsAssumed: boolean;
  dietaryConfirmed: string[];
  dietaryUnconfirmed: string[];
  score: ScoreBreakdown;
  reasons: Reason[];
  /** Opening-hours check for this venue's slot in the evening (Qloo hours). */
  hours?: HoursCheck;
}

export type Decision = "auto_approved" | "needs_manager_approval" | "rejected_over_budget";

export interface AuditEntry {
  seq: number;
  at: string;
  subject: string;
  decision: Decision;
  rule: string;
  detail: Record<string, string | number | boolean>;
}

export interface PlanOption {
  rank: number;
  dinner: Candidate;
  activity: Candidate;
  costPerPerson: number;
  costTotal: number;
  decision: Decision;
  score: number;
  summary?: string;
}

export interface Plan {
  request: PlanRequest;
  currency: string;
  /** Locality as resolved by Qloo, e.g. "Amman, Jordan"; shown so a wrong match is visible. */
  locality?: string;
  options: PlanOption[];
  audit: AuditEntry[];
  warnings: string[];
  /** Which seeds drove the signal (for transparency in the UI). */
  seeds: { kind: "cuisine" | "activity" | "artist"; labelEn: string; labelAr?: string; members: string[] }[];
  provider: string;
  qlooHttpCalls: number;
  /** Evening schedule the hours check used (local time in the city). */
  schedule?: { weekday: string; activity: { from: string; to: string }; dinner: { from: string; to: string } };
  overview?: string;
}
