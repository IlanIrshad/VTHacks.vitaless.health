import { NextRequest, NextResponse } from "next/server";
import { analyzeClip } from "@/lib/presage";
import { logBiometricSample } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    const userId = req.nextUrl.searchParams.get("userId") || "demo-user";
    const routineId = req.nextUrl.searchParams.get("routineId");

    if (!contentType.includes("multipart/form-data")) {
      // No camera clip was captured — there is nothing real to report. We do
      // not fabricate a reading here; the client treats this as "no data".
      return NextResponse.json(
        { error: "No camera clip provided — live vitals require a working camera." },
        { status: 503 }
      );
    }

    const form = await req.formData();
    const clip = form.get("video");
    if (!(clip instanceof Blob)) {
      return NextResponse.json({ error: "Missing 'video' file in form data." }, { status: 400 });
    }

    // Throws (500, below) if PRESAGE_API_KEY is missing or Presage can't
    // produce a result — deliberately no fallback to invented data.
    const reading = await analyzeClip(clip);

    // Best-effort logging — don't fail the request if the DB isn't configured yet.
    try {
      await logBiometricSample({
        userId,
        heartRateBpm: reading.heartRateBpm,
        respirationRateBpm: reading.respirationRateBpm,
        stressLevel: reading.stressLevel,
        focusLevel: reading.focusLevel,
        energyLevel: reading.energyLevel,
        source: reading.source,
        routineId,
      });
    } catch (dbErr) {
      console.warn("[/api/biometrics] DB logging skipped:", (dbErr as Error).message);
    }

    return NextResponse.json(reading);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/biometrics]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
