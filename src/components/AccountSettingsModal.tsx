"use client";

import { useMemo, useState } from "react";
import type { AuthUser, UserPreferences } from "@/lib/useAuth";
import { VOICE_OPTIONS } from "@/lib/voices";
import { getBrowserTimezone, getTimezoneOptions } from "@/lib/timezones";

export default function AccountSettingsModal({
  user,
  onClose,
  onSaved,
}: {
  user: AuthUser;
  onClose: () => void;
  onSaved: (preferences: UserPreferences) => void;
}) {
  const timezoneOptions = useMemo(() => getTimezoneOptions(), []);
  const [timezone, setTimezone] = useState(user.preferences.timezone || getBrowserTimezone());
  const [goals, setGoals] = useState(user.preferences.goals ?? "");
  const [preferredVoiceId, setPreferredVoiceId] = useState(user.preferences.preferredVoiceId ?? "");
  const [notifyCheckIns, setNotifyCheckIns] = useState(user.preferences.notifyCheckIns ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testSendState, setTestSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendTestReminder() {
    setTestSendState("sending");
    try {
      const res = await fetch("/api/reminders/test", { method: "POST" });
      setTestSendState(res.ok ? "sent" : "error");
    } catch {
      setTestSendState("error");
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, goals, preferredVoiceId, notifyCheckIns }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't save.");
        return;
      }
      onSaved(data.preferences);
      onClose();
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="headline" style={{ fontSize: 22 }}>
          Account settings
        </h2>
        <p className="state-note" style={{ padding: 0 }}>
          Signed in as {user.email}
        </p>

        <div className="field">
          <label htmlFor="pref-timezone">Timezone</label>
          <select id="pref-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {!timezoneOptions.includes(timezone) && <option value={timezone}>{timezone}</option>}
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pref-goals">Wellness goals</label>
          <textarea id="pref-goals" rows={3} placeholder="What are you working on?" value={goals} onChange={(e) => setGoals(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pref-voice">Preferred voice</label>
          <select id="pref-voice" value={preferredVoiceId} onChange={(e) => setPreferredVoiceId(e.target.value)}>
            <option value="">Use narrator default</option>
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
            {/* A previously-saved id that's since dropped out of VOICE_OPTIONS would otherwise silently
                render as "Use narrator default" while still being what's actually saved — surface it instead. */}
            {preferredVoiceId && !VOICE_OPTIONS.some((v) => v.id === preferredVoiceId) && (
              <option value={preferredVoiceId}>Previously saved voice ({preferredVoiceId})</option>
            )}
          </select>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={notifyCheckIns} onChange={(e) => setNotifyCheckIns(e.target.checked)} />
          Email me a check-in reminder
        </label>
        <div style={{ marginTop: -8, marginBottom: 14 }}>
          <button
            type="button"
            className="pill-btn"
            onClick={sendTestReminder}
            disabled={testSendState === "sending"}
            style={{ fontSize: 13 }}
          >
            {testSendState === "sending" ? "Sending…" : "Send me a test reminder now"}
          </button>
          {testSendState === "sent" && (
            <div className="state-note" style={{ padding: "6px 0 0" }}>
              Sent — check {user.email}.
            </div>
          )}
          {testSendState === "error" && (
            <div className="error-text" style={{ padding: "6px 0 0" }}>
              Couldn't send that email — email sending may not be configured on this server.
            </div>
          )}
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="primary-btn" style={{ alignSelf: "stretch", justifyContent: "center", textAlign: "center" }} onClick={save} disabled={saving}>
          {saving ? "…" : "Save"}
        </button>
        <button className="pill-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
