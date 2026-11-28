import type { CycleData, PeriodEntry, PeriodInput, SymptomEntry, SymptomInput } from '@openhoop/core';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import CycleScreen from '@/app/health/cycle';
import PregnancyScreen from '@/app/health/pregnancy';
import SymptomsScreen from '@/app/health/symptoms';

import { FIXTURE_NOW, withAppData } from './support/appData';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: string) => mockPush(href), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function period(id: number, startDay: string, endDay: string | null = null, flow: 1 | 2 | 3 = 2): PeriodEntry {
  return { id, startDay, endDay, flow, createdAt: id };
}

function symptom(id: number, day: string, name: SymptomEntry['symptom'], intensity: SymptomEntry['intensity'] = 2): SymptomEntry {
  return { id, day, symptom: name, intensity, createdAt: id };
}

function cycleData(overrides: Partial<CycleData> = {}): CycleData {
  return { periods: [], symptoms: [], pregnancy: null, ...overrides };
}

const THREE_PERIODS = [period(1, '2026-09-01', '2026-09-05'), period(2, '2026-09-29', '2026-10-03'), period(3, '2026-10-29', '2026-11-02')];

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(FIXTURE_NOW.getTime());
  mockPush.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cycle screen', () => {
  it('shows honest empty states and no estimate without logs', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData() }));
    expect(screen.getByTestId('cycle-entries-empty')).toBeTruthy();
    expect(within(screen.getByTestId('cycle-average')).getByText('Not enough logs')).toBeTruthy();
    expect(within(screen.getByTestId('cycle-period-average')).getByText('Not enough logs')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('cycle-average-missing').props.style).fontSize).toBeLessThan(20);
    expect(StyleSheet.flatten(screen.getByTestId('cycle-tile-temp-header').props.style).marginVertical).toBeLessThan(0);
    expect(screen.getByTestId('cycle-next-reason')).toHaveTextContent(/Log your first period to start/);
    expect(screen.getByTestId('cycle-next-disclaimer')).toHaveTextContent(/not a prediction of fertility or ovulation, and not medical advice/);
    expect(screen.getByTestId('cycle-wipe').props.accessibilityState?.disabled).toBe(true);
  });

  it('asks for more history before estimating', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: [period(1, '2026-10-01'), period(2, '2026-10-29')] }) }));
    expect(screen.getByTestId('cycle-next-reason')).toHaveTextContent(/Log at least 3 period starts/);
  });

  it('shows averages and an average-based next period estimate from the logs', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }) }));
    expect(within(screen.getByTestId('cycle-average')).getByText(/29\.0/)).toBeTruthy();
    expect(within(screen.getByTestId('cycle-period-average')).getByText(/5\.0/)).toBeTruthy();
    expect(screen.getByTestId('cycle-next-day')).toHaveTextContent('2026-11-27');
    expect(screen.getByTestId('cycle-next-value')).toHaveTextContent('In 2 days');
    expect(screen.getByTestId('cycle-basis')).toHaveTextContent(/Cycles used: 2/);
    expect(screen.getByTestId('cycle-temp-note')).toHaveTextContent(/Raw data, not interpreted/);
  });

  it('places today on the phase wheel and labels everything as an estimate', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }) }));
    expect(screen.getByTestId('cycle-wheel-day')).toHaveTextContent('28');
    expect(screen.getByTestId('cycle-wheel-phase')).toHaveTextContent('Luteal');
    expect(screen.getByTestId('cycle-phase-title')).toHaveTextContent('Luteal phase (estimate)');
    expect(screen.getByTestId('cycle-phase-left')).toHaveTextContent('1 day left');
    expect(screen.getByTestId('cycle-tile-next-value')).toHaveTextContent('in 2 days');
    expect(screen.getByText('estimate')).toBeTruthy();
    expect(screen.getByTestId('cycle-level')).toHaveTextContent(/Not for contraception and not medical advice/);
    expect(screen.queryByTestId('cycle-wheel-typical')).toBeNull();
  });

  it('assumes a typical cycle until there is history and asks for a first log', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: [period(4, '2026-11-09')] }) }));
    expect(screen.getByTestId('cycle-wheel-day')).toHaveTextContent('17');
    expect(screen.getByTestId('cycle-wheel-typical')).toHaveTextContent(/typical 28-day cycle/);
    expect(screen.getByTestId('cycle-phase-left')).toHaveTextContent('11 days left');
    expect(screen.getByTestId('cycle-tile-next-missing')).toHaveTextContent('Needs more logs');
  });

  it('names no phase when the period is later than the average cycle', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: [period(1, '2026-08-25'), period(2, '2026-09-22'), period(3, '2026-10-20')] }) }));
    expect(screen.getByTestId('cycle-wheel-phase')).toHaveTextContent('Later than usual');
    expect(screen.getByTestId('cycle-phase-title')).toHaveTextContent('Cycle phase');
    expect(screen.queryByText(/Luteal phase/)).toBeNull();
  });

  it('opens the period form from the calendar button', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }) }));
    await fireEvent.press(screen.getByTestId('cycle-open-calendar'));
    expect(screen.getByTestId('cycle-form')).toBeTruthy();
  });

  it('does not estimate a next period while pregnancy mode is on', async () => {
    await render(
      withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS, pregnancy: { dueDay: '2027-03-01', createdAt: 1 } }) }),
    );
    expect(screen.getByTestId('cycle-next-pregnant')).toBeTruthy();
    expect(screen.queryByTestId('cycle-next-day')).toBeNull();
  });

  it('renders in Dutch', async () => {
    await render(withAppData(<CycleScreen />, 'nl', { cycle: cycleData({ periods: THREE_PERIODS }) }));
    expect(screen.getByTestId('cycle-next-value')).toHaveTextContent('Over 2 dagen');
    expect(screen.getByTestId('cycle-next-disclaimer')).toHaveTextContent(/geen voorspelling van vruchtbaarheid/);
  });

  it('rejects invalid periods without saving and flags the overlap', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }), savePeriod: save }));
    expect(screen.queryByTestId('cycle-form')).toBeNull();
    await fireEvent.press(screen.getByTestId('cycle-open-form'));
    await fireEvent.changeText(screen.getByTestId('cycle-input-start'), '2026-11-26');
    await fireEvent.press(screen.getByTestId('cycle-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('cycle-input-start'), '2026-11-10');
    await fireEvent.changeText(screen.getByTestId('cycle-input-end'), '2026-11-09');
    await fireEvent.press(screen.getByTestId('cycle-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('cycle-input-start'), '2026-11-01');
    await fireEvent.changeText(screen.getByTestId('cycle-input-end'), '');
    await fireEvent.press(screen.getByTestId('cycle-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('cycle-overlap')).toBeTruthy();
  });

  it('saves a valid period with its flow', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    await render(withAppData(<CycleScreen />, 'en', { savePeriod: save }));
    await fireEvent.changeText(screen.getByTestId('cycle-input-start'), '2026-11-20');
    await fireEvent.changeText(screen.getByTestId('cycle-input-end'), '2026-11-24');
    await fireEvent.press(screen.getByText('Heavy'));
    await fireEvent.press(screen.getByTestId('cycle-save'));
    expect(save).toHaveBeenCalledWith(null, { startDay: '2026-11-20', endDay: '2026-11-24', flow: 3 });
  });

  it('edits a period in place and deletes one entry after confirming', async () => {
    const save = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    const remove = jest.fn<Promise<boolean>, [number]>(async () => true);
    await render(
      withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: [period(7, '2026-11-20', null, 1)] }), savePeriod: save, removePeriod: remove }),
    );
    await fireEvent.press(screen.getByTestId('cycle-edit-7'));
    await fireEvent.changeText(screen.getByTestId('cycle-input-end'), '2026-11-23');
    await fireEvent.press(screen.getByTestId('cycle-save'));
    expect(save).toHaveBeenCalledWith(7, { startDay: '2026-11-20', endDay: '2026-11-23', flow: 1 });
    await fireEvent.press(screen.getByTestId('cycle-delete-7'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('cycle-confirm-7'));
    expect(remove).toHaveBeenCalledWith(7);
  });

  it('deletes all cycle data only after a confirmation', async () => {
    const wipe = jest.fn<Promise<boolean>, []>(async () => true);
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }), removeAllCycleData: wipe }));
    await fireEvent.press(screen.getByTestId('cycle-wipe'));
    expect(wipe).not.toHaveBeenCalled();
    expect(screen.getByTestId('cycle-wipe-warning')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cycle-wipe-keep'));
    expect(wipe).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('cycle-wipe'));
    await fireEvent.press(screen.getByTestId('cycle-wipe-confirm'));
    expect(wipe).toHaveBeenCalledTimes(1);
  });

  it('links to symptoms and pregnancy', async () => {
    await render(withAppData(<CycleScreen />, 'en', { cycle: cycleData() }));
    await fireEvent.press(screen.getByTestId('cycle-link-symptoms'));
    await fireEvent.press(screen.getByTestId('cycle-link-pregnancy'));
    expect(mockPush).toHaveBeenNthCalledWith(1, '/health/symptoms');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/health/pregnancy');
  });
});

