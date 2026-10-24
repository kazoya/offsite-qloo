import { describe, expect, it } from "vitest";
import { planOffsite, type PlanRequest } from "../src/agent";
import { artistSpellings, exactMatchAny, exactNameMatch, normalizeName } from "../src/agent/names";
import { warningText } from "../src/i18n";
import { FakeQloo } from "./fixtures/qloo";

const FIXED = () => new Date("2026-10-24T09:00:00.000Z");
const hit = (entityId: string, name: string) => ({ entityId, name, types: ["urn:entity:artist"], tags: [] });

describe("artist name matching (synthetic names)", () => {
  it("normalises case, accents, punctuation, '&', a leading 'the' and Arabic variants", () => {
    expect(normalizeName("  Test  ARTIST! ")).toBe("test artist");
    expect(normalizeName("Tést Ártist")).toBe("test artist");
    expect(normalizeName("The Test Band")).toBe("test band");
    expect(normalizeName("Duo A & B")).toBe(normalizeName("duo a and b"));
    expect(normalizeName("أَحمد تجربة")).toBe(normalizeName("احمد تجربه"));
  });

  it("picks the exact match even when it is not the first hit, and rejects collaborations/partials", () => {
    const hits = [hit("C1", "Marshmello & Test Artist"), hit("C2", "Test Artist Tribute"), hit("C3", "Test Artist")];
    expect(exactNameMatch("test artist", hits)?.entityId).toBe("C3");
    expect(exactNameMatch("Test Artist", hits.slice(0, 2))).toBeUndefined();
    expect(exactNameMatch("", hits)).toBeUndefined();
  });
});

describe("planner artist resolution", () => {
  const req = (artists: string[]): PlanRequest => ({
    city: "Amman",
    budgetPerPerson: 60,
    headcount: 4,
    date: "2026-11-12",
    language: "en",
    team: [{ name: "Nour", cuisines: ["lebanese"], activities: ["museum"], artists, dietary: [] }],
  });

  it("seeds only exact matches; skips a near-miss with a bilingual note", async () => {
    const q = new FakeQloo();
    q.searchHits = {
      "Test Artist": [hit("C1", "Marshmello & Test Artist"), hit("C3", "Test Artist")],
      "Only Collab": [hit("C9", "Someone & Only Collab Live")],
    };
    const plan = await planOffsite(req(["Test Artist", "Only Collab"]), { qloo: q, now: FIXED });
    const seeds = plan.seeds.filter((s) => s.kind === "artist").map((s) => s.labelEn);
    expect(seeds).toContain("Test Artist");
    expect(seeds.join()).not.toMatch(/Marshmello|Someone/);
    const note = plan.warnings.find((w) => w.includes("Only Collab"))!;
    expect(note).toBe('Qloo has no exact artist match for "Only Collab" (closest: "Someone & Only Collab Live"); it was skipped.');
    expect(warningText(note, "ar")).toMatch(/تم تجاهله/);
    expect(q.searchTakes.every((t) => (t ?? 0) > 1)).toBe(true);
    const signal = q.requests.flatMap((r) => r.signalEntities ?? []);
    expect(signal).toContain("C3");
    expect(signal).not.toContain("C1");
    expect(signal).not.toContain("C9");
  });

  it("falls back to an alternate spelling the input suggests, keeping the exact-match rule", async () => {
    const q = new FakeQloo();
    q.searchHits = {
      "Test Star / تجربة نجم": [hit("X0", "Someone & Test Star")],
      "Test Star": [hit("X1", "Marshmello & Test Star")],
      "تجربة نجم": [hit("X2", "تجربة نجم"), hit("X3", "تجربة نجوم")],
    };
    const plan = await planOffsite(req(["Test Star / تجربة نجم"]), { qloo: q, now: FIXED });
    expect(plan.seeds.filter((s) => s.kind === "artist").map((s) => s.labelEn)).toEqual(["تجربة نجم"]);
    expect(plan.warnings.join()).not.toMatch(/no exact artist match/);
    expect(q.requests.flatMap((r) => r.signalEntities ?? [])).not.toContain("X1");
  });

  it("uses a known Latin/Arabic equivalent, but still skips when no spelling matches exactly", async () => {
    const q = new FakeQloo();
    q.searchHits = {
      "Amr Diab": [hit("C1", "Marshmello & Amr Diab")],
      "عمرو دياب": [hit("AR1", "عمرو دياب")],
      "Nancy Ajram": [hit("N1", "Nancy Ajram Tribute")],
      "نانسي عجرم": [hit("N2", "نانسي عجرم وأصدقاء")],
    };
    const plan = await planOffsite(req(["Amr Diab", "Nancy Ajram"]), { qloo: q, now: FIXED });
    const seeds = plan.seeds.filter((s) => s.kind === "artist").map((s) => s.labelEn);
    expect(seeds).toEqual(["عمرو دياب"]);
    expect(plan.warnings).toContain('Qloo has no exact artist match for "Nancy Ajram" (closest: "Nancy Ajram Tribute"); it was skipped.');
  });
});

describe("alternate spellings", () => {
  it("lists the typed name first, then typed parts, then known equivalents, without duplicates", () => {
    expect(artistSpellings("Fairuz")).toEqual(["Fairuz", "فيروز", "Fairouz", "Fayrouz"]);
    expect(artistSpellings("fairouz")[0]).toBe("fairouz");
    expect(artistSpellings("Test A / Test B")).toEqual(["Test A / Test B", "Test A", "Test B"]);
    expect(artistSpellings("Unknown Test Band")).toEqual(["Unknown Test Band"]);
    expect(exactMatchAny(artistSpellings("Amr Diab"), [hit("Z", "Amr Mostafa"), hit("Y", "عمرو دياب")])?.entityId).toBe("Y");
  });
});
