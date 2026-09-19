"use client";

import { useEffect, useState } from "react";

type Phase = "inhale" | "hold" | "exhale" | "rest";

function phaseFromLabel(label: string): Phase {
  const l = label.toLowerCase();
  if (l.includes("inhale") || l.includes("breathe in")) return "inhale";
  if (l.includes("exhale") || l.includes("release")) return "exhale";
  if (l.includes("hold")) return "hold";
  return "rest";
}

/**
 * A single circle that expands on inhale, holds, and contracts on exhale —
 * driven by the routine step's own label + duration so it needs no extra
 * wiring. Falls back to a static circle with a countdown for
 * prefers-reduced-motion, per Phase 9 of the build plan.
 */
export default function BreathingCircle({
  label,
  durationSec,
  running,
}: {
  label: string;
  durationSec: number;
  running: boolean;
}) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [countdown, setCountdown] = useState(durationSec);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setCountdown(durationSec);
    if (!running) return;
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCountdown(Math.max(0, Math.ceil(durationSec - elapsed)));
    }, 250);
    return () => clearInterval(id);
  }, [durationSec, label, running]);

  const phase = phaseFromLabel(label);
  const scale = phase === "inhale" ? 1.35 : phase === "exhale" ? 0.8 : 1.1;

  const style: React.CSSProperties = reducedMotion
    ? {}
    : {
        transform: running ? `scale(${scale})` : "scale(1)",
        transitionDuration: `${durationSec}s`,
      };

  return (
    <div className="breathing-circle-wrap">
      <div className={`breathing-circle${reducedMotion ? " reduced-motion" : ""}`} style={style}>
        {reducedMotion ? countdown : ""}
      </div>
    </div>
  );
}
