import { NextResponse } from "next/server";
import { planOffsite } from "@/agent";
import { parsePlanRequest, ValidationError } from "@/agent/validate";
import { QlooClient, QlooError } from "@/connectors/qloo";
import { providerFromEnv } from "@/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const req = parsePlanRequest(body);
    if (!process.env.QLOO_API_KEY) {
      return NextResponse.json({ error: "QLOO_API_KEY is not configured on the server." }, { status: 503 });
    }
    const plan = await planOffsite(req, { qloo: QlooClient.fromEnv(), llm: providerFromEnv() });
    return NextResponse.json(plan);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof QlooError) return NextResponse.json({ error: `Qloo error: ${e.message}` }, { status: 502 });
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
