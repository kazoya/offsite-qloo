import type { QlooPlace } from "../connectors/qloo/types";

/**
 * Opening-hours check against Qloo `properties.hours`.
 * Shape (verified live): { monday: [{ opens: "T10:00:00", closes: "T23:30:00", closed: false }], ... };
 * a closed day is [{ opens: null, closes: null, closed: true }]; `closes <= opens` means past midnight.
 * Times are the venue's local time; the requested date/time are taken as local time in the plan's city.
 */
export type HoursStatus = "open" | "closed_day" | "closed_at_time" | "unknown";

export interface HoursCheck {
  status: HoursStatus;
  weekday: string;
  /** Window checked, local "HH:MM". */
  from: string;
  to: string;
  /** That day's opening hours as "HH:MM–HH:MM" strings, when known. */
  dayHours?: string[];
  /**
   * Qloo marks every day of the week closed while the venue is not flagged is_closed. Seen on ~23% of probed venues,
   * so it is treated as missing data (status "unknown"), not as proof the venue is shut.
   */
  allWeekClosed?: boolean;
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY = 24 * 60;

/** Weekday of an ISO yyyy-mm-dd date, independent of the server's time zone. */
export function weekdayOf(date: string): (typeof WEEKDAYS)[number] {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** "T10:00:00" | "10:00" | "10:00:00" -> minutes since midnight; undefined when unparseable. */
export function parseClock(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.match(/^T?(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return undefined;
  return h * 60 + min;
}

export const fmtClock = (mins: number) => {
  const x = ((mins % DAY) + DAY) % DAY;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

type Slots = { opens: unknown; closes: unknown; closed?: unknown }[];

/** Open intervals of one weekday, in minutes from that day's midnight (may extend past 24:00). */
function intervals(slots: Slots | undefined): { list: [number, number][]; known: boolean; allClosed: boolean } {
  if (!Array.isArray(slots) || slots.length === 0) return { list: [], known: false, allClosed: false };
  const list: [number, number][] = [];
  let closedCount = 0;
  for (const s of slots) {
    if (s?.closed === true) {
      closedCount++;
      continue;
    }
    const o = parseClock(s?.opens);
    let c = parseClock(s?.closes);
    if (o === undefined || c === undefined) return { list: [], known: false, allClosed: false };
    if (c <= o) c += DAY; // past midnight (or 24h when equal)
    list.push([o, c]);
  }
  return { list, known: true, allClosed: closedCount === slots.length };
}

/** Merge overlapping or touching intervals (e.g. a 24h day followed by the next day). */
function merge(list: [number, number][]): [number, number][] {
  const sorted = [...list].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [o, c] of sorted) {
    const last = out[out.length - 1];
    if (last && o <= last[1]) last[1] = Math.max(last[1], c);
    else out.push([o, c]);
  }
  return out;
}

/**
 * Is the venue open for the whole window [startMin, startMin + minutes) on `date`?
 * Includes spill-over from the previous day's past-midnight hours and windows that run into the next day.
 */
export function checkHours(hours: QlooPlace["hours"], date: string, startMin: number, minutes: number): HoursCheck {
  const weekday = weekdayOf(date);
  const prev = WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 6) % 7]!;
  const base = { weekday, from: fmtClock(startMin), to: fmtClock(startMin + minutes) };
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return { status: "unknown", ...base };

  const allWeekClosed = WEEKDAYS.every((d) => intervals(hours[d] as Slots | undefined).allClosed);
  if (allWeekClosed) return { status: "unknown", ...base, allWeekClosed: true };

  const today = intervals(hours[weekday] as Slots | undefined);
  if (!today.known) return { status: "unknown", ...base };
  const dayHours = today.list.map(([o, c]) => `${fmtClock(o)}–${fmtClock(c)}`);
  const yesterday = intervals(hours[prev] as Slots | undefined);
  const spill = yesterday.list.filter(([, c]) => c > DAY).map(([o, c]): [number, number] => [o - DAY, c - DAY]);

  const next = WEEKDAYS[(WEEKDAYS.indexOf(weekday) + 1) % 7]!;
  const tomorrow = intervals(hours[next] as Slots | undefined).list.map(([o, c]): [number, number] => [o + DAY, c + DAY]);

  const end = startMin + minutes;
  const covered = merge([...spill, ...today.list, ...tomorrow]).some(([o, c]) => o <= startMin && c >= end);
  if (covered) return { status: "open", ...base, dayHours };
  if (today.allClosed) return { status: "closed_day", ...base, dayHours: [] };
  return { status: "closed_at_time", ...base, dayHours };
}