describe('symptoms screen', () => {
  it('shows an empty history', async () => {
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData() }));
    expect(screen.getByTestId('symptom-empty')).toBeTruthy();
  });

  it('needs a symptom before saving', async () => {
    const save = jest.fn<Promise<boolean>, [SymptomInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { saveSymptom: save }));
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('symptom-error')).toBeTruthy();
  });

  it('rejects a day in the future', async () => {
    const save = jest.fn<Promise<boolean>, [SymptomInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { saveSymptom: save }));
    await fireEvent.press(screen.getByTestId('symptom-chip-cramps'));
    await fireEvent.changeText(screen.getByTestId('symptom-input-day'), '2026-11-26');
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(save).not.toHaveBeenCalled();
  });

  it('saves the chosen symptom with its intensity', async () => {
    const save = jest.fn<Promise<boolean>, [SymptomInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { saveSymptom: save }));
    await fireEvent.press(screen.getByTestId('symptom-chip-headache'));
    await fireEvent.press(screen.getByText('Strong'));
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(save).toHaveBeenCalledWith({ day: '2026-11-25', symptom: 'headache', intensity: 3 });
  });

  it('saves several symptoms with their own intensity and logs the flow for the day', async () => {
    const save = jest.fn<Promise<boolean>, [SymptomInput]>(async () => true);
    const savePeriod = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { saveSymptom: save, savePeriod }));
    await fireEvent.press(screen.getByTestId('symptom-chip-cramps'));
    await fireEvent.press(screen.getByTestId('symptom-chip-fatigue'));
    await fireEvent.press(within(screen.getByTestId('symptom-intensity-fatigue')).getByText('Strong'));
    await fireEvent.press(screen.getByTestId('symptom-flow-3'));
    await fireEvent.press(screen.getByTestId('symptom-save-top'));
    expect(screen.getByTestId('symptom-new-period')).toHaveTextContent(/starts a new period/);
    expect(save).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('symptom-new-confirm'));
    expect(save).toHaveBeenCalledWith({ day: '2026-11-25', symptom: 'cramps', intensity: 1 });
    expect(save).toHaveBeenCalledWith({ day: '2026-11-25', symptom: 'fatigue', intensity: 3 });
    expect(savePeriod).toHaveBeenCalledWith(null, { startDay: '2026-11-25', endDay: null, flow: 3 });
  });

  it('removes a period started today when the flow is set back to none', async () => {
    const removePeriod = jest.fn<Promise<boolean>, [number]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData({ periods: [period(5, '2026-11-25')] }), removePeriod }));
    expect(screen.getByTestId('symptom-flow-2').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByTestId('symptom-flow-0'));
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(removePeriod).toHaveBeenCalledWith(5);
  });

  it('shows the period a day belongs to and joins a day after a skipped one', async () => {
    const savePeriod = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData({ periods: [period(6, '2026-11-20', '2026-11-22')] }), savePeriod }));
    await fireEvent.changeText(screen.getByTestId('symptom-input-day'), '2026-11-21');
    expect(screen.getByTestId('symptom-flow-period')).toHaveTextContent(/whole period/);
    await fireEvent.changeText(screen.getByTestId('symptom-input-day'), '2026-11-24');
    expect(screen.getByTestId('symptom-flow-hint')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('symptom-flow-1'));
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(savePeriod).toHaveBeenCalledWith(6, { startDay: '2026-11-20', endDay: '2026-11-24', flow: 1 });
  });

  it('says so when the day is before 2015 instead of dropping it', async () => {
    const save = jest.fn<Promise<boolean>, [SymptomInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { saveSymptom: save }));
    await fireEvent.press(screen.getByTestId('symptom-chip-cramps'));
    await fireEvent.changeText(screen.getByTestId('symptom-input-day'), '2014-05-01');
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByTestId('symptom-problem')).toBeTruthy();
  });

  it('will not cut a day out of the middle of a period', async () => {
    const savePeriod = jest.fn<Promise<boolean>, [number | null, PeriodInput]>(async () => true);
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData({ periods: [period(6, '2026-11-20', '2026-11-24')] }), savePeriod }));
    await fireEvent.changeText(screen.getByTestId('symptom-input-day'), '2026-11-22');
    await fireEvent.press(screen.getByTestId('symptom-flow-0'));
    await fireEvent.press(screen.getByTestId('symptom-save'));
    expect(savePeriod).not.toHaveBeenCalled();
    expect(screen.getByTestId('symptom-problem')).toHaveTextContent(/middle of a logged period/);
  });

  it('marks the predictions as estimates and explains when there are none', async () => {
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData({ periods: THREE_PERIODS }) }));
    expect(screen.getByTestId('symptom-predict-next')).toBeTruthy();
    expect(screen.getByTestId('symptom-predict-fertile')).toBeTruthy();
    expect(screen.getByText('estimate')).toBeTruthy();
    expect(screen.getByTestId('symptom-predictions')).toHaveTextContent(/Not for contraception and not medical advice/);
    await render(withAppData(<SymptomsScreen />, 'en', { cycle: cycleData() }));
    expect(screen.getByTestId('symptom-predictions-reason')).toHaveTextContent(/Log your first period/);
  });

  it('lists entries by day and deletes a single entry after confirming', async () => {
    const remove = jest.fn<Promise<boolean>, [number]>(async () => true);
    const symptoms = [symptom(1, '2026-11-24', 'cramps', 3), symptom(2, '2026-11-24', 'mood', 1), symptom(3, '2026-11-20', 'fatigue')];
    await render(withAppData(<SymptomsScreen />, 'nl', { cycle: cycleData({ symptoms }), removeSymptom: remove }));
    expect(within(screen.getByTestId('symptom-day-2026-11-24')).getByText('Krampen · Sterk')).toBeTruthy();
    expect(within(screen.getByTestId('symptom-day-2026-11-20')).getByText('Vermoeidheid · Matig')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('symptom-delete-2'));
    expect(remove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('symptom-confirm-2'));
    expect(remove).toHaveBeenCalledWith(2);
  });
});

