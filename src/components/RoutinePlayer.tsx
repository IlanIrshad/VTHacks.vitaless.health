"use client";

import { useEffect, useRef, useState } from "react";
import { ROUTINES, adaptRoutine, type Routine, type RoutineId } from "@/lib/routines";
import type { BiometricReading } from "./WebcamCapture";
import BreathingCircle from "./BreathingCircle";

interface RoutinePlayerProps {
  biometrics: BiometricReading | null;
  activeRoutineId: RoutineId | null;
  onRoutineChange: (id: RoutineId | null) => void;
}

interface FrozenStep {
  label: string;
  narration: string;
  durationSec: number;
  reasonText: string | null;
}

function freezeStep(routine: Routine, stepIndex: number, biometrics: BiometricReading | null): FrozenStep {
  const base = routine.steps[stepIndex];
  if (!biometrics) {
    return { label: base.label, narration: base.narration, durationSec: base.durationSec, reasonText: null };
  }
  const adapted = adaptRoutine(routine, biometrics).steps[stepIndex];
  let reasonText: string | null = null;
  if (adapted.durationSec > base.durationSec) {
    reasonText = `normally ${base.durationSec}s, slowed because stress is ${Math.round(biometrics.stressLevel * 100)}%`;
  } else if (adapted.durationSec < base.durationSec) {
    reasonText = `normally ${base.durationSec}s, shortened because focus is ${Math.round(biometrics.focusLevel * 100)}%`;
  }
  return { label: adapted.label, narration: adapted.narration, durationSec: adapted.durationSec, reasonText };
}

export default function RoutinePlayer({ biometrics, activeRoutineId, onRoutineChange }: RoutinePlayerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frozen, setFrozen] = useState<FrozenStep | null>(null);
  const [startReading, setStartReading] = useState<BiometricReading | null>(null);
  const [summary, setSummary] = useState<{ start: BiometricReading; end: BiometricReading; routineTitle: string } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const biometricsRef = useRef(biometrics);
  biometricsRef.current = biometrics;

  const baseRoutine = activeRoutineId ? ROUTINES[activeRoutineId] : null;

  // New routine selected — reset player state and freeze the first step.
  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
    setSummary(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (baseRoutine) {
      setStartReading(biometricsRef.current);
      setFrozen(freezeStep(baseRoutine, 0, biometricsRef.current));
    } else {
      setFrozen(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoutineId]);

  async function narrate(text: string) {
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      const audioEl = audioRef.current;
      audioEl.src = url;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      await audioEl.play();
    } catch {
      // Voice narration is best-effort — routine still advances on its timer either way.
    }
  }

  useEffect(() => {
    if (!playing || !frozen) return;
    narrate(frozen.narration);

    timerRef.current = setTimeout(() => {
      if (!baseRoutine) return;
      const nextIndex = stepIndex + 1;
      if (nextIndex < baseRoutine.steps.length) {
        setFrozen(freezeStep(baseRoutine, nextIndex, biometricsRef.current));
        setStepIndex(nextIndex);
      } else {
        setPlaying(false);
        if (startReading && biometricsRef.current) {
          setSummary({ start: startReading, end: biometricsRef.current, routineTitle: baseRoutine.title });
        }
      }
    }, frozen.durationSec * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frozen]);

  function handleBegin() {
    // Unlock audio playback synchronously within this click, before any
    // await — Safari otherwise blocks every later programmatic play().
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.play().catch(() => {});
    }
    setPlaying(true);
  }

  function handleEnd() {
    setPlaying(false);
    onRoutineChange(null);
  }

  if (!activeRoutineId || !baseRoutine) {
    return null;
  }

  if (summary) {
    const stressDelta = Math.round((summary.end.stressLevel - summary.start.stressLevel) * 100);
    const hrDelta = Math.round(summary.end.heartRateBpm - summary.start.heartRateBpm);
    return (
      <div className="summary-card">
        <div className="eyebrow">Session complete — {summary.routineTitle}</div>
        <h3 className="headline" style={{ fontSize: 20, marginTop: 6 }}>
          Your readings during this session
        </h3>
        <div className="summary-grid">
          <div className="summary-metric">
            <div className="metric-label" style={{ justifyContent: "center" }}>
              Heart rate
            </div>
            <div className="before-after">
              {Math.round(summary.start.heartRateBpm)} → {Math.round(summary.end.heartRateBpm)} bpm
            </div>
            <div className={`delta ${hrDelta <= 0 ? "down" : "up"}`}>
              {hrDelta === 0 ? "steady" : `${hrDelta > 0 ? "+" : ""}${hrDelta} bpm`}
            </div>
          </div>
          <div className="summary-metric">
            <div className="metric-label" style={{ justifyContent: "center" }}>
              Stress
            </div>
            <div className="before-after">
              {Math.round(summary.start.stressLevel * 100)}% → {Math.round(summary.end.stressLevel * 100)}%
            </div>
            <div className={`delta ${stressDelta <= 0 ? "down" : "up"}`}>
              {stressDelta === 0 ? "steady" : `${stressDelta > 0 ? "+" : ""}${stressDelta}%`}
            </div>
          </div>
        </div>
        <p className="state-note" style={{ marginTop: 8 }}>
          Camera-based estimate over this session — not a clinical measurement.
        </p>
        <div className="routine-actions" style={{ marginTop: 4 }}>
          <button className="primary-btn" onClick={() => onRoutineChange(null)}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!frozen) return null;

  return (
    <div className="routine-player">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="eyebrow">
          Step {stepIndex + 1} of {baseRoutine.steps.length}
        </div>
        <button className="pill-btn" onClick={handleEnd}>
          End routine
        </button>
      </div>

      <BreathingCircle label={frozen.label} durationSec={frozen.durationSec} running={playing} />

      <div className="routine-step-label">{frozen.label}</div>
      <div className="routine-narration">{frozen.narration}</div>
      {frozen.reasonText && <div className="pace-note">{frozen.label} — {frozen.durationSec}s ({frozen.reasonText})</div>}

      <div className="routine-actions">
        {!playing ? (
          <button className="primary-btn" onClick={handleBegin}>
            {stepIndex === 0 ? "Begin" : "Resume"}
          </button>
        ) : (
          <button className="primary-btn" onClick={() => setPlaying(false)}>
            Pause
          </button>
        )}
        <button className="pill-btn" onClick={handleEnd}>
          Choose another
        </button>
      </div>
    </div>
  );
}
