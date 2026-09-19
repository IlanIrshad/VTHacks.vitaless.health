// Small helpers for turning a short history of biometric readings into the
// "rising / steady / falling" language the UI shows next to each live tile,
// and the "has been low for N minutes" framing on the dashboard.

import type { BiometricReading } from "@/components/WebcamCapture";

export interface HistoryEntry {
  t: number; // Date.now() at capture time
  reading: BiometricReading;
}

export const MAX_HISTORY = 40;

export function pushHistory(history: HistoryEntry[], reading: BiometricReading): HistoryEntry[] {
  const next = [...history, { t: Date.now(), reading }];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

type NumericKey = "heartRateBpm" | "stressLevel" | "focusLevel" | "energyLevel";

/** Compares the latest sample against the one ~2 sampling cycles back. */
export function trendDirection(history: HistoryEntry[], key: NumericKey, threshold = 0.02): "up" | "down" | "steady" {
  if (history.length < 2) return "steady";
  const latest = history[history.length - 1].reading[key];
  const prevIdx = Math.max(0, history.length - 3);
  const prev = history[prevIdx].reading[key];
  const scale = key === "heartRateBpm" ? 40 : 1; // normalize bpm roughly onto a 0-1-ish scale for the threshold
  const delta = (latest - prev) / scale;
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "steady";
}

/** How many of the most recent samples have stayed under/over a threshold, in minutes. */
export function minutesAtLevel(history: HistoryEntry[], key: NumericKey, predicate: (v: number) => boolean): number {
  if (history.length === 0) return 0;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!predicate(history[i].reading[key])) break;
    count++;
  }
  if (count < 2) return 0;
  const spanMs = history[history.length - 1].t - history[history.length - count].t;
  return Math.max(1, Math.round(spanMs / 60000));
}
