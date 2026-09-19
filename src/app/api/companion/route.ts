import { NextRequest, NextResponse } from "next/server";
import { getCompanionReply, type BiometricSnapshot, type CompanionTurn } from "@/lib/gemini";

export const runtime = "nodejs";

interface CompanionRequestBody {
  message: string;
  history?: CompanionTurn[];
  biometrics?: BiometricSnapshot;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompanionRequestBody;

    if (!body?.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "Missing 'message' string in request body." }, { status: 400 });
    }

    const reply = await getCompanionReply(body.message, body.history ?? [], body.biometrics);
    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/companion]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
