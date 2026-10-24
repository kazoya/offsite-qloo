import { NextResponse } from "next/server";
import { ApprovalError, approvalStore } from "@/approvals/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { action: "approve" | "reject", actor: string, note?: string } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const action = b.action === "approve" || b.action === "reject" ? b.action : undefined;
    if (!action) throw new ApprovalError("action must be approve or reject.");
    const r = await approvalStore().decide(id, action, typeof b.actor === "string" ? b.actor : "", typeof b.note === "string" ? b.note : undefined);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
