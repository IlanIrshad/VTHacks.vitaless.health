"use client";

import { useState } from "react";
import type { AuthUser } from "@/lib/useAuth";

export type ViewId = "dashboard" | "session" | "routines" | "trends";

const TABS: { id: ViewId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "session", label: "Live session" },
  { id: "routines", label: "Routines" },
  { id: "trends", label: "Trends" },
];

interface TopNavProps {
  active: ViewId;
  onChange: (v: ViewId) => void;
  user: AuthUser | null;
  onSignIn: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export default function TopNav({ active, onChange, user, onSignIn, onOpenSettings, onSignOut }: TopNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header>
      <div className="logo">Vitaless</div>
      <nav>
        {TABS.map((tab) => (
          <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
      <div className="account-area">
        {user ? (
          <>
            <button className="account-btn" onClick={() => setMenuOpen((v) => !v)}>
              {user.name}
            </button>
            {menuOpen && (
              <div className="account-menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenSettings();
                  }}
                >
                  Account settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </>
        ) : (
          <button className="account-btn" onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
