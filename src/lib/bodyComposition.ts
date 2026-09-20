// Body-fat % estimation.
//
// DELIBERATE DESIGN CHOICE: the estimate itself is a real, published,
// deterministic formula — not something Gemini guesses. There is no
// scientific relationship between heart rate/respiration and adiposity, so
// feeding them into an LLM and asking it to output a body-fat percentage
// would just be a plausible-sounding invented number, which conflicts with
// this app's whole "never fabricate a measurement" principle. Gemini's role
// (see getBodyCompositionInsight in lib/gemini.ts) is to write a natural-
// language interpretation of this real number, using the live Presage
// vitals as context — not to be the source of the number itself.
//
// Formula: Deurenberg et al. 1991, "Body mass index as a measure of body
// fatness: age- and sex-specific prediction formulas", British Journal of
// Nutrition. One of the most widely cited BMI-based body-fat estimators;
// mean error vs. underwater-weighing-measured body fat in the original
// study was roughly ±4 percentage points — a real, bounded estimate, not a
// clinical measurement (DEXA scan, skinfold calipers, or bioelectrical
// impedance would all be more accurate).

export type Gender = "male" | "female";

export interface BodyCompositionInput {
  heightCm: number;
  weightKg: number;
  age: number;
  gender: Gender;
}

export interface BodyCompositionResult {
  bmi: number;
  bodyFatPercent: number;
  category: string;
  formula: string;
}

// American Council on Exercise body-fat-percentage categories — widely
// published, real reference ranges (not derived by us).
const CATEGORIES: Record<Gender, { max: number; label: string }[]> = {
  male: [
    { max: 5, label: "Essential fat" },
    { max: 13, label: "Athletic" },
    { max: 17, label: "Fitness" },
    { max: 24, label: "Average" },
    { max: Infinity, label: "Above average" },
  ],
  female: [
    { max: 13, label: "Essential fat" },
    { max: 20, label: "Athletic" },
    { max: 24, label: "Fitness" },
    { max: 31, label: "Average" },
    { max: Infinity, label: "Above average" },
  ],
};

function categoryFor(gender: Gender, bodyFatPercent: number): string {
  const bands = CATEGORIES[gender];
  return (bands.find((b) => bodyFatPercent <= b.max) ?? bands[bands.length - 1]).label;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function lbToKg(lb: number): number {
  return lb * 0.453592;
}

export function estimateBodyComposition(input: BodyCompositionInput): BodyCompositionResult {
  const { heightCm, weightKg, age, gender } = input;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);

  const sex = gender === "male" ? 1 : 0;
  const raw = 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4;
  // Physiologically-plausible bounds — the linear formula can drift outside
  // reality at extreme inputs, so clamp rather than display nonsense.
  const bodyFatPercent = Math.max(3, Math.min(60, raw));

  return {
    bmi: Math.round(bmi * 10) / 10,
    bodyFatPercent: Math.round(bodyFatPercent * 10) / 10,
    category: categoryFor(gender, bodyFatPercent),
    formula: "Deurenberg (1991) BMI-based estimate",
  };
}
