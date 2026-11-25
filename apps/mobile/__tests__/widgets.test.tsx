import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as AndroidWidget from 'react-native-android-widget';
import type { WidgetInfo, WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';

import { readWidgetFile, writeWidgetFile } from '@/data/widgetStorage';
import type { WidgetValues } from '@/lib/widgetSnapshot';
import { androidWidgetBridge } from '@/widgets/bridge';
import { renderWidget } from '@/widgets/OpenHoopWidget';
import { widgetTaskHandler } from '@/widgets/taskHandler';
import { currentView } from '@/widgets/currentView';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: class {
    readonly uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists(): boolean {
      return mockFiles.has(this.uri);
    }
    create(): void {
      mockFiles.set(this.uri, '');
    }
    writeSync(text: string): void {
      mockFiles.set(this.uri, text);
    }
    textSync(): string {
      return mockFiles.get(this.uri) ?? '';
    }
    delete(): void {
      mockFiles.delete(this.uri);
    }
  },
}));

jest.mock('react-native-android-widget', () => ({
  FlexWidget: () => null,
  TextWidget: () => null,
  getWidgetInfo: jest.fn(async () => []),
  requestWidgetUpdate: jest.fn(async () => undefined),
  requestPinWidget: jest.fn(async () => true),
}));

const mocked = jest.mocked(AndroidWidget);

function info(widgetName: string, widgetId: number): WidgetInfo {
  return { widgetName, widgetId, width: 200, height: 200, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320, fontScale: 1 } };
}

const VALUES: WidgetValues = {
  v: 1,
  kind: 'values',
  language: 'en',
  day: '2026-11-25',
  syncedAt: 1_795_000_000,
  readiness: { value: 72, reason: null },
  calibrating: false,
  sleep: { value: null, reason: 'no-sleep' },
  load: { value: 12.4, reason: null },
  restingHr: { value: 52, reason: null },
  hrv: { value: 64, reason: null },
};

interface Collected {
  texts: string[];
  clickActions: string[];
}

function collect(node: ReactNode, out: Collected = { texts: [], clickActions: [] }): Collected {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const element = node as ReactElement<{ text?: string; clickAction?: string; children?: ReactNode }>;
  if (element.props.clickAction !== undefined) out.clickActions.push(element.props.clickAction);
  if (element.type === AndroidWidget.TextWidget && element.props.text !== undefined) out.texts.push(element.props.text);
  if (element.type === AndroidWidget.FlexWidget || element.type === AndroidWidget.TextWidget) return collect(element.props.children, out);
  if (typeof element.type === 'function') return collect((element.type as (props: object) => ReactNode)(element.props), out);
  return out;
}

function both(representation: WidgetRepresentation): [Collected, Collected] {
  if (!('light' in representation)) throw new Error('expected light and dark variants');
  return [collect(representation.light), collect(representation.dark)];
}

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'android');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('widget rendering', () => {
  it('renders the scores, the reasons and the sync age in light and dark, and opens the app on tap', () => {
    const [light, dark] = both(renderWidget('OpenHoopOverview', currentView(VALUES, new Date('2026-11-25T12:00:00Z'))));
    expect(light.texts).toEqual(dark.texts);
    expect(light.texts).toEqual(expect.arrayContaining(['Readiness', '72%', 'Sleep score', '–', 'No sleep recorded', 'Load', '12.4', 'Resting HR 52 bpm', 'HRV 64 ms']));
    expect(light.texts.some((text) => text.startsWith('Synced'))).toBe(true);
    expect(light.clickActions).toEqual(['OPEN_APP']);
  });

  it('shows the small widget without the vitals', () => {
    const [light] = both(renderWidget('OpenHoopScores', currentView(VALUES)));
    expect(light.texts).toContain('72%');
    expect(light.texts.some((text) => text.includes('bpm'))).toBe(false);
  });
});

describe('widget task handler', () => {
  function props(widgetAction: WidgetTaskHandlerProps['widgetAction'], name = 'OpenHoopScores', id = 1): WidgetTaskHandlerProps & { renderWidget: jest.Mock } {
    return { widgetInfo: info(name, id), widgetAction, renderWidget: jest.fn() };
  }

  it('draws the stored snapshot on add and update', async () => {
    writeWidgetFile(VALUES);
    const added = props('WIDGET_ADDED');
    await widgetTaskHandler(added);
    const drawn = added.renderWidget.mock.calls[0]?.[0] as WidgetRepresentation;
    expect(both(drawn)[0].texts).toContain('72%');
    const updated = props('WIDGET_UPDATE', 'OpenHoopOverview', 2);
    await widgetTaskHandler(updated);
    expect(updated.renderWidget).toHaveBeenCalledTimes(1);
  });

  it('asks to open the app when nothing is stored', async () => {
    const added = props('WIDGET_ADDED');
    await widgetTaskHandler(added);
    const drawn = added.renderWidget.mock.calls[0]?.[0] as WidgetRepresentation;
    expect(both(drawn)[0].texts.length).toBe(2);
  });

  it('deletes the snapshot when the last widget is removed', async () => {
    writeWidgetFile(VALUES);
    mocked.getWidgetInfo.mockImplementation(async (name: string) => (name === 'OpenHoopScores' ? [info(name, 1)] : [info(name, 2)]));
    await widgetTaskHandler(props('WIDGET_DELETED', 'OpenHoopScores', 1));
    expect(readWidgetFile()).toEqual(VALUES);
    mocked.getWidgetInfo.mockImplementation(async (name: string) => (name === 'OpenHoopScores' ? [info(name, 1)] : []));
    await widgetTaskHandler(props('WIDGET_DELETED', 'OpenHoopScores', 1));
    expect(readWidgetFile()).toBeNull();
    expect(mockFiles.size).toBe(0);
  });
});

describe('android widget bridge', () => {
  it('writes the snapshot and redraws every widget kind', async () => {
    mocked.getWidgetInfo.mockImplementation(async (name: string) => (name === 'OpenHoopScores' ? [info(name, 1)] : []));
    expect(await androidWidgetBridge.placed()).toBe(1);
    await androidWidgetBridge.publish(VALUES);
    expect(readWidgetFile()).toEqual(VALUES);
    expect(mocked.requestWidgetUpdate.mock.calls.map(([request]) => request.widgetName)).toEqual(['OpenHoopScores', 'OpenHoopOverview']);
    await androidWidgetBridge.clear();
    expect(readWidgetFile()).toBeNull();
  });

  it('stores nothing on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(await androidWidgetBridge.placed()).toBe(0);
    await androidWidgetBridge.publish(VALUES);
    expect(mockFiles.size).toBe(0);
    expect(mocked.getWidgetInfo).not.toHaveBeenCalled();
  });

  it('ignores a damaged file', () => {
    mockFiles.set('file:///cache/openhoop-widget.json', '{"v":1,"kind":"values"}');
    expect(readWidgetFile()).toBeNull();
  });
});
