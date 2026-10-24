import { UnsupportedCityError, ValidationError } from "../agent/validate";
import { QlooError } from "../connectors/qloo/client";

/** Stable error codes the UI localises; messages stay English for logs/API clients. */
export type ApiErrorCode = "bad_json" | "validation" | "unsupported_city" | "no_key" | "qloo_down" | "qloo_auth" | "internal";

export interface ApiError {
  status: number;
  code: ApiErrorCode;
  error: string;
  city?: string;
}

/** Maps an exception from the plan route to an HTTP status + code. Never echoes upstream bodies to the client. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof UnsupportedCityError) return { status: 422, code: "unsupported_city", error: e.message, city: e.city };
  if (e instanceof ValidationError) return { status: 400, code: "validation", error: e.message };
  if (e instanceof QlooError) {
    if (e.status === 401 || e.status === 403) return { status: 502, code: "qloo_auth", error: `Qloo rejected the API key (${e.status}).` };
    return { status: 502, code: "qloo_down", error: e.status ? `Qloo is unavailable (HTTP ${e.status}).` : "Qloo could not be reached." };
  }
  return { status: 500, code: "internal", error: "Unexpected server error." };
}
