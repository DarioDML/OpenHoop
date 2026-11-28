import { findQuestion } from '@/data/journalQuestions';
import { VOICE_RULE_IDS, detectBehaviours, detectionAnswers, findDuration, findTime, initialSelection, splitClauses, type Detection } from '@/data/voiceLog';

function byId(detections: readonly Detection[]): Record<string, Detection> {
  return Object.fromEntries(detections.map((d) => [d.questionId, d]));
}

describe('voice log detection', () => {
  it('reads the mockup sentence into journal answers', () => {
    const found = detectBehaviours('Had two glasses of wine with dinner around nine, an espresso at four, and I read for half an hour before bed.', 'en');
    const d = byId(found);
    expect(d.alcohol).toEqual({ questionId: 'alcohol', answer: 2, detail: { kind: 'count', value: 2 }, confident: true });
    expect(d['caffeine-late']).toEqual({ questionId: 'caffeine-late', answer: true, detail: { kind: 'time', minutes: 16 * 60 }, confident: true });
    expect(d['late-meal']).toEqual({ questionId: 'late-meal', answer: true, detail: { kind: 'time', minutes: 21 * 60 }, confident: false });
    expect(d['read-before-sleep']).toEqual({ questionId: 'read-before-sleep', answer: true, detail: { kind: 'duration', minutes: 30 }, confident: true });
    expect(found.map((x) => x.questionId).slice(0, 2)).toEqual(['alcohol', 'late-meal']);
  });

  it('selects only sure finds for behaviours the journal asks about', () => {
    const found = detectBehaviours('Had two glasses of wine with dinner around nine, an espresso at four, and I read for half an hour before bed.', 'en');
    const selected = initialSelection(found, ['alcohol', 'caffeine-late', 'read-before-sleep', 'late-meal']);
    expect([...selected].sort()).toEqual(['alcohol', 'caffeine-late', 'read-before-sleep']);
    expect(detectionAnswers(found, selected)).toEqual({ alcohol: 2, 'caffeine-late': true, 'read-before-sleep': true });
  });

  it('understands Dutch', () => {
    const d = byId(detectBehaviours('Twee glazen wijn bij het eten rond negen uur, een espresso om vier uur en ik heb een half uur gelezen voor het slapen.', 'nl'));
    expect(d.alcohol?.answer).toBe(2);
    expect(d['caffeine-late']?.detail).toEqual({ kind: 'time', minutes: 16 * 60 });
    expect(d['late-meal']?.detail).toEqual({ kind: 'time', minutes: 21 * 60 });
    expect(d['read-before-sleep']).toMatchObject({ answer: true, confident: true, detail: { kind: 'duration', minutes: 30 } });
  });

  it('records a clear no for negated behaviours', () => {
    const d = byId(detectBehaviours("No alcohol today. I didn't go to the sauna and had no coffee after lunch.", 'en'));
    expect(d.alcohol).toMatchObject({ answer: 0, detail: { kind: 'no' }, confident: true });
    expect(d.sauna).toMatchObject({ answer: false, confident: true });
    expect(d['caffeine-late']).toMatchObject({ answer: false, confident: true });
    const nl = byId(detectBehaviours('Geen alcohol en geen koffie na de middag.', 'nl'));
    expect(nl.alcohol?.answer).toBe(0);
    expect(nl['caffeine-late']?.answer).toBe(false);
  });

  it('adds up drinks across a sentence and keeps vague amounts unselected', () => {
    const d = byId(detectBehaviours('Two beers at the bar and a glass of wine later.', 'en'));
    expect(d.alcohol).toMatchObject({ answer: 3, confident: true });
    const vague = byId(detectBehaviours('A few beers with friends.', 'en'));
    expect(vague.alcohol).toMatchObject({ answer: 2, confident: false });
    expect(vague.friends?.answer).toBe(true);
  });

  it('converts litres of water to glasses but leaves it to the user to confirm', () => {
    expect(byId(detectBehaviours('Drank 2 litres of water', 'en')).water).toMatchObject({ answer: 8, confident: false });
    expect(byId(detectBehaviours('Drie glazen water', 'nl')).water).toMatchObject({ answer: 3, confident: true });
  });

  it('only flags caffeine as late when the time says so', () => {
    expect(byId(detectBehaviours('Coffee at 10', 'en'))['caffeine-late']).toBeUndefined();
    expect(byId(detectBehaviours('Coffee at 4pm', 'en'))['caffeine-late']?.detail).toEqual({ kind: 'time', minutes: 16 * 60 });
    expect(byId(detectBehaviours('Koffie om 15u30', 'nl'))['caffeine-late']?.detail).toEqual({ kind: 'time', minutes: 15 * 60 + 30 });
    expect(byId(detectBehaviours('Een cappuccino om half vijf', 'nl'))['caffeine-late']?.detail).toEqual({ kind: 'time', minutes: 16 * 60 + 30 });
    expect(byId(detectBehaviours('A late coffee', 'en'))['caffeine-late']).toMatchObject({ answer: true, detail: null });
  });

  it('places a workout in the morning or evening', () => {
    expect(byId(detectBehaviours('Worked out at 7pm', 'en'))['evening-workout']?.detail).toEqual({ kind: 'time', minutes: 19 * 60 });
    const morning = byId(detectBehaviours('Went running this morning for 40 minutes', 'en'));
    expect(morning['morning-workout']?.answer).toBe(true);
    expect(morning.running?.detail).toEqual({ kind: 'duration', minutes: 40 });
    expect(byId(detectBehaviours("Vanavond gesport in de gym", 'nl'))['evening-workout']?.answer).toBe(true);
  });

  it('needs bed context for screens in bed and is unsure about reading without it', () => {
    expect(byId(detectBehaviours('Scrolled my phone in bed', 'en'))['screens-bed']?.answer).toBe(true);
    expect(byId(detectBehaviours('Watched tv', 'en'))['screens-bed']).toBeUndefined();
    expect(byId(detectBehaviours('Read the news', 'en'))['read-before-sleep']).toMatchObject({ answer: true, confident: false });
  });

  it('splits clauses on punctuation and conjunctions but keeps decimals', () => {
    expect(splitClauses('Wine, two beers and 1,5 liter water').map((c) => c.tokens)).toEqual([['wine'], ['two', 'beers'], ['1,5', 'liter', 'water']]);
  });

  it('reads times and durations', () => {
    expect(findTime(['at', '16:00'], 7, 'en')).toEqual({ minutes: 960, explicit: true });
    expect(findTime(['om', '9', 'uur', "'s", 'avonds'], 12, 'nl')).toMatchObject({ minutes: 21 * 60 });
    expect(findTime(['around', 'nine'], 12, 'en')).toMatchObject({ minutes: 21 * 60 });
    expect(findTime(['around', 'nine', 'in', 'the', 'morning'], 12, 'en')).toMatchObject({ minutes: 9 * 60 });
    expect(findTime(['for', '30', 'minutes'], 7, 'en')).toBeNull();
    expect(findDuration(['for', 'half', 'an', 'hour'])).toBe(30);
    expect(findDuration(['20', 'minuten'])).toBe(20);
    expect(findDuration(['anderhalf', 'uur'])).toBe(90);
    expect(findDuration(['an', 'hour'])).toBe(60);
    expect(findDuration(['om', '1', 'uur'])).toBeNull();
  });

  it('finds nothing in an empty or unrelated transcript', () => {
    expect(detectBehaviours('', 'en')).toEqual([]);
    expect(detectBehaviours('The weather report said nothing new', 'en')).toEqual([]);
  });

  it('only targets behaviours from the catalogue', () => {
    for (const id of VOICE_RULE_IDS) expect(findQuestion(id)).toBeDefined();
  });
});
