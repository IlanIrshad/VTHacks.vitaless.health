import { NextRequest, NextResponse } from "next/server";
import { estimateBodyComposition, feetInchesToCm, lbToKg, type Gender } from "@/lib/bodyComposition";
import { getBodyCompositionInsight, type BiometricSnapshot } from "@/lib/gemini";

export const runtime = "nodejs";

interface RequestBody {
  heightFeet: number;
  heightInches: number;
  weightLb: number;
  age: number;
  gender: Gender;
  biometrics?: BiometricSnapshot;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<RequestBody>;

    const { heightFeet, heightInches, weightLb, age, gender, biometrics } = body;

    if (
      !isFiniteNumber(heightFeet) ||
      !isFiniteNumber(heightInches) ||
      !isFiniteNumber(weightLb) ||
      !isFiniteNumber(age) ||
      (gender !== "male" && gender !== "female")
    ) {
      return NextResponse.json({ error: "Missing or invalid height, weight, age, or gender." }, { status: 400 });
    }
    if (heightFeet < 3 || heightFeet > 8 || heightInches < 0 || heightInches >= 12) {
      return NextResponse.json({ error: "Height looks out of range." }, { status: 400 });
    }
    if (weightLb < 50 || weightLb > 700) {
      return NextResponse.json({ error: "Weight looks out of range." }, { status: 400 });
    }
    if (age < 13 || age > 100) {
      return NextResponse.json({ error: "This formula is only validated for ages 13-100." }, { status: 400 });
    }

    const result = estimateBodyComposition({
      heightCm: feetInchesToCm(heightFeet, heightInches),
      weightKg: lbToKg(weightLb),
      age,
      gender,
    });

    let insight: string;
    try {
      insight = await getBodyCompositionInsight({
        bodyFatPercent: result.bodyFatPercent,
        category: result.category,
        bmi: result.bmi,
        age,
        gender,
        biometrics,
      });
    } catch (err) {
      // Gemini being unavailable shouldn't hide the real, already-computed
      // number — fall back to a plain factual sentence instead.
      console.warn("[/api/body-composition] Gemini insight unavailable:", (err as Error).message);
      insight = `Estimated body fat: ${result.bodyFatPercent}% (${result.category}), from the Deurenberg formula — a formula-based estimate, not a clinical measurement.`;
    }

    return NextResponse.json({ ...result, insight });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/body-composition]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
