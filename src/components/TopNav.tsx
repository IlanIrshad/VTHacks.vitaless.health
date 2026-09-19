"use client";

export type ViewId = "dashboard" | "session" | "routines" | "trends";

const TABS: { id: ViewId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "session", label: "Live session" },
  { id: "routines", label: "Routines" },
  { id: "trends", label: "Trends" },
];

export default function TopNav({ active, onChange }: { active: ViewId; onChange: (v: ViewId) => void }) {
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
    </header>
  );
}
