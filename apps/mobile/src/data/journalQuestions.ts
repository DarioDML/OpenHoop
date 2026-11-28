import type { TranslationKey } from '@/i18n';

import type { JournalAnswer } from './userData';

export type JournalKind = 'yesno' | 'count';

export const JOURNAL_CATEGORIES = ['nutrition', 'sleep', 'body', 'activity', 'mind', 'health', 'supplements', 'lifestyle', 'environment'] as const;
export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

export interface JournalQuestion {
  id: string;
  kind: JournalKind;
  category: JournalCategory;
  labelKey: TranslationKey;
  nameKey: TranslationKey;
  unitKey?: TranslationKey;
  max?: number;
}

export const MAX_ACTIVE_QUESTIONS = 40;

function behaviour(id: string, category: JournalCategory, key: TranslationKey): JournalQuestion {
  return { id, kind: 'yesno', category, labelKey: key, nameKey: key };
}

export const JOURNAL_QUESTIONS: readonly JournalQuestion[] = [
  { id: 'alcohol', kind: 'count', category: 'nutrition', labelKey: 'journal.q.alcohol', nameKey: 'readinessImpacts.b.alcohol', unitKey: 'journal.unit.drinks', max: 20 },
  { id: 'caffeine-late', kind: 'yesno', category: 'nutrition', labelKey: 'journal.q.caffeineLate', nameKey: 'readinessImpacts.b.caffeineLate' },
  { id: 'screens-bed', kind: 'yesno', category: 'sleep', labelKey: 'journal.q.screensBed', nameKey: 'readinessImpacts.b.screensBed' },
  { id: 'read-before-sleep', kind: 'yesno', category: 'sleep', labelKey: 'journal.q.readBeforeSleep', nameKey: 'readinessImpacts.b.readBeforeSleep' },
  { id: 'sauna', kind: 'yesno', category: 'body', labelKey: 'journal.q.sauna', nameKey: 'readinessImpacts.b.sauna' },
  { id: 'melatonin', kind: 'yesno', category: 'sleep', labelKey: 'journal.q.melatonin', nameKey: 'readinessImpacts.b.melatonin' },
  { id: 'late-meal', kind: 'yesno', category: 'nutrition', labelKey: 'journal.q.lateMeal', nameKey: 'readinessImpacts.b.lateMeal' },
  { id: 'evening-workout', kind: 'yesno', category: 'activity', labelKey: 'journal.q.eveningWorkout', nameKey: 'readinessImpacts.b.eveningWorkout' },
  { id: 'nap', kind: 'yesno', category: 'sleep', labelKey: 'journal.q.nap', nameKey: 'readinessImpacts.b.nap' },
  { id: 'high-stress', kind: 'yesno', category: 'mind', labelKey: 'journal.q.highStress', nameKey: 'readinessImpacts.b.highStress' },
  { id: 'water', kind: 'count', category: 'nutrition', labelKey: 'journal.q.water', nameKey: 'readinessImpacts.b.water', unitKey: 'journal.unit.glasses', max: 20 },
  { id: 'outdoors', kind: 'yesno', category: 'environment', labelKey: 'journal.q.outdoors', nameKey: 'readinessImpacts.b.outdoors' },

  { id: 'caffeine', kind: 'count', category: 'nutrition', labelKey: 'journal.b.caffeine', nameKey: 'journal.b.caffeine', unitKey: 'journal.unit.cups', max: 20 },
  behaviour('large-dinner', 'nutrition', 'journal.b.largeDinner'),
  behaviour('late-snack', 'nutrition', 'journal.b.lateSnack'),
  behaviour('sugary-food', 'nutrition', 'journal.b.sugaryFood'),
  behaviour('fast-food', 'nutrition', 'journal.b.fastFood'),
  behaviour('processed-food', 'nutrition', 'journal.b.processedFood'),
  behaviour('spicy-food', 'nutrition', 'journal.b.spicyFood'),
  behaviour('salty-food', 'nutrition', 'journal.b.saltyFood'),
  behaviour('fruit-veg', 'nutrition', 'journal.b.fruitVeg'),
  behaviour('red-meat', 'nutrition', 'journal.b.redMeat'),
  behaviour('fish', 'nutrition', 'journal.b.fish'),
  behaviour('dairy', 'nutrition', 'journal.b.dairy'),
  behaviour('plant-based', 'nutrition', 'journal.b.plantBased'),
  behaviour('high-protein', 'nutrition', 'journal.b.highProtein'),
  behaviour('low-carb', 'nutrition', 'journal.b.lowCarb'),
  behaviour('fasting', 'nutrition', 'journal.b.fasting'),
  behaviour('skipped-breakfast', 'nutrition', 'journal.b.skippedBreakfast'),
  behaviour('skipped-meal', 'nutrition', 'journal.b.skippedMeal'),
  behaviour('overate', 'nutrition', 'journal.b.overate'),
  behaviour('home-cooked', 'nutrition', 'journal.b.homeCooked'),
  behaviour('ate-out', 'nutrition', 'journal.b.ateOut'),
  behaviour('soft-drinks', 'nutrition', 'journal.b.softDrinks'),
  behaviour('energy-drink', 'nutrition', 'journal.b.energyDrink'),
  behaviour('herbal-tea', 'nutrition', 'journal.b.herbalTea'),
  behaviour('protein-shake', 'nutrition', 'journal.b.proteinShake'),

  behaviour('shared-bed', 'sleep', 'journal.b.sharedBed'),
  behaviour('earplugs', 'sleep', 'journal.b.earplugs'),
  behaviour('eye-mask', 'sleep', 'journal.b.eyeMask'),
  behaviour('white-noise', 'sleep', 'journal.b.whiteNoise'),
  behaviour('cool-bedroom', 'sleep', 'journal.b.coolBedroom'),
  behaviour('dark-bedroom', 'sleep', 'journal.b.darkBedroom'),
  behaviour('usual-bedtime', 'sleep', 'journal.b.usualBedtime'),
  behaviour('late-bedtime', 'sleep', 'journal.b.lateBedtime'),
  behaviour('slept-in', 'sleep', 'journal.b.sleptIn'),
  behaviour('woke-at-night', 'sleep', 'journal.b.wokeAtNight'),
  behaviour('woken-by-children', 'sleep', 'journal.b.wokenByChildren'),
  behaviour('pet-in-bedroom', 'sleep', 'journal.b.petInBedroom'),
  behaviour('noisy-night', 'sleep', 'journal.b.noisyNight'),
  behaviour('new-place', 'sleep', 'journal.b.newPlace'),
  behaviour('mouth-tape', 'sleep', 'journal.b.mouthTape'),
  behaviour('nasal-strip', 'sleep', 'journal.b.nasalStrip'),
  behaviour('warm-shower', 'sleep', 'journal.b.warmShower'),
  behaviour('wind-down', 'sleep', 'journal.b.windDown'),
  behaviour('blue-light-glasses', 'sleep', 'journal.b.blueLightGlasses'),
  behaviour('screen-free-evening', 'sleep', 'journal.b.screenFreeEvening'),

  behaviour('cold-plunge', 'body', 'journal.b.coldPlunge'),
  behaviour('cold-shower', 'body', 'journal.b.coldShower'),
  behaviour('massage', 'body', 'journal.b.massage'),
  behaviour('stretching', 'body', 'journal.b.stretching'),
  behaviour('foam-rolling', 'body', 'journal.b.foamRolling'),
  behaviour('compression', 'body', 'journal.b.compression'),
  behaviour('physiotherapy', 'body', 'journal.b.physiotherapy'),
  behaviour('rest-day', 'body', 'journal.b.restDay'),
  behaviour('red-light', 'body', 'journal.b.redLight'),
  behaviour('acupuncture', 'body', 'journal.b.acupuncture'),

  behaviour('morning-workout', 'activity', 'journal.b.morningWorkout'),
  behaviour('strength-training', 'activity', 'journal.b.strengthTraining'),
  behaviour('intervals', 'activity', 'journal.b.intervals'),
  behaviour('long-endurance', 'activity', 'journal.b.longEndurance'),
  behaviour('trained-twice', 'activity', 'journal.b.trainedTwice'),
  behaviour('running', 'activity', 'journal.b.running'),
  behaviour('cycling', 'activity', 'journal.b.cycling'),
  behaviour('swimming', 'activity', 'journal.b.swimming'),
  behaviour('yoga', 'activity', 'journal.b.yoga'),
  behaviour('pilates', 'activity', 'journal.b.pilates'),
  behaviour('long-walk', 'activity', 'journal.b.longWalk'),
  behaviour('hiking', 'activity', 'journal.b.hiking'),
  behaviour('active-commute', 'activity', 'journal.b.activeCommute'),
  behaviour('team-sport', 'activity', 'journal.b.teamSport'),
  behaviour('racket-sport', 'activity', 'journal.b.racketSport'),
  behaviour('climbing', 'activity', 'journal.b.climbing'),
  behaviour('dancing', 'activity', 'journal.b.dancing'),
  behaviour('martial-arts', 'activity', 'journal.b.martialArts'),
  behaviour('race', 'activity', 'journal.b.race'),
  behaviour('no-exercise', 'activity', 'journal.b.noExercise'),
  behaviour('dog-walk', 'activity', 'journal.b.dogWalk'),
  behaviour('housework', 'activity', 'journal.b.housework'),

  behaviour('meditation', 'mind', 'journal.b.meditation'),
  behaviour('breathwork', 'mind', 'journal.b.breathwork'),
  behaviour('journaling', 'mind', 'journal.b.journaling'),
  behaviour('gratitude', 'mind', 'journal.b.gratitude'),
  behaviour('therapy', 'mind', 'journal.b.therapy'),
  behaviour('anxious', 'mind', 'journal.b.anxious'),
  behaviour('low-mood', 'mind', 'journal.b.lowMood'),
  behaviour('good-mood', 'mind', 'journal.b.goodMood'),
  behaviour('lonely', 'mind', 'journal.b.lonely'),
  behaviour('conflict', 'mind', 'journal.b.conflict'),
  behaviour('deadline', 'mind', 'journal.b.deadline'),
  behaviour('long-workday', 'mind', 'journal.b.longWorkday'),
  behaviour('worked-late', 'mind', 'journal.b.workedLate'),
  behaviour('screen-time', 'mind', 'journal.b.screenTime'),
  behaviour('creative-hobby', 'mind', 'journal.b.creativeHobby'),
  behaviour('video-games', 'mind', 'journal.b.videoGames'),
  behaviour('reflection', 'mind', 'journal.b.reflection'),

  behaviour('feeling-ill', 'health', 'journal.b.feelingIll'),
  behaviour('cold-flu', 'health', 'journal.b.coldFlu'),
  behaviour('fever', 'health', 'journal.b.fever'),
  behaviour('headache', 'health', 'journal.b.headache'),
  behaviour('allergies', 'health', 'journal.b.allergies'),
  behaviour('blocked-nose', 'health', 'journal.b.blockedNose'),
  behaviour('stomach-trouble', 'health', 'journal.b.stomachTrouble'),
  behaviour('sore-muscles', 'health', 'journal.b.soreMuscles'),
  behaviour('injury', 'health', 'journal.b.injury'),
  behaviour('back-pain', 'health', 'journal.b.backPain'),
  behaviour('hangover', 'health', 'journal.b.hangover'),
  behaviour('low-energy', 'health', 'journal.b.lowEnergy'),
  behaviour('vaccination', 'health', 'journal.b.vaccination'),
  behaviour('gave-blood', 'health', 'journal.b.gaveBlood'),

  behaviour('magnesium', 'supplements', 'journal.b.magnesium'),
  behaviour('vitamin-d', 'supplements', 'journal.b.vitaminD'),
  behaviour('omega-3', 'supplements', 'journal.b.omega3'),
  behaviour('creatine', 'supplements', 'journal.b.creatine'),
  behaviour('multivitamin', 'supplements', 'journal.b.multivitamin'),
  behaviour('iron', 'supplements', 'journal.b.iron'),
  behaviour('zinc', 'supplements', 'journal.b.zinc'),
  behaviour('probiotics', 'supplements', 'journal.b.probiotics'),
  behaviour('ashwagandha', 'supplements', 'journal.b.ashwagandha'),
  behaviour('electrolytes', 'supplements', 'journal.b.electrolytes'),
  behaviour('pre-workout', 'supplements', 'journal.b.preWorkout'),
  behaviour('cbd', 'supplements', 'journal.b.cbd'),
  behaviour('painkillers', 'supplements', 'journal.b.painkillers'),
  behaviour('antihistamine', 'supplements', 'journal.b.antihistamine'),
  behaviour('sleeping-pill', 'supplements', 'journal.b.sleepingPill'),
  behaviour('antibiotics', 'supplements', 'journal.b.antibiotics'),
  behaviour('prescribed-medication', 'supplements', 'journal.b.prescribedMedication'),

  behaviour('friends', 'lifestyle', 'journal.b.friends'),
  behaviour('family', 'lifestyle', 'journal.b.family'),
  behaviour('night-out', 'lifestyle', 'journal.b.nightOut'),
  behaviour('sexual-activity', 'lifestyle', 'journal.b.sexualActivity'),
  behaviour('nicotine', 'lifestyle', 'journal.b.nicotine'),
  behaviour('cannabis', 'lifestyle', 'journal.b.cannabis'),
  behaviour('travelling', 'lifestyle', 'journal.b.travelling'),
  behaviour('flight', 'lifestyle', 'journal.b.flight'),
  behaviour('jet-lag', 'lifestyle', 'journal.b.jetLag'),
  behaviour('long-drive', 'lifestyle', 'journal.b.longDrive'),
  behaviour('long-commute', 'lifestyle', 'journal.b.longCommute'),
  behaviour('worked-from-home', 'lifestyle', 'journal.b.workedFromHome'),
  behaviour('night-shift', 'lifestyle', 'journal.b.nightShift'),
  behaviour('sat-all-day', 'lifestyle', 'journal.b.satAllDay'),
  behaviour('standing-desk', 'lifestyle', 'journal.b.standingDesk'),
  behaviour('caregiving', 'lifestyle', 'journal.b.caregiving'),

  behaviour('morning-light', 'environment', 'journal.b.morningLight'),
  behaviour('hot-weather', 'environment', 'journal.b.hotWeather'),
  behaviour('cold-weather', 'environment', 'journal.b.coldWeather'),
  behaviour('high-altitude', 'environment', 'journal.b.highAltitude'),
  behaviour('poor-air', 'environment', 'journal.b.poorAir'),
  behaviour('high-pollen', 'environment', 'journal.b.highPollen'),
];

