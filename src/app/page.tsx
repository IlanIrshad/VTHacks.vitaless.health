"use client";

import { useEffect, useRef, useState } from "react";
import TopNav, { type ViewId } from "@/components/TopNav";
import DashboardView from "@/components/DashboardView";
import LiveSessionView from "@/components/LiveSessionView";
import RoutinesView from "@/components/RoutinesView";
import TrendsView from "@/components/TrendsView";
import BodyScanView from "@/components/BodyScanView";
import AuthModal from "@/components/AuthModal";
import AccountSettingsModal from "@/components/AccountSettingsModal";
import type { BiometricReading, SensingStatus } from "@/components/WebcamCapture";
import type { RoutineId } from "@/lib/routines";
import type { ChatTurn } from "@/lib/chat";
import type { AuthUser } from "@/lib/useAuth";
import { pushHistory, type HistoryEntry } from "@/lib/trend";

const DEFAULT_GREETING: ChatTurn = {
  role: "companion",
  text: "Hi, I'm Sage. I'll check in with you as we go — how are you feeling right now?",
};

export default function Home() {
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [reading, setReading] = useState<BiometricReading | null>(null);
  const [sensingStatus, setSensingStatus] = useState<SensingStatus>("idle");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeRoutineId, setActiveRoutineId] = useState<RoutineId | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([DEFAULT_GREETING]);
  const [sending, setSending] = useState(false);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Check for an existing session on load, then hydrate persisted chat
  // history if there is one. Both are best-effort — an anonymous visitor
  // (or a Mongo outage) just sees the normal demo-user experience.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          loadConversation();
        }
      } catch {
        // Not signed in — the app is fully usable anonymously.
      }
    })();
  }, []);

  async function loadConversation() {
    try {
      const res = await fetch("/api/conversation");
      const data = await res.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setTurns(data.messages.map((m: { role: "user" | "companion"; text: string }) => ({ role: m.role, text: m.text })));
      }
    } catch {
      // Keep the default greeting if history can't be loaded.
    }
  }

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

  async function handleSignOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Clear client-side state regardless — worst case the cookie outlives this tab.
    }
    setUser(null);
    setTurns([DEFAULT_GREETING]);
  }

  const lastCompanionText = [...turns].reverse().find((t) => t.role === "companion")?.text ?? null;

  // The camera/Presage sensing loop only runs when something actually needs
  // it: the Live session tab, the Body scan tab (live vitals shown as
  // context there), or an in-progress routine (adaptive pacing + the
  // before/after summary both need a live reading regardless of which tab
  // is currently focused). Everywhere else — Dashboard, Trends, or browsing
  // the routine list without starting one — it stays off, since a
  // permanently-running camera stream + capture interval was the actual
  // cause of the memory/slowness issue.
  const sensingEnabled = activeView === "session" || activeView === "scan" || activeRoutineId !== null;

  // WebcamCapture only reports status while it's mounted, so once sensing
  // turns off nothing updates this anymore — reset it explicitly, or the
  // Dashboard would keep showing whatever status the camera happened to be
  // in the instant it stopped (e.g. stuck on "live").
  useEffect(() => {
    if (!sensingEnabled) setSensingStatus("idle");
  }, [sensingEnabled]);

  function handleEndSession() {
    setActiveView("dashboard");
    // If a routine is also running independently, sensing correctly stays on
    // for its sake — "End session" ends the Live session tab's own session,
    // not a routine you'd end separately from the Routines tab.
  }

  return (
    <div>
      <TopNav
        active={activeView}
        onChange={setActiveView}
        user={user}
        onSignIn={() => setAuthModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onSignOut={handleSignOut}
      />
      <main>
        <DashboardView
          active={activeView === "dashboard"}
          reading={reading}
          sensingStatus={sensingStatus}
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
          sensing={sensingEnabled}
          reading={reading}
          history={history}
          onReading={handleReading}
          onSensingStatusChange={setSensingStatus}
          routineId={activeRoutineId}
          turns={turns}
          sending={sending}
          onSend={send}
          onEndSession={handleEndSession}
        />
        <RoutinesView
          active={activeView === "routines"}
          biometrics={reading}
          activeRoutineId={activeRoutineId}
          onRoutineChange={setActiveRoutineId}
        />
        <TrendsView active={activeView === "trends"} />
        <BodyScanView active={activeView === "scan"} reading={reading} sensingStatus={sensingStatus} />
      </main>

      {authModalOpen && (
        <AuthModal
          onClose={() => setAuthModalOpen(false)}
          onAuthed={(u) => {
            setUser(u);
            setAuthModalOpen(false);
            loadConversation();
          }}
        />
      )}
      {settingsModalOpen && user && (
        <AccountSettingsModal
          user={user}
          onClose={() => setSettingsModalOpen(false)}
          onSaved={(preferences) => setUser((prev) => (prev ? { ...prev, preferences } : prev))}
        />
      )}
    </div>
  );
}
