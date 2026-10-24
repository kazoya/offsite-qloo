import { NextResponse } from "next/server";
import { ApprovalError } from "@/approvals/store";
import { pinGuard } from "@/approvals/pin";
import { resolveApprovals } from "@/approvals/sandbox";
import { BodyTooLargeError, LIMITS, clientKey, limiters, readJsonCapped } from "@/api/guard";
import { refuseIfLimited } from "@/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { action: "approve" | "reject", actor: string, note?: string, pin?: string } (or header x-approvals-pin).
 * Sandbox mode: decisions apply only to the caller's private demo queue, so no PIN is asked for.
 * Shared mode (APPROVALS_MODE=shared): the shared queue, guarded by the demo PIN.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = refuseIfLimited(limiters().approvals, request);
  if (limited) return limited;
  const { id } = await params;
  const { mode, store, setCookie } = resolveApprovals(request);
  const reply = (body: object, status = 200) => {
    const res = NextResponse.json(body, { status });
    if (setCookie) res.headers.append("set-cookie", setCookie);
    return res;
  };
  try {
    const raw = await readJsonCapped(request, LIMITS.approvalsBodyBytes).catch((e) => {
      if (e instanceof BodyTooLargeError) throw e;
      return null;
    });
    const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (mode === "shared") {
      const pin = request.headers.get("x-approvals-pin") ?? (typeof b.pin === "string" ? b.pin : undefined);
      const refused = pinGuard().check(pin || undefined, clientKey(request));
      if (refused) return reply({ code: refused.code, error: refused.code }, refused.status);
    }
    const action = b.action === "approve" || b.action === "reject" ? b.action : undefined;
    if (!action) throw new ApprovalError("action must be approve or reject.");
    const r = await store.decide(id, action, typeof b.actor === "string" ? b.actor : "", typeof b.note === "string" ? b.note : undefined);
    return reply({ mode, ...r });
  } catch (e) {
    if (e instanceof ApprovalError) return reply({ error: e.message }, e.status);
    if (e instanceof BodyTooLargeError) return reply({ code: "too_large", error: e.message }, 413);
    return reply({ error: "Unexpected server error." }, 500);
  }
}
