"use client";

import type { BiometricReading } from "./WebcamCapture";
import { minutesAtLevel, trendDirection, type HistoryEntry } from "@/lib/trend";

interface DashboardViewProps {
  active: boolean;
  reading: BiometricReading | null;
  history: HistoryEntry[];
  insight: string | null;
  onStartCheckIn: () => void;
  onPlayInsight: () => void;
}

function stressLabel(level: number): string {
  if (level >= 0.6) return "High";
  if (level >= 0.4) return "Medium";
  return "Low";
}

function overallState(reading: BiometricReading | null, history: HistoryEntry[]): { label: string; desc: string } {
  if (!reading) {
    return { label: "Sensing…", desc: "Measuring your pulse now from your camera — your first reading lands in about 15 seconds." };
  }
  if (reading.stressLevel >= 0.6) {
    return {
      label: "Stress is elevated",
      desc: "Your heart rate and breathing suggest rising stress right now. A short breathing routine could help.",
    };
  }
  if (reading.focusLevel <= 0.4) {
    return { label: "Focus is drifting", desc: "Your focus signal is low right now — a quick focus reset might help before your next task." };
  }
  if (reading.energyLevel <= 0.4) {
    return { label: "Energy is low", desc: "Your readings suggest low energy. A short movement routine can help shake off a slump." };
  }
  const minutes = minutesAtLevel(history, "stressLevel", (v) => v < 0.4);
  return {
    label: "Calm & focused",
    desc:
      minutes > 0
        ? `Your stress has stayed low for the last ${minutes} minute${minutes === 1 ? "" : "s"}. This is a good window to keep working through your task list.`
        : "Your readings look steady right now.",
  };
}

export default function DashboardView({ active, reading, history, insight, onStartCheckIn, onPlayInsight }: DashboardViewProps) {
  const state = overallState(reading, history);
  const hrTrend = trendDirection(history, "heartRateBpm");
  const stressTrend = trendDirection(history, "stressLevel");

  return (
    <section id="dashboard" className={`view${active ? " active" : ""}`}>
      <div className="eyebrow">Vitaless</div>
      <h1 className="page-title">Your vitals, right now</h1>

      <div className="dash-grid">
        <div className="hero-card">
          <div className="state-row">
            <div className="icon-circle" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3D7A68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2-8 4 16 2-8h6" />
              </svg>
            </div>
            <div>
              <div className="eyebrow">Overall state</div>
              <div className="headline" style={{ fontSize: 22, fontWeight: 700 }}>
                {state.label}
              </div>
            </div>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 15, lineHeight: 1.5 }}>{state.desc}</p>
          <button className="primary-btn" onClick={onStartCheckIn}>
            Start check-in
          </button>
        </div>

        <div className="metrics-col">
          <div className="metric-card">
            <div className="metric-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2-8 4 16 2-8h6" />
              </svg>
              Heart rate
            </div>
            <div className="metric-value">{reading ? `${Math.round(reading.heartRateBpm)} bpm` : "—"}</div>
            <div className={`metric-delta ${hrTrend === "up" ? "warn" : hrTrend === "down" ? "up" : ""}`}>
              {reading ? (hrTrend === "up" ? "Rising" : hrTrend === "down" ? "Falling" : "Steady") : "Waiting for signal"}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M15 7h6v6" />
              </svg>
              Stress
            </div>
            <div className="metric-value">{reading ? stressLabel(reading.stressLevel) : "—"}</div>
            <div className={`metric-delta ${stressTrend === "down" ? "up" : stressTrend === "up" ? "warn" : ""}`}>
              {reading ? (stressTrend === "up" ? "Rising" : stressTrend === "down" ? "Easing" : "Steady") : "Waiting for signal"}
            </div>
          </div>
        </div>

        <div className="insight-card">
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Sage&apos;s take
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
              {insight || "Ask Sage for a check-in to get a read on how you're doing right now."}
            </p>
          </div>
          <button className="voice-btn" aria-label="Play voice insight" onClick={onPlayInsight} disabled={!insight}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3D7A68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9v6h4l5 5V4L8 9H4z" />
              <path d="M16.5 8a5 5 0 010 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="footer-note">
        Vitaless is a wellness tool, not a medical device, and is not for diagnosis. Vitals are camera-based estimates
        from Presage&apos;s Human Sensing Layer (or simulated when no sponsor key is configured) — not clinical
        measurements.
      </div>
    </section>
  );
}
