import type { NotificationPrefs } from '@/data/userData';

export const NOTIFICATION_PRESETS = ['quiet', 'standard', 'everything'] as const;
export type NotificationPreset = (typeof NOTIFICATION_PRESETS)[number];

type PresetChoice = Required<Pick<NotificationPrefs, 'morningDigest' | 'syncProblems' | 'goals' | 'coachCheckins'>>;

const CHOICES: Readonly<Record<NotificationPreset, PresetChoice>> = {
  quiet: { morningDigest: true, syncProblems: true, goals: false, coachCheckins: false },
  standard: { morningDigest: true, syncProblems: true, goals: true, coachCheckins: false },
  everything: { morningDigest: true, syncProblems: true, goals: true, coachCheckins: true },
};

export function presetChoice(preset: NotificationPreset): PresetChoice {
  return CHOICES[preset];
}

export function presetOf(prefs: NotificationPrefs): NotificationPreset | null {
  for (const preset of NOTIFICATION_PRESETS) {
    const choice = CHOICES[preset];
    if (
      prefs.morningDigest === choice.morningDigest &&
      prefs.syncProblems === choice.syncProblems &&
      prefs.goals === choice.goals &&
      (prefs.coachCheckins === true) === choice.coachCheckins
    ) {
      return preset;
    }
  }
  return null;
}
