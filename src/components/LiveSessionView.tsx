"use client";

import { useEffect, useState } from "react";
import WebcamCapture, { sensingStatusLabel, type BiometricReading, type SensingStatus } from "./WebcamCapture";
import { trendDirection, type HistoryEntry } from "@/lib/trend";
import type { RoutineId } from "@/lib/routines";
import type { ChatTurn } from "@/lib/chat";

interface LiveSessionViewProps {
  active: boolean;
  /** Whether the camera/Presage sensing loop should actually be running right now — see page.tsx for when this is true. */
  sensing: boolean;
  reading: BiometricReading | null;
  history: HistoryEntry[];
  onReading: (r: BiometricReading) => void;
  onSensingStatusChange?: (status: SensingStatus) => void;
  routineId: RoutineId | null;
  turns: ChatTurn[];
  sending: boolean;
  onSend: (message: string) => void;
  onEndSession: () => void;
}

export default function LiveSessionView({
  active,
  sensing,
  reading,
  history,
  onReading,
  onSensingStatusChange,
  routineId,
  turns,
  sending,
  onSend,
  onEndSession,
}: LiveSessionViewProps) {
  const [status, setStatus] = useState<SensingStatus>("idle");
  const [input, setInput] = useState("");

  // WebcamCapture is only ever mounted while `sensing` is true (see below) —
  // once it unmounts, nothing updates `status` anymore, so reset it here or
  // the camera-frame would keep showing whatever it last was (e.g. "live")
  // even though the stream has actually stopped.
  useEffect(() => {
    if (!sensing) setStatus("idle");
  }, [sensing]);

  const hrTrend = trendDirection(history, "heartRateBpm");
  const stressTrend = trendDirection(history, "stressLevel");

  const lastCompanionTurn = [...turns].reverse().find((t) => t.role === "companion");

  function handleSend() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    onSend(message);
  }

  return (
    <section id="session" className={`view${active ? " active" : ""}`}>
      <h1 className="page-title" style={{ fontSize: 30 }}>
        Live session
      </h1>

      <div className="session-layout">
        <div>
          <div className="camera-frame">
            {sensing && (
              <WebcamCapture
                onReading={onReading}
                routineId={routineId}
                onStatusChange={(s) => {
                  setStatus(s);
                  onSensingStatusChange?.(s);
                }}
                visible={status === "live"}
                className="camera-video"
              />
            )}
            {!sensing && (
              <div className="camera-overlay">
                <div style={{ fontSize: 14, fontWeight: 500 }}>Sensing paused — camera is off on this tab</div>
              </div>
            )}
            {sensing && status !== "live" && (
              <div className="camera-overlay">
                <div className="pulse-dot" />
                <div style={{ fontSize: 14, fontWeight: 500 }}>{sensingStatusLabel(status)}</div>
              </div>
            )}
            {sensing && status === "live" && !reading && (
              <div className="camera-overlay" style={{ position: "absolute", bottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>Measuring your pulse…</div>
              </div>
            )}
          </div>

          <div className="live-metrics">
            <div className="live-metric">
              <div className="metric-label" style={{ justifyContent: "center" }}>
                Heart rate
              </div>
              <div className="val" style={{ color: hrTrend === "up" ? "var(--warn)" : undefined }}>
                {reading ? `${Math.round(reading.heartRateBpm)} bpm` : "—"}
              </div>
              <div className={`tag ${hrTrend === "up" ? "warn" : hrTrend === "down" ? "up" : ""}`}>
                {reading ? (hrTrend === "up" ? "Rising" : hrTrend === "down" ? "Falling" : "Steady") : "Sensing…"}
              </div>
            </div>
            <div className="live-metric">
              <div className="metric-label" style={{ justifyContent: "center" }}>
                Stress
              </div>
              <div className="val">{reading ? `${Math.round(reading.stressLevel * 100)}%` : "—"}</div>
              <div className={`tag ${stressTrend === "up" ? "warn" : stressTrend === "down" ? "up" : ""}`}>
                {reading ? (stressTrend === "up" ? "Rising" : stressTrend === "down" ? "Easing" : "Watching") : "Sensing…"}
              </div>
            </div>
            <div className="live-metric">
              <div className="metric-label" style={{ justifyContent: "center" }}>
                Focus
              </div>
              <div className="val">{reading ? `${Math.round(reading.focusLevel * 100)}%` : "—"}</div>
              <div className="tag">{reading ? "Holding" : "Sensing…"}</div>
            </div>
          </div>

          {reading && (
            <div className="source-tag" style={{ marginTop: 10 }}>
              Source: Presage Human Sensing Layer{typeof reading.hrvMs === "number" ? ` · HRV ${Math.round(reading.hrvMs)}ms` : ""}
            </div>
          )}
          {!reading && (status === "denied" || status === "unsupported") && (
            <div className="state-note error" style={{ marginTop: 10 }}>
              No live vitals — Vitaless only shows real Presage readings, and needs camera access to sense your pulse.
            </div>
          )}
        </div>

        <div>
          <div className="advice-card">
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Sage says
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
                {sending
                  ? "Thinking…"
                  : lastCompanionTurn?.text || "Say hello, or ask how you're doing — Sage reads your live vitals as context."}
              </p>
            </div>
          </div>

          <div className="chat-card">
            <div className="chat-log">
              {turns.slice(-6).map((turn, i) => (
                <div key={i} className={`chat-bubble ${turn.role}`}>
                  {turn.text}
                </div>
              ))}
            </div>
            <div className="chat-input-row">
              <input
                type="text"
                placeholder="Tell Sage how you're doing…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={sending}
              />
              <button className="send-btn" onClick={handleSend} disabled={sending}>
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>

          <button className="end-btn" onClick={onEndSession}>
            End session
          </button>
        </div>
      </div>
    </section>
  );
}
