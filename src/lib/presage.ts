// Client for Presage's biometric sensing ("Human Sensing Layer").
//
// IMPORTANT: Presage publishes native SDKs for iOS, Android, and C++ — there
// is no browser SDK. For a web app, the workaround used here is: record a
// short webcam clip client-side (see WebcamCapture.tsx), upload it to our
// own /api/biometrics route, and have the SERVER forward it to Presage's
// Physiology API, which analyzes heart rate and respiration rate from video.
//
// The real REST contract (confirmed 2026-09-19 by downloading the official
// `Presage-Technologies` PyPI package and reading its client source, then
// verifying live against the real API with a real key — the "v1" paths
// documented in Presage's general docs / the Python package's older methods
// return 403 MissingAuthenticationTokenException; only "v2" is actually
// deployed):
//
//   1. POST {base}/v2/upload-url   headers: x-api-key
//        body: { file_size: <bytes>, metrics: ["hr", "rr"] }
//        -> { id, upload_id, urls: [<presigned S3 PUT url>, ...] }
//      (urls has one entry per 5MB chunk — our clips are always under that,
//      so in practice there's exactly one.)
//   2. PUT the raw video bytes to each url in order, with NO extra headers
//      (no auth header, no explicit Content-Type — the presigned URL's
//      signature is tied to the exact headers used when it was minted, and
//      adding a Content-Type breaks the signature). Capture the `ETag`
//      response header for each part.
//   3. POST {base}/v2/complete      headers: x-api-key
//        body: { id, upload_id, parts: [{ ETag, PartNumber }, ...] }
//   4. Poll POST {base}/retrieve-data   headers: x-api-key
//        body: { id, reshape: false }
//        -> 201 "Video not yet processed" while queued; 200 with the result
//        JSON once done; 401 if the key is bad.
//
// The exact field names inside the 200 response weren't confirmed against a
// real face video during setup (only verified the plumbing with a dummy
// file, which never finishes processing) — resultFieldsFromResponse() below
// tries a few plausible shapes (the request explicitly asks for metrics
// "hr"/"rr", so the response very likely echoes those keys) and throws with
// the raw JSON logged if none match, so a real test run makes the fix
// obvious immediately rather than silently misreading a wrong field.
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

const BASE_URL = () => process.env.PRESAGE_API_BASE_URL || "https://api.physiology.presagetech.com";
const MAX_PART_SIZE = 5 * 1024 * 1024; // 5MB — matches Presage's multipart upload chunking

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

interface UploadUrlResponse {
  id: string;
  upload_id: string;
  urls: string[];
}

async function requestUploadUrl(apiKey: string, fileSize: number): Promise<UploadUrlResponse> {
  const res = await fetch(`${BASE_URL()}/v2/upload-url`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ file_size: fileSize, metrics: ["hr", "rr"] }),
  });
  if (!res.ok) {
    throw new Error(`Presage upload-url request failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function uploadParts(urls: string[], bytes: Uint8Array): Promise<{ ETag: string; PartNumber: number }[]> {
  const parts: { ETag: string; PartNumber: number }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const start = i * MAX_PART_SIZE;
    const chunk = bytes.slice(start, start + MAX_PART_SIZE);
    // No extra headers here — the presigned URL's signature only matches
    // the exact (headerless) request shape Presage signed it for.
    const res = await fetch(urls[i], { method: "PUT", body: chunk });
    if (!res.ok) {
      throw new Error(`Presage part upload failed: ${res.status} ${await res.text()}`);
    }
    const etag = res.headers.get("etag");
    if (!etag) throw new Error("Presage part upload succeeded but returned no ETag header.");
    parts.push({ ETag: etag, PartNumber: i + 1 });
  }
  return parts;
}

async function completeUpload(
  apiKey: string,
  id: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<void> {
  const res = await fetch(`${BASE_URL()}/v2/complete`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ id, upload_id: uploadId, parts }),
  });
  if (!res.ok) {
    throw new Error(`Presage complete request failed: ${res.status} ${await res.text()}`);
  }
}

/** Tries a few plausible field-name shapes for the retrieve-data payload — see the module comment. */
function resultFieldsFromResponse(data: Record<string, unknown>): { hr: number; rr: number } | null {
  const hr = data.hr ?? data.heart_rate ?? data.heartRate ?? data.hr_bpm;
  const rr = data.rr ?? data.respiration_rate ?? data.respirationRate ?? data.rr_bpm ?? data.br;
  if (typeof hr === "number" && typeof rr === "number") return { hr, rr };
  return null;
}

async function pollForResult(apiKey: string, id: string): Promise<{ hr: number; rr: number }> {
  const maxAttempts = 15;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${BASE_URL()}/retrieve-data`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ id, reshape: false }),
    });
    if (res.status === 401) {
      throw new Error("Presage rejected the API key (401) while polling for a result.");
    }
    if (res.status === 200) {
      const data = await res.json();
      const fields = resultFieldsFromResponse(data);
      if (!fields) {
        console.warn("[presage] Unrecognized retrieve-data shape — adjust resultFieldsFromResponse():", JSON.stringify(data));
        throw new Error("Presage returned a result but its shape wasn't recognized — see server logs.");
      }
      return fields;
    }
    // 201 ("Video not yet processed") or anything else transient — wait and retry.
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Presage result did not complete in time; falling back upstream to simulated data recommended.");
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

  const bytes = new Uint8Array(await videoBlob.arrayBuffer());
  const { id, upload_id, urls } = await requestUploadUrl(apiKey, bytes.byteLength);
  const parts = await uploadParts(urls, bytes);
  await completeUpload(apiKey, id, upload_id, parts);
  const { hr, rr } = await pollForResult(apiKey, id);

  return {
    heartRateBpm: hr,
    respirationRateBpm: rr,
    ...deriveScores(hr, rr),
    source: "presage",
  };
}
