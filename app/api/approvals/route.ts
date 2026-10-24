import { NextResponse } from "next/server";
import { ApprovalError, approvalStore, parseSubmission, type ApprovalStatus } from "@/approvals/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ApprovalStatus[] = ["pending", "approved", "rejected"];

export async function GET(request: Request) {
  const s = new URL(request.url).searchParams.get("status");
  const status = STATUSES.find((x) => x === s);
  return NextResponse.json(await approvalStore().list(status));
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const req = await approvalStore().submit(parseSubmission(body));
    return NextResponse.json(req, { status: 201 });
  } catch (e) {
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
