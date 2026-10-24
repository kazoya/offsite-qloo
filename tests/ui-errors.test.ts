import { describe, expect, it } from "vitest";
import { toApiError } from "../src/api/errors";
import { parsePlanRequest, UnsupportedCityError, ValidationError } from "../src/agent/validate";
import { QlooError } from "../src/connectors/qloo/client";
import { ERROR_TEXT, warningText } from "../src/i18n";

const base = { team: [{ name: "A", cuisines: ["italian"], activities: [], artists: [], dietary: [] }], budgetPerPerson: 30, headcount: 10, date: "2027-01-14", language: "en" };

describe("unsupported city", () => {
  it("Jeddah (EN and AR) is refused with an honest reason, not planned as Saudi Arabia", () => {
    for (const city of ["Jeddah", "jeddah", "جدة"]) {
      expect(() => parsePlanRequest({ ...base, city })).toThrow(UnsupportedCityError);
    }
    try {
      parsePlanRequest({ ...base, city: "Jeddah" });
    } catch (e) {
      expect(toApiError(e)).toMatchObject({ status: 422, code: "unsupported_city", city: "Jeddah" });
      expect((e as Error).message).toMatch(/all of Saudi Arabia/);
    }
  });
  it("an unknown city is a plain validation error", () => {
    expect(() => parsePlanRequest({ ...base, city: "Atlantis" })).toThrow(ValidationError);
    expect(() => parsePlanRequest({ ...base, city: "Atlantis" })).not.toThrow(UnsupportedCityError);
  });
});

describe("toApiError", () => {
  it("maps each failure to a stable code and never echoes upstream bodies", () => {
    expect(toApiError(new ValidationError("x"))).toMatchObject({ status: 400, code: "validation", error: "x" });
    expect(toApiError(new QlooError("Qloo 503 on /v2/insights: <html>secret</html>", 503))).toEqual({
      status: 502,
      code: "qloo_down",
      error: "Qloo is unavailable (HTTP 503).",
    });
    expect(toApiError(new QlooError("Qloo request failed: ETIMEDOUT"))).toMatchObject({ code: "qloo_down", error: "Qloo could not be reached." });
    expect(toApiError(new QlooError("Qloo 401", 401))).toMatchObject({ code: "qloo_auth" });
    expect(toApiError(new Error("boom"))).toMatchObject({ status: 500, code: "internal", error: "Unexpected server error." });
  });
  it("every code has EN and AR copy", () => {
    for (const v of Object.values(ERROR_TEXT)) {
      expect(v.en.length).toBeGreaterThan(0);
      expect(v.ar).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("warningText", () => {
  it("translates known planner notes to Arabic and keeps unknown ones verbatim", () => {
    expect(warningText("4 activity venues were left out because Qloo opening hours show them closed at the planned time.", "ar")).toMatch(/^استبعدنا 4 من أماكن الأنشطة/);
    expect(warningText("1 restaurant was left out because Qloo opening hours show them closed at the planned time.", "ar")).toMatch(/^استبعدنا 1 من المطاعم/);
    expect(warningText("Only 1 restaurant fit the budget, so some options share a dinner.", "ar")).toMatch(/مطعم فقط/);
    expect(warningText('Unknown dietary need "keto" from Sara was ignored.', "ar")).toMatch(/keto/);
    expect(warningText("Something new.", "ar")).toBe("Something new.");
    expect(warningText("Qloo returned no restaurants for this location.", "en")).toBe("Qloo returned no restaurants for this location.");
  });
});
