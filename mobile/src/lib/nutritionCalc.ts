/**
 * Client-side nutrition calculation rules.
 * Mirror of backend/app/rules/nutrition_rules.py — keep in sync.
 */

import type { ActivityLevel } from '../types';

export type GoalType = 'lose_fat' | 'maintain' | 'gain_muscle' | 'recomposition';
export type Sex = 'male' | 'female';

export interface NutritionInput {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  trainingDaysPerWeek?: number;
}

export interface NutritionResult {
  bmr: number;
  tdee: number;
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  stepsTarget: number;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<GoalType, number> = {
  lose_fat: -0.15,
  maintain: 0.0,
  gain_muscle: 0.10,
  recomposition: -0.05,
};

/** g/kg/día por actividad; alineado con backend ACTIVITY_PROTEIN_PER_KG + resolve_protein_per_kg */
const ACTIVITY_PROTEIN_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 0.8,
  light: 1.0,
  moderate: 1.1,
  active: 1.45,
  very_active: 1.75,
};

function resolveProteinPerKg(
  goalType: GoalType,
  activityLevel?: ActivityLevel,
  trainingDaysPerWeek?: number,
): number {
  const actKey =
    activityLevel && activityLevel in ACTIVITY_PROTEIN_PER_KG ? activityLevel : 'moderate';
  let base = ACTIVITY_PROTEIN_PER_KG[actKey];

  if (trainingDaysPerWeek != null && trainingDaysPerWeek >= 4) {
    base = Math.max(base, 1.65);
  }
  if (goalType === 'lose_fat' || goalType === 'recomposition') {
    base = Math.max(base, 1.2);
  } else if (goalType === 'gain_muscle') {
    base = Math.max(base, 1.6);
  }
  return Math.min(base, 2.0);
}

const BASE_STEPS: Record<ActivityLevel, number> = {
  sedentary: 6000,
  light: 7500,
  moderate: 8500,
  active: 10000,
  very_active: 12000,
};

function calculateBmi(weightKg: number, heightCm: number): number {
  const hM = heightCm / 100;
  if (hM <= 0 || weightKg <= 0) return 0;
  return weightKg / (hM * hM);
}

function calculateBmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  if (sex === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
}

function calculateTdee(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.55));
}

function calculateTargetCalories(tdee: number, goalType: GoalType): number {
  const adjustment = GOAL_ADJUSTMENTS[goalType] ?? 0;
  return Math.round(Math.max(tdee * (1 + adjustment), 1200));
}

function adjustForOverweight(
  targetKcal: number,
  tdee: number,
  bmr: number,
  weightKg: number,
  heightCm: number,
  goalType: GoalType,
): number {
  if (goalType !== 'lose_fat' && goalType !== 'recomposition') {
    return Math.round(targetKcal);
  }
  const bmi = calculateBmi(weightKg, heightCm);
  if (bmi < 25) return Math.round(targetKcal);

  const moderateRef = bmr * ACTIVITY_MULTIPLIERS.moderate;
  let tdeeCap: number;
  let metabolicCap: number;

  if (bmi < 30) {
    tdeeCap = tdee * 0.78;
    metabolicCap = moderateRef * 0.88;
  } else if (bmi < 35) {
    tdeeCap = tdee * 0.74;
    metabolicCap = moderateRef * 0.84;
  } else {
    tdeeCap = tdee * 0.70;
    metabolicCap = moderateRef * 0.80;
  }

  return Math.round(Math.max(Math.min(targetKcal, tdeeCap, metabolicCap), 1200));
}

function calculateMacros(
  targetKcal: number,
  weightKg: number,
  goalType: GoalType,
  activityLevel?: ActivityLevel,
  trainingDaysPerWeek?: number,
) {
  const proteinG = Math.round(
    weightKg * resolveProteinPerKg(goalType, activityLevel, trainingDaysPerWeek),
  );
  const proteinKcal = proteinG * 4;

  let fatPct = 0.25;
  if (activityLevel === 'active' || activityLevel === 'very_active') {
    fatPct = 0.22;
  } else if (trainingDaysPerWeek != null && trainingDaysPerWeek >= 4) {
    fatPct = 0.23;
  }

  const fatKcal = targetKcal * fatPct;
  const fatG = Math.round(fatKcal / 9);
  const carbsG = Math.round(Math.max((targetKcal - proteinKcal - fatKcal) / 4, 50));

  return { proteinG, carbsG, fatG };
}

function calculateSteps(activityLevel: ActivityLevel, goalType: GoalType): number {
  let base = BASE_STEPS[activityLevel] ?? 8000;
  if (goalType === 'lose_fat' || goalType === 'recomposition') {
    base += 1500;
  }
  return base;
}

export function computeNutrition(input: NutritionInput): NutritionResult {
  const age = new Date().getFullYear() - input.birthYear;
  const bmr = calculateBmr(input.sex, input.weightKg, input.heightCm, age);
  const tdee = calculateTdee(bmr, input.activityLevel);
  const rawTarget = calculateTargetCalories(tdee, input.goalType);
  const targetKcal = adjustForOverweight(
    rawTarget, tdee, bmr,
    input.weightKg, input.heightCm, input.goalType,
  );
  const macros = calculateMacros(
    targetKcal, input.weightKg, input.goalType,
    input.activityLevel, input.trainingDaysPerWeek,
  );
  const stepsTarget = calculateSteps(input.activityLevel, input.goalType);

  return {
    bmr: Math.round(bmr),
    tdee,
    targetKcal,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    stepsTarget,
  };
}
