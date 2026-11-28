import type { Language } from './types';
import type { JournalAnswer } from './userData';

export type DetectionDetail = { kind: 'count'; value: number } | { kind: 'time'; minutes: number } | { kind: 'duration'; minutes: number } | { kind: 'no' };

export interface Detection {
  questionId: string;
  answer: JournalAnswer;
  detail: DetectionDetail | null;
  confident: boolean;
}

type Reader = 'yes' | 'count';

interface Rule {
  id: string;
  read: Reader;
  words: readonly string[];
  needs?: readonly string[];
  needsRequired?: boolean;
  ignoreNegation?: boolean;
  duration?: boolean;
  requireNumber?: boolean;
  longIf?: number;
}

const MAX_TRANSCRIPT = 4000;
const NUMBER_WINDOW = 4;
const NEGATION_WINDOW = 4;
const LATE_CAFFEINE = 14 * 60;
const LATE_MEAL_MAYBE = 21 * 60;
const LATE_MEAL_SURE = 22 * 60;
const EVENING_WORKOUT = 18 * 60;
const MORNING_WORKOUT = 11 * 60;
const GLASSES_PER_LITRE = 4;
const GLASSES_PER_BOTTLE = 2;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, couple: 2,
  twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
  dertien: 13, veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18, negentien: 19, twintig: 20,
  dertig: 30, veertig: 40, vijftig: 50,
};
const ARTICLES = new Set(['a', 'an', 'een', 'one']);
const VAGUE = new Set(['few', 'several', 'some', 'many', 'lots', 'paar', 'enkele', 'wat', 'veel']);
const NEGATIONS = new Set(['no', 'not', "didn't", 'didnt', "don't", 'dont', "haven't", "hadn't", "wasn't", 'without', 'skipped', 'never', 'none', 'zero', 'geen', 'niet', 'zonder', 'nooit']);
const TIME_PREPOSITIONS = new Set(['at', 'around', 'about', 'by', 'after', 'past', 'om', 'rond', 'rondom', 'tegen', 'na', 'vanaf']);
const PM = new Set(['pm', 'p.m', 'p.m.', "'s", 'avonds', 'middags']);
const AM = new Set(['am', 'a.m', 'a.m.']);
const MORNING = new Set(['morning', 'breakfast', 'ochtends', 'morgens', 'vanochtend', 'vanmorgen', 'ochtend', 'ontbijt']);
const AFTERNOON = new Set(['afternoon', 'lunch', 'middags', 'vanmiddag', 'namiddag', 'middag']);
const EVENING = new Set(['evening', 'tonight', 'night', 'dinner', 'supper', 'avonds', 'vanavond', 'avond', 'avondeten']);
const BED_CONTEXT = ['bed', 'bedtime', 'sleep', 'sleeping', 'slapen', 'slapengaan', 'slaap', 'bedtijd'];
const CONJUNCTIONS = new Set(['and', 'but', 'then', 'plus', 'en', 'maar', 'daarna', 'dan']);
const LITRES = new Set(['l', 'liter', 'litre', 'liters', 'litres']);
const BOTTLES = new Set(['bottle', 'bottles', 'fles', 'flessen', 'flesje', 'flesjes']);

const CAFFEINE_WORDS = [
  'coffee*', 'koffie*', 'espresso*', 'cappuccino*', 'latte*', 'americano*', 'flat white', 'macchiato*', 'cortado*', 'black tea', 'green tea',
  'zwarte thee', 'groene thee', 'matcha', 'energy drink*', 'energiedrank*', 'cola', 'red bull', 'caffeine', 'cafeine',
];
const MEAL_WORDS = ['dinner', 'supper', 'meal', 'ate', 'eaten', 'diner', 'avondeten', 'avondmaal', 'gegeten', 'eten'];
const WORKOUT_WORDS = [
  'worked out', 'workout', 'trained', 'training', 'gym', 'ran', 'run', 'running', 'jog*', 'cycled', 'swam', 'lifted', 'sport*', 'gesport',
  'getraind', 'hardgelopen', 'gefietst', 'gezwommen', 'fitness', 'krachttraining', 'ochtendtraining', 'avondtraining',
];

