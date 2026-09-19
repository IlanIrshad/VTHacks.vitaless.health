// Postgres client for logging biometric sessions to Tiger Data (TimescaleDB).
// Requires DATABASE_URL in the environment. Schema: db/schema.sql
// (run `npm run db:init` once to create the hypertable).

import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Add it to .env.local (see .env.example).");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export interface BiometricLogEntry {
  userId: string;
  heartRateBpm: number;
  respirationRateBpm: number;
  stressLevel: number;
  focusLevel: number;
  energyLevel: number;
  source: string;
  routineId?: string | null;
}

export async function logBiometricSample(entry: BiometricLogEntry): Promise<void> {
  const db = getPool();
  await db.query(
    `INSERT INTO biometric_samples
      (time, user_id, heart_rate_bpm, respiration_rate_bpm, stress_level, focus_level, energy_level, source, routine_id)
     VALUES (now(), $1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.userId,
      entry.heartRateBpm,
      entry.respirationRateBpm,
      entry.stressLevel,
      entry.focusLevel,
      entry.energyLevel,
      entry.source,
      entry.routineId ?? null,
    ]
  );
}

export interface BiometricHistoryRow {
  time: string;
  heart_rate_bpm: number;
  respiration_rate_bpm: number;
  stress_level: number;
  focus_level: number;
  energy_level: number;
  routine_id: string | null;
}

export async function getRecentHistory(userId: string, limit = 100): Promise<BiometricHistoryRow[]> {
  const db = getPool();
  const { rows } = await db.query(
    `SELECT time, heart_rate_bpm, respiration_rate_bpm, stress_level, focus_level, energy_level, routine_id
     FROM biometric_samples
     WHERE user_id = $1
     ORDER BY time DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows;
}
