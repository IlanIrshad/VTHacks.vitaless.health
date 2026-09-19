"use client";

import { useState } from "react";
import type { AuthUser, UserPreferences } from "@/lib/useAuth";

export default function AccountSettingsModal({
  user,
  onClose,
  onSaved,
}: {
  user: AuthUser;
  onClose: () => void;
  onSaved: (preferences: UserPreferences) => void;
}) {
  const [timezone, setTimezone] = useState(user.preferences.timezone ?? "");
  const [goals, setGoals] = useState(user.preferences.goals ?? "");
  const [preferredVoiceId, setPreferredVoiceId] = useState(user.preferences.preferredVoiceId ?? "");
  const [notifyCheckIns, setNotifyCheckIns] = useState(user.preferences.notifyCheckIns ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <input id="pref-timezone" type="text" placeholder="e.g. America/New_York" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pref-goals">Wellness goals</label>
          <textarea id="pref-goals" rows={3} placeholder="What are you working on?" value={goals} onChange={(e) => setGoals(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pref-voice">Preferred ElevenLabs voice ID</label>
          <input id="pref-voice" type="text" value={preferredVoiceId} onChange={(e) => setPreferredVoiceId(e.target.value)} />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={notifyCheckIns} onChange={(e) => setNotifyCheckIns(e.target.checked)} />
          Remind me to check in
        </label>

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
