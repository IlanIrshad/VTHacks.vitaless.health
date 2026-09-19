"use client";

import { ROUTINES, pickRoutineForState, type RoutineId } from "@/lib/routines";
import type { BiometricReading } from "./WebcamCapture";
import RoutinePlayer from "./RoutinePlayer";

interface RoutinesViewProps {
  active: boolean;
  biometrics: BiometricReading | null;
  activeRoutineId: RoutineId | null;
  onRoutineChange: (id: RoutineId | null) => void;
}

export default function RoutinesView({ active, biometrics, activeRoutineId, onRoutineChange }: RoutinesViewProps) {
  const recommended = biometrics
    ? pickRoutineForState({
        stressLevel: biometrics.stressLevel,
        focusLevel: biometrics.focusLevel,
        energyLevel: biometrics.energyLevel,
      })
    : null;

  return (
    <section id="routines" className={`view${active ? " active" : ""}`}>
      <h1 className="page-title">Guided routines</h1>
      <p className="page-subtitle">Sage adapts pacing to how you&apos;re doing right now.</p>

      {activeRoutineId ? (
        <RoutinePlayer biometrics={biometrics} activeRoutineId={activeRoutineId} onRoutineChange={onRoutineChange} />
      ) : (
        <div className="routine-grid">
          {Object.values(ROUTINES).map((r) => (
            <div key={r.id} className="routine-card">
              <div>
                <div className="headline" style={{ fontSize: 18, fontWeight: 700 }}>
                  {r.title}
                </div>
                {recommended === r.id && <span className="recommended-badge">Recommended now</span>}
              </div>
              <p className="desc">{r.description}</p>
              <button className="primary-btn" onClick={() => onRoutineChange(r.id)}>
                Start
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
