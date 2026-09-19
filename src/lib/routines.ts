// Static guided-routine definitions. Each routine is a sequence of steps
// with a base duration and a line of narration. RoutinePlayer adapts the
// actual pace/step count at runtime based on live biometric signals
// (see adaptRoutine below), so these are *base* templates, not fixed scripts.

export type RoutineId = "box-breathing" | "body-scan" | "focus-reset" | "energy-boost";

export interface RoutineStep {
  id: string;
  label: string;
  /** Base duration in seconds at "neutral" biometric state. */
  durationSec: number;
  /** Narration line sent to ElevenLabs for this step. */
  narration: string;
}

export interface Routine {
  id: RoutineId;
  title: string;
  description: string;
  /** Which biometric state this routine is best suited for. */
  bestFor: "high-stress" | "low-focus" | "low-energy" | "general";
  steps: RoutineStep[];
}

export const ROUTINES: Record<RoutineId, Routine> = {
  "box-breathing": {
    id: "box-breathing",
    title: "Box Breathing",
    description: "A calming 4-4-4-4 breathing pattern to bring down stress and heart rate.",
    bestFor: "high-stress",
    steps: [
      { id: "inhale", label: "Inhale", durationSec: 4, narration: "Breathe in slowly through your nose for four counts." },
      { id: "hold-1", label: "Hold", durationSec: 4, narration: "Hold that breath gently for four counts." },
      { id: "exhale", label: "Exhale", durationSec: 4, narration: "Release the breath slowly through your mouth for four counts." },
      { id: "hold-2", label: "Hold", durationSec: 4, narration: "Hold the empty breath for four counts before we begin again." },
    ],
  },
  "body-scan": {
    id: "body-scan",
    title: "Body Scan",
    description: "A short mindfulness scan to reconnect with how your body feels right now.",
    bestFor: "general",
    steps: [
      { id: "settle", label: "Settle in", durationSec: 8, narration: "Find a comfortable position and let your shoulders drop." },
      { id: "breath", label: "Notice your breath", durationSec: 10, narration: "Bring your attention to your breath, without changing it." },
      { id: "scan-upper", label: "Scan upper body", durationSec: 12, narration: "Gently bring your awareness to your head, neck, and shoulders. Notice any tension, and let it soften." },
      { id: "scan-lower", label: "Scan lower body", durationSec: 12, narration: "Now move your attention down through your arms, chest, and legs, releasing tension as you go." },
      { id: "close", label: "Close", durationSec: 6, narration: "Take one more full breath, and gently open your eyes when you're ready." },
    ],
  },
  "focus-reset": {
    id: "focus-reset",
    title: "Focus Reset",
    description: "A quick attention-anchoring exercise for when focus is drifting.",
    bestFor: "low-focus",
    steps: [
      { id: "anchor", label: "Anchor", durationSec: 6, narration: "Pick one point in front of you and rest your eyes there." },
      { id: "count", label: "Count breaths", durationSec: 15, narration: "Silently count five slow breaths, starting now." },
      { id: "intention", label: "Set intention", durationSec: 8, narration: "Name the one thing you want to focus on next." },
    ],
  },
  "energy-boost": {
    id: "energy-boost",
    title: "Energy Boost",
    description: "Light movement and paced breathing to lift low energy.",
    bestFor: "low-energy",
    steps: [
      { id: "stand", label: "Stand and stretch", durationSec: 10, narration: "Stand up if you can, and reach both arms overhead." },
      { id: "shoulder-rolls", label: "Shoulder rolls", durationSec: 10, narration: "Roll your shoulders back five times, nice and slow." },
      { id: "quick-breaths", label: "Energizing breaths", durationSec: 12, narration: "Take three quick, deep breaths to wake up your body." },
    ],
  },
};

export function pickRoutineForState(state: {
  stressLevel: number; // 0-1
  focusLevel: number; // 0-1
  energyLevel: number; // 0-1
}): RoutineId {
  if (state.stressLevel >= 0.6) return "box-breathing";
  if (state.focusLevel <= 0.4) return "focus-reset";
  if (state.energyLevel <= 0.4) return "energy-boost";
  return "body-scan";
}

/**
 * Adapts a routine's step durations to the user's live biometric state.
 * High stress -> slower pacing (longer steps) to encourage deeper breathing.
 * Low focus -> shorter steps to hold attention.
 */
export function adaptRoutine(routine: Routine, state: { stressLevel: number; focusLevel: number }): Routine {
  const stressFactor = 1 + Math.max(0, state.stressLevel - 0.5); // up to 1.5x longer when very stressed
  const focusFactor = state.focusLevel < 0.4 ? 0.75 : 1; // shorter steps when focus is low

  return {
    ...routine,
    steps: routine.steps.map((step) => ({
      ...step,
      durationSec: Math.round(step.durationSec * stressFactor * focusFactor),
    })),
  };
}
