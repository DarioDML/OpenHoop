# Explain Metrics and Missing Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every metric name opens a plain explanation where it is shown, every missing value says why and when it will appear, readiness stays hidden until it has its nights, and Load shows a running "so far" value for the open day.

**Architecture:** The pipeline stores two optional fields (`loadSoFar`, `loadValidMinutes`). The app gets a term registry (i18n-backed), pure helpers for building progress, missing-value explanations and their text, and one accessor that hides readiness while the stored `readinessCalibrating` flag is set. A reusable `Sheet` plus an app-level `ExplainProvider` render an About sheet and a Why sheet. Surfaces opt in through small `explain` props on `MetricTile`, `StatRow`, `HeroRing` and `ScoreRing`.

**Tech Stack:** TypeScript, Expo / React Native, expo-router, react-native-svg, jest + @testing-library/react-native (apps/mobile), vitest (packages).

**Spec:** `docs/superpowers/specs/2026-11-27-explain-metrics-design.md`. Approved copy and layout come from canvas artboards N2 to N6. They are reproduced below where they apply.

## Global Constraints

- Never fill a gap with a guess or show a placeholder number.
- Make no medical claims beyond README/LEGAL: no "normal is 95–100 %" and no diagnosis.
- No lecture: a sheet is short and a list line is one line.
- No change to any analytics model or calibration. No new metrics and no AI-written explanations. The coach is only linked to (a pre-filled draft is allowed, it is never sent). No chart rework. No change to PR #87 (alarm) files.
- Import thresholds from the packages that own them (analytics, core, `data/derived.ts`). No new magic numbers in UI code. Layout sizes are fine.
- The app names are Readiness and Load, never Recovery or Strain. "Recovery" appears only as the All terms section heading.
- Every new string exists in English and Dutch. Dutch is written, not machine-literal. Placeholders must match (`__tests__/i18n.test.ts`). Plurals use the existing `…One` key suffix pattern (for example `jetlag.preDaysOne`).
- Readiness: the stored record is unchanged. One accessor (`visibleReadiness`) hides it everywhere while `readinessCalibrating` is true.
- New `DayRecord` fields are optional, and older records must still parse.
- The info button is a button with a hit area of at least 44 px and the a11y label "What is X?".
- Use only theme tokens (`ui/theme.ts`), `Icon` names from `ui/Icon.tsx`, `AppText` variants, `Card`, `Chip` and `ParityBadge`. No hex values in new UI code. The backdrop is `colors.background` at `opacity: 0.72`.
- Pure functions take the clock as a parameter (`nowS: number`, unix seconds). Components read it from `ExplainProvider` (`now` prop, default `Date.now`).
- Owner rules: no `any`, no implicit `unknown`, no comments unless the logic is non-obvious. Use conventional commits whose message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write the message to a temp file and run `git commit -F <file>`. Stay on branch `feature/explain-metrics`.
- Scope every Grep/Glob to `apps/mobile/src`, `apps/mobile/__tests__`, `packages/*/src` and `packages/*/test`.
- All new i18n keys go in a new section pair `apps/mobile/src/i18n/sections/explain.en.json` / `explain.nl.json`. Value changes to existing keys stay in their current file.

## Review Focus

1. **An (i) or a missing-value status inside something that already navigates** (`MetricTile` with `href`, `StatRow` with `href`, the home stress card, `ListRow`). The tap opens only the sheet and never also calls `router.push`. Tests are in Task 6.
2. **A past day** (`app/day/[day]`, date picker). It shows no Load "so far", no "Expected …" row, status "No number yet" instead of "N more nights", no nights-left ring and no first-week card. Tests are in Tasks 3 and 8.
3. **A band not synced for 24 h or more, or never synced.** It never shows a check mark. The first line reads "Last sync 1 d ago" or "Not synced yet". Tests are in Tasks 3 and 5.
4. **Older data.** Stored records without `loadSoFar`/`loadValidMinutes` and widget files without `nightsLeft` render without crashing and fall back to plain text. Tests are in Tasks 1, 3 and 4.
5. **Singular counts and Dutch composition.** Expected strings: "1 more night", "Nog 1 nacht", "Night left", "1 night left" and "Verwacht maandagochtend". A gap in the first week never shows 0 nights left while the score is hidden (minimum 1). Tests are in Tasks 3, 4 and 7.

## Counting rule (applies to Tasks 3, 4, 7 and 8)

`need` counts every night that must exist, including the night that gets the number. `have` counts nights recorded up to and including the shown day. `remaining = max(1, need − have)`.

| Item | need | have |
|---|---|---|
| readiness (building while `readinessCalibrating`) | `READINESS_CALIBRATING_NIGHTS + 1` = 4 | earlier days with hrv, sleep score and resting HR all non-null, + 1 if the shown day has all three |
| consistency (building while reason `needs-history`) | `CONSISTENCY_MIN_NIGHTS` = 2 | `min(CONSISTENCY_NIGHTS − 1, earlier days with a main night)` + 1 if the shown day has a main night |
| normalRange (building while every vital has fewer than `MIN_BASELINE_NIGHTS` earlier values) | `MIN_BASELINE_NIGHTS + 1` = 5 | max over `VITAL_KEYS` of earlier non-null values, + 1 if the shown day has any vital |
| skinTempChange (building while `skinTempDeviationC.reason === 'needs-history'`) | `SKIN_BASELINE_MIN_DAYS + 1` = 4 | earlier non-null `skinTempC` values + 1 if the shown day has one |
| stress, unit `days` (building while the stored stress reason is `needs-history`, or `low-coverage` with `baselineDays < STRESS_BASELINE_MIN_DAYS`) | `STRESS_BASELINE_MIN_DAYS` = 3 | earlier days (last 28) whose stored `windows.length >= STRESS_MIN_DAY_WINDOWS`. The shown day does not count because it is still running. |

The expected day is `addDays(max(day.day, todayIso), remaining)`. It is only set when the shown day is the last day in the list. Its weekday name comes from `formatWeekday(day, language, 'long')` in `data/activityDerived.ts`.

On 27 Nov (one day, index 0) this gives: readiness 1/4 → 3 more, Monday · consistency 1/2 → 1 more, Saturday · ranges 1/5 → 4 more, Tuesday · skin temp 1/4 → 3 more, Monday · stress 0/3 days → 3 more, Monday.

---

### Task 1: Core — export thresholds, store `loadSoFar` and `loadValidMinutes`

**Files:**
- Modify: `packages/analytics/src/index.ts:14-15,35,58-72` (add exports)
- Modify: `packages/core/src/pipeline.ts:62,64,508-509,554-588`
- Modify: `packages/core/src/store/types.ts:148-182`
- Test: `packages/core/test/pipeline.test.ts`, `packages/core/test/store.test.ts`

**Interfaces:**
- Produces:
  - from `@openhoop/analytics`: `LOAD_MIN_VALID_MINUTES` (600), `LOAD_MAX` (21), `READINESS_CALIBRATING_NIGHTS` (3), `CONSISTENCY_MIN_NIGHTS` (2), `CONSISTENCY_NIGHTS` (4) and `STRESS_MIN_DAY_WINDOWS` (12);
  - from `@openhoop/core`: `SKIN_BASELINE_MIN_DAYS` (3);
  - `DayRecord.loadSoFar?: number | null`;
  - `DayRecord.loadValidMinutes?: number`.

- [ ] **Step 1: Write the failing tests**

In `pipeline.test.ts`, extend `'flags partial-day for a day with six hours of data'`:
```ts
expect(records[0]?.loadValidMinutes).toBe(360);
expect(records[0]?.loadSoFar).toBeGreaterThan(0);
expect(records[0]?.loadSoFar).toBeLessThanOrEqual(21);
```
Add the following inside `describe('seven simulated days')`:
```ts
it('stores no load so far once a day has its ten hours of heart rate', () => {
  const scored = records.filter((r) => r.load.value !== null);
  expect(scored.length).toBeGreaterThan(0);
  for (const r of scored) {
    expect(r.loadSoFar).toBeNull();
    expect(r.loadValidMinutes).toBeGreaterThanOrEqual(600);
  }
});
```
In `store.test.ts`:
```ts
it('reads a day stored before load so far existed', async () => {
  const old = dayRecord(device.id, '2026-11-26');
  await store.replaceDay(old);
  const read = await store.getDay(device.id, '2026-11-26');
  expect(read).toEqual(old);
  expect(read?.loadSoFar).toBeUndefined();
});
it('round-trips load so far and valid minutes', async () => {
  const day = dayRecord(device.id, '2026-11-27', { loadSoFar: 4.6, loadValidMinutes: 482 });
  await store.replaceDay(day);
  expect(await store.getDay(device.id, '2026-11-27')).toEqual(day);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/pipeline.test.ts packages/core/test/store.test.ts`
Expected: FAIL. `loadValidMinutes`/`loadSoFar` are undefined, and the store test fails typecheck on the unknown properties.

- [ ] **Step 3: Implement**

