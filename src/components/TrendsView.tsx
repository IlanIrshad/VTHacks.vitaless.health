"use client";

import { useEffect, useState } from "react";
import { ROUTINES, type RoutineId } from "@/lib/routines";

interface SampleRow {
  time: string;
  heart_rate_bpm: number;
  respiration_rate_bpm: number;
  stress_level: number;
  focus_level: number;
  energy_level: number;
  routine_id: string | null;
}

function stressQualitative(avg: number): string {
  if (avg >= 0.6) return "high";
  if (avg >= 0.4) return "medium";
  return "low";
}

function buildSparklinePoints(rows: SampleRow[]): string {
  if (rows.length === 0) return "";
  const w = 600;
  const h = 140;
  const n = rows.length;
  return rows
    .map((row, i) => {
      const x = n === 1 ? 0 : (i / (n - 1)) * w;
      const y = h - 10 - row.stress_level * 110;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

interface SessionGroup {
  routineId: string;
  startTime: Date;
  sampleCount: number;
  avgStress: number;
}

function groupSessions(rowsAsc: SampleRow[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  let current: { routineId: string; startTime: Date; stressSum: number; count: number } | null = null;

  for (const row of rowsAsc) {
    if (row.routine_id && current && row.routine_id === current.routineId) {
      current.stressSum += row.stress_level;
      current.count++;
    } else {
      if (current) {
        groups.push({
          routineId: current.routineId,
          startTime: current.startTime,
          sampleCount: current.count,
          avgStress: current.stressSum / current.count,
        });
      }
      current = row.routine_id
        ? { routineId: row.routine_id, startTime: new Date(row.time), stressSum: row.stress_level, count: 1 }
        : null;
    }
  }
  if (current) {
    groups.push({
      routineId: current.routineId,
      startTime: current.startTime,
      sampleCount: current.count,
      avgStress: current.stressSum / current.count,
    });
  }
  return groups.reverse(); // most recent first
}

export default function TrendsView({ active }: { active: boolean }) {
  const [rows, setRows] = useState<SampleRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/sessions?limit=150");
        const data = await res.json();
        if (cancelled) return;
        setRows(data.rows || []);
        setWarning(data.warning || null);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    }

    load();
    const id = setInterval(load, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);

  const rowsAsc = [...rows].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const liveWindow = rowsAsc.filter((r) => new Date(r.time).getTime() >= fiveMinAgo);
  const sessions = groupSessions(rowsAsc).slice(0, 8);

  return (
    <section id="trends" className={`view${active ? " active" : ""}`}>
      <h1 className="page-title" style={{ fontSize: 30 }}>
        Trends
      </h1>
      <p className="page-subtitle">Your vitals over time, stored as a Tiger Data (TimescaleDB) hypertable.</p>

      <div className="chart-card" style={{ marginTop: 28 }}>
        <div className="eyebrow">Stress — last 5 minutes</div>
        {liveWindow.length < 2 ? (
          <p className="state-note">
            {loaded ? "Measuring — your first trend point lands in about 15 seconds." : "Loading…"}
          </p>
        ) : (
          <>
            <svg viewBox="0 0 600 140" width="100%" height="160" preserveAspectRatio="none" style={{ marginTop: 10 }}>
              <polyline
                points={`0,140 ${buildSparklinePoints(liveWindow)} 600,140`}
                fill="#E4EFE9"
                stroke="none"
              />
              <polyline
                points={buildSparklinePoints(liveWindow)}
                fill="none"
                stroke="#3D7A68"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="chart-axis">
              <span>{new Date(liveWindow[0].time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span>now</span>
            </div>
          </>
        )}
        {warning && <p className="state-note error">Database unavailable — showing what we have. ({warning})</p>}
      </div>

      <div className="session-list">
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>Recent sessions</h3>
        {sessions.length === 0 ? (
          <p className="state-note">No routines completed yet — start one from the Routines tab to see it here.</p>
        ) : (
          sessions.map((s, i) => {
            const durationMin = Math.max(1, Math.round((s.sampleCount * 12) / 60));
            const title = ROUTINES[s.routineId as RoutineId]?.title || s.routineId;
            return (
              <div className="session-row" key={i}>
                <div>
                  <div className="date">
                    {s.startTime.toLocaleDateString([], { month: "short", day: "numeric" })},{" "}
                    {s.startTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </div>
                  <div className="meta">
                    {title} · {durationMin} min · avg stress {stressQualitative(s.avgStress)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
