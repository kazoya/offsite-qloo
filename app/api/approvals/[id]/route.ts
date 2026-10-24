import { NextResponse } from "next/server";
import { ApprovalError, approvalStore } from "@/approvals/store";
import { pinGuard } from "@/approvals/pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { action: "approve" | "reject", actor: string, note?: string, pin?: string } (or header x-approvals-pin) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const pin = request.headers.get("x-approvals-pin") ?? (typeof b.pin === "string" ? b.pin : undefined);
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const refused = pinGuard().check(pin || undefined, client);
    if (refused) return NextResponse.json({ code: refused.code, error: refused.code }, { status: refused.status });
    const action = b.action === "approve" || b.action === "reject" ? b.action : undefined;
    if (!action) throw new ApprovalError("action must be approve or reject.");
    const r = await approvalStore().decide(id, action, typeof b.actor === "string" ? b.actor : "", typeof b.note === "string" ? b.note : undefined);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