describe('pregnancy screen', () => {
  it('is off by default and asks for a due date', async () => {
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: cycleData() }));
    expect(screen.getByTestId('pregnancy-off')).toBeTruthy();
    expect(screen.queryByTestId('pregnancy-week')).toBeNull();
    expect(screen.getByTestId('pregnancy-disclaimer')).toHaveTextContent(/does not give medical advice/);
  });

  it('rejects an invalid due date and saves a valid one', async () => {
    const save = jest.fn<Promise<boolean>, [string]>(async () => true);
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: cycleData(), savePregnancy: save }));
    await fireEvent.changeText(screen.getByTestId('pregnancy-input-due'), '2028-01-01');
    await fireEvent.press(screen.getByTestId('pregnancy-save'));
    expect(save).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('pregnancy-input-due'), '2027-03-01');
    await fireEvent.press(screen.getByTestId('pregnancy-save'));
    expect(save).toHaveBeenCalledWith('2027-03-01');
  });

  it('counts the week from the due date and shows the nightly values as trends', async () => {
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: cycleData({ pregnancy: { dueDay: '2027-03-01', createdAt: 1 } }) }));
    expect(screen.getByTestId('pregnancy-week-value')).toHaveTextContent(/26w 2d/);
    expect(screen.getByTestId('pregnancy-due')).toHaveTextContent(/Due date 2027-03-01/);
    expect(screen.getByTestId('pregnancy-days')).toHaveTextContent(/Days until the due date: 96/);
    expect(screen.getByTestId('pregnancy-trend-restingHr')).toBeTruthy();
    expect(screen.getByTestId('pregnancy-trend-hrv')).toBeTruthy();
    expect(screen.getByTestId('pregnancy-trend-skinTemp')).toBeTruthy();
  });

  it('shows no week when the stored due date puts the start in the future', async () => {
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: cycleData({ pregnancy: { dueDay: '2027-09-10', createdAt: 1 } }) }));
    expect(screen.getByTestId('pregnancy-week-none')).toBeTruthy();
    expect(screen.queryByTestId('pregnancy-week-value')).toBeNull();
  });

  it('turns pregnancy mode off only after a confirmation', async () => {
    const end = jest.fn<Promise<boolean>, []>(async () => true);
    await render(withAppData(<PregnancyScreen />, 'en', { cycle: cycleData({ pregnancy: { dueDay: '2027-03-01', createdAt: 1 } }), removePregnancy: end }));
    await fireEvent.press(screen.getByTestId('pregnancy-end-button'));
    expect(end).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('pregnancy-end-confirm'));
    expect(end).toHaveBeenCalledTimes(1);
  });
});
