import type { CuffReading } from '@openhoop/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, type AlertButton } from 'react-native';

import { cuffCsv, emptyCuffDraft, localToUnix, validateCuffDraft } from '@/data/cuff';
import { shareCuffCsv } from '@/data/cuffShare';
import { defaultUserData } from '@/data/userData';

import { withAppData } from './support/appData';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (href: unknown) => mockPush(href), back: () => mockBack(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
  Link: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/data/cuffShare', () => ({ shareCuffCsv: jest.fn(async () => undefined), removeLeftoverCuffFiles: jest.fn() }));

import BloodPressureScreen from '@/app/health/blood-pressure';
import BpCalibrationScreen from '@/app/health/bp-calibration';
import IrregularRhythmScreen from '@/app/health/irregular-rhythm';

const NOW = Date.UTC(2026, 10, 25, 12, 0) / 1000;
const READING: CuffReading = { id: 3, t: NOW - 3_600, systolic: 118, diastolic: 76, pulse: 61, createdAt: NOW };

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  jest.mocked(shareCuffCsv).mockClear();
});

describe('cuff readings', () => {
  const draft = { ...emptyCuffDraft(NOW, 0), systolic: '118', diastolic: '76', pulse: '' };
  const utc = (): number => 0;

  it('starts on today and the current time', () => {
    expect(emptyCuffDraft(NOW, 3_600)).toEqual({ systolic: '', diastolic: '', pulse: '', day: '2026-11-25', time: '13:00' });
  });

  it('keeps what was typed and derives nothing', () => {
    expect(validateCuffDraft(draft, NOW, utc)).toEqual({ ok: true, value: { t: NOW, systolic: 118, diastolic: 76, pulse: null } });
    expect(validateCuffDraft({ ...draft, pulse: '62', time: '7.10' }, NOW, () => 3_600)).toEqual({
      ok: true,
      value: { t: Date.UTC(2026, 10, 25, 6, 10) / 1000, systolic: 118, diastolic: 76, pulse: 62 },
    });
  });

  it('rejects numbers a cuff cannot show, a swapped pair and a future time', () => {
    expect(validateCuffDraft({ ...draft, systolic: '300' }, NOW, utc)).toEqual({ ok: false, invalid: ['systolic'] });
    expect(validateCuffDraft({ ...draft, systolic: '76', diastolic: '118' }, NOW, utc)).toEqual({ ok: false, invalid: ['order'] });
    expect(validateCuffDraft({ ...draft, pulse: '12' }, NOW, utc)).toEqual({ ok: false, invalid: ['pulse'] });
    expect(validateCuffDraft({ ...draft, time: '25:00' }, NOW, utc)).toEqual({ ok: false, invalid: ['time'] });
    expect(validateCuffDraft({ ...draft, day: '2026-11-26' }, NOW, utc)).toEqual({ ok: false, invalid: ['day', 'time'] });
    expect(localToUnix('1999-01-01', '07:00', utc)).toBeNull();
  });

  it('uses the UTC offset of the typed date, so a summer reading typed in winter keeps its clock time', () => {
    const summerStart = Date.UTC(2026, 2, 29, 1) / 1000;
    const summerEnd = Date.UTC(2026, 9, 25, 1) / 1000;
    const brussels = (unixS: number): number => (unixS >= summerStart && unixS < summerEnd ? 7_200 : 3_600);
    expect(localToUnix('2026-07-15', '07:10', brussels)).toBe(Date.UTC(2026, 6, 15, 5, 10) / 1000);
    expect(localToUnix('2026-11-25', '07:10', brussels)).toBe(Date.UTC(2026, 10, 25, 6, 10) / 1000);
    const typedInWinter = validateCuffDraft({ ...draft, day: '2026-07-15', time: '07:10' }, NOW, brussels);
    expect(typedInWinter).toEqual({ ok: true, value: { t: Date.UTC(2026, 6, 15, 5, 10) / 1000, systolic: 118, diastolic: 76, pulse: null } });
  });

  it('exports oldest first as the wearer typed it', () => {
    const older: CuffReading = { ...READING, id: 1, t: NOW - 86_400, pulse: null };
    expect(cuffCsv([READING, older], () => 0)).toBe(
      `local_time,unix_s,systolic_mmhg,diastolic_mmhg,pulse_bpm,source\r\n2026-11-24 12:00,${NOW - 86_400},118,76,,own-cuff-entry\r\n2026-11-25 11:00,${NOW - 3_600},118,76,61,own-cuff-entry\r\n`,
    );
  });
});

