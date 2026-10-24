import { NextResponse } from "next/server";
import { planOffsite } from "@/agent";
import { parsePlanRequest } from "@/agent/validate";
import { toApiError, type ApiError } from "@/api/errors";
import { QlooClient } from "@/connectors/qloo";
import { providerFromEnv } from "@/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = ({ status, ...body }: ApiError) => NextResponse.json(body, { status });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ status: 400, code: "bad_json", error: "Invalid JSON body." });
  }
  try {
    const req = parsePlanRequest(body);
    if (!process.env.QLOO_API_KEY) {
      return fail({ status: 503, code: "no_key", error: "QLOO_API_KEY is not configured on the server." });
    }
    const plan = await planOffsite(req, { qloo: QlooClient.fromEnv(), llm: providerFromEnv() });
    return NextResponse.json(plan);
  } catch (e) {
    const err = toApiError(e);
    if (err.code === "internal" || err.code.startsWith("qloo")) console.error("[plan]", e instanceof Error ? e.message : e);
    return fail(err);
  }
}
