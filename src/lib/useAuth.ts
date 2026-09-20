export interface UserPreferences {
  timezone?: string;
  goals?: string;
  preferredVoiceId?: string;
  preferredRoutineId?: string;
  /** One-time check-in reminder date+time, as an ISO string once it comes back over JSON. Null/absent = no reminder scheduled. */
  reminderScheduledAt?: string | null;
  lastReminderSentAt?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
}
