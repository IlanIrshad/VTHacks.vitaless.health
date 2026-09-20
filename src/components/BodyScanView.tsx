"use client";

import { useState } from "react";
import type { BiometricReading, SensingStatus } from "./WebcamCapture";
import type { Gender } from "@/lib/bodyComposition";

interface BodyScanViewProps {
  active: boolean;
  reading: BiometricReading | null;
  sensingStatus: SensingStatus;
}

interface ScanResult {
  bmi: number;
  bodyFatPercent: number;
  category: string;
  formula: string;
  insight: string;
}

export default function BodyScanView({ active, reading, sensingStatus }: BodyScanViewProps) {
  const [heightFeet, setHeightFeet] = useState("5");
  const [heightInches, setHeightInches] = useState("8");
  const [weightLb, setWeightLb] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender>("male");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function handleCalculate() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/body-composition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heightFeet: Number(heightFeet),
          heightInches: Number(heightInches),
          weightLb: Number(weightLb),
          age: Number(age),
          gender,
          biometrics: reading
            ? {
                heartRateBpm: reading.heartRateBpm,
                respirationRateBpm: reading.respirationRateBpm,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't calculate a result.");
        return;
      }
      setResult(data);
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setLoading(false);
    }
  }

  const hasLiveVitals = reading !== null;

  return (
    <section id="scan" className={`view${active ? " active" : ""}`}>
      <h1 className="page-title" style={{ fontSize: 30 }}>
        Body composition scan
      </h1>
      <p className="page-subtitle">
        An estimate, not a diagnosis — computed with a published formula (BMI, age, gender), with your live Presage
        vitals shown alongside as context.
      </p>

      <div className="session-layout">
        <div className="routine-player" style={{ marginTop: 28 }}>
          <div className="field">
            <label>Height</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="ft"
                value={heightFeet}
                onChange={(e) => setHeightFeet(e.target.value)}
                style={{ width: 70 }}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="in"
                value={heightInches}
                onChange={(e) => setHeightInches(e.target.value)}
                style={{ width: 70 }}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="scan-weight">Weight (lb)</label>
            <input
              id="scan-weight"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 160"
              value={weightLb}
              onChange={(e) => setWeightLb(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="scan-age">Age</label>
            <input
              id="scan-age"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 20"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="scan-gender">Gender</label>
            <select id="scan-gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <div className="state-note" style={{ padding: 0 }}>
              The underlying formula was only validated for these two categories.
            </div>
          </div>

          {error && <div className="error-text">{error}</div>}

          <div className="routine-actions">
            <button className="primary-btn" onClick={handleCalculate} disabled={loading || !weightLb || !age}>
              {loading ? "Calculating…" : "Calculate estimate"}
            </button>
          </div>
        </div>

        <div>
          <div className="live-metrics" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <div className="live-metric">
              <div className="metric-label" style={{ justifyContent: "center" }}>
                Heart rate
              </div>
              <div className="val">{reading ? `${Math.round(reading.heartRateBpm)} bpm` : "—"}</div>
              <div className="tag">{reading ? "live" : "no signal"}</div>
            </div>
            <div className="live-metric">
              <div className="metric-label" style={{ justifyContent: "center" }}>
                Respiration
              </div>
              <div className="val">{reading ? `${Math.round(reading.respirationRateBpm)}/min` : "—"}</div>
              <div className="tag">{reading ? "live" : "no signal"}</div>
            </div>
          </div>

          {!hasLiveVitals && (
            <p className="state-note" style={{ marginTop: 10 }}>
              {sensingStatus === "denied" || sensingStatus === "unsupported"
                ? "No live vitals — grant camera access to include them as context. The estimate below still works without them."
                : "Sensing for live vitals to include as context — this doesn't block calculating your estimate."}
            </p>
          )}

          {result && (
            <div className="summary-card" style={{ marginTop: hasLiveVitals ? 10 : 20 }}>
              <div className="eyebrow">Estimated body composition</div>
              <div className="summary-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                <div className="summary-metric">
                  <div className="metric-label" style={{ justifyContent: "center" }}>
                    Body fat
                  </div>
                  <div className="before-after">{result.bodyFatPercent}%</div>
                  <div className="delta">{result.category}</div>
                </div>
                <div className="summary-metric">
                  <div className="metric-label" style={{ justifyContent: "center" }}>
                    BMI
                  </div>
                  <div className="before-after">{result.bmi}</div>
                  <div className="delta">{result.formula}</div>
                </div>
              </div>
              <p style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.55 }}>{result.insight}</p>
              <p className="state-note" style={{ marginTop: 8, padding: 0 }}>
                A formula-based estimate — not a clinical measurement (DEXA, calipers, or bioelectrical impedance
                would be more accurate). Vitaless is a wellness tool, not a medical device.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
