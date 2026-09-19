export interface UserPreferences {
  timezone?: string;
  goals?: string;
  preferredVoiceId?: string;
  preferredRoutineId?: string;
  notifyCheckIns?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
}
