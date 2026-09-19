// Client for Presage's biometric sensing ("Human Sensing Layer").
//
// IMPORTANT: Presage publishes native SDKs for iOS, Android, and C++ — there
// is no browser SDK (confirmed against https://www.mlh.com/partners/presage
// and Presage's PyPI packages as of Sep 2026). For a web app, the workaround
// used here is: record a short webcam clip client-side (see
// WebcamCapture.tsx), upload it to our own /api/biometrics route, and have
// the SERVER forward it to Presage's Physiology API, which analyzes heart
// rate and respiration rate from video.
//
// The exact REST endpoint paths were not published in general docs at
// research time (the officially documented client is the Python package
// `presage_technologies`, which wraps: queue_processing_hr_rr(path) ->
// video_id, then retrieve_result(video_id) -> { hr, rr }). PRESAGE_API_BASE_URL
// below is a best-guess default — confirm the real base URL, auth header
// name, and endpoint paths from your Presage dashboard / Discord after
// signing up, and adjust the two fetch calls below accordingly.
//
// Until PRESAGE_API_KEY is set, this module returns simulated biometrics so
// the rest of the app (companion + routines) is fully demoable without a key.

export interface PresageReading {
  heartRateBpm: number;
  respirationRateBpm: number;
  /** Derived 0-1 scores — Presage doesn't return these directly; we compute
   *  simple heuristics from hr/rr so the companion + routine logic has a
   *  single normalized signal to react to. Tune against real sponsor data
   *  during the hackathon. */
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
  source: "presage" | "simulated";
}

/** Maps raw vitals onto the three normalized 0-1 scores every downstream
 *  consumer (companion prompt, routine picker, UI thresholds) reads. */
export function deriveScores(heartRateBpm: number, respirationRateBpm: number): {
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
} {
  // Very rough heuristics for demo purposes:
  // - Resting HR ~60-75bpm treated as calm baseline; higher HR + fast
  //   breathing pushes stress up.
  const stressLevel = clamp01((heartRateBpm - 65) / 40 + (respirationRateBpm - 14) / 20);
  const energyLevel = clamp01((heartRateBpm - 55) / 50);
  const focusLevel = clamp01(1 - Math.abs(respirationRateBpm - 14) / 10);
  return { stressLevel, focusLevel, energyLevel };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Simulates a plausible biometric reading with gentle random drift, for demoing without hardware/API access. */
export function simulateReading(previous?: PresageReading): PresageReading {
  const baseHr = previous?.heartRateBpm ?? 72;
  const baseRr = previous?.respirationRateBpm ?? 15;
  const heartRateBpm = clampRange(baseHr + (Math.random() - 0.5) * 6, 55, 130);
  const respirationRateBpm = clampRange(baseRr + (Math.random() - 0.5) * 2, 10, 26);
  return {
    heartRateBpm,
    respirationRateBpm,
    ...deriveScores(heartRateBpm, respirationRateBpm),
    source: "simulated",
  };
}

function clampRange(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Sends a recorded webcam clip to Presage's Physiology API and returns the
 * derived reading. Falls back to a simulated reading if PRESAGE_API_KEY is
 * not configured, so the demo keeps working without live sponsor credentials.
 */
export async function analyzeClip(videoBlob: Blob): Promise<PresageReading> {
  const apiKey = process.env.PRESAGE_API_KEY;
  if (!apiKey) {
    return simulateReading();
  }

  const baseUrl = process.env.PRESAGE_API_BASE_URL || "https://api.presagetech.com";

  // NOTE: confirm exact paths/payload shape against the real Presage docs —
  // this mirrors the Python client's two-step queue/retrieve flow.
  const form = new FormData();
  form.append("video", videoBlob, "clip.webm");

  const queueRes = await fetch(`${baseUrl}/v1/physiology/hr-rr`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!queueRes.ok) {
    throw new Error(`Presage queue request failed: ${queueRes.status} ${await queueRes.text()}`);
  }
  const { video_id } = (await queueRes.json()) as { video_id: string };

  // Simple poll loop — a real implementation should back off / time out.
  for (let attempt = 0; attempt < 10; attempt++) {
    const resultRes = await fetch(`${baseUrl}/v1/physiology/results/${video_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (resultRes.ok) {
      const data = (await resultRes.json()) as { hr: number; rr: number; status: string };
      if (data.status === "complete") {
        return {
          heartRateBpm: data.hr,
          respirationRateBpm: data.rr,
          ...deriveScores(data.hr, data.rr),
          source: "presage",
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("Presage result did not complete in time; falling back upstream to simulated data recommended.");
}