- `index.ts`: add `CONSISTENCY_MIN_NIGHTS, CONSISTENCY_NIGHTS` to the sleepNeed export line, `READINESS_CALIBRATING_NIGHTS` to the readiness line, `LOAD_MAX, LOAD_MIN_VALID_MINUTES` to the load line and `STRESS_MIN_DAY_WINDOWS` to the stress block.
- `pipeline.ts`: change `SKIN_BASELINE_MIN_DAYS` to `export const`. Replace the private `CALIBRATING_NIGHTS = 3` with the imported `READINESS_CALIBRATING_NIGHTS`, which has the same value and leaves a single owner.
- `computeDay`: after `minuteHr`, call `const counted = loadSum(minuteHr, rest, maxHr, calibration)`. Set `loadValidMinutes: counted.valid`. Set `loadSoFar` to `loadFromSum(counted.sum, calibration)` when `load.value === null && counted.valid > 0 && counted.valid < LOAD_MIN_VALID_MINUTES && maxHr > rest`, else `null`.
- `types.ts`: add `loadSoFar?: number | null;` and `loadValidMinutes?: number;` after `load`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core packages/analytics`
Expected: PASS (all core and analytics tests).

- [ ] **Step 5: Commit**

```
git add packages/analytics/src/index.ts packages/core/src/pipeline.ts packages/core/src/store/types.ts packages/core/test/pipeline.test.ts packages/core/test/store.test.ts
git commit -F <msg>   # feat: store load so far and valid heart-rate minutes per day
```

---

### Task 2: Term registry and its copy

**Files:**
- Create: `apps/mobile/src/data/terms.ts`
- Create: `apps/mobile/src/i18n/sections/explain.en.json`, `apps/mobile/src/i18n/sections/explain.nl.json`
- Modify: `apps/mobile/src/i18n/index.ts:1-24` (import and spread the explain section into both dictionaries)
- Modify values: `apps/mobile/src/i18n/en.json` + `nl.json` (`metric.spo2`, `metric.skinTempDeviation`), `sections/daily.{en,nl}.json` (`metricDetail.meaning.{hrv,rhr,resp,spo2}`, `metricDetail.method.{hrv,rhr,resp,spo2,temp}`)
- Modify: `apps/mobile/src/ui/daily/metrics.ts` (add `term: TermId` to `MetricSpec`), `apps/mobile/src/data/healthDerived.ts:14-28,119-205` (add `term: TermId` to `VitalSpec` and `term: TermId | null` to `CatalogueItem`)
- Test: `apps/mobile/__tests__/terms.test.ts`

**Interfaces:**
- Produces (from `@/data/terms`):
```ts
export const TERM_IDS: readonly ['readiness','hrv','restingHr','respiratoryRate','spo2','skinTemp','skinTempChange','normalRange','sleepScore','asleep','inBed','sleepNeed','sleepDebt','hoursVsNeed','consistency','efficiency','stages','load','zones','stress','calories','steps','wearTime'];
export type TermId = (typeof TERM_IDS)[number];
export type TermCategory = 'recovery' | 'sleep' | 'effort';
export interface TermList { title: TranslationKey; items: TranslationKey }
export interface TermSpec {
  id: TermId; category: TermCategory; window: 'night' | 'day';
  name: TranslationKey; short: TranslationKey | null; body: TranslationKey; method: TranslationKey;
  level: ParityLevel | null; lists: readonly [TermList, TermList] | null;
}
export const TERMS: Readonly<Record<TermId, TermSpec>>;
export function isTermId(value: string | null | undefined): value is TermId;
export function termFull(id: TermId): TranslationKey;   // `term.${id}.full`
export function termLine(id: TermId): TranslationKey;   // `term.${id}.line`
```
- The template-literal keys must type-check against `TranslationKey`, as the existing `t(\`level.${level}\`)` already does.

**Registry values.** Names reuse existing keys. Levels come from `PARITY`.

| id | cat | window | name | body | method | level | lists |
|---|---|---|---|---|---|---|---|
| readiness | recovery | night | score.readiness | term.readiness.body | explain.method.calibrated | PARITY.readiness | – |
| hrv | recovery | night | metric.hrv | metricDetail.meaning.hrv | metricDetail.method.hrv | PARITY.hrv | higherAfter/lowerAfter: term.hrv.higher, term.hrv.lower |
| restingHr | recovery | night | metric.restingHr | metricDetail.meaning.rhr | metricDetail.method.rhr | PARITY.restingHr | higherAfter/lowerAfter: term.restingHr.higher, .lower |
| respiratoryRate | recovery | night | metric.respiratoryRate | metricDetail.meaning.resp | metricDetail.method.resp | PARITY.respiratoryRate | higherWith/lowerWith: term.respiratoryRate.higher, .lower |
| spo2 | recovery | night | metric.spo2 | metricDetail.meaning.spo2 | metricDetail.method.spo2 | PARITY.spo2 | readsLowerWith/readsBestWith: term.spo2.lower, term.spo2.best |
| skinTemp | recovery | night | metric.skinTemp | metricDetail.meaning.temp | metricDetail.method.temp | PARITY.skinTemp | warmerWith/coolerWith: term.skinTemp.warmer, .cooler |
| skinTempChange | recovery | night | metric.skinTempDeviation | term.skinTempChange.body | metricDetail.method.temp | PARITY.skinTemp | same lists as skinTemp |
| normalRange | recovery | night | term.normalRange.name | term.normalRange.body | explain.method.range | null | – |
| sleepScore | sleep | night | metric.sleepScore | term.sleepScore.body | explain.method.calibrated | PARITY.sleepScore | – |
| asleep | sleep | night | metric.asleep | term.asleep.body | term.asleep.method | PARITY.sleep | – |
| inBed | sleep | night | metric.inBed | term.inBed.body | term.asleep.method | PARITY.sleep | – |
| sleepNeed | sleep | night | metric.need | term.sleepNeed.body | explain.method.calibrated | PARITY.sleepNeed | – |
| sleepDebt | sleep | night | metric.debt | term.sleepDebt.body | explain.method.calibrated | PARITY.sleepNeed | – |
| hoursVsNeed | sleep | night | sleepx.hoursVsNeed | term.hoursVsNeed.body | explain.method.calibrated | PARITY.sleepNeed | – |
| consistency | sleep | night | metric.consistency | term.consistency.body | explain.method.own | PARITY.consistency | – |
| efficiency | sleep | night | sleepx.efficiency | term.efficiency.body | term.asleep.method | PARITY.sleep | – |
| stages | sleep | night | term.stages.name | term.stages.body | explain.method.own | PARITY.stages | – |
| load | effort | day | score.load | term.load.body | explain.method.calibrated | PARITY.load | – |
| zones | effort | day | term.zones.name | term.zones.body | explain.method.calibrated | PARITY.zones | – |
| stress | effort | day | home.stress | term.stress.body | explain.method.own | PARITY.stress | – |
| calories | effort | day | daily.tile.calories | term.calories.body | explain.method.own | PARITY.calories | – |
| steps | effort | day | metric.steps | term.steps.body | metricDetail.method.spo2 | PARITY.steps | – |
| wearTime | effort | day | metric.wearTime | term.wearTime.body | metricDetail.method.spo2 | PARITY.wearTime | – |

`short` is set only for hrv, restingHr, respiratoryRate, spo2 and skinTemp. It is the N6 subtitle under the name.

Mappings:
- `METRIC_SPECS`: hrv→hrv, rhr→restingHr, resp→respiratoryRate, spo2→spo2, temp→skinTemp.
- `VITALS`: the same mapping by id.
- `CATALOGUE`: readiness, hrv, rhr→restingHr, resp→respiratoryRate, spo2, temp→skinTemp, tempDeviation→skinTempChange, sleepScore, asleep, need→sleepNeed, debt→sleepDebt, consistency, load, steps, stress. All others are `null`.

**Value changes to existing keys:**

| key | en | nl |
|---|---|---|
| metric.spo2 | Blood oxygen | Bloedzuurstof |
| metric.skinTempDeviation | Skin temp change | Afwijking huidtemp. (unchanged) |
| metricDetail.meaning.hrv | The time between two heartbeats is never exactly the same. HRV measures how much it varies. A rested body varies more, so a number above your own usual is a good sign. | De tijd tussen twee hartslagen is nooit precies gelijk. HRV meet hoeveel die varieert. Een uitgerust lichaam varieert meer, dus een getal boven je eigen gewoonlijke waarde is een goed teken. |
| metricDetail.meaning.rhr | Your heart rate once your body has settled during sleep. Below your own usual often means you are well rested. A rise of a few beats over several days can come with stress, short sleep or a cold. | Je hartslag zodra je lichaam tot rust is gekomen in je slaap. Onder je eigen gewoonlijke waarde betekent vaak dat je goed uitgerust bent. Een stijging van een paar slagen over meerdere dagen kan samengaan met stress, korte nachten of een verkoudheid. |
| metricDetail.meaning.resp | How many breaths you take per minute while asleep. It stays very steady for most people, so a clear jump from your usual is worth noticing. It can come before you feel ill. | Hoeveel ademhalingen je per minuut neemt terwijl je slaapt. Bij de meeste mensen blijft dat heel stabiel, dus een duidelijke sprong ten opzichte van normaal is het opmerken waard. Die kan komen voordat je je ziek voelt. |
| metricDetail.meaning.spo2 | How much of your blood is carrying oxygen while you sleep. It normally stays high and steady. This is a wellness reading from a wrist sensor, not a medical measurement. | Hoeveel van je bloed zuurstof draagt terwijl je slaapt. Dat blijft normaal hoog en stabiel. Dit is een welzijnsmeting van een polssensor, geen medische meting. |
| metricDetail.method.hrv | OpenHoop works this out from the band's beat-to-beat timing while you sleep. A wellness number, not a medical one. | OpenHoop berekent dit uit de tijd tussen hartslagen die de band meet terwijl je slaapt. Een welzijnsgetal, geen medisch getal. |
| metricDetail.method.rhr | OpenHoop takes the lowest steady stretch of your heart rate while you sleep. | OpenHoop neemt het laagste stabiele stuk van je hartslag tijdens je slaap. |
| metricDetail.method.resp | OpenHoop reads it from the small rhythm your breathing leaves in your heartbeat. | OpenHoop leest het af uit het kleine ritme dat je ademhaling in je hartslag achterlaat. |
| metricDetail.method.spo2 | Reported by the band itself. OpenHoop shows it as received. | Door de band zelf gemeten. OpenHoop toont het zoals ontvangen. |
| metricDetail.method.temp | The band measures skin temperature. OpenHoop compares it with your own nights. | De band meet je huidtemperatuur. OpenHoop vergelijkt die met je eigen nachten. |

**New keys in explain.{en,nl}.json.** Lines marked N5 are the canvas text verbatim. `\n` is a real newline inside the JSON string.

| key | en | nl |
|---|---|---|
| term.readiness.full | How ready your body is today | Hoe klaar je lichaam vandaag is |
| term.readiness.line (N5) | How ready your body is for effort today, from HRV, resting heart rate and sleep. | Hoe klaar je lichaam vandaag is voor inspanning, op basis van HRV, rusthartslag en slaap. |
| term.readiness.body | Readiness compares last night's HRV, resting heart rate and sleep with your own earlier nights. Above your usual means your body has recovered well. It appears once OpenHoop has seen a few of your nights. | Paraatheid vergelijkt de HRV, rusthartslag en slaap van afgelopen nacht met je eigen eerdere nachten. Boven je gewoonlijke niveau betekent dat je lichaam goed hersteld is. Het verschijnt zodra OpenHoop een paar van je nachten heeft gezien. |
| term.hrv.full | Heart rate variability | Hartslagvariabiliteit |
| term.hrv.line (N5) | How much the time between heartbeats varies. Above your usual means rested. | Hoeveel de tijd tussen hartslagen varieert. Boven je gewoonlijke waarde betekent uitgerust. |
| term.hrv.short | Rest signal from your heartbeat | Rustsignaal uit je hartslag |
| term.hrv.higher | A long night\nA rest day\nA calm evening | Een lange nacht\nEen rustdag\nEen rustige avond |
| term.hrv.lower | Alcohol\nA late, heavy meal\nIllness or a hard session | Alcohol\nEen late, zware maaltijd\nZiekte of een zware training |
| term.restingHr.full | Your pulse at rest | Je hartslag in rust |
| term.restingHr.line (N5) | Your lowest steady heart rate while asleep. Below your usual means rested. | Je laagste stabiele hartslag tijdens je slaap. Onder je gewoonlijke waarde betekent uitgerust. |
| term.restingHr.short | Lowest steady pulse in sleep | Laagste stabiele hartslag in je slaap |
| term.restingHr.higher | Alcohol\nA late workout\nIllness | Alcohol\nEen late training\nZiekte |
| term.restingHr.lower | Good sleep\nSteady training\nA cool bedroom | Goede slaap\nRegelmatig trainen\nEen koele slaapkamer |
| term.respiratoryRate.full | Breaths per minute | Ademhalingen per minuut |
| term.respiratoryRate.line (N5) | Breaths per minute while you sleep. It stays steady for most people night to night. | Ademhalingen per minuut tijdens je slaap. Bij de meeste mensen blijft dat van nacht tot nacht gelijk. |
| term.respiratoryRate.short | How fast you breathe asleep | Hoe snel je ademt als je slaapt |
| term.respiratoryRate.higher | Illness or fever\nAlcohol\nA warm room | Ziekte of koorts\nAlcohol\nEen warme kamer |
| term.respiratoryRate.lower | Deep, calm sleep\nGood fitness | Diepe, rustige slaap\nEen goede conditie |
| term.spo2.full | SpO₂, oxygen saturation | SpO₂, zuurstofverzadiging |
| term.spo2.line (N5) | Blood oxygen while you sleep. It normally stays high and steady. | Zuurstof in je bloed tijdens je slaap. Dat blijft normaal hoog en stabiel. |
| term.spo2.short | Oxygen carried in your blood | Zuurstof in je bloed |
| term.spo2.lower | High altitude\nA blocked nose\nA loose strap | Grote hoogte\nEen verstopte neus\nEen losse band |
| term.spo2.best | A snug strap\nStill sleep | Een strakke band\nRustige slaap |
| term.skinTemp.full | Measured at your wrist | Gemeten aan je pols |
| term.skinTemp.line | Your skin temperature at the wrist while you sleep. The change matters more than the number. | Je huidtemperatuur aan je pols tijdens je slaap. De verandering zegt meer dan het getal. |
| term.skinTemp.short | Warmer or cooler than usual | Warmer of koeler dan normaal |
| term.skinTemp.warmer | Illness\nAlcohol\nA warm room | Ziekte\nAlcohol\nEen warme kamer |
| term.skinTemp.cooler | A cold room\nA loose strap | Een koude kamer\nEen losse band |
| term.skinTempChange.full | Skin temperature against your usual | Huidtemperatuur vergeleken met normaal |
| term.skinTempChange.line (N5) | How much warmer or cooler your skin was than on your usual nights. | Hoeveel warmer of koeler je huid was dan op je gewone nachten. |
| term.skinTempChange.body | How much warmer or cooler your skin was than on your usual nights. The change matters more than the number itself. | Hoeveel warmer of koeler je huid was dan op je gewone nachten. De verandering zegt meer dan het getal zelf. |
| term.normalRange.name | Your normal ranges | Je normale bereik |
| term.normalRange.full | Where your own values usually fall | Waar je eigen waarden meestal liggen |
| term.normalRange.line | The range your own values usually fall in, worked out from your earlier nights. | Het bereik waarin je eigen waarden meestal vallen, berekend uit je eerdere nachten. |
| term.normalRange.body | Your normal range is where your own values usually fall: the average of your earlier nights, plus or minus the usual spread. It is not a medical reference range. | Je normale bereik is waar je eigen waarden meestal liggen: het gemiddelde van je eerdere nachten, plus of min de gewone spreiding. Het is geen medisch referentiebereik. |
| term.sleepScore.full | How well you slept against your need | Hoe goed je sliep, gemeten aan je behoefte |
| term.sleepScore.line | How much of the sleep you needed you got, and how regular your times were. | Hoeveel van de slaap die je nodig had je kreeg, en hoe regelmatig je tijden waren. |
| term.sleepScore.body | Sleep score looks at how much of the sleep you needed you actually got, and how regular your bed and wake times were. | De slaapscore kijkt hoeveel van de slaap die je nodig had je echt kreeg, en hoe regelmatig je bed- en opstaantijden waren. |
| term.asleep.full | Time you were actually asleep | Tijd dat je echt sliep |
| term.asleep.line | Time you were actually asleep, without the moments you lay awake. | De tijd dat je echt sliep, zonder de momenten dat je wakker lag. |
| term.asleep.body | The time the band saw you asleep during your main night, without the moments you lay awake. | De tijd dat de band je zag slapen tijdens je hoofdnacht, zonder de momenten dat je wakker lag. |
| term.asleep.method | OpenHoop finds your sleep from the band's heart rate and movement. | OpenHoop vindt je slaap aan de hartslag en beweging die de band meet. |
| term.inBed.full | From falling asleep to getting up | Van inslapen tot opstaan |
| term.inBed.line | Time from falling asleep to getting up, awake moments included. | De tijd van inslapen tot opstaan, wakkere momenten meegeteld. |
| term.inBed.body | The time from falling asleep to getting up, including the short awake moments in between. | De tijd van inslapen tot opstaan, met de korte wakkere momenten daartussen. |
| term.sleepNeed.full | How long to sleep tonight | Hoeveel slaap je vannacht nodig hebt |
| term.sleepNeed.line (N5) | How long to sleep tonight, with extra after short nights and hard days. | Hoe lang je vannacht moet slapen, met extra na korte nachten en zware dagen. |
| term.sleepNeed.body | Your basic need, plus extra after short nights and hard days, minus naps. Getting close to it most nights keeps sleep debt low. | Je basisbehoefte, plus extra na korte nachten en zware dagen, min dutjes. Kom je er de meeste nachten dichtbij, dan blijft je slaapschuld laag. |
| term.sleepDebt.full | Sleep you are short | Slaap die je tekortkomt |
| term.sleepDebt.line (N5) | Sleep you are short from recent nights. | Slaap die je tekortkomt van de laatste nachten. |
| term.sleepDebt.body | Sleep you missed on recent nights against your need. It adds to tonight's need until you catch up. | Slaap die je de laatste nachten miste tegenover je behoefte. Die komt bij je behoefte voor vannacht tot je hem hebt ingehaald. |
| term.hoursVsNeed.full | Sleep you got against your need | Je slaap tegenover je behoefte |
| term.hoursVsNeed.line | The hours you slept as a share of the hours you needed. | De uren die je sliep als deel van de uren die je nodig had. |
| term.hoursVsNeed.body | The hours you slept as a share of the hours you needed. 100% means you got all the sleep you needed. | De uren die je sliep als deel van de uren die je nodig had. 100% betekent dat je alle slaap kreeg die je nodig had. |
| term.consistency.full | Regular bed and wake times | Vaste tijden voor bed en opstaan |
| term.consistency.line (N5) | How close your bed and wake times are from night to night. | Hoe dicht je bedtijd en opstaantijd van nacht tot nacht bij elkaar liggen. |
| term.consistency.body (N4) | Going to bed and getting up at similar times helps you sleep better, even when the hours stay the same. | Op vergelijkbare tijden naar bed gaan en opstaan helpt je beter te slapen, ook als het aantal uren gelijk blijft. |
| term.efficiency.full | Time asleep while in bed | Slaaptijd tijdens je tijd in bed |
| term.efficiency.line | The share of your time in bed that you were asleep. | Het deel van je tijd in bed dat je sliep. |
| term.efficiency.body | The share of your time in bed that you were asleep. When the night has sleep stages, the awake time comes from the stages. | Het deel van je tijd in bed dat je sliep. Als de nacht slaapfasen heeft, komt de wakkere tijd uit die fasen. |
| term.stages.name | Sleep stages | Slaapfasen |
| term.stages.full | Light, deep and REM sleep | Lichte, diepe en REM-slaap |
| term.stages.line (N5) | Light, deep and REM sleep, estimated from your heart rate and movement. | Lichte, diepe en REM-slaap, geschat uit je hartslag en beweging. |
| term.stages.body | Your night split into light, deep and REM sleep and awake moments. OpenHoop estimates them from your heart rate and movement, so treat them as a rough picture. | Je nacht verdeeld in lichte, diepe en REM-slaap en wakkere momenten. OpenHoop schat ze uit je hartslag en beweging, dus zie ze als een ruw beeld. |
| term.load.full | How hard your heart worked | Hoe hard je hart werkte |
| term.load.line (N5) | How hard your heart worked today, from 0 to 21. Each step up is harder to reach. | Hoe hard je hart vandaag werkte, van 0 tot 21. Elke stap hoger is moeilijker te halen. |
| term.load.body (N4) | Load adds up how hard your heart worked today, on a scale of 0 to 21. A number from only part of a day would look too low. | Belasting telt op hoe hard je hart vandaag werkte, op een schaal van 0 tot 21. Een getal van maar een deel van de dag zou te laag lijken. |
| term.zones.name | Heart rate zones | Hartslagzones |
| term.zones.full | Five bands of effort | Vijf niveaus van inspanning |
| term.zones.line (N5) | Five bands from easy (1) to all-out (5), set by your resting and maximum heart rate. | Vijf niveaus van rustig (1) tot alles geven (5), bepaald door je rust- en maximale hartslag. |
| term.zones.body | Five bands from easy (1) to all-out (5). OpenHoop sets them from your resting and maximum heart rate, so they move with your fitness. | Vijf niveaus van rustig (1) tot alles geven (5). OpenHoop bepaalt ze uit je rust- en maximale hartslag, dus ze bewegen mee met je conditie. |
| term.stress.full | Drift from your calm level | Afwijking van je rustige niveau |
| term.stress.line (N5) | How far your heart rate and HRV drift from your calm level while you are awake and still. | Hoe ver je hartslag en HRV afwijken van je rustige niveau terwijl je wakker en stil bent. |
| term.stress.body | Stress compares your heart rate and HRV with your own calm level, only while you are awake and still. It needs a few calm days first to learn that level. | Stress vergelijkt je hartslag en HRV met je eigen rustige niveau, alleen als je wakker en stil bent. Het heeft eerst een paar rustige dagen nodig om dat niveau te leren. |
| term.calories.full | Energy you burned | Energie die je verbruikte |
| term.calories.line | Energy you burned today, estimated from your heart rate and body profile. | Energie die je vandaag verbruikte, geschat uit je hartslag en lichaamsprofiel. |
| term.calories.body | Calories are estimated from your heart rate and your weight, height, sex and age. Without a full profile there is no estimate. | Calorieën worden geschat uit je hartslag en je gewicht, lengte, geslacht en leeftijd. Zonder volledig profiel is er geen schatting. |
| term.steps.full | Counted by the band | Geteld door de band |
| term.steps.line | Steps the band counted today. | Stappen die de band vandaag telde. |
| term.steps.body | Steps counted by the band's motion sensor. If you link Health Connect, its count can be shown instead. | Stappen die de bewegingssensor van de band telt. Als je Health Connect koppelt, kan dat aantal in de plaats komen. |
| term.wearTime.full | Time the band was on your wrist | Tijd dat de band om je pols zat |
| term.wearTime.line | How long the band was on your wrist today. | Hoe lang de band vandaag om je pols zat. |
| term.wearTime.body | How long the band says it was on your wrist today. Numbers like HRV and Load need the band on. | Hoe lang de band volgens zichzelf vandaag om je pols zat. Getallen zoals HRV en Belasting hebben de band om je pols nodig. |
| explain.method.calibrated | OpenHoop's calibrated model. A wellness number, not a medical one. | Het gekalibreerde model van OpenHoop. Een welzijnsgetal, geen medisch getal. |
| explain.method.own | OpenHoop's own method. An estimate, not a diagnosis. | De eigen methode van OpenHoop. Een schatting, geen diagnose. |
| explain.method.range | OpenHoop works this out from your own recent nights. | OpenHoop berekent dit uit je eigen recente nachten. |
| explain.list.higherAfter | Often higher after | Vaak hoger na |
| explain.list.lowerAfter | Often lower after | Vaak lager na |
| explain.list.higherWith | Often higher with | Vaak hoger bij |
| explain.list.lowerWith | Often lower with | Vaak lager bij |
| explain.list.readsLowerWith | Can read lower with | Kan lager uitvallen bij |
| explain.list.readsBestWith | Reads best with | Meet het best met |
| explain.list.warmerWith | Often warmer with | Vaak warmer bij |
| explain.list.coolerWith | Often cooler with | Vaak koeler bij |

- [ ] **Step 1: Write the failing test** `apps/mobile/__tests__/terms.test.ts`

```ts
import { PARITY } from '@/ui/parity';
import { TERMS, TERM_IDS, isTermId, termFull, termLine } from '@/data/terms';
import { translate } from '@/i18n';
import { METRIC_SPECS } from '@/ui/daily/metrics';
import { CATALOGUE, VITALS } from '@/data/healthDerived';

it.each(TERM_IDS)('%s has every text in both languages', (id) => {
  const spec = TERMS[id];
  for (const key of [spec.name, spec.body, spec.method, termFull(id), termLine(id), ...(spec.short ? [spec.short] : [])])
    for (const lang of ['en', 'nl'] as const) expect(translate(lang, key).trim()).not.toBe('');
});
it('takes levels from PARITY and lists only where the canvas has them', () => {
  expect(TERMS.hrv.level).toBe(PARITY.hrv);
  expect(TERMS.normalRange.level).toBeNull();
  expect(TERM_IDS.filter((id) => TERMS[id].lists !== null)).toEqual(['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp', 'skinTempChange']);
});
it('uses the approved copy', () => {
  expect(translate('en', termLine('hrv'))).toBe('How much the time between heartbeats varies. Above your usual means rested.');
  expect(translate('en', TERMS.spo2.name)).toBe('Blood oxygen');
  expect(translate('nl', TERMS.spo2.name)).toBe('Bloedzuurstof');
  expect(translate('en', TERMS.hrv.lists?.[0].items ?? 'reason.unknown')).toBe('A long night\nA rest day\nA calm evening');
});
it('links every metric spec, vital and catalogue item to a valid term', () => {
  expect(Object.values(METRIC_SPECS).map((s) => s.term)).toEqual(['hrv', 'restingHr', 'respiratoryRate', 'spo2', 'skinTemp']);
  expect(VITALS.every((v) => isTermId(v.term))).toBe(true);
  expect(CATALOGUE.find((c) => c.id === 'tempDeviation')?.term).toBe('skinTempChange');
  expect(isTermId('bogus')).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails.** `cd apps/mobile; npx jest __tests__/terms.test.ts`. Expected: FAIL, because `@/data/terms` cannot be found.
- [ ] **Step 3: Implement** `data/terms.ts` from the tables above, add the JSON files, register them in `i18n/index.ts`, change the existing values and add the `term` fields.
- [ ] **Step 4: Run to verify it passes.** `npx jest __tests__/terms.test.ts __tests__/i18n.test.ts`. Expected: PASS. Also run `npm run typecheck` (apps/mobile). Expected: no errors.
- [ ] **Step 5: Commit.** `feat: add the term registry with plain-language copy`

---

### Task 3: Building progress, missing-value explanation and their text (pure)

**Files:**
- Create: `apps/mobile/src/data/progress.ts`, `apps/mobile/src/data/explainMissing.ts`, `apps/mobile/src/ui/explain/whyText.ts`
- Modify: `apps/mobile/src/data/energyDerived.ts` (add `missingProfileFields`), `apps/mobile/src/lib/widgetSnapshot.ts:12` (`export const STALE_AFTER_S`)
- Modify: `explain.{en,nl}.json` (why/status keys below)
- Create: `apps/mobile/__tests__/support/firstNight.ts`
- Test: `apps/mobile/__tests__/explainMissing.test.ts`

**Interfaces:**
- Consumes:
  - `TermId`, `TERMS` (Task 2);
  - from `@openhoop/analytics`: `READINESS_CALIBRATING_NIGHTS`, `CONSISTENCY_MIN_NIGHTS`, `CONSISTENCY_NIGHTS`, `STRESS_BASELINE_MIN_DAYS`, `STRESS_MIN_DAY_WINDOWS`, `LOAD_MIN_VALID_MINUTES`, `parseStressDay`, `ALGO`;
  - `SKIN_BASELINE_MIN_DAYS` from `@openhoop/core`;
  - `MIN_BASELINE_NIGHTS`, `metricValue` and `addDays` from `@/data/derived`;
  - `VITAL_KEYS` and `mainNightSpan` from `@/data/dailyDerived`;
  - `unixToIsoDate` from `@/lib/dates`;
  - `formatWeekday` from `@/data/activityDerived`;
  - `formatAgo`, `formatClock` and `formatDuration` from `@/lib/format`.
- Produces:
```ts
// data/progress.ts
export interface Progress { have: number; need: number; unit: 'nights' | 'days' }
export const BUILDING_TERMS: readonly ['readiness', 'consistency', 'normalRange', 'skinTempChange', 'stress'];
export type BuildingTerm = (typeof BUILDING_TERMS)[number];
export function isBuildingTerm(term: TermId): term is BuildingTerm;
export function buildingProgress(term: BuildingTerm, days: readonly DayRecord[], index: number): Progress | null; // null = not building
export function remaining(progress: Progress): number;                       // max(1, need − have)
export function firstWeekItems(days: readonly DayRecord[], index: number): Array<{ term: BuildingTerm; progress: Progress }>; // BUILDING_TERMS order
export function readinessNightsLeft(days: readonly DayRecord[], index: number): number | null; // null unless readinessCalibrating
export function expectedDay(day: string, nowS: number, tzOffsetS: number, more: number): string;
// data/energyDerived.ts
export type ProfileField = 'weight' | 'height' | 'sex' | 'birthYear';
export function missingProfileFields(userData: UserData, profile: Profile): ProfileField[]; // in that order
// data/explainMissing.ts
export type MissingKind = 'needs-nights' | 'day-running' | 'not-recorded' | 'thin-signal' | 'needs-profile' | 'signal-missing' | 'other';
export type BandState = 'read' | 'stale' | 'no-window';
export interface MissingInput { term: TermId; reason: string | null; days: readonly DayRecord[]; index: number; nowS: number; lastSyncAt: number | null; profileGaps: readonly ProfileField[] }
export interface MissingExplanation {
  term: TermId; kind: MissingKind; reason: string | null; window: 'night' | 'day'; current: boolean;
  band: { state: BandState; lastSyncAt: number | null; tzOffsetS: number };
  progress: Progress | null; expectedDay: string | null; wornMinutes: number | null; profileGaps: readonly ProfileField[];
}
export function explainMissing(input: MissingInput): MissingExplanation;
// ui/explain/whyText.ts
export type WhyTone = 'positive' | 'pink' | 'info' | 'warning' | 'neutral';
export interface WhyRow { id: 'band' | 'cause' | 'source' | 'next' | 'expected'; icon: IconName; tone: WhyTone; title: string; body: string | null; dots: Progress | null; bar: number | null }
export interface WhyText { title: string; subtitle: string; rows: WhyRow[]; footer: string; aboutLink: string; profileLink: boolean }
export function whyText(t: TFunction, language: Language, expl: MissingExplanation): WhyText;
export function missingStatus(t: TFunction, language: Language, expl: MissingExplanation, style: 'row' | 'sheet'): string;
```

**Kind mapping (first match wins):**
1. `no-data` or `no-sleep` → not-recorded.
2. `low-coverage` on a night term → thin-signal.
3. Building term whose `buildingProgress` is non-null → needs-nights with that progress. Stress `low-coverage` lands here while its baseline is building.
4. `needs-history` → needs-nights with progress `null`, which uses the generic copy.
5. `low-coverage` on load → day-running with `wornMinutes = day.loadValidMinutes ?? null`.
6. `no-profile` → needs-profile.
7. `missing-signal` → signal-missing.
8. Anything else → other.

Band state:
- `read` when the shown day has samples for the window (night: a non-nap sleep period; day: `heartRate.avg !== null`) and `nowS − lastSyncAt < STALE_AFTER_S`.
- `stale` when `lastSyncAt` is null or at least `STALE_AFTER_S` old.
- `no-window` otherwise, and also when `days[index]` is undefined.

`expectedDay` is set only for needs-nights with progress and `current`. The band row's clock time uses `formatClock(lastSyncAt, day.tzOffsetS)`.

**whyText rows per kind.** The band row comes first when its state is `read` (icon `check`, positive) or `stale` (icon `sync`, warning). It is omitted for `no-window`.

| kind | subtitle | rows after the band row | footer |
|---|---|---|---|
| needs-nights | why.noNumber | cause (target, pink, why.nights.title or why.days.title, why.need.<term> {need,have} or why.need.generic, dots = progress) · expected (calendar, neutral, why.expected.morning or why.expected.from {weekday}, body by remaining: 1 → why.expected.tonight, 2 → why.expected.tonightTomorrow, else why.expected.next {count}; days → why.expected.calmDays). The expected row only appears when expectedDay is set. | term body |
| day-running | why.subtitle.dayRunning | cause (clock, info, why.load.title, why.load.body {hours, worn} or why.load.bodyUnknown {hours}, bar = worn/need) · next (calendar, neutral, why.next.today, why.next.todayBody) | term body |
| not-recorded | night: why.subtitle.notRecordedLastNight (current) or why.subtitle.notRecordedNight; day: why.subtitle.notRecordedDay | cause (band, warning, why.noData.nightTitle/nightBody or dayTitle/dayBody) · source (pulse, neutral, why.source.title, why.source.night or why.source.day) · next (moon or clock, neutral, why.next.tonight + why.next.tonightBody, or why.next.today + why.next.todayBody) | why.footer.noGuessNight or why.footer.noGuessDay |
| thin-signal | why.subtitle.thin | cause (pulse, warning, why.thin.title, why.thin.body) · next (moon, neutral, why.next.tonight, why.thin.fit) | term body |
| needs-profile | why.subtitle.profile | cause (user, warning, why.profile.title, why.profile.body {fields} joined with ", " from why.field.*, or calories.needsProfile when no field is missing). `profileLink: true`. | term body |
| signal-missing | reason.missing-signal | cause (alert, warning, why.signal.title, why.signal.body) | term body |
| other | reasonText(reason) | cause (info, neutral, reasonText(reason), body null) | term body |

- `hours` is `LOAD_MIN_VALID_MINUTES / 60`.
- `worn` is `formatDuration(t, wornMinutes * 60)`.
- `title` is `t(TERMS[term].name)`.
- `aboutLink` is `t('explain.aboutLink', { name })`.

`missingStatus`:
- needs-nights: `row` gives why.status.nights {count} or why.status.nightsOne, or why.status.calmDays / calmDaysOne for days. It gives why.noNumber when not `current`. `sheet` gives why.status.until {weekday} when expectedDay is set, otherwise the row text.
- day-running: why.status.worn {worn, hours}, or `reasonText` when minutes are unknown.
- not-recorded: why.status.notRecorded.
- thin-signal: why.status.thin.
- needs-profile: reason.no-profile.
- signal-missing: reason.missing-signal.
- other: reasonText.

**Copy (explain.{en,nl}.json):**

| key | en | nl |
|---|---|---|
| why.a11y | Why there is no number yet | Waarom er nog geen getal is |
| why.noNumber | No number yet | Nog geen getal |
| why.subtitle.dayRunning | No number for this day | Geen getal voor deze dag |
| why.subtitle.notRecordedLastNight | Not recorded last night | Afgelopen nacht niet vastgelegd |
| why.subtitle.notRecordedNight | Not recorded that night | Die nacht niet vastgelegd |
| why.subtitle.notRecordedDay | Not recorded that day | Die dag niet vastgelegd |
| why.subtitle.thin | Too little clean signal | Te weinig schoon signaal |
| why.subtitle.profile | Your profile is incomplete | Je profiel is niet compleet |
| why.band.readTitle | Your band is being read | Je band wordt uitgelezen |
| why.band.night | Synced {time}. The night was recorded. | Gesynchroniseerd om {time}. De nacht is vastgelegd. |
| why.band.day | Synced {time}. The band sent heart rate for this day. | Gesynchroniseerd om {time}. De band stuurde hartslag voor deze dag. |
| why.band.staleTitle | Last sync {ago} | Laatst gesynchroniseerd {ago} |
| why.band.neverTitle | Not synced yet | Nog niet gesynchroniseerd |
| why.band.staleBody | Sync the band to bring in your latest nights. | Synchroniseer de band om je laatste nachten binnen te halen. |
| why.nights.title | It needs more nights | Er zijn meer nachten nodig |
| why.days.title | It needs more calm days | Er zijn meer rustige dagen nodig |
| why.need.readiness | It compares last night with your own earlier nights, so it needs {need} nights. You have {have}. | Het vergelijkt afgelopen nacht met je eigen eerdere nachten, dus het heeft {need} nachten nodig. Je hebt er {have}. |
| why.need.consistency | It compares your bed and wake times over {need} nights. You have {have}. | Het vergelijkt je bed- en opstaantijden over {need} nachten. Je hebt er {have}. |
| why.need.normalRange | Your usual range comes from your earlier nights, so it needs {need} nights. You have {have}. | Je gewone bereik komt uit je eerdere nachten, dus het heeft {need} nachten nodig. Je hebt er {have}. |
| why.need.skinTempChange | The change is measured against your usual, so it needs {need} nights. You have {have}. | De verandering wordt gemeten tegenover je gewone waarde, dus het heeft {need} nachten nodig. Je hebt er {have}. |
| why.need.stress | It learns your calm level from {need} days with enough calm, awake time. You have {have}. | Het leert je rustige niveau uit {need} dagen met genoeg rustige, wakkere tijd. Je hebt er {have}. |
| why.need.generic | It compares you with your own earlier nights, so it needs a few more first. | Het vergelijkt je met je eigen eerdere nachten, dus het heeft er eerst nog een paar nodig. |
| why.expected.morning | Expected {weekday} morning | Verwacht {weekday}ochtend |
| why.expected.from | Expected from {weekday} | Verwacht vanaf {weekday} |
| why.expected.tonight | If you wear the band tonight. | Als je de band vannacht draagt. |
| why.expected.tonightTomorrow | If you wear the band tonight and tomorrow night. | Als je de band vannacht en morgennacht draagt. |
| why.expected.next | If you wear the band the next {count} nights. | Als je de band de komende {count} nachten draagt. |
| why.expected.calmDays | If you have some calm, awake time each day. | Als je elke dag wat rustige, wakkere tijd hebt. |
| why.load.title | Too little heart rate that day | Te weinig hartslag die dag |
| why.load.body | Load needs {hours} hours of heart rate in a day. This day had {worn}. | Belasting heeft {hours} uur hartslag per dag nodig. Deze dag had {worn}. |
| why.load.bodyUnknown | Load needs {hours} hours of heart rate in a day. This day had less. | Belasting heeft {hours} uur hartslag per dag nodig. Deze dag had minder. |
| why.noData.nightTitle | No band data for the night | Geen banddata voor de nacht |
| why.noData.nightBody | The band sent no sleep for this night. | De band stuurde geen slaap voor deze nacht. |
| why.noData.dayTitle | No band data for the day | Geen banddata voor de dag |
| why.noData.dayBody | The band sent no heart rate for this day. | De band stuurde geen hartslag voor deze dag. |
| why.source.title | Nothing to work it out from | Niets om het uit te berekenen |
| why.source.night | It comes from your heartbeat while you sleep. | Het komt uit je hartslag terwijl je slaapt. |
| why.source.day | It comes from your heart rate during the day. | Het komt uit je hartslag overdag. |
| why.next.tonight | Next chance: tonight | Volgende kans: vannacht |
| why.next.tonightBody | Wear the band to bed and sync in the morning. | Draag de band in bed en synchroniseer 's ochtends. |
| why.next.today | Next chance: today | Volgende kans: vandaag |
| why.next.todayBody | Keep the band on during the day. | Houd de band overdag om. |
| why.thin.title | The signal was too noisy | Het signaal was te onrustig |
| why.thin.body | There was too little clean beat data from your sleep to work this out. | Er was te weinig schone hartslagdata uit je slaap om dit te berekenen. |
| why.thin.fit | A snug strap, a finger's width above the wrist bone, gives cleaner readings. | Een strakke band, een vinger breed boven het polsbotje, geeft schonere metingen. |
| why.profile.title | Your profile is missing something | Je profiel mist iets |
| why.profile.body | Calories need your {fields}. | Vul je {fields} in voor calorieën. |
| why.field.weight | weight | gewicht |
| why.field.height | height | lengte |
| why.field.sex | sex | geslacht |
| why.field.birthYear | birth year | geboortejaar |
| why.signal.title | The band did not send this signal | De band stuurde dit signaal niet |
| why.signal.body | Without it OpenHoop cannot work this out. It can come back after the next sync. | Zonder dat signaal kan OpenHoop dit niet berekenen. Het kan na de volgende synchronisatie terugkomen. |
| why.footer.noGuessNight | OpenHoop never fills a gap with a guess. A night without data stays empty in your trends. | OpenHoop vult een gat nooit met een gok. Een nacht zonder data blijft leeg in je trends. |
| why.footer.noGuessDay | OpenHoop never fills a gap with a guess. A day without data stays empty in your trends. | OpenHoop vult een gat nooit met een gok. Een dag zonder data blijft leeg in je trends. |
| why.status.nights | {count} more nights | Nog {count} nachten |
| why.status.nightsOne | 1 more night | Nog 1 nacht |
| why.status.calmDays | {count} more calm days | Nog {count} rustige dagen |
| why.status.calmDaysOne | 1 more calm day | Nog 1 rustige dag |
| why.status.until | No number until {weekday} | Geen getal tot {weekday} |
| why.status.worn | Worn {worn} of {hours} h | {worn} van {hours} u gedragen |
| why.status.notRecorded | Not recorded | Niet vastgelegd |
| why.status.thin | Too little signal | Te weinig signaal |
| explain.aboutLink | About {name} › | Over {name} › |

- [ ] **Step 1: Write the test support** `__tests__/support/firstNight.ts`

```ts
export const FIRST_NIGHT_NOW_S = Date.UTC(2026, 10, 27, 9, 30) / 1000;  // Fri 27 Nov, 10:30 at +01:00
export const FIRST_NIGHT_SYNC_S = Date.UTC(2026, 10, 27, 9, 21) / 1000; // 10:21 local
export function firstNightDay(over: Partial<DayRecord> = {}): DayRecord;
```
Build it from `createFixtureDays(new Date(FIRST_NIGHT_NOW_S * 1000)).at(-1)` with these values:
- `day: '2026-11-27'`;
- hrv 46.4, restingHr 53.2, respiratoryRate 15.0, spo2 95.95, skinTempC 34.32;
- `skinTempDeviationC` and `sleep.consistency` null with reason `'needs-history'`;
- readiness 45.6 with `readinessCalibrating: true`;
- load null with reason `'low-coverage'`, `loadSoFar: 4.6`, `loadValidMinutes: 482`;
- `stress: { algo: ALGO.stress, reason: 'low-coverage', baselineDays: 0, windows: [] }`.

Keep the fixture's sleep periods and score. Apply `over` last.

- [ ] **Step 2: Write the failing tests** `__tests__/explainMissing.test.ts`

```ts
const input = (term: TermId, reason: string | null, over: Partial<MissingInput> = {}): MissingInput =>
  ({ term, reason, days: [firstNightDay()], index: 0, nowS: FIRST_NIGHT_NOW_S, lastSyncAt: FIRST_NIGHT_SYNC_S, profileGaps: [], ...over });
const tEn: TFunction = (k, p) => translate('en', k, p);
const tNl: TFunction = (k, p) => translate('nl', k, p);

it('lists what is still building on the first night', () => {
  expect(firstWeekItems([firstNightDay()], 0).map((i) => [i.term, remaining(i.progress)])).toEqual(
    [['readiness', 3], ['consistency', 1], ['normalRange', 4], ['skinTempChange', 3], ['stress', 3]]);
  expect(readinessNightsLeft([firstNightDay()], 0)).toBe(3);
  const fixture = createFixtureDays(FIXTURE_NOW);
  expect(firstWeekItems(fixture, fixture.length - 1)).toEqual([]);
});
it.each([
  ['consistency', { have: 1, need: 2, unit: 'nights' }, '2026-11-28'],
  ['readiness', { have: 1, need: 4, unit: 'nights' }, '2026-11-30'],
  ['skinTempChange', { have: 1, need: 4, unit: 'nights' }, '2026-11-30'],
  ['normalRange', { have: 1, need: 5, unit: 'nights' }, '2026-12-01'],
  ['stress', { have: 0, need: 3, unit: 'days' }, '2026-11-30'],
] as const)('explains %s as needing more nights', (term, progress, day) => {
  expect(explainMissing(input(term, term === 'stress' ? 'low-coverage' : 'needs-history'))).toMatchObject(
    { kind: 'needs-nights', current: true, band: { state: 'read' }, progress, expectedDay: day });
});
it('explains a finished day under ten hours', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  expect(explainMissing(input('load', 'low-coverage', { days, index: 0 }))).toMatchObject({ kind: 'day-running', wornMinutes: 482, current: false, expectedDay: null });
});
it('maps the other reasons', () => {
  const noNight = firstNightDay({ sleep: { ...firstNightDay().sleep, periods: [] } });
  expect(explainMissing(input('hrv', 'no-sleep', { days: [noNight] }))).toMatchObject({ kind: 'not-recorded', window: 'night', band: { state: 'no-window' } });
  expect(explainMissing(input('respiratoryRate', 'low-coverage'))).toMatchObject({ kind: 'thin-signal', progress: null });
  expect(explainMissing(input('calories', 'no-profile', { profileGaps: ['weight', 'birthYear'] }))).toMatchObject({ kind: 'needs-profile', profileGaps: ['weight', 'birthYear'] });
  expect(explainMissing(input('load', 'missing-signal')).kind).toBe('signal-missing');
  expect(explainMissing(input('hrv', 'something-new')).kind).toBe('other');
});
it('never shows a check mark for a stale or missing sync', () => {
  expect(explainMissing(input('consistency', 'needs-history', { lastSyncAt: FIRST_NIGHT_NOW_S - 26 * 3600 })).band.state).toBe('stale');
  expect(explainMissing(input('consistency', 'needs-history', { lastSyncAt: null })).band.state).toBe('stale');
});
it('gives a past day no expected moment', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  const expl = explainMissing(input('consistency', 'needs-history', { days, index: 0 }));
  expect(expl.expectedDay).toBeNull();
  expect(missingStatus(tEn, 'en', expl, 'row')).toBe('No number yet');
});
it('keeps at least one night left while readiness is hidden', () => {
  const usable = [0, 1, 2, 3].map((i) => firstNightDay({ day: `2026-11-2${4 + i}` }));
  expect(readinessNightsLeft(usable, 3)).toBe(1);
});
it('writes the consistency sheet', () => {
  const w = whyText(tEn, 'en', explainMissing(input('consistency', 'needs-history')));
  expect(w.subtitle).toBe('No number yet');
  expect(w.rows.map((r) => r.title)).toEqual(['Your band is being read', 'It needs more nights', 'Expected Saturday morning']);
  expect(w.rows.map((r) => r.body)).toEqual(['Synced 10:21. The night was recorded.', 'It compares your bed and wake times over 2 nights. You have 1.', 'If you wear the band tonight.']);
  expect(w.footer).toBe('Going to bed and getting up at similar times helps you sleep better, even when the hours stay the same.');
  expect(w.aboutLink).toBe('About Consistency ›');
});
it('writes counts, weekdays and Dutch correctly', () => {
  const skin = explainMissing(input('skinTempChange', 'needs-history'));
  expect(whyText(tEn, 'en', skin).rows[2]).toMatchObject({ title: 'Expected Monday morning', body: 'If you wear the band the next 3 nights.' });
  expect(whyText(tNl, 'nl', skin).rows[2]?.title).toBe('Verwacht maandagochtend');
  expect(missingStatus(tEn, 'en', skin, 'sheet')).toBe('No number until Monday');
  const consistency = explainMissing(input('consistency', 'needs-history'));
  expect(missingStatus(tEn, 'en', consistency, 'row')).toBe('1 more night');
  expect(missingStatus(tNl, 'nl', consistency, 'row')).toBe('Nog 1 nacht');
  expect(missingStatus(tEn, 'en', explainMissing(input('stress', 'low-coverage')), 'row')).toBe('3 more calm days');
});
it('writes the finished-day, not-recorded and stale sheets', () => {
  const days = [firstNightDay({ day: '2026-11-26' }), firstNightDay()];
  const load = explainMissing(input('load', 'low-coverage', { days, index: 0 }));
  expect(missingStatus(tEn, 'en', load, 'row')).toBe('Worn 8 h 2 min of 10 h');
  expect(whyText(tEn, 'en', load).rows[1]).toMatchObject({ body: 'Load needs 10 hours of heart rate in a day. This day had 8 h 2 min.' });
  expect(whyText(tEn, 'en', load).rows[1]?.bar).toBeCloseTo(482 / 600, 3);
  const noNight = firstNightDay({ sleep: { ...firstNightDay().sleep, periods: [] } });
  const nr = whyText(tEn, 'en', explainMissing(input('hrv', 'no-sleep', { days: [noNight] })));
  expect(nr.rows.map((r) => r.title)).toEqual(['No band data for the night', 'Nothing to work it out from', 'Next chance: tonight']);
  expect(nr.footer).toBe('OpenHoop never fills a gap with a guess. A night without data stays empty in your trends.');
  const stale = whyText(tEn, 'en', explainMissing(input('consistency', 'needs-history', { lastSyncAt: FIRST_NIGHT_NOW_S - 26 * 3600 })));
  expect(stale.rows[0]).toMatchObject({ title: 'Last sync 1 d ago', body: 'Sync the band to bring in your latest nights.' });
  expect(missingStatus(tEn, 'en', explainMissing(input('load', 'low-coverage', { days: [{ ...days[0], loadValidMinutes: undefined }, days[1]], index: 0 })), 'row')).toBe('Not enough readings');
});
```

- [ ] **Step 3: Run to verify they fail.** `npx jest __tests__/explainMissing.test.ts`. Expected: FAIL, because the modules cannot be found.
- [ ] **Step 4: Implement** the three modules, `missingProfileFields`, the exported `STALE_AFTER_S` and the copy, following the rules above.
- [ ] **Step 5: Run to verify they pass.** `npx jest __tests__/explainMissing.test.ts __tests__/i18n.test.ts` then `npm run typecheck`. Expected: PASS with no type errors.
- [ ] **Step 6: Commit.** `feat: explain why a value is missing and when it will appear`

---

### Task 4: Visible readiness and Load so far, routed through every consumer

**Files:**
- Modify: `apps/mobile/src/data/derived.ts:5-36`. Add `visibleReadiness` and `shownLoad`. Make `metricValue(day, 'readiness')` return `visibleReadiness(day).value`. This covers `series`, `baselineAt`, `latestValue` (All metrics, coach chips), `coachMetricValue`, journal insights and load trends.
- Modify the direct readers:
  - `ui/daily/briefText.ts:35-42`;
  - `ui/daily/BriefPage.tsx` (add `missing?: string` to `BriefStat`, shown instead of `reason.no-data`);
  - `app/home/morning-brief.tsx:17-24` and `app/home/evening-review.tsx:21-26`;
  - `app/home/date-picker.tsx:98,122`;
  - `app/load/target.tsx:30` and `app/load/week.tsx:77`;
  - `app/recovery/trends.tsx:26,37`;
  - `data/activityDerived.ts:75`;
  - `data/healthReport.ts:124`.
- Modify: `lib/notificationPlan.ts` (move `digestFacts` here from `data/controller.ts:1552-1564` as an exported function), `data/controller.ts` (call it, and pass `readinessNightsLeft` to the widget at `:1627`).
- Modify: `lib/widgetSnapshot.ts:20-32,42-47,58-75,98-122,172-173`.
- Copy keys: `brief.readinessHidden`, `brief.readinessHiddenOne`, `widget.nightsLeft`, `widget.nightsLeftOne`. Delete `brief.readinessCalibrating` (en and nl) once grep finds no use.
- Test: `apps/mobile/__tests__/visibleValues.test.ts`; update `__tests__/widgetSnapshot.test.ts:28-33,100-104` and `__tests__/widgets.test.tsx:61` (add `nightsLeft`).

**Interfaces:**
- Consumes: `readinessNightsLeft` and `remaining` (Task 3), `firstNightDay` (Task 3 support).
- Produces:
```ts
export function visibleReadiness(day: DayRecord): Derived;
// calibrating && value !== null → { ...day.readiness, value: null, reason: 'needs-history', coverage: null }
// calibrating && value === null → day.readiness (keeps its own reason)
export interface ShownLoad { value: number | null; soFar: boolean; reason: string | null }
export function shownLoad(days: readonly DayRecord[], index: number): ShownLoad; // soFar only for index === days.length − 1 with loadSoFar != null and load.value === null
export function digestFacts(days: readonly DayRecord[], now: Date): (day: string) => DigestFacts | null; // lib/notificationPlan.ts
// lib/widgetSnapshot.ts
export interface WidgetValues { /* … */ nightsLeft: number | null }
export interface WidgetInput { enabled: boolean; day: DayRecord | undefined; syncedAt: number | null; language: Language; readinessNightsLeft: number | null }
```
- The widget readiness metric becomes `metric(visibleReadiness(day), 0)`.
- `parseWidgetFile` accepts a missing `nightsLeft`, which becomes `null`. It must be a positive integer when present.
- `widgetView`: when `file.calibrating`, the readiness value is `'–'` and the tone is `muted`. The note is `widget.nightsLeft{One}` when `nightsLeft !== null`, else `reason.needs-history`.

| key | en | nl |
|---|---|---|
| brief.readinessHidden | Readiness appears after {count} more nights. | Paraatheid verschijnt na nog {count} nachten. |
| brief.readinessHiddenOne | Readiness appears after 1 more night. | Paraatheid verschijnt na nog 1 nacht. |
| widget.nightsLeft | {count} nights left | Nog {count} nachten |
| widget.nightsLeftOne | 1 night left | Nog 1 nacht |

- [ ] **Step 1: Write the failing tests** `__tests__/visibleValues.test.ts`

```ts
it('hides readiness while calibrating and keeps a real missing reason', () => {
  expect(visibleReadiness(firstNightDay())).toMatchObject({ value: null, reason: 'needs-history' });
  expect(visibleReadiness(firstNightDay({ readiness: { value: null, reason: 'no-sleep', coverage: null, algo: 'x' } })).reason).toBe('no-sleep');
  const last = createFixtureDays(FIXTURE_NOW).at(-1);
  if (!last) throw new Error('no fixture');
  expect(visibleReadiness(last)).toBe(last.readiness);
  expect(metricValue(firstNightDay(), 'readiness')).toBeNull();
});
it('shows Load so far only on the open day', () => {
  expect(shownLoad([firstNightDay()], 0)).toEqual({ value: 4.6, soFar: true, reason: null });
  expect(shownLoad([firstNightDay({ day: '2026-11-26' }), firstNightDay()], 0)).toEqual({ value: null, soFar: false, reason: 'low-coverage' });
  expect(shownLoad([firstNightDay({ loadSoFar: undefined })], 0)).toEqual({ value: null, soFar: false, reason: 'low-coverage' });
});
it('says when readiness appears in the brief', () => {
  expect(briefLines(tEn, 'en', [firstNightDay()], 0).find((l) => l.id === 'readiness')?.text).toBe('Readiness appears after 3 more nights.');
});
it('leaves readiness out of the digest and the coach context while hidden', () => {
  expect(digestFacts([firstNightDay()], new Date(FIRST_NIGHT_NOW_S * 1000))('2026-11-27')?.readiness).toBeNull();
  expect(buildDataSummary([firstNightDay()], '2026-11-27')).toContain('2026-11-27 | - |');
});
it('writes nights left to the widget and reads old files', () => {
  const file = buildWidgetFile({ enabled: true, day: firstNightDay(), syncedAt: FIRST_NIGHT_SYNC_S, language: 'en', readinessNightsLeft: 3 });
  if (file.kind !== 'values') throw new Error('expected values');
  expect(file.readiness).toEqual({ value: null, reason: 'needs-history' });
  expect(file.nightsLeft).toBe(3);
  const ctx = { nowS: FIRST_NIGHT_NOW_S, today: '2026-11-27', fallbackLanguage: 'en' as const };
  const view = widgetView(file, ctx);
  if (view.kind !== 'values') throw new Error('expected values');
  expect(view.scores[0]).toMatchObject({ value: '–', note: '3 nights left', tone: 'muted' });
  const one = widgetView({ ...file, nightsLeft: 1 }, ctx);
  if (one.kind !== 'values') throw new Error('expected values');
  expect(one.scores[0]?.note).toBe('1 night left');
  const { nightsLeft: _drop, ...old } = file;
  const parsed = parseWidgetFile(JSON.stringify(old));
  expect(parsed?.kind === 'values' ? parsed.nightsLeft : 'x').toBeNull();
});
```
In `widgetSnapshot.test.ts`, add `'nightsLeft'` to the key list and `readinessNightsLeft: null` to the input. Change the calibrating test to expect `{ value: '–', note: 'Needs more nights first', tone: 'muted' }` for `values({ calibrating: true })` with `nightsLeft: null`.

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/visibleValues.test.ts __tests__/widgetSnapshot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace each `day.readiness.value` / `d.readiness.value` read listed above with `visibleReadiness(x).value`, or with `metricValue` where a key-based call already exists. The readiness color stays `readinessColor(colors, visible)`, so a hidden day is muted. Brief: when `readinessNightsLeft` is non-null, push `brief.readinessHidden{One}`. Morning brief readiness stat: `missing = t('why.status.nights{One}', { count })` when hidden.
- [ ] **Step 4: Check that nothing else reads the raw value.** Run Grep `readiness\.value` in `apps/mobile/src`. Expected hits are only `data/derived.ts` (inside `visibleReadiness`) and `data/fixtureSource.ts`.
- [ ] **Step 5: Run to verify they pass.** `npx jest` (whole mobile suite). Update any assertion that relied on a calibrating day's readiness number, and say why in the commit body. Then run `npm run typecheck`.
- [ ] **Step 6: Commit.** `feat: hide readiness until it has its nights and show load so far`

---

### Task 5: Sheet, ExplainProvider, About and Why sheets, MetricName, coach pre-fill

**Files:**
- Create: `apps/mobile/src/ui/Sheet.tsx`, `apps/mobile/src/ui/explain/ExplainProvider.tsx`, `ui/explain/AboutSheet.tsx`, `ui/explain/WhySheet.tsx`, `ui/explain/MetricName.tsx`, `ui/explain/ProgressDots.tsx`
- Modify: `apps/mobile/src/ui/strava/StravaUploadCard.tsx:143-197` (use `Sheet`: title `strava.upload.title`, the current scroll content as children, the two buttons as `footer`, testID `strava-upload-sheet`)
- Modify: `apps/mobile/src/app/_layout.tsx:42-52` (`<StravaProvider><ExplainProvider><RootStack /></ExplainProvider></StravaProvider>`)
- Modify: `apps/mobile/__tests__/support/appData.tsx:151-159`. `withAppData(children, language, overrides, nowS?)` wraps the children in `<ExplainProvider now={nowS === undefined ? undefined : () => nowS}>` inside `StravaHost`.
- Modify: `apps/mobile/src/app/coach/index.tsx:50-71` (`term` param pre-fills the draft)
- Copy keys below.
- Test: `apps/mobile/__tests__/explainSheets.test.tsx`; extend `__tests__/coach.test.tsx`; run `__tests__/stravaScreens.test.tsx` unchanged.

**Interfaces:**
- Consumes: `TERMS`, `termFull`, `isTermId`, `explainMissing`, `whyText`, `missingStatus`, `buildingProgress`, `missingProfileFields`.
- Produces:
```ts
// ui/Sheet.tsx
export function Sheet(props: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode; testID?: string }): ReactElement;
// ui/explain/ExplainProvider.tsx
export interface ExplainShown { value: string | null; unit: string | null; reason: string | null }
export interface ExplainTarget { term: TermId; index: number; shown: ExplainShown | null } // shown null = opened from an index (no "Your night" block)
export interface ExplainApi { about(target: ExplainTarget): void; why(target: ExplainTarget): void; close(): void; nowS(): number }
export function ExplainProvider(props: { children: ReactNode; now?: () => number }): ReactElement;
export function useExplain(): ExplainApi;                                  // throws outside the provider
export function useMissing(target: ExplainTarget): MissingExplanation | null; // null when shown is null or shown.value !== null
// ui/explain/MetricName.tsx
export function MetricName(props: { target: ExplainTarget; label?: string; variant?: TypeVariant; muted?: boolean; testID?: string }): ReactElement;
// ui/explain/ProgressDots.tsx
export function ProgressDots(props: { progress: Progress; color?: string; testID?: string }): ReactElement;
```

**Layout (canvas N3, N4, N6):**
- **Sheet.** `Modal` (transparent, `animationType="slide"`, `statusBarTranslucent`, `onRequestClose`).
  - A full-screen backdrop `Pressable` (`colors.background`, `opacity: 0.72`, a11y label `common.close`, testID `${testID}-backdrop`).
  - A bottom panel (`colors.sheet`, top radii `radius.lg`, max height 88 %, `accessibilityViewIsModal`, testID):
    - a 40×5 handle in `colors.surface3`;
    - a header row with the title (`h2`, `accessibilityRole="header"`) and subtitle (`lead`, muted), plus a 44×44 close `IconButton` on `colors.surfaceAlt`;
    - a `ScrollView` with `gap: spacing.lg`, then `footer`.
- **MetricName.** A `Pressable` with `minHeight: 44`, `accessibilityRole="button"` and `accessibilityLabel = t('explain.whatIs', { name })`. Inside: the label in an `AppText` (default `capSmall`, muted) and `Icon name="info" size={15}` in `colors.textMuted`.
- **AboutSheet** (testID `about-sheet`):
  - title = name, subtitle = full;
  - body (`lead`, soft);
  - when `shown` is set, a `Card` with a `capSmall` label (`explain.yourNight` for night terms, otherwise `explain.today` on the last day or `explain.thatDay`), then the value (`Num size 30` + unit muted) or `missingStatus(…, 'sheet')`;
  - for hrv, restingHr, respiratoryRate, spo2 and skinTemp while normalRange is building, the line `explain.rangeAfter {count: MIN_BASELINE_NIGHTS}` + `ProgressDots`;
  - two list cards side by side (`capSmall` title + items as `body` soft);
  - an outline `Card` with `ParityBadge long` (skipped when level is null) + method (`label` muted);
  - link `explain.askCoach` (testID `about-coach`) → `close()` then `router.push({ pathname: '/coach', params: { term } })`;
  - link `explain.allTerms` (testID `about-all-terms`) → `close()` then `router.push('/settings/terms')`;
  - both links are `cap` muted with `minHeight: 44`.
- **WhySheet** (testID `why-sheet`, a11y `why.a11y`):
  - title and subtitle from `whyText`;
  - each row has a 40×40 icon box (radius 12, tone soft background: positive→`positiveSoft`, pink→`pinkSoft`, info→`infoSoft`, warning→`warningSoft`, neutral→`surfaceAlt`) and a title (`bodyStrong`) + body (`body` muted), then `ProgressDots` or a 6 px bar (`surfaceAlt` track, `info` fill);
  - the footer paragraph sits above a top border;
  - `profileLink` shows the button `calories.completeProfile` (testID `why-profile`) → `/profile/edit`;
  - the link `aboutLink` (testID `why-about`) switches to the About sheet.
- **ProgressDots.** 10 px dots with gap 4. Filled dots are `colors.pink`, empty ones have a 1.5 px `colors.textFaint` border. `accessible` with label `explain.dots` / `explain.dotsDays`.
- **Coach.** When `params.term` passes `isTermId` and was not handled yet, `setDraft(t('explain.coachQuestion', { name: t(TERMS[term].name) }))`. The draft is never sent automatically.

| key | en | nl |
|---|---|---|
| explain.whatIs | What is {name}? | Wat is {name}? |
| explain.yourNight | Your night | Jouw nacht |
| explain.today | Today | Vandaag |
| explain.thatDay | That day | Die dag |
| explain.askCoach | Ask the coach about this › | Vraag de coach hiernaar › |
| explain.allTerms | All terms › | Alle begrippen › |
| explain.rangeAfter | Your usual range shows after {count} nights | Je gewone bereik verschijnt na {count} nachten |
| explain.coachQuestion | Explain this to me with my own numbers: {name}. | Leg dit uit met mijn eigen cijfers: {name}. |
| explain.dots | {have} of {need} nights | {have} van {need} nachten |
| explain.dotsDays | {have} of {need} days | {have} van {need} dagen |

- [ ] **Step 1: Write the failing tests** `__tests__/explainSheets.test.tsx`. Mock `expo-router` as `daily.test.tsx` does.

```tsx
const device = { ...createFixtureDevice(FIXTURE_NOW), lastSyncAt: FIRST_NIGHT_SYNC_S };
const wrap = (node: ReactNode, language: Language = 'en') => withAppData(node, language, { days: [firstNightDay()], device }, FIRST_NIGHT_NOW_S);
function Open({ mode, target }: { mode: 'about' | 'why'; target: ExplainTarget }) {
  const explain = useExplain();
  return <Pressable testID="open" onPress={() => (mode === 'about' ? explain.about(target) : explain.why(target))} />;
}
const hrv: ExplainTarget = { term: 'hrv', index: 0, shown: { value: '46', unit: 'ms', reason: null } };

