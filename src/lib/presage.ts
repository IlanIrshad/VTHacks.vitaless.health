// Client for Presage's biometric sensing ("Human Sensing Layer").
//
// IMPORTANT: Presage publishes native SDKs for iOS, Android, and C++ — there
// is no browser SDK. For a web app, the workaround used here is: record a
// short webcam clip client-side (see WebcamCapture.tsx), upload it to our
// own /api/biometrics route, and have the SERVER forward it to Presage's
// Physiology API, which analyzes heart rate, respiration, and heart-rate
// variability from video.
//
// The real REST contract (confirmed 2026-09-19 by downloading the official
// `Presage-Technologies` PyPI package and reading its client source, then
// verifying live against the real API with a real key — the "v1" paths
// documented in Presage's general docs / the Python package's older methods
// return 403 MissingAuthenticationTokenException; only "v2" is actually
// deployed):
//
//   1. POST {base}/v2/upload-url   headers: x-api-key
//        body: { file_size: <bytes>, metrics: ["hr", "rr", "hrv"] }
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
// file, which never finishes processing, since Presage can't extract a
// pulse from noise) — resultFieldsFromResponse() below tries a few
// plausible shapes (the request explicitly asks for metrics
// "hr"/"rr"/"hrv", so the response very likely echoes those keys) and
// throws with the raw JSON logged if none match, so the first real run
// surfaces the mismatch loudly in server logs instead of silently
// misreading a field.
//
// DELIBERATE: there is no simulated/fabricated fallback anywhere in this
// module. If PRESAGE_API_KEY isn't set, or Presage can't produce a result,
// analyzeClip() throws — callers must not invent a reading to paper over
// that. A missing or failed reading should render as "no data" in the UI,
// never as numbers nobody actually measured.

export interface PresageReading {
  heartRateBpm: number;
  respirationRateBpm: number;
  /** ms, if Presage returned it for this clip — heart-rate variability, the primary real signal the stress estimate below is grounded in. */
  hrvMs: number | null;
  /** Derived 0-1 scores — Presage doesn't return these directly. Computed
   *  deterministically from the real measured vitals above (HRV when
   *  present, HR/RR otherwise) — never randomized, never fabricated. Rough
   *  heuristic; retune against real sponsor data once real field names/units
   *  are confirmed from an actual completed response. */
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
  source: "presage";
}

const BASE_URL = () => process.env.PRESAGE_API_BASE_URL || "https://api.physiology.presagetech.com";
const MAX_PART_SIZE = 5 * 1024 * 1024; // 5MB — matches Presage's multipart upload chunking

/** Maps raw vitals onto the three normalized 0-1 scores every downstream
 *  consumer (companion prompt, routine picker, UI thresholds) reads. Prefers
 *  HRV for the stress estimate when Presage returned one — lower HRV is a
 *  well-established real indicator of sympathetic/stress load — and falls
 *  back to the cruder HR/RR-only heuristic otherwise. Either way this is a
 *  deterministic function of real measured inputs, not invented data. */
export function deriveScores(
  heartRateBpm: number,
  respirationRateBpm: number,
  hrvMs?: number | null
): {
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
} {
  let stressLevel: number;
  if (typeof hrvMs === "number" && hrvMs > 0) {
    // Typical resting RMSSD-style HRV for adults spans roughly 20-100ms;
    // lower HRV -> higher stress. Confirm the actual units/scale Presage
    // returns against a real response and retune this range.
    stressLevel = clamp01(1 - (hrvMs - 20) / 80);
  } else {
    stressLevel = clamp01((heartRateBpm - 65) / 40 + (respirationRateBpm - 14) / 20);
  }
  const energyLevel = clamp01((heartRateBpm - 55) / 50);
  const focusLevel = clamp01(1 - Math.abs(respirationRateBpm - 14) / 10);
  return { stressLevel, focusLevel, energyLevel };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
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
    body: JSON.stringify({ file_size: fileSize, metrics: ["hr", "rr", "hrv"] }),
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

/** Tries a few plausible field-name shapes for the retrieve-data payload — see the module comment. hrv is optional; hr/rr are required. */
function resultFieldsFromResponse(data: Record<string, unknown>): { hr: number; rr: number; hrv: number | null } | null {
  const hr = data.hr ?? data.heart_rate ?? data.heartRate ?? data.hr_bpm;
  const rr = data.rr ?? data.respiration_rate ?? data.respirationRate ?? data.rr_bpm ?? data.br;
  const hrvRaw = data.hrv ?? data.hrv_ms ?? data.hrvMs ?? data.rmssd;
  if (typeof hr === "number" && typeof rr === "number") {
    return { hr, rr, hrv: typeof hrvRaw === "number" ? hrvRaw : null };
  }
  return null;
}

async function pollForResult(apiKey: string, id: string): Promise<{ hr: number; rr: number; hrv: number | null }> {
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
  throw new Error("Presage did not finish processing this clip in time.");
}

/**
 * Sends a recorded webcam clip to Presage's Physiology API and returns the
 * derived reading. Throws if PRESAGE_API_KEY isn't configured or Presage
 * can't produce a result — callers must surface that as "no data", never
 * substitute a fabricated reading.
 */
export async function analyzeClip(videoBlob: Blob): Promise<PresageReading> {
  const apiKey = process.env.PRESAGE_API_KEY;
  if (!apiKey) {
    throw new Error("PRESAGE_API_KEY is not set — real biometric data requires a configured Presage key.");
  }

  const bytes = new Uint8Array(await videoBlob.arrayBuffer());
  const { id, upload_id, urls } = await requestUploadUrl(apiKey, bytes.byteLength);
  const parts = await uploadParts(urls, bytes);
  await completeUpload(apiKey, id, upload_id, parts);
  const { hr, rr, hrv } = await pollForResult(apiKey, id);

  return {
    heartRateBpm: hr,
    respirationRateBpm: rr,
    hrvMs: hrv,
    ...deriveScores(hr, rr, hrv),
    source: "presage",
  };
}
