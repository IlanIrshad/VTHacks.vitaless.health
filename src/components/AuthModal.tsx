"use client";

import { useState } from "react";
import type { AuthUser } from "@/lib/useAuth";

export default function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, name } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }
      onAuthed(data.user);
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="headline" style={{ fontSize: 22 }}>
          {mode === "login" ? "Sign in" : "Create an account"}
        </h2>
        <p className="state-note" style={{ padding: 0 }}>
          Optional — signing in saves your chat history and preferences. The app works fully without an account.
        </p>

        {mode === "signup" && (
          <div className="field">
            <label htmlFor="auth-name">Name</label>
            <input id="auth-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="primary-btn" style={{ alignSelf: "stretch", justifyContent: "center", textAlign: "center" }} onClick={submit} disabled={submitting}>
          {submitting ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <div className="modal-footer">
          <button className="link-btn" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
          <button className="pill-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
