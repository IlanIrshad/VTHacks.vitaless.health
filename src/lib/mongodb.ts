// MongoDB Atlas client for user accounts, chat history, and preferences.
// Requires MONGODB_URI in the environment. Biometric time-series data stays
// in Tiger Data (src/lib/db.ts) — this is deliberately NOT used for that.
//
// Caches the client on `global` in dev so Next.js's hot-reload doesn't open
// a fresh connection pool on every file save (the standard pattern for
// MongoDB + Next.js — see mongodb.com/docs/drivers/node/current/quick-start).

import { MongoClient, type Db } from "mongodb";

const DB_NAME = "vitaless";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local (see .env.example).");
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(process.env.MONGODB_URI).connect();
    }
    return global._mongoClientPromise;
  }

  return new MongoClient(process.env.MONGODB_URI).connect();
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(DB_NAME);
}

export interface UserPreferences {
  timezone?: string;
  goals?: string;
  preferredVoiceId?: string;
  preferredRoutineId?: string;
  notifyCheckIns?: boolean;
}

export interface UserDoc {
  _id?: import("mongodb").ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  preferences: UserPreferences;
}

export interface ConversationMessage {
  role: "user" | "companion";
  text: string;
  timestamp: Date;
}

export interface ConversationDoc {
  _id?: import("mongodb").ObjectId;
  userId: import("mongodb").ObjectId;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}