export const DEFAULT_JOURNAL_QUESTIONS: readonly string[] = ['alcohol', 'caffeine-late', 'screens-bed', 'read-before-sleep', 'sauna', 'melatonin'];

const BY_ID = new Map(JOURNAL_QUESTIONS.map((q) => [q.id, q]));

export function findQuestion(id: string): JournalQuestion | undefined {
  return BY_ID.get(id);
}

export function activeQuestions(selected: readonly string[] | null): JournalQuestion[] {
  const ids = selected ?? DEFAULT_JOURNAL_QUESTIONS;
  return ids.map(findQuestion).filter((q): q is JournalQuestion => q !== undefined);
}

export function trackedQuestions(selected: readonly string[] | null, journal: Readonly<Record<string, Readonly<Record<string, JournalAnswer>>>>): JournalQuestion[] {
  const active = new Set(activeQuestions(selected).map((q) => q.id));
  for (const answers of Object.values(journal)) for (const id of Object.keys(answers)) active.add(id);
  return JOURNAL_QUESTIONS.filter((q) => active.has(q.id));
}

export function questionsByCategory(questions: readonly JournalQuestion[]): Array<{ category: JournalCategory; questions: JournalQuestion[] }> {
  return JOURNAL_CATEGORIES.map((category) => ({ category, questions: questions.filter((q) => q.category === category) })).filter((group) => group.questions.length > 0);
}

export function withQuestion(selected: readonly string[] | null, id: string, on: boolean): string[] {
  const current = selected ?? [...DEFAULT_JOURNAL_QUESTIONS];
  const next = on ? [...current, id] : current.filter((existing) => existing !== id);
  return JOURNAL_QUESTIONS.map((q) => q.id).filter((qid) => next.includes(qid));
}

const COMBINING_MARKS = /[̀-ͯ]/g;

export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}

export function searchQuestions<T extends { question: JournalQuestion; label: string }>(entries: readonly T[], query: string): T[] {
  const terms = foldForSearch(query)
    .split(/\s+/)
    .filter((term) => term !== '');
  if (terms.length === 0) return [...entries];
  return entries.filter((entry) => {
    const haystack = foldForSearch(entry.label);
    return terms.every((term) => haystack.includes(term));
  });
}