it('opens the about sheet from a name with the user value', async () => {
  await render(wrap(<MetricName target={hrv} testID="name-hrv" />));
  expect(screen.getByLabelText('What is HRV?')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('name-hrv'));
  const sheet = within(screen.getByTestId('about-sheet'));
  for (const text of ['Heart rate variability', 'Your night', '46', 'ms', 'Often higher after', 'A long night\nA rest day\nA calm evening', 'Level B', 'Your usual range shows after 4 nights'])
    expect(sheet.getByText(text)).toBeTruthy();
  expect(sheet.getByLabelText('1 of 5 nights')).toBeTruthy();
});
it('shows the missing status in the about sheet', async () => {
  await render(wrap(<Open mode="about" target={{ term: 'skinTempChange', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />));
  await fireEvent.press(screen.getByTestId('open'));
  expect(within(screen.getByTestId('about-sheet')).getByText('No number until Monday')).toBeTruthy();
});
it('links to the coach and to all terms, closing the sheet', async () => {
  await render(wrap(<Open mode="about" target={hrv} />));
  await fireEvent.press(screen.getByTestId('open'));
  await fireEvent.press(screen.getByTestId('about-coach'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/coach', params: { term: 'hrv' } });
  expect(screen.queryByTestId('about-sheet')).toBeNull();
  await fireEvent.press(screen.getByTestId('open'));
  await fireEvent.press(screen.getByTestId('about-all-terms'));
  expect(mockPush).toHaveBeenCalledWith('/settings/terms');
});
it('opens the why sheet for a missing value and switches to about', async () => {
  await render(wrap(<Open mode="why" target={{ term: 'skinTempChange', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />));
  await fireEvent.press(screen.getByTestId('open'));
  const sheet = within(screen.getByTestId('why-sheet'));
  for (const text of ['Skin temp change', 'No number yet', 'Your band is being read', 'Synced 10:21. The night was recorded.', 'It needs more nights', 'Expected Monday morning'])
    expect(sheet.getByText(text)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('why-about'));
  expect(screen.getByTestId('about-sheet')).toBeTruthy();
});
it('says when the band was last synced instead of a check mark', async () => {
  await render(withAppData(<Open mode="why" target={{ term: 'consistency', index: 0, shown: { value: null, unit: null, reason: 'needs-history' } }} />, 'en',
    { days: [firstNightDay()], device: { ...device, lastSyncAt: null } }, FIRST_NIGHT_NOW_S));
  await fireEvent.press(screen.getByTestId('open'));
  expect(within(screen.getByTestId('why-sheet')).getByText('Not synced yet')).toBeTruthy();
  expect(within(screen.getByTestId('why-sheet')).queryByText('Your band is being read')).toBeNull();
});
it('links a missing profile to the profile editor and closes on the backdrop', async () => {
  await render(wrap(<Open mode="why" target={{ term: 'calories', index: 0, shown: { value: null, unit: null, reason: 'no-profile' } }} />));
  await fireEvent.press(screen.getByTestId('open'));
  await fireEvent.press(screen.getByTestId('why-profile'));
  expect(mockPush).toHaveBeenCalledWith('/profile/edit');
  await fireEvent.press(screen.getByTestId('open'));
  await fireEvent.press(screen.getByTestId('why-sheet-backdrop'));
  expect(screen.queryByTestId('why-sheet')).toBeNull();
});
```
In `coach.test.tsx`, add: with `mockParams.value = { term: 'hrv' }` the question field holds `'Explain this to me with my own numbers: HRV.'` and no request was sent. With `{ term: 'bogus' }` the field is empty.

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/explainSheets.test.tsx __tests__/coach.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the components, the provider, the Strava refactor, the root wiring, the test support change and the coach param.
- [ ] **Step 4: Run to verify they pass.** `npx jest __tests__/explainSheets.test.tsx __tests__/coach.test.tsx __tests__/stravaScreens.test.tsx __tests__/i18n.test.ts`, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add the explanation sheets and an app-level explain provider`

---

### Task 6: Wire tiles, rows, metric detail, vitals and All metrics

**Files:**
- Modify: `apps/mobile/src/ui/MetricTile.tsx`. Add the prop `explain?: { term: TermId; index: number }`:
  - The label becomes `MetricName` (testID `${testID}-name`) with the `chevronRight` icon (14 px) next to the `ParityBadge` when `href` is set.
  - A missing value renders a `Pressable` (testID `${testID}-why`) whose text is `missingStatus(…, 'row') + ' ›'`. The text node keeps testID `${testID}-reason`. Pressing it calls `why`.
  - Without `explain`, the tile behaves exactly as today.
- Modify: `apps/mobile/src/ui/daily/bits.tsx:43-82`. `StatRow` gets `explain?: ExplainTarget`: the label becomes `MetricName` (variant `body`, not muted, testID `${testID}-name`). When `explain.shown?.value === null`, the value becomes a why `Pressable` (testID `${testID}-why`).
- Modify: `apps/mobile/src/app/recovery/metric/[metric].tsx:45-80`. Pass `right={<IconButton icon="info" label={t('explain.whatIs', { name })} onPress={…about} testID="metric-about" />}` to `Page`. `metric-reason` becomes a why `Pressable` (testID `metric-why`) showing the row status.
- Modify: `apps/mobile/src/app/health/vitals.tsx:46-63`:
  - rows get `explain={{ term: reading.spec.term, index }}` and `caption={t(TERMS[term].short)}`;
  - above the rows, while normalRange is building, show `health.vitals.rangesAfter {count: MIN_BASELINE_NIGHTS}` + `ProgressDots` (testID `vitals-ranges-after`);
  - below the rows, `explain.tapHint`.
- Modify: `apps/mobile/src/app/health/metrics.tsx:80-97`. For rows with `item.term`, the `ListRow` subtitle is `t(termLine(term))`. `right` holds the `ParityBadge` + `IconButton icon="info"` (testID `metric-${id}-about`), which opens about with `shown: { value: readingText or null, unit: null, reason: null }`.
- Test: `apps/mobile/__tests__/explainLists.test.tsx`; update `__tests__/MetricTile.test.tsx` only if needed.

**Interfaces:**
- Consumes: `MetricName`, `useExplain`, `useMissing`, `missingStatus`, `ProgressDots`, `TERMS`, `termLine`, `buildingProgress`.
- Produces: `MetricTile.explain?: { term: TermId; index: number }` and `StatRow.explain?: ExplainTarget` (used by Tasks 7 and 8).

| key | en | nl |
|---|---|---|
| explain.tapHint | Tap a name to see what it means. | Tik op een naam om te zien wat die betekent. |
| health.vitals.rangesAfter | Your usual ranges show after {count} nights | Je gewone bereik verschijnt na {count} nachten |

- [ ] **Step 1: Write the failing tests** `__tests__/explainLists.test.tsx` (the wrap from Task 5)

```tsx
it('opens about from a tile name without navigating', async () => {
  await render(wrap(<MetricTile testID="t" label="HRV" value={46.4} unit="ms" level="B" href="/recovery/metric/hrv" explain={{ term: 'hrv', index: 0 }} />));
  await fireEvent.press(screen.getByTestId('t-name'));
  expect(screen.getByTestId('about-sheet')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
it('says how many nights a missing tile needs and opens why', async () => {
  await render(wrap(<MetricTile testID="t" label="Skin temp change" value={null} reason="needs-history" level="A" explain={{ term: 'skinTempChange', index: 0 }} />));
  expect(screen.getByTestId('t-reason')).toHaveTextContent('3 more nights ›');
  await fireEvent.press(screen.getByTestId('t-why'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
});
it('opens about from a row name without navigating', async () => {
  await render(wrap(<StatRow testID="r" label="HRV" value="46 ms" href="/recovery/metric/hrv" explain={{ term: 'hrv', index: 0, shown: { value: '46', unit: 'ms', reason: null } }} />));
  await fireEvent.press(screen.getByTestId('r-name'));
  expect(screen.getByTestId('about-sheet')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
it('puts an info button on the metric detail and explains a missing value', async () => {
  mockParams.value = { metric: 'hrv' };
  await render(withAppData(<MetricDetailScreen />, 'en', { days: [firstNightDay({ hrv: { value: null, reason: 'low-coverage', coverage: null, algo: 'x' } })], device }, FIRST_NIGHT_NOW_S));
  expect(screen.getByTestId('metric-why')).toHaveTextContent('Too little signal ›');
  await fireEvent.press(screen.getByTestId('metric-about'));
  expect(within(screen.getByTestId('about-sheet')).getByText('Heart rate variability')).toBeTruthy();
});
it('explains vitals in place on the first night', async () => {
  await render(wrap(<VitalsScreen />));
  expect(screen.getByTestId('vitals-ranges-after')).toHaveTextContent('Your usual ranges show after 4 nights');
  expect(screen.getByText('Tap a name to see what it means.')).toBeTruthy();
  expect(within(screen.getByTestId('vital-hrv')).getByText('Rest signal from your heartbeat')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('vital-hrv-name'));
  expect(screen.getByTestId('about-sheet')).toBeTruthy();
});
it('gives All metrics one-liners and an info button', async () => {
  await render(wrap(<MetricsScreen />));
  expect(within(screen.getByTestId('metric-hrv')).getByText('How much the time between heartbeats varies. Above your usual means rested.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('metric-hrv-about'));
  expect(screen.getByTestId('about-sheet')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/explainLists.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as described in Files.
- [ ] **Step 4: Run to verify they pass.** `npx jest __tests__/explainLists.test.tsx __tests__/MetricTile.test.tsx __tests__/health.test.tsx __tests__/daily.test.tsx __tests__/i18n.test.ts`, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: explain metric names and missing values on tiles, rows and lists`

---

### Task 7: Sleep, Readiness and Load screens (efficiency, nights-left ring, so far)

**Files:**
- Modify: `apps/mobile/src/data/dailyDerived.ts`. Add `sleepEfficiency`.
- Modify: `apps/mobile/src/ui/Ring.tsx`. Add `segments?: { count: number; filled: number } | null`: `count` arcs separated by a gap of `strokeWidth` px, starting at 12 o'clock. The first `filled` arcs use `color` and the rest `trackColor`. Each segment's testID is `${testID}-segment-${i}`. No continuous arc and no tick are drawn while `segments` is set.
- Modify: `apps/mobile/src/ui/ScoreRing.tsx`:
  - Add `building?: BuildingRing | null`. Segments are `{ count: need, filled: have }` in `colors.pink`. The centre shows `Num` = `left` + `capSmall` `readiness.nightsLeft{One}` in pink.
  - Add `onExplain?: () => void`. When the value is missing or building, the ring is a `Pressable` with testID `${testID}-why`.
  - Remove the `calibrating.label` caption.
- Modify: `apps/mobile/src/app/sleep/index.tsx:32,95-105,140-157`:
  - efficiency comes from `sleepEfficiency(day)`;
  - contributors become `StatRow` with `explain` (hoursVsNeed, consistency, efficiency);
  - every `MetricTile` gets `explain` (asleep, inBed, sleepNeed, sleepDebt, consistency, hrv, restingHr, respiratoryRate, spo2, skinTemp, skinTempChange).
- Modify: `apps/mobile/src/app/recovery/index.tsx:30-128`:
  - the value is `visibleReadiness(day)`;
  - the ring gets `building` from `readinessNightsLeft` + `buildingProgress('readiness', …)` and `onExplain` → why;
  - remove the `calibrating-hint` card;
  - while hidden, `card-contributions` shows `missingStatus` (row) as a why `Pressable` (testID `contributions-why`) instead of the bars;
  - the vs-baseline `StatRow`s get `explain`;
  - the 7-day chart uses `visibleReadiness`.
- Modify: `apps/mobile/src/app/load/index.tsx:52-69`:
  - the hero uses `shownLoad(days, last)` with `sublabel={t('load.soFar')}` when `soFar`;
  - the caption is `loadx.soFarCaption {time: formatClock(device.lastSyncAt, day.tzOffsetS)}` when `soFar` (else the current caption);
  - `TopBar right` is an info `IconButton` (testID `load-about`) → about load;
  - a missing value calls `onExplain` → why.
- Delete `calibrating.hint` and `calibrating.label` (en and nl) when grep finds no use after Tasks 7 and 8. Check this again in Task 8.
- Test: `apps/mobile/__tests__/explainScreens.test.tsx`.

**Interfaces:**
- Consumes: `visibleReadiness`, `shownLoad` (Task 4), `readinessNightsLeft`, `buildingProgress`, `remaining` (Task 3), `StatRow.explain`, `MetricTile.explain` (Task 6), `useExplain` (Task 5).
- Produces:
```ts
export function sleepEfficiency(day: DayRecord): number | null; // percent 0–100, rounded; (inBedS − stages.totals.wake) / inBedS when totals exist, else asleepS / inBedS; null without inBedS > 0
export interface BuildingRing { left: number; have: number; need: number } // exported from ui/ScoreRing.tsx, reused by HeroRing in Task 8
```

| key | en | nl |
|---|---|---|
| readiness.nightsLeft | Nights left | Nachten te gaan |
| readiness.nightsLeftOne | Night left | Nacht te gaan |
| readiness.nightsLeftA11y | Readiness: {count} nights left before the first score | Paraatheid: nog {count} nachten tot de eerste score |
| readiness.nightsLeftA11yOne | Readiness: 1 night left before the first score | Paraatheid: nog 1 nacht tot de eerste score |
| load.soFar | So far | Tot nu toe |
| loadx.soFarCaption | So far today · synced {time} | Tot nu toe vandaag · gesynchroniseerd om {time} |

- [ ] **Step 1: Write the failing tests** `__tests__/explainScreens.test.tsx`

```tsx
const staged = (wake: number) => firstNightDay({ sleep: { ...firstNightDay().sleep, asleepS: 27_000, inBedS: 28_800, stages: { algo: 'x', reason: null, coverage: 0.9, totals: { wake, light: 14_400, deep: 5_400, rem: 5_400 } } } });
it('computes efficiency from stages when they exist', () => {
  expect(sleepEfficiency(staged(3_600))).toBe(88);
  expect(sleepEfficiency(firstNightDay({ sleep: { ...staged(0).sleep, stages: undefined } }))).toBe(94);
  expect(sleepEfficiency(staged(40_000))).toBe(0);
  expect(sleepEfficiency(firstNightDay({ sleep: { ...firstNightDay().sleep, inBedS: null } }))).toBeNull();
});
it('draws a segmented ring', async () => {
  await render(wrap(<Ring testID="r" fraction={null} color="red" segments={{ count: 4, filled: 1 }} />));
  expect(screen.getAllByTestId(/^r-segment-/)).toHaveLength(4);
});
it('uses stage wake for the sleep efficiency row and explains consistency', async () => {
  await render(withAppData(<SleepScreen />, 'en', { days: [staged(3_600)], device }, FIRST_NIGHT_NOW_S));
  expect(screen.getByTestId('contrib-efficiency')).toHaveTextContent('88%');
  expect(screen.getByTestId('contrib-consistency')).toHaveTextContent('1 more night ›');
  await fireEvent.press(screen.getByTestId('contrib-consistency-why'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
});
it('hides readiness on the first night and says how many nights are left', async () => {
  await render(wrap(<ReadinessScreen />));
  const ring = within(screen.getByTestId('ring-readiness-detail'));
  expect(ring.getByText('3')).toBeTruthy();
  expect(ring.getByText('Nights left')).toBeTruthy();
  expect(ring.queryByText('46')).toBeNull();
  expect(screen.queryByTestId('band-chip')).toBeNull();
  expect(screen.queryByTestId('calibrating-hint')).toBeNull();
  expect(screen.getByTestId('contributions-why')).toHaveTextContent('3 more nights');
  await fireEvent.press(screen.getByTestId('ring-readiness-detail-why'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
});
it('says Night left when one night remains', async () => {
  const days = ['2026-11-25', '2026-11-26', '2026-11-27'].map((d) => firstNightDay({ day: d }));
  await render(withAppData(<ReadinessScreen />, 'en', { days, device }, FIRST_NIGHT_NOW_S));
  expect(within(screen.getByTestId('ring-readiness-detail')).getByText('Night left')).toBeTruthy();
});
it('shows Load so far on the open day', async () => {
  await render(wrap(<LoadScreen />));
  const ring = within(screen.getByTestId('ring-load-detail'));
  expect(ring.getByText('4.6')).toBeTruthy();
  expect(ring.getByText('So far')).toBeTruthy();
  expect(screen.getByText('So far today · synced 10:21')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('load-about'));
  expect(within(screen.getByTestId('about-sheet')).getByText('How hard your heart worked')).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/explainScreens.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as described in Files.
- [ ] **Step 4: Run to verify they pass.** `npx jest __tests__/explainScreens.test.tsx __tests__/daily.test.tsx __tests__/activity.test.tsx __tests__/i18n.test.ts`, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: explain sleep, readiness and load screens and compute efficiency from stages`

---

### Task 8: Home — rings, first-week card, vitals and stress cards, tiles, weekly label

**Files:**
- Modify: `apps/mobile/src/ui/daily/Hero.tsx:15-210`:
  - `HeroRing` splits into a ring `Pressable` (testID unchanged) and a label `Pressable` (testID `${testID}-label`, text `label ›`, navigates to `href`).
  - The ring press calls `why(explain)` when the value is missing or `building` is set, else `router.push(href)`.
  - New props: `explain: ExplainTarget`, `building?: BuildingRing | null`, `caption` (already exists).
  - Building uses `Ring segments` in `colors.pink` and the a11y label `readiness.nightsLeftA11y{One}`.
  - A missing value shows `missingStatus(…, 'row')` instead of `reasonLabel(reason)`.
  - `useHeroValues` uses `visibleReadiness` and `shownLoad`. Building is set only when `index === days.length − 1`.
  - The load ring uses `shownLoad`, with caption `load.soFar` and a11y `load.soFarA11y {value, max: LOAD_MAX}` when `soFar`.
  - The compact hero replaces the hard-coded `reason.no-data` (~line 141) with `missingStatus` for each stat (hrv, load, sleep) and opens why on press when missing.
- Create: `apps/mobile/src/ui/daily/FirstWeekCard.tsx`. Props: `{ days: readonly DayRecord[]; index: number }`. It returns `null` when `firstWeekItems` is empty or `index !== days.length − 1`. Card testID `card-first-week`:
  - title `firstWeek.title` (`cardTitle`) and body `firstWeek.body` (`body` muted);
  - one row per item (testID `first-week-${term}`, `minHeight: 56`, top border `colors.border`) with the label, `ProgressDots` and the right-aligned status `missingStatus(…, 'row')`;
  - pressing a row opens why for `{ term, index, shown: { value: null, unit: null, reason: 'needs-history' } }`.
- Modify: `apps/mobile/src/ui/daily/HomeBody.tsx`. Remove the calibrating `Card` from `Notices` (lines 39-43). Render `<FirstWeekCard days={days} index={index} />` after `<Notices />` in `HomeBody`.
- Modify: `apps/mobile/src/ui/daily/cards.tsx`:
  - **VitalsCard (45-67).** When `summary.calibrating`, show a `cap` line `home.vitalsMeasured {count: summary.withValue, total: summary.total}` (testID `vitals-count`) and a `label` muted line `home.vitalsRangesFrom {night: MIN_BASELINE_NIGHTS + 1}`, next to a 36×36 `check` icon box on `surfaceAlt`.
  - **StressCard (69-101).** The header becomes `MetricName` (term stress, testID `stress-tile-name`) + `ParityBadge`. While stress is building, show `stress.notYet` (testID `stress-tile-reason`) + `stress.needsCalm`, in a why `Pressable` (testID `stress-tile-why`). Other missing reasons keep `reason(view.reason ?? 'no-data')`.
  - **WeekCard (278).** Let the label wrap (`numberOfLines={2}`).
  - **DashboardGrid (371-470).** Every `MetricTile` gets `explain` (`calories`, `steps`, `wearTime`, `sleepDebt` and the slug terms).
- Modify: `apps/mobile/src/data/dailyDerived.ts:30-55`. `VitalsSummary` gains `withValue: number` and `total: number` (= `VITAL_KEYS.length`).
- Modify value: `home.weekSleep` → en "Nights at sleep need", nl "Nachten met genoeg slaap".
- Copy keys below. Then delete `calibrating.hint` and `calibrating.label` if grep finds no use.
- Test: `apps/mobile/__tests__/firstWeek.test.tsx`; update `__tests__/stress.test.tsx:111-114` (expect `'Not yet'`).

**Interfaces:**
- Consumes: everything from Tasks 3 to 7. `BuildingRing` comes from `ui/ScoreRing.tsx`.
- Produces: `FirstWeekCard`.

| key | en | nl |
|---|---|---|
| firstWeek.title | Your first week | Je eerste week |
| firstWeek.body | These compare you with your own nights, so they wait until OpenHoop has seen a few. | Deze vergelijken je met je eigen nachten, dus ze wachten tot OpenHoop er een paar heeft gezien. |
| home.vitalsMeasured | {count}/{total} measured | {count}/{total} gemeten |
| home.vitalsRangesFrom | Ranges from night {night} | Bereik vanaf nacht {night} |
| stress.notYet | Not yet | Nog niet |
| stress.needsCalm | Needs calm, awake time | Heeft rustige, wakkere tijd nodig |
| load.soFarA11y | Load so far today: {value} of {max} | Belasting tot nu toe vandaag: {value} van {max} |

- [ ] **Step 1: Write the failing tests** `__tests__/firstWeek.test.tsx` (fake timers at `FIRST_NIGHT_NOW_S` as in `daily.test.tsx`)

```tsx
it('lists what is still building and replaces the calibrating notice', async () => {
  await render(wrap(<HomeScreen />));
  const card = within(screen.getByTestId('card-first-week'));
  expect(card.getByText('Your first week')).toBeTruthy();
  expect(screen.getByTestId('first-week-readiness')).toHaveTextContent('3 more nights');
  expect(screen.getByTestId('first-week-consistency')).toHaveTextContent('1 more night');
  expect(screen.getByTestId('first-week-normalRange')).toHaveTextContent('4 more nights');
  expect(screen.getByTestId('first-week-skinTempChange')).toHaveTextContent('3 more nights');
  expect(screen.getByTestId('first-week-stress')).toHaveTextContent('3 more calm days');
  expect(screen.queryByTestId('calibrating-hint')).toBeNull();
  await fireEvent.press(screen.getByTestId('first-week-consistency'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
});
it('drops the card once nothing is building', async () => {
  await render(withAppData(<HomeScreen />));
  expect(screen.queryByTestId('card-first-week')).toBeNull();
});
it('shows nights left in the readiness ring and Load so far', async () => {
  await render(wrap(<HomeScreen />));
  expect(screen.getByLabelText('Readiness: 3 nights left before the first score')).toBeTruthy();
  expect(within(screen.getByTestId('ring-readiness')).getByText('Nights left')).toBeTruthy();
  expect(within(screen.getByTestId('ring-load')).getByText('4.6')).toBeTruthy();
  expect(within(screen.getByTestId('ring-load')).getByText('So far')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('ring-readiness'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('why-sheet-backdrop'));
  await fireEvent.press(screen.getByTestId('ring-readiness-label'));
  expect(mockPush).toHaveBeenCalledWith('/recovery');
});
it('keeps a past day free of so far, nights left and the first-week card', async () => {
  mockParams.value = { day: '2026-11-26' };
  await render(withAppData(<PastDayScreen />, 'en', { days: [firstNightDay({ day: '2026-11-26' }), firstNightDay()], device }, FIRST_NIGHT_NOW_S));
  expect(within(screen.getByTestId('ring-load')).queryByText('So far')).toBeNull();
  expect(within(screen.getByTestId('ring-load')).getByText('Worn 8 h 2 min of 10 h')).toBeTruthy();
  expect(within(screen.getByTestId('ring-readiness')).getByText('No number yet')).toBeTruthy();
  expect(screen.queryByTestId('card-first-week')).toBeNull();
});
it('writes the vitals card, stress tile and weekly plan label', async () => {
  await render(wrap(<HomeScreen />));
  expect(screen.getByTestId('vitals-count')).toHaveTextContent('5/5 measured');
  expect(within(screen.getByTestId('card-vitals')).getByText('Ranges from night 5')).toBeTruthy();
  expect(screen.getByTestId('stress-tile-reason')).toHaveTextContent('Not yet');
  expect(within(screen.getByTestId('card-stress')).getByText('Needs calm, awake time')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('stress-tile-why'));
  expect(screen.getByTestId('why-sheet')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalledWith('/health/stress');
  expect(screen.getByText('Nights at sleep need')).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/firstWeek.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as described in Files.
- [ ] **Step 4: Run to verify they pass.** `npx jest` (whole mobile suite). Update `stress.test.tsx` 'says calibrating on the first days' to expect `'Not yet'`. Then run `npm run typecheck`. Grep `calibrating\.hint|calibrating\.label` in `apps/mobile/src`: delete both keys (en and nl) if there are no hits.
- [ ] **Step 5: Commit.** `feat: show the first week on home and explain the home rings, cards and tiles`

---

### Task 9: All terms screen and its entry in About

**Files:**
- Create: `apps/mobile/src/app/settings/terms.tsx`. Use `SettingsPage` (title `terms.title`, testID `all-terms`). Add the search field (copy the pattern from `app/health/metrics.tsx:46-72`, testID `terms-search`, placeholder `terms.search`). Matching is case-insensitive over the name + line in the current language.
  - One `ListGroup` per category (`terms.cat.recovery|sleep|effort`) in `TERM_IDS` order.
  - Each row is a `ListRow` (testID `term-${id}`, title name, subtitle line) that calls `about({ term, index: days.length − 1, shown: null })`.
  - Show `terms.noMatch` (testID `terms-none`) when nothing matches.
  - Finish with the section `terms.levels`: a 2×2 grid of `ParityBadge long` + `level.A…D` text (the existing keys).
- Modify: `apps/mobile/src/app/settings/about.tsx:58-71`. Under the levels card, add a `ListRow` (testID `about-terms`, `icon tile(colors, 'help', 'info')`, title `terms.title`, subtitle `terms.aboutBody`, href `/settings/terms`).
- Test: `apps/mobile/__tests__/allTerms.test.tsx`.

**Interfaces:**
- Consumes: `TERMS`, `TERM_IDS`, `termLine`, `useExplain`.

| key | en | nl |
|---|---|---|
| terms.title | All terms | Alle begrippen |
| terms.search | Search, like HRV or sleep debt | Zoek, bijvoorbeeld HRV of slaapschuld |
| terms.cat.recovery | Recovery | Herstel |
| terms.cat.sleep | Sleep | Slaap |
| terms.cat.effort | Effort | Inspanning |
| terms.levels | How a number is made | Hoe een getal ontstaat |
| terms.noMatch | No term matches your search. | Geen begrip past bij je zoekopdracht. |
| terms.aboutBody | What every number in the app means, in plain words | Wat elk getal in de app betekent, in gewone woorden |

- [ ] **Step 1: Write the failing tests** `__tests__/allTerms.test.tsx`

```tsx
it('lists every term by section with its one-liner', async () => {
  await render(wrap(<TermsScreen />));
  for (const title of ['Recovery', 'Sleep', 'Effort', 'How a number is made']) expect(screen.getByText(title)).toBeTruthy();
  expect(within(screen.getByTestId('term-stress')).getByText('How far your heart rate and HRV drift from your calm level while you are awake and still.')).toBeTruthy();
});
it('searches names and lines in the current language', async () => {
  await render(wrap(<TermsScreen />));
  await fireEvent.changeText(screen.getByTestId('terms-search'), 'debt');
  expect(screen.getByTestId('term-sleepDebt')).toBeTruthy();
  expect(screen.queryByTestId('term-hrv')).toBeNull();
  await fireEvent.changeText(screen.getByTestId('terms-search'), 'zzz');
  expect(screen.getByTestId('terms-none')).toHaveTextContent('No term matches your search.');
});
it('finds Dutch words in Dutch', async () => {
  await render(wrap(<TermsScreen />, 'nl'));
  await fireEvent.changeText(screen.getByTestId('terms-search'), 'slaapschuld');
  expect(screen.getByTestId('term-sleepDebt')).toBeTruthy();
});
it('opens the about sheet without a personal value', async () => {
  await render(wrap(<TermsScreen />));
  await fireEvent.press(screen.getByTestId('term-hrv'));
  expect(within(screen.getByTestId('about-sheet')).queryByText('Your night')).toBeNull();
});
it('is linked from About', async () => {
  await render(wrap(<AboutScreen />));
  await fireEvent.press(screen.getByTestId('about-terms'));
  expect(mockPush).toHaveBeenCalledWith('/settings/terms');
});
```

- [ ] **Step 2: Run to verify they fail.** `npx jest __tests__/allTerms.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen, the About row and the copy.
- [ ] **Step 4: Run to verify they pass.** `npx jest __tests__/allTerms.test.tsx __tests__/manage.test.tsx __tests__/i18n.test.ts`, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat: add the All terms index under About`

---

### Task 10: Full verification

**Files:** none new.

- [ ] **Step 1: Root checks.** From the repo root, run `npm test`, `npm run typecheck` and `npm run lint`. Expected: every vitest suite passes, tsc reports 0 errors and eslint reports 0 problems.
- [ ] **Step 2: Mobile checks.** In `apps/mobile`, run `npm test` and `npm run typecheck`. Expected: every jest suite passes (including `i18n.test.ts`) and tsc reports 0 errors.
- [ ] **Step 3: Leftover scan.** Grep `apps/mobile/src` for `readiness\.value` (expected hits only in `data/derived.ts` and `data/fixtureSource.ts`), for `#[0-9A-Fa-f]{6}` in `ui/explain`, `ui/Sheet.tsx`, `ui/daily/FirstWeekCard.tsx` and `app/settings/terms.tsx` (expected none), and for `: any\b|as any` (expected none in changed files).
- [ ] **Step 4: Code review.** Run one review (`superpowers:requesting-code-review` or the `feature-dev:code-reviewer` agent) over the branch diff against `master`. Fix confirmed findings, then re-run Steps 1 and 2.
- [ ] **Step 5: Manual check (owner, S24).** Install a release build signed with the same debug key so data is kept (see the device workflow memory). On the first-nights data, check:
  - the readiness ring shows nights left;
  - the first-week card appears;
  - the Load ring shows "So far";
  - tapping the HRV name opens the sheet;
  - a missing value opens the why sheet;
  - Settings › About › All terms works.

  Do not drive the share sheet.
- [ ] **Step 6: Commit any review fixes.** `fix: address review findings for metric explanations` (only if there are changes).

---

## Self-review

**Spec coverage:**

| Spec item | Task |
|---|---|
| Goal 1 | 3, 5, 6–8 |
| Goal 2 | 2, 5, 6–8 |
| Goal 3 (friendly names, one-liners) | 2, 6, 9 |
| Goal 4 | 4, 7, 8 |
| Goal 5 | 1, 4, 7, 8 |
| Goal 6 | 7 |
| Goal 7 | 9 |
| Goal 8 | every task's copy table + i18n parity |
| Design §1 (kinds, have/need, expected, band read, thresholds imported, unknown reasons fall back) | 1, 3 |
| §2 Sheet primitive extracted from Strava | 5 |
| §2 provider | 5 |
| §2 registry incl. level and method | 2 |
| §2 name + (i), 44 px, a11y label | 5 |
| §2 surfaces: Home | 8 |
| §2 surfaces: metric detail top-bar (i) | 6 |
| §2 surfaces: Readiness rows | 7 |
| §2 surfaces: Sleep tiles and contributors | 7 |
| §2 surfaces: Vitals rows | 6 |
| §2 surfaces: Load hero | 7 |
| §2 surfaces: Stress tile | 8 |
| §2 surfaces: All metrics | 6 |
| §2 sheet content and coach link | 5 |
| §3 ring | 7, 8 |
| §3 consistent hiding | 4 |
| §3 first-week card | 8 |
| §3 vitals card | 8 |
| §3 stress tile | 8 |
| §3 "Sleep nights" label | 8 |
| §4 | 1, 4, 7, 8 |
| §5 | 7 |
| §6 | copy tables |
| Testing section | 1, 3, 4, 5, 7, 8, 10 |
| Settled 1 (copy) | 2–9 |
| Settled 2: ring, readiness screen and trends | 4, 7 |
| Settled 2: brief, widget, digest and coach | 4 |
| Settled 3: so far refreshed per sync, current = last day, day-running finished only | 1, 3, 4 |
| Settled 4 | 3 |
| Settled 5 | 1 |
| Settled 6 | 3 |
| Left to builder: coach pre-fill | yes, Task 5 |

**Builder decisions taken:**
- `loadValidMinutes` is stored next to `loadSoFar`, because the "worn X h of 10 h" text needs the minutes and `DayRecord` had no field for them.
- Counts follow the code, not the canvas example numbers (see the Counting rule).
- The vitals card reads "Ranges from night 5".
- `metric.spo2` becomes "Blood oxygen".
- Stress progress counts calm days before today.
- The thin-signal sheet shows no measured share, because coverage is `null` on failure.
- The Strava sheet gains a close button and a backdrop that closes it.
