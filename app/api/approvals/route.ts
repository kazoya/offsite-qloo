import { NextResponse } from "next/server";
import { ApprovalError, parseSubmission, type ApprovalStatus } from "@/approvals/store";
import { resolveApprovals } from "@/approvals/sandbox";
import { BodyTooLargeError, LIMITS, limiters, readJsonCapped } from "@/api/guard";
import { refuseIfLimited } from "@/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

/** Responses carry `mode` ("sandbox": this visitor's private demo queue, or "shared") and set the sandbox cookie when new. */
const reply = (body: object, setCookie: string | undefined, status = 200) => {
  const res = NextResponse.json(body, { status });
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
};

export async function GET(request: Request) {
  const limited = refuseIfLimited(limiters().approvals, request);
  if (limited) return limited;
  const { mode, store, setCookie } = resolveApprovals(request);
  const s = new URL(request.url).searchParams.get("status");
  const status = STATUSES.find((x) => x === s);
  return reply({ mode, ...(await store.list(status)) }, setCookie);
}

export async function POST(request: Request) {
  const limited = refuseIfLimited(limiters().approvals, request);
  if (limited) return limited;
  const { mode, store, setCookie } = resolveApprovals(request);
  try {
    const body = await readJsonCapped(request, LIMITS.approvalsBodyBytes).catch((e) => {
      if (e instanceof BodyTooLargeError) throw e;
      return null;
    });
    const req = await store.submit(parseSubmission(body));
    return reply({ mode, ...req }, setCookie, 201);
  } catch (e) {
    if (e instanceof ApprovalError) return reply({ error: e.message }, setCookie, e.status);
    if (e instanceof BodyTooLargeError) return reply({ code: "too_large", error: e.message }, setCookie, 413);
    return reply({ error: "Unexpected server error." }, setCookie, 500);
  }
}