const RULES: readonly Rule[] = [
  { id: 'alcohol', read: 'count', words: ['alcohol', 'beer*', 'bier*', 'pils*', 'wine*', 'wijn*', 'cocktail*', 'whisk*', 'vodka', 'gin', 'champagne', 'prosecco', 'cava', 'cider', 'rum', 'tequila', 'drinks', 'drankje*', 'borrel*', 'pint*'] },
  { id: 'water', read: 'count', words: ['water'] },
  { id: 'caffeine', read: 'count', words: CAFFEINE_WORDS, requireNumber: true },
  { id: 'skipped-breakfast', read: 'yes', words: ['skipped breakfast', 'no breakfast', 'geen ontbijt', 'ontbijt overgeslagen'], ignoreNegation: true },
  { id: 'no-exercise', read: 'yes', words: ['no exercise', 'no workout', "didn't work out", "didn't train", 'niet gesport', 'niet getraind', 'geen training'], ignoreNegation: true },
  { id: 'read-before-sleep', read: 'yes', words: ['read', 'reading', 'book', 'gelezen', 'lezen', 'boek'], needs: BED_CONTEXT, duration: true },
  {
    id: 'screens-bed',
    read: 'yes',
    words: ['phone', 'telefoon', 'gsm', 'scroll*', 'screen*', 'scherm*', 'tv', 'television', 'netflix', 'youtube', 'instagram', 'tiktok', 'social media', 'laptop', 'tablet', 'ipad'],
    needs: ['bed'],
    needsRequired: true,
  },
  { id: 'warm-shower', read: 'yes', words: ['warm bath', 'hot bath', 'warm shower', 'hot shower', 'warm bad', 'warme douche'], needs: BED_CONTEXT },
  { id: 'sauna', read: 'yes', words: ['sauna*'], duration: true },
  { id: 'cold-plunge', read: 'yes', words: ['cold plunge', 'ice bath', 'ijsbad*'], duration: true },
  { id: 'cold-shower', read: 'yes', words: ['cold shower', 'koude douche'] },
  { id: 'massage', read: 'yes', words: ['massage*'] },
  { id: 'stretching', read: 'yes', words: ['stretch*', 'gestretcht', 'gerekt', 'rekoefeningen'], duration: true },
  { id: 'foam-rolling', read: 'yes', words: ['foam roll*', 'foamroll*'] },
  { id: 'yoga', read: 'yes', words: ['yoga'], duration: true },
  { id: 'pilates', read: 'yes', words: ['pilates'], duration: true },
  { id: 'meditation', read: 'yes', words: ['meditat*', 'mediteer*', 'gemediteerd'], duration: true },
  { id: 'breathwork', read: 'yes', words: ['breathwork', 'breathing exercise*', 'ademhalingsoefening*'], duration: true },
  { id: 'nap', read: 'yes', words: ['nap', 'naps', 'napped', 'napping', 'power nap', 'dutje*', 'middagdutje*', 'powernap*'], duration: true },
  { id: 'melatonin', read: 'yes', words: ['melatonin*'] },
  { id: 'magnesium', read: 'yes', words: ['magnesium'] },
  { id: 'vitamin-d', read: 'yes', words: ['vitamin d', 'vitamine d'] },
  { id: 'creatine', read: 'yes', words: ['creatine'] },
  { id: 'omega-3', read: 'yes', words: ['omega 3', 'omega-3', 'fish oil', 'visolie'] },
  { id: 'electrolytes', read: 'yes', words: ['electrolyte*', 'elektrolyt*', 'sports drink', 'sportdrank*'] },
  { id: 'painkillers', read: 'yes', words: ['painkiller*', 'pijnstiller*', 'ibuprofen', 'paracetamol', 'aspirin*', 'dafalgan', 'perdolan'] },
  { id: 'sleeping-pill', read: 'yes', words: ['sleeping pill*', 'slaappil*', 'slaapmiddel*'] },
  { id: 'antihistamine', read: 'yes', words: ['antihistamin*', 'cetirizine', 'loratadine', 'allergy pill*', 'allergiepil*'] },
  { id: 'antibiotics', read: 'yes', words: ['antibiotic*', 'antibiotica'] },
  { id: 'headache', read: 'yes', words: ['headache*', 'hoofdpijn'] },
  { id: 'feeling-ill', read: 'yes', words: ['sick', 'ill', 'unwell', 'ziek', 'ziekjes'] },
  { id: 'fever', read: 'yes', words: ['fever', 'koorts*'] },
  { id: 'cold-flu', read: 'yes', words: ['caught a cold', 'have a cold', 'got a cold', 'flu', 'griep*', 'verkouden', 'verkoudheid', 'sore throat', 'keelpijn'] },
  { id: 'hangover', read: 'yes', words: ['hungover', 'hangover', 'kater', 'brak'] },
  { id: 'stomach-trouble', read: 'yes', words: ['stomach ache', 'stomachache', 'upset stomach', 'buikpijn', 'maagpijn', 'buikklachten'] },
  { id: 'sore-muscles', read: 'yes', words: ['sore muscles', 'muscle soreness', 'spierpijn', 'stijve spieren'] },
  { id: 'injury', read: 'yes', words: ['injur*', 'geblesseerd', 'blessure'] },
  { id: 'back-pain', read: 'yes', words: ['back pain', 'sore back', 'rugpijn'] },
  { id: 'allergies', read: 'yes', words: ['allerg*', 'hay fever', 'hooikoorts'] },
  { id: 'low-energy', read: 'yes', words: ['tired', 'exhausted', 'low energy', 'moe', 'uitgeput'] },
  { id: 'high-stress', read: 'yes', words: ['stress', 'stressed', 'stressful', 'gestrest', 'gestresst', 'drukke dag', 'busy day'] },
  { id: 'anxious', read: 'yes', words: ['anxious', 'anxiety', 'nervous', 'angstig', 'nerveus'] },
  { id: 'low-mood', read: 'yes', words: ['felt down', 'feeling down', 'sad', 'low mood', 'somber', 'verdrietig'] },
  { id: 'good-mood', read: 'yes', words: ['good mood', 'happy', 'great day', 'goed humeur', 'blij'] },
  { id: 'conflict', read: 'yes', words: ['argument', 'ruzie', 'conflict'] },
  { id: 'deadline', read: 'yes', words: ['deadline*'] },
  { id: 'worked-late', read: 'yes', words: ['worked late', 'working late', 'laat gewerkt', 'overgewerkt'] },
  { id: 'long-workday', read: 'yes', words: ['long workday', 'long day at work', 'lange werkdag'] },
  { id: 'therapy', read: 'yes', words: ['therapy', 'therapist', 'therapie', 'psycholoog', 'psychologist'] },
  { id: 'gratitude', read: 'yes', words: ['gratitude', 'dankbaarheid'] },
  { id: 'video-games', read: 'yes', words: ['gaming', 'gamed', 'video games', 'videogames', 'gamen', 'gegamed'] },
  { id: 'friends', read: 'yes', words: ['friends', 'vrienden'] },
  { id: 'family', read: 'yes', words: ['family', 'familie', 'parents', 'ouders'] },
  { id: 'night-out', read: 'yes', words: ['night out', 'went out', 'party', 'partied', 'feestje', 'feest', 'uitgegaan'] },
  { id: 'sexual-activity', read: 'yes', words: ['sex', 'seks'] },
  { id: 'nicotine', read: 'yes', words: ['cigarette*', 'sigaret*', 'smoked', 'gerookt', 'vape*', 'vaped', 'snus', 'nicotine'] },
  { id: 'cannabis', read: 'yes', words: ['cannabis', 'weed', 'joint', 'wiet', 'geblowd'] },
  { id: 'travelling', read: 'yes', words: ['travel*', 'op reis', 'gereisd'] },
  { id: 'flight', read: 'yes', words: ['flight', 'flew', 'vlucht', 'gevlogen', 'vliegtuig'] },
  { id: 'jet-lag', read: 'yes', words: ['jet lag', 'jetlag*'] },
  { id: 'worked-from-home', read: 'yes', words: ['worked from home', 'wfh', 'thuisgewerkt', 'thuis gewerkt'] },
  { id: 'night-shift', read: 'yes', words: ['night shift', 'nachtdienst'] },
  { id: 'fast-food', read: 'yes', words: ['fast food', 'fastfood', 'burger*', 'pizza*', 'fries', 'friet*', 'kebab'] },
  { id: 'sugary-food', read: 'yes', words: ['candy', 'sweets', 'cake*', 'cookie*', 'koek*', 'snoep*', 'taart*', 'chocolate*', 'chocola*', 'dessert*', 'ice cream', 'donut*'] },
  { id: 'late-snack', read: 'yes', words: ['late snack', 'midnight snack', 'late-night snack'] },
  { id: 'fasting', read: 'yes', words: ['fasted', 'fasting', 'vasten', 'gevast'] },
  { id: 'large-dinner', read: 'yes', words: ['big dinner', 'large dinner', 'huge dinner', 'heavy dinner', 'zware maaltijd', 'groot diner'] },
  { id: 'overate', read: 'yes', words: ['overate', 'ate too much', 'te veel gegeten'] },
  { id: 'ate-out', read: 'yes', words: ['restaurant', 'ate out', 'eating out', 'uit eten'] },
  { id: 'home-cooked', read: 'yes', words: ['cooked at home', 'home-cooked', 'home cooked', 'zelf gekookt', 'thuis gekookt'] },
  { id: 'soft-drinks', read: 'yes', words: ['soda', 'coke', 'frisdrank*', 'fanta', 'sprite', 'soft drink*'] },
  { id: 'herbal-tea', read: 'yes', words: ['herbal tea', 'kruidenthee', 'chamomile', 'kamille*', 'mint tea', 'muntthee', 'rooibos'] },
  { id: 'protein-shake', read: 'yes', words: ['protein shake*', 'eiwitshake*', 'proteineshake*'] },
  { id: 'red-meat', read: 'yes', words: ['steak', 'beef', 'red meat', 'rood vlees', 'biefstuk', 'rundvlees'] },
  { id: 'fish', read: 'yes', words: ['fish', 'salmon', 'tuna', 'vis', 'zalm', 'tonijn'] },
  { id: 'spicy-food', read: 'yes', words: ['spicy', 'curry', 'pittig'] },
  { id: 'earplugs', read: 'yes', words: ['earplug*', 'oordop*'] },
  { id: 'eye-mask', read: 'yes', words: ['eye mask', 'sleep mask', 'slaapmasker'] },
  { id: 'white-noise', read: 'yes', words: ['white noise', 'witte ruis'] },
  { id: 'mouth-tape', read: 'yes', words: ['mouth tape', 'mondtape'] },
  { id: 'nasal-strip', read: 'yes', words: ['nasal strip*', 'neuspleister*'] },
  { id: 'slept-in', read: 'yes', words: ['slept in', 'uitgeslapen'] },
  { id: 'late-bedtime', read: 'yes', words: ['went to bed late', 'late to bed', 'stayed up late', 'laat naar bed'] },
  { id: 'woke-at-night', read: 'yes', words: ['middle of the night', 'woke up during the night', 'woke up in the night', 'nachts wakker'] },
  { id: 'outdoors', read: 'yes', words: ['outside', 'outdoors', 'buiten'] },
  { id: 'morning-light', read: 'yes', words: ['morning sun', 'morning light', 'ochtendzon', 'ochtendlicht'] },
  { id: 'dog-walk', read: 'yes', words: ['walked the dog', 'dog walk', 'hond uitgelaten', 'met de hond'] },
  { id: 'long-walk', read: 'yes', words: ['walk', 'walked', 'wandeling', 'gewandeld', 'wandelen'], needs: ['long', 'lange', 'lang'], duration: true, longIf: 45 },
  { id: 'running', read: 'yes', words: ['ran', 'run', 'running', 'jog*', 'hardgelopen', 'hardlopen', 'gejogd', 'joggen'], duration: true },
  { id: 'cycling', read: 'yes', words: ['cycled', 'cycling', 'bike ride', 'biked', 'gefietst', 'fietstocht', 'fietsrit'], duration: true },
  { id: 'swimming', read: 'yes', words: ['swam', 'swim', 'swimming', 'gezwommen', 'zwemmen'], duration: true },
  { id: 'strength-training', read: 'yes', words: ['gym', 'weights', 'lifted', 'lifting', 'strength training', 'krachttraining', 'fitness', 'leg day', 'squats', 'deadlift*', 'bench press'], duration: true },
  { id: 'intervals', read: 'yes', words: ['intervals', 'interval training', 'intervaltraining', 'hiit', 'sprints'] },
  { id: 'hiking', read: 'yes', words: ['hike', 'hiked', 'hiking', 'trektocht', 'bergwandeling'] },
  { id: 'climbing', read: 'yes', words: ['climbing', 'climbed', 'bouldering', 'klimmen', 'geklommen', 'boulderen'] },
  { id: 'dancing', read: 'yes', words: ['danced', 'dancing', 'dansen', 'gedanst'] },
  { id: 'team-sport', read: 'yes', words: ['football', 'soccer', 'voetbal*', 'basketball', 'volleyball', 'hockey', 'rugby', 'handbal', 'korfbal'] },
  { id: 'racket-sport', read: 'yes', words: ['tennis', 'padel', 'squash', 'badminton'] },
  { id: 'martial-arts', read: 'yes', words: ['boxing', 'kickbox*', 'judo', 'karate', 'jiu jitsu', 'bjj', 'boksen'] },
  { id: 'rest-day', read: 'yes', words: ['rest day', 'rustdag'] },
  { id: 'physiotherapy', read: 'yes', words: ['physio*', 'kine', 'kinesist', 'kinesitherapie', 'fysio*'] },
  { id: 'vaccination', read: 'yes', words: ['vaccin*', 'flu shot', 'griepprik'] },
  { id: 'gave-blood', read: 'yes', words: ['gave blood', 'donated blood', 'bloed gegeven', 'bloed gedoneerd'] },
];

