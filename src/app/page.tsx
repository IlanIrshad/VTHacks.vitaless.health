"use client";

import { useRef, useState } from "react";
import TopNav, { type ViewId } from "@/components/TopNav";
import DashboardView from "@/components/DashboardView";
import LiveSessionView from "@/components/LiveSessionView";
import RoutinesView from "@/components/RoutinesView";
import TrendsView from "@/components/TrendsView";
import type { BiometricReading } from "@/components/WebcamCapture";
import type { RoutineId } from "@/lib/routines";
import type { ChatTurn } from "@/lib/chat";
import { pushHistory, type HistoryEntry } from "@/lib/trend";

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [reading, setReading] = useState<BiometricReading | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState<RoutineId | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    { role: "companion", text: "Hi, I'm Sage. I'll check in with you as we go — how are you feeling right now?" },
  ]);
  const [sending, setSending] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function handleReading(r: BiometricReading) {
    setReading(r);
    setHistory((prev) => pushHistory(prev, r));
  }

  /** Unlocks audio playback within a real click handler, before any awaits — see Phase 6 of the build plan. */
  function unlockAudio() {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.play().catch(() => {});
    }
  }

  async function playVoice(text: string) {
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
      audioRef.current.src = url;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      await audioRef.current.play();
    } catch {
      // Voice is a nice-to-have; silently skip if ElevenLabs isn't configured.
    }
  }

  async function send(message: string) {
    unlockAudio();
    const nextTurns = [...turns, { role: "user" as const, text: message }];
    setTurns(nextTurns);
    setSending(true);
    try {
      const res = await fetch("/api/companion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: nextTurns.slice(-8),
          biometrics: reading
            ? {
                heartRateBpm: reading.heartRateBpm,
                respirationRateBpm: reading.respirationRateBpm,
                stressLevel: reading.stressLevel,
                focusLevel: reading.focusLevel,
                energyLevel: reading.energyLevel,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "I'm having trouble responding right now — mind trying again?";
      setTurns((prev) => [...prev, { role: "companion", text: reply }]);
      playVoice(reply);
    } catch {
      setTurns((prev) => [...prev, { role: "companion", text: "I lost connection for a second — try again?" }]);
    } finally {
      setSending(false);
    }
  }

  function handleStartCheckIn() {
    unlockAudio();
    setActiveView("session");
    send("How am I doing right now?");
  }

  const lastCompanionText = [...turns].reverse().find((t) => t.role === "companion")?.text ?? null;

  return (
    <div>
      <TopNav active={activeView} onChange={setActiveView} />
      <main>
        <DashboardView
          active={activeView === "dashboard"}
          reading={reading}
          history={history}
          insight={lastCompanionText}
          onStartCheckIn={handleStartCheckIn}
          onPlayInsight={() => {
            unlockAudio();
            if (lastCompanionText) playVoice(lastCompanionText);
          }}
        />
        <LiveSessionView
          active={activeView === "session"}
          reading={reading}
          history={history}
          onReading={handleReading}
          routineId={activeRoutineId}
          turns={turns}
          sending={sending}
          onSend={send}
          onEndSession={() => setActiveView("dashboard")}
        />
        <RoutinesView
          active={activeView === "routines"}
          biometrics={reading}
          activeRoutineId={activeRoutineId}
          onRoutineChange={setActiveRoutineId}
        />
        <TrendsView active={activeView === "trends"} />
      </main>
    </div>
  );
}
