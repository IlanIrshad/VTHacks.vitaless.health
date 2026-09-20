"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface BiometricReading {
  heartRateBpm: number;
  respirationRateBpm: number;
  hrvMs: number | null;
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
  source: "presage";
}

export type SensingStatus = "idle" | "starting" | "live" | "denied" | "unsupported";

interface WebcamCaptureProps {
  onReading: (reading: BiometricReading) => void;
  /** How often to sample, in seconds. Presage's underlying Physiology API needs a short clip, not a single frame. */
  intervalSec?: number;
  routineId?: string | null;
  /** Report sensing status up so the parent can render its own camera-frame chrome. */
  onStatusChange?: (status: SensingStatus) => void;
  /** Whether to visually show the live video feed. Sensing keeps running in the background either way. */
  visible?: boolean;
  className?: string;
}

/**
 * Captures short webcam clips at a fixed interval and sends them to
 * /api/biometrics, which forwards them to Presage for vitals analysis (see
 * src/lib/presage.ts for why this two-hop approach is needed — Presage has
 * no browser SDK).
 *
 * There is no simulated/fabricated fallback: without camera access, or
 * without a configured Presage key, this component simply reports no
 * reading rather than inventing one. Mount this once near the app root (not
 * per-tab) so sensing starts the instant the page loads — pass `visible` to
 * control whether the feed is actually shown.
 */
export default function WebcamCapture({
  onReading,
  intervalSec = 12,
  routineId,
  onStatusChange,
  visible = true,
  className,
}: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [status, setStatusState] = useState<SensingStatus>("idle");

  // The sensing loop below is set up once on mount (see the effect further
  // down) so switching tabs never restarts the camera. That means its
  // setInterval callback closes over whatever `routineId`/`onReading` were
  // at mount time — without these refs, a routine started later would never
  // actually get tagged on any sample (routine_id would stay null forever),
  // which silently breaks the Tiger Data session grouping in the Trends tab.
  const routineIdRef = useRef(routineId);
  routineIdRef.current = routineId;
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;

  const setStatus = useCallback(
    (s: SensingStatus) => {
      setStatusState(s);
      onStatusChange?.(s);
    },
    [onStatusChange]
  );

  const sendClip = useCallback(async (blob: Blob) => {
    try {
      const params = new URLSearchParams({ userId: "demo-user" });
      const currentRoutineId = routineIdRef.current;
      if (currentRoutineId) params.set("routineId", currentRoutineId);

      const form = new FormData();
      form.append("video", blob, "clip.webm");
      const res = await fetch(`/api/biometrics?${params.toString()}`, { method: "POST", body: form });
      // A non-2xx response means Presage couldn't produce a real reading for
      // this clip (missing key, processing failure, timeout, etc). We skip
      // this sample rather than showing anything — the next interval retries.
      if (!res.ok) return;
      const reading = (await res.json()) as BiometricReading;
      onReadingRef.current(reading);
    } catch {
      // Network hiccup — just skip this sample, next interval will retry.
    }
  }, []);

  const recordOneClip = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === "undefined") return;
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorderRef.current = recorder;
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = () => sendClip(new Blob(chunks, { type: "video/webm" }));
    recorder.start();
    setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 4000); // 4s clip
  }, [sendClip]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("live");
        recordOneClip();
        intervalId = setInterval(recordOneClip, intervalSec * 1000);
      } catch {
        setStatus("denied");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalSec]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={className}
      style={{ display: visible ? undefined : "none" }}
      aria-label="Live camera feed used for pulse sensing"
    />
  );
}

export function sensingStatusLabel(status: SensingStatus, intervalSec = 12): string {
  switch (status) {
    case "live":
      return `Reading vitals — sensing every ${intervalSec}s`;
    case "starting":
      return "Requesting camera access…";
    case "denied":
      return "Camera unavailable — no live vitals";
    case "unsupported":
      return "Camera not supported in this browser — no live vitals";
    default:
      return "Starting…";
  }
}