interface Clause {
  tokens: string[];
  index: number;
}

interface Found {
  detection: Detection;
  position: number;
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’`]/g, "'");
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((raw) => raw.replace(/^[^a-z0-9']+|[^a-z0-9]+$/g, ''))
    .filter((token) => token !== '' && token !== "'");
}

export function splitClauses(text: string): Clause[] {
  const parts = fold(text.slice(0, MAX_TRANSCRIPT)).split(/(?:[;!?\n]|[.,](?=\s|$))+/);
  const clauses: Clause[] = [];
  for (const part of parts) {
    let current: string[] = [];
    for (const token of tokenize(part)) {
      if (CONJUNCTIONS.has(token)) {
        if (current.length > 0) clauses.push({ tokens: current, index: clauses.length });
        current = [];
      } else current.push(token);
    }
    if (current.length > 0) clauses.push({ tokens: current, index: clauses.length });
  }
  return clauses;
}

function tokenMatches(token: string | undefined, pattern: string): boolean {
  if (token === undefined) return false;
  return pattern.endsWith('*') ? token.startsWith(pattern.slice(0, -1)) : token === pattern;
}

function findPhrase(tokens: readonly string[], phrase: string): number {
  const parts = phrase.split(' ');
  for (let i = 0; i + parts.length <= tokens.length; i++) {
    if (parts.every((part, offset) => tokenMatches(tokens[i + offset], part))) return i;
  }
  return -1;
}

function firstMatch(tokens: readonly string[], words: readonly string[]): number {
  let best = -1;
  for (const word of words) {
    const at = findPhrase(tokens, word);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

function hasAny(tokens: readonly string[], words: readonly string[]): boolean {
  return words.some((word) => findPhrase(tokens, word) >= 0);
}

function negatedBefore(tokens: readonly string[], at: number): boolean {
  for (let i = Math.max(0, at - NEGATION_WINDOW); i < at; i++) if (NEGATIONS.has(tokens[i] ?? '')) return true;
  return false;
}

function numberValue(token: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'));
  return NUMBER_WORDS[token] ?? null;
}

type Amount = { value: number; exact: boolean; unit: 'litre' | 'bottle' | null };

function amountBefore(tokens: readonly string[], at: number): Amount | null {
  let unit: Amount['unit'] = null;
  for (let i = at - 1; i >= Math.max(0, at - NUMBER_WINDOW); i--) {
    const token = tokens[i] ?? '';
    if (LITRES.has(token)) unit = 'litre';
    if (BOTTLES.has(token)) unit = 'bottle';
    if (VAGUE.has(token)) return { value: 2, exact: false, unit };
    const value = numberValue(token);
    if (value !== null && value > 0 && value <= 50) return { value, exact: true, unit };
    if (ARTICLES.has(token)) return { value: 1, exact: true, unit };
  }
  return null;
}

function hourValue(token: string | undefined): number | null {
  if (token === undefined) return null;
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return n <= 24 ? n : null;
  }
  const word = token === 'een' ? 1 : NUMBER_WORDS[token];
  return word !== undefined && word <= 12 ? word : null;
}

interface ClockTime {
  minutes: number;
  explicit: boolean;
}

function clockAt(tokens: readonly string[], i: number, language: Language): { hour: number; minute: number; explicit: boolean; next: number } | null {
  const token = tokens[i] ?? '';
  const full = /^(\d{1,2})[:.hu](\d{2})$/.exec(token);
  if (full) return { hour: Number(full[1]), minute: Number(full[2]), explicit: Number(full[1]) >= 13 || (full[1] ?? '').length === 2, next: i + 1 };
  const suffixed = /^(\d{1,2})(am|pm|u|h)$/.exec(token);
  if (suffixed) {
    const hour = Number(suffixed[1]);
    if (suffixed[2] === 'pm') return { hour: hour < 12 ? hour + 12 : hour, minute: 0, explicit: true, next: i + 1 };
    if (suffixed[2] === 'am') return { hour: hour % 12, minute: 0, explicit: true, next: i + 1 };
    return { hour, minute: 0, explicit: hour >= 13, next: i + 1 };
  }
  if (token === 'half') {
    if (language === 'en' && tokens[i + 1] === 'past') {
      const hour = hourValue(tokens[i + 2]);
      return hour === null ? null : { hour, minute: 30, explicit: false, next: i + 3 };
    }
    const hour = hourValue(tokens[i + 1]);
    if (hour === null) return null;
    return language === 'nl' ? { hour: hour === 0 ? 23 : hour - 1, minute: 30, explicit: false, next: i + 2 } : { hour, minute: 30, explicit: false, next: i + 2 };
  }
  if (token === 'noon') return { hour: 12, minute: 0, explicit: true, next: i + 1 };
  if (token === 'midnight' || token === 'middernacht') return { hour: 24, minute: 0, explicit: true, next: i + 1 };
  const hour = hourValue(token);
  if (hour === null) return null;
  return { hour, minute: 0, explicit: hour >= 13, next: i + 1 };
}

export function findTime(tokens: readonly string[], pmBelow: number, language: Language): ClockTime | null {
  const pmContext = tokens.some((token) => AFTERNOON.has(token) || EVENING.has(token));
  const amContext = tokens.some((token) => MORNING.has(token));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const standalone = /^\d{1,2}[:.hu]\d{2}$/.test(token) || /^\d{1,2}(am|pm)$/.test(token);
    if (!standalone && !TIME_PREPOSITIONS.has(tokens[i - 1] ?? '')) continue;
    const clock = clockAt(tokens, i, language);
    if (clock === null) continue;
    const after = tokens[clock.next] ?? '';
    let { hour } = clock;
    let explicit = clock.explicit;
    if (PM.has(after) && after !== "'s") {
      if (hour < 12) hour += 12;
      explicit = true;
    } else if (AM.has(after)) {
      hour %= 12;
      explicit = true;
    } else if (after === "'s" && (tokens[clock.next + 1] === 'avonds' || tokens[clock.next + 1] === 'middags')) {
      if (hour < 12) hour += 12;
      explicit = true;
    } else if (after === "'s" && (tokens[clock.next + 1] === 'ochtends' || tokens[clock.next + 1] === 'morgens')) {
      explicit = true;
    }
    if (!explicit) {
      if (pmContext && !amContext && hour < 12) hour += 12;
      else if (!amContext && hour >= 1 && hour < pmBelow) hour += 12;
    }
    if (hour > 24) continue;
    return { minutes: hour * 60 + clock.minute, explicit };
  }
  return null;
}

export function findDuration(tokens: readonly string[]): number | null {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    const next = tokens[i + 1] ?? '';
    if (token === 'half' && (next === 'an' || next === 'a') && tokens[i + 2] === 'hour') return 30;
    if (token === 'half' && (next === 'uur' || next === 'uurtje')) return 30;
    if (token === 'anderhalf' && (next === 'uur' || next === 'uurtje')) return 90;
    if (TIME_PREPOSITIONS.has(tokens[i - 1] ?? '')) continue;
    const compact = /^(\d{1,3})(min|mins|m)$/.exec(token);
    if (compact) return Number(compact[1]);
    const value = token === 'an' || token === 'a' ? (next === 'hour' ? 1 : null) : token === 'een' && (next === 'uur' || next === 'uurtje') ? 1 : numberValue(token);
    if (value === null || value <= 0) continue;
    if (/^(min|mins|minute|minutes|minuten|minuutjes)$/.test(next)) return Math.round(value);
    if (/^(hour|hours|hr|hrs|uur|uren|uurtje)$/.test(next)) return Math.round(value * 60);
  }
  return null;
}

function addFound(found: Map<string, Found>, detection: Detection, position: number): void {
  const existing = found.get(detection.questionId);
  if (existing === undefined) {
    found.set(detection.questionId, { detection, position });
    return;
  }
  const a = existing.detection;
  const b = detection;
  if (typeof a.answer === 'number' && typeof b.answer === 'number') {
    const value = a.answer + b.answer;
    found.set(b.questionId, {
      position: existing.position,
      detection: { ...a, answer: value, detail: value === 0 ? { kind: 'no' } : { kind: 'count', value }, confident: a.confident && b.confident },
    });
    return;
  }
  const aYes = a.answer === true || (typeof a.answer === 'number' && a.answer > 0);
  const bYes = b.answer === true || (typeof b.answer === 'number' && b.answer > 0);
  if (bYes && !aYes) found.set(b.questionId, { detection: b, position: existing.position });
  else if (bYes && aYes && b.detail?.kind === 'time' && a.detail?.kind === 'time' && b.detail.minutes > a.detail.minutes) found.set(b.questionId, { detection: b, position: existing.position });
}

function readRule(rule: Rule, clause: Clause, found: Map<string, Found>): void {
  const at = firstMatch(clause.tokens, rule.words);
  if (at < 0) return;
  const position = clause.index * 1000 + at;
  const negated = !rule.ignoreNegation && negatedBefore(clause.tokens, at);
  if (rule.read === 'count') {
    if (negated) {
      if (rule.requireNumber) return;
      addFound(found, { questionId: rule.id, answer: 0, detail: { kind: 'no' }, confident: true }, position);
      return;
    }
    const amount = amountBefore(clause.tokens, at);
    if (amount === null && rule.requireNumber) return;
    let value = amount?.value ?? 1;
    let confident = amount?.exact ?? false;
    if (amount?.unit === 'litre') {
      value = Math.round(amount.value * GLASSES_PER_LITRE);
      confident = false;
    } else if (amount?.unit === 'bottle') {
      value = Math.round(amount.value * GLASSES_PER_BOTTLE);
      confident = false;
    }
    addFound(found, { questionId: rule.id, answer: Math.round(value), detail: { kind: 'count', value: Math.round(value) }, confident }, position);
    return;
  }
  const hasNeeds = rule.needs === undefined || hasAny(clause.tokens, rule.needs);
  if (rule.needsRequired && !hasNeeds) return;
  if (negated) {
    addFound(found, { questionId: rule.id, answer: false, detail: { kind: 'no' }, confident: true }, position);
    return;
  }
  const duration = rule.duration ? findDuration(clause.tokens) : null;
  const longEnough = rule.longIf !== undefined && duration !== null && duration >= rule.longIf;
  addFound(
    found,
    { questionId: rule.id, answer: true, detail: duration === null ? null : { kind: 'duration', minutes: duration }, confident: hasNeeds || longEnough },
    position,
  );
}

function readLateCaffeine(clause: Clause, language: Language, found: Map<string, Found>): void {
  const at = firstMatch(clause.tokens, CAFFEINE_WORDS);
  if (at < 0) return;
  const position = clause.index * 1000 + at;
  const time = findTime(clause.tokens, 7, language);
  const late = clause.tokens.some((token) => AFTERNOON.has(token) || EVENING.has(token) || token === 'late' || token === 'laat');
  if (negatedBefore(clause.tokens, at)) {
    const scoped = time !== null || late || clause.tokens.includes('after') || clause.tokens.includes('na');
    if (scoped || amountBefore(clause.tokens, at) === null) addFound(found, { questionId: 'caffeine-late', answer: false, detail: { kind: 'no' }, confident: true }, position);
    return;
  }
  if (time !== null) {
    if (time.minutes >= LATE_CAFFEINE) addFound(found, { questionId: 'caffeine-late', answer: true, detail: { kind: 'time', minutes: time.minutes }, confident: true }, position);
    return;
  }
  if (late) addFound(found, { questionId: 'caffeine-late', answer: true, detail: null, confident: true }, position);
}

function readLateMeal(clause: Clause, language: Language, found: Map<string, Found>): void {
  const at = firstMatch(clause.tokens, MEAL_WORDS);
  if (at < 0) return;
  const position = clause.index * 1000 + at;
  if (negatedBefore(clause.tokens, at)) return;
  const near = clause.tokens.slice(Math.max(0, at - 2), at + 3);
  if (near.includes('late') || near.includes('laat')) {
    addFound(found, { questionId: 'late-meal', answer: true, detail: null, confident: true }, position);
    return;
  }
  const time = findTime(clause.tokens, 12, language);
  if (time === null || time.minutes < LATE_MEAL_MAYBE) return;
  addFound(found, { questionId: 'late-meal', answer: true, detail: { kind: 'time', minutes: time.minutes }, confident: time.minutes >= LATE_MEAL_SURE }, position);
}

function readWorkoutTime(clause: Clause, language: Language, found: Map<string, Found>): void {
  const at = firstMatch(clause.tokens, WORKOUT_WORDS);
  if (at < 0 || negatedBefore(clause.tokens, at)) return;
  const position = clause.index * 1000 + at;
  if (clause.tokens.includes('ochtendtraining')) {
    addFound(found, { questionId: 'morning-workout', answer: true, detail: null, confident: true }, position);
    return;
  }
  if (clause.tokens.includes('avondtraining')) {
    addFound(found, { questionId: 'evening-workout', answer: true, detail: null, confident: true }, position);
    return;
  }
  const time = findTime(clause.tokens, 6, language);
  if (time !== null) {
    if (time.minutes >= EVENING_WORKOUT) addFound(found, { questionId: 'evening-workout', answer: true, detail: { kind: 'time', minutes: time.minutes }, confident: true }, position);
    else if (time.minutes < MORNING_WORKOUT) addFound(found, { questionId: 'morning-workout', answer: true, detail: { kind: 'time', minutes: time.minutes }, confident: true }, position);
    return;
  }
  if (clause.tokens.some((token) => EVENING.has(token) && token !== 'dinner' && token !== 'avondeten')) {
    addFound(found, { questionId: 'evening-workout', answer: true, detail: null, confident: true }, position);
  } else if (clause.tokens.some((token) => MORNING.has(token) && token !== 'breakfast' && token !== 'ontbijt')) {
    addFound(found, { questionId: 'morning-workout', answer: true, detail: null, confident: true }, position);
  }
}

export function detectBehaviours(text: string, language: Language): Detection[] {
  const found = new Map<string, Found>();
  for (const clause of splitClauses(text)) {
    for (const rule of RULES) readRule(rule, clause, found);
    readLateCaffeine(clause, language, found);
    readLateMeal(clause, language, found);
    readWorkoutTime(clause, language, found);
  }
  return [...found.values()].sort((a, b) => a.position - b.position).map((entry) => entry.detection);
}

export function detectionAnswers(detections: readonly Detection[], selected: ReadonlySet<string>): Record<string, JournalAnswer> {
  const answers: Record<string, JournalAnswer> = {};
  for (const detection of detections) if (selected.has(detection.questionId)) answers[detection.questionId] = detection.answer;
  return answers;
}

export function initialSelection(detections: readonly Detection[], active: readonly string[]): Set<string> {
  const tracked = new Set(active);
  return new Set(detections.filter((d) => d.confident && tracked.has(d.questionId)).map((d) => d.questionId));
}

export const VOICE_RULE_IDS: readonly string[] = [...new Set([...RULES.map((rule) => rule.id), 'caffeine-late', 'late-meal', 'evening-workout', 'morning-workout'])];
