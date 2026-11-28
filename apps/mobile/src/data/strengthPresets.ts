import type { PlannedExercise, StrengthTemplateInput } from '@openhoop/core';

import { LIBRARY, LIBRARY_PREFIX, type LibraryId } from './strength';

export const PRESET_IDS = ['fullBody', 'upperLower', 'fiveByFive', 'kettlebell'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_TEMPLATE_IDS = ['fullBody', 'upper', 'lower', 'fiveByFiveA', 'fiveByFiveB', 'kettlebell'] as const;
export type PresetTemplateId = (typeof PRESET_TEMPLATE_IDS)[number];

type Line = readonly [LibraryId, number, number];

const TEMPLATES: Readonly<Record<PresetTemplateId, readonly Line[]>> = {
  fullBody: [
    ['back_squat', 3, 8],
    ['bench_press', 3, 8],
    ['barbell_row', 3, 8],
    ['overhead_press', 3, 10],
    ['romanian_deadlift', 3, 10],
    ['crunch', 3, 15],
  ],
  upper: [
    ['bench_press', 4, 8],
    ['barbell_row', 4, 8],
    ['overhead_press', 3, 10],
    ['lat_pulldown', 3, 10],
    ['barbell_curl', 3, 12],
    ['triceps_pushdown', 3, 12],
  ],
  lower: [
    ['back_squat', 4, 8],
    ['romanian_deadlift', 3, 10],
    ['leg_press', 3, 12],
    ['leg_curl', 3, 12],
    ['standing_calf_raise', 3, 15],
    ['hanging_leg_raise', 3, 12],
  ],
  fiveByFiveA: [
    ['back_squat', 5, 5],
    ['bench_press', 5, 5],
    ['barbell_row', 5, 5],
  ],
  fiveByFiveB: [
    ['back_squat', 5, 5],
    ['overhead_press', 5, 5],
    ['deadlift', 1, 5],
  ],
  kettlebell: [
    ['kettlebell_swing', 4, 15],
    ['goblet_squat', 3, 10],
    ['kettlebell_press', 3, 8],
    ['kettlebell_row', 3, 10],
    ['turkish_get_up', 3, 3],
  ],
};

export const PRESETS: Readonly<Record<PresetId, readonly PresetTemplateId[]>> = {
  fullBody: ['fullBody'],
  upperLower: ['upper', 'lower'],
  fiveByFive: ['fiveByFiveA', 'fiveByFiveB'],
  kettlebell: ['kettlebell'],
};

function muscleOf(id: LibraryId): PlannedExercise['muscle'] {
  return LIBRARY.find((entry) => entry.id === id)?.muscle ?? 'core';
}

export function presetItems(id: PresetTemplateId, libraryName: (id: LibraryId) => string): PlannedExercise[] {
  return TEMPLATES[id].map(([exercise, sets, reps]) => ({
    exerciseKey: `${LIBRARY_PREFIX}${exercise}`,
    exerciseName: libraryName(exercise),
    muscle: muscleOf(exercise),
    sets,
    reps,
    weightKg: 0,
  }));
}

export interface PresetPlan {
  create: StrengthTemplateInput[];
  existing: string[];
}

export function presetTemplates(
  preset: PresetId,
  name: (id: PresetTemplateId) => string,
  libraryName: (id: LibraryId) => string,
  taken: readonly string[],
): PresetPlan {
  const owned = new Map(taken.map((existing) => [existing.trim().toLowerCase(), existing]));
  const plan: PresetPlan = { create: [], existing: [] };
  for (const id of PRESETS[preset]) {
    const base = name(id);
    const found = owned.get(base.toLowerCase());
    if (found !== undefined) plan.existing.push(found);
    else plan.create.push({ name: base, items: presetItems(id, libraryName) });
  }
  return plan;
}
