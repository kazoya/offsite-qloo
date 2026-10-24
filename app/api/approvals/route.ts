import { NextResponse } from "next/server";
import { ApprovalError, approvalStore, parseSubmission, type ApprovalStatus } from "@/approvals/store";
import { BodyTooLargeError, LIMITS, limiters, readJsonCapped } from "@/api/guard";
import { refuseIfLimited } from "@/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

export async function GET(request: Request) {
  const limited = refuseIfLimited(limiters().approvals, request);
  if (limited) return limited;
  const s = new URL(request.url).searchParams.get("status");
  const status = STATUSES.find((x) => x === s);
  return NextResponse.json(await approvalStore().list(status));
}

export async function POST(request: Request) {
  const limited = refuseIfLimited(limiters().approvals, request);
  if (limited) return limited;
  try {
    const body = await readJsonCapped(request, LIMITS.approvalsBodyBytes).catch((e) => {
      if (e instanceof BodyTooLargeError) throw e;
      return null;
    });
    const req = await approvalStore().submit(parseSubmission(body));
    return NextResponse.json(req, { status: 201 });
  } catch (e) {
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof BodyTooLargeError) return NextResponse.json({ code: "too_large", error: e.message }, { status: 413 });
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
