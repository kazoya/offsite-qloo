import { NextResponse } from "next/server";
import { Deadline, runAgent } from "@/agent";
import { parseFeedback, parsePlanRequest } from "@/agent/validate";
import { toApiError, type ApiError } from "@/api/errors";
import { LIMITS, limiters, readJsonCapped } from "@/api/guard";
import { refuseIfLimited } from "@/api/http";
import { QlooClient } from "@/connectors/qloo";
import { providerFromEnv } from "@/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Platform ceiling; the planner's own deadline (LIMITS.planDeadlineMs) stops it earlier with a clean 504. */
export const maxDuration = 30;

const fail = ({ status, ...body }: ApiError) => NextResponse.json(body, { status });

/**
 * POST a PlanRequest, optionally with `feedback: Feedback[]` to replan.
 * Response: the Plan as before, plus `agent` (decision log, approval gate, feedback checks).
 */
export async function POST(request: Request) {
  const limited = refuseIfLimited(limiters().plan, request);
  if (limited) return limited;
  try {
    const body = await readJsonCapped(request, LIMITS.planBodyBytes);
    const req = parsePlanRequest(body);
    const feedback = parseFeedback((body as Record<string, unknown>).feedback, req);
    if (!process.env.QLOO_API_KEY) {
      return fail({ status: 503, code: "no_key", error: "QLOO_API_KEY is not configured on the server." });
    }
    const deadline = new Deadline(LIMITS.planDeadlineMs);
    const plan = await deadline.race(
      runAgent(req, feedback, { qloo: QlooClient.fromEnv(), llm: providerFromEnv(), deadline }),
      "planning",
    );
    return NextResponse.json(plan);
  } catch (e) {
    const err = toApiError(e);
    if (err.code === "internal" || err.code === "timeout" || err.code.startsWith("qloo")) console.error("[plan]", e instanceof Error ? e.message : e);
    return fail(err);
  }
}