describe('blood pressure screen', () => {
  it('keeps the log off by default and says the band makes no blood pressure value', async () => {
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<BloodPressureScreen />, 'en', { updateUserData, cuffReadings: [READING] }));
    expect(screen.getByTestId('not-offered')).toHaveTextContent(/Not part of OpenHoop/);
    expect(screen.queryByTestId('cuff-readings')).toBeNull();
    expect(screen.getByTestId('cuff-hidden')).toBeTruthy();
    await fireEvent(screen.getByTestId('cuff-log-toggle'), 'valueChange', true);
    expect(updateUserData).toHaveBeenCalledWith({ cuffLog: true });
  });

  it('lists the wearer own readings, exports them and deletes one after asking', async () => {
    const removeCuffReading = jest.fn(async () => true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(withAppData(<BloodPressureScreen />, 'en', { userData: { ...defaultUserData(), cuffLog: true }, cuffReadings: [READING], removeCuffReading }));
    expect(screen.getByText(/Cuff 118 \/ 76 · pulse 61 · your entry/)).toBeTruthy();
    expect(screen.getByTestId('cuff-reading-3').props.accessibilityRole).toBe('button');
    await fireEvent.press(screen.getByTestId('cuff-add'));
    expect(mockPush).toHaveBeenCalledWith('/health/bp-calibration');
    await fireEvent.press(screen.getByTestId('cuff-export'));
    await waitFor(() => expect(shareCuffCsv).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByTestId('cuff-reading-3'));
    const buttons: AlertButton[] = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.style === 'destructive')?.onPress?.();
    expect(removeCuffReading).toHaveBeenCalledWith(3);
    alert.mockRestore();
  });

  it('asks for a first reading when the log is empty', async () => {
    await render(withAppData(<BloodPressureScreen />, 'en', { userData: { ...defaultUserData(), cuffLog: true } }));
    expect(screen.getByTestId('cuff-empty')).toBeTruthy();
    expect(screen.getByTestId('cuff-export').props.accessibilityState).toEqual({ disabled: true });
  });
});

describe('cuff reading form', () => {
  it('saves the typed reading, turns the log on and goes back', async () => {
    const saveCuffReading = jest.fn(async () => true);
    const updateUserData = jest.fn(async () => true);
    await render(withAppData(<BpCalibrationScreen />, 'en', { saveCuffReading, updateUserData }));
    await fireEvent.press(screen.getByTestId('cuff-step-1'));
    expect(screen.getByTestId('cuff-step-1').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.changeText(screen.getByTestId('cuff-input-systolic'), '121');
    await fireEvent.changeText(screen.getByTestId('cuff-input-diastolic'), '78');
    await fireEvent.changeText(screen.getByTestId('cuff-input-pulse'), '64');
    expect(screen.getByTestId('cuff-step-3').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByTestId('cuff-save'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    expect(saveCuffReading).toHaveBeenCalledWith(expect.objectContaining({ systolic: 121, diastolic: 78, pulse: 64 }));
    expect(updateUserData).toHaveBeenCalledWith({ cuffLog: true });
  });

  it('explains a swapped pair and saves nothing', async () => {
    const saveCuffReading = jest.fn(async () => true);
    await render(withAppData(<BpCalibrationScreen />, 'en', { saveCuffReading }));
    await fireEvent.changeText(screen.getByTestId('cuff-input-systolic'), '70');
    await fireEvent.changeText(screen.getByTestId('cuff-input-diastolic'), '90');
    await fireEvent.press(screen.getByTestId('cuff-save'));
    expect(screen.getByTestId('cuff-hint').props.children).toBe('The systolic number must be higher than the diastolic number.');
    expect(saveCuffReading).not.toHaveBeenCalled();
    expect(screen.getByTestId('not-offered')).toBeTruthy();
  });
});

describe('rhythm alerts screen', () => {
  it('stays not part of OpenHoop and links to the ECG and providers', async () => {
    await render(withAppData(<IrregularRhythmScreen />));
    expect(screen.getByTestId('not-offered')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('rhythm-record'));
    expect(mockPush).toHaveBeenCalledWith('/health/ecg');
    await fireEvent.press(screen.getByTestId('rhythm-provider'));
    expect(mockPush).toHaveBeenCalledWith('/settings/connect-provider');
  });
});
