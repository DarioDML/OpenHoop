import { PermissionsAndroid, Platform } from 'react-native';
import BleManager, { BleState } from 'react-native-ble-manager';

import { BleManagerTransport } from '@/ble/bleManagerTransport';
import { BleError } from '@/ble/errors';

type StateListener = (event: { state: BleState }) => void;

const mockStateListeners = new Set<StateListener>();

jest.mock('@openhoop/protocol', () => ({ GATT: { service: 'fd4b0001-0000-1000-8000-00805f9b34fb' } }));

jest.mock('react-native-ble-manager', () => {
  const subscription = () => ({ remove: jest.fn() });
  return {
    __esModule: true,
    BleState: {
      Unknown: 'unknown',
      Resetting: 'resetting',
      Unsupported: 'unsupported',
      Unauthorized: 'unauthorized',
      On: 'on',
      Off: 'off',
      TurningOn: 'turning_on',
      TurningOff: 'turning_off',
    },
    BleScanMode: { LowLatency: 2 },
    ConnectionPriority: { high: 1 },
    default: {
      start: jest.fn(() => Promise.resolve()),
      checkState: jest.fn(() => Promise.resolve('on')),
      connect: jest.fn(() => Promise.resolve()),
      retrieveServices: jest.fn(() => Promise.resolve({ services: [], characteristics: [] })),
      requestMTU: jest.fn(() => Promise.resolve(247)),
      requestConnectionPriority: jest.fn(() => Promise.resolve(true)),
      getMaximumWriteValueLengthForWithResponse: jest.fn(() => Promise.resolve(182)),
      write: jest.fn(() => Promise.resolve()),
      getBondedPeripherals: jest.fn(() => Promise.reject(new Error('not supported'))),
      createBond: jest.fn(() => Promise.reject(new Error('not supported'))),
      onDidUpdateState: jest.fn((listener: StateListener) => {
        mockStateListeners.add(listener);
        return { remove: () => mockStateListeners.delete(listener) };
      }),
      onDidUpdateValueForCharacteristic: jest.fn(subscription),
      onDisconnectPeripheral: jest.fn(subscription),
    },
  };
});

const ble = jest.mocked(BleManager);

function setPlatform(os: 'ios' | 'android'): void {
  jest.replaceProperty(Platform, 'OS', os);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStateListeners.clear();
  setPlatform('ios');
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('BleManagerTransport on iOS', () => {
  it('leaves pairing to the system instead of calling the Android-only bond API', async () => {
    const transport = new BleManagerTransport();
    await transport.connect('peripheral-uuid');

    await expect(transport.bond()).resolves.toBe('unsupported');
    expect(ble.getBondedPeripherals).not.toHaveBeenCalled();
    expect(ble.createBond).not.toHaveBeenCalled();
  });

  it('sizes write chunks from the length iOS negotiated', async () => {
    const transport = new BleManagerTransport();
    await transport.connect('peripheral-uuid');
    await transport.write('fd4b0001', 'fd4b0002', new Uint8Array(4));

    expect(ble.requestMTU).not.toHaveBeenCalled();
    expect(ble.requestConnectionPriority).not.toHaveBeenCalled();
    expect(ble.write).toHaveBeenCalledWith('peripheral-uuid', 'fd4b0001', 'fd4b0002', [0, 0, 0, 0], 182);
  });

  it('waits for the radio to report its state after start-up', async () => {
    ble.checkState.mockResolvedValueOnce(BleState.Unknown);
    const transport = new BleManagerTransport();
    const prepared = transport.prepare();
    for (let tick = 0; tick < 20 && mockStateListeners.size === 0; tick++) await Promise.resolve();
    expect(mockStateListeners.size).toBe(1);
    for (const listener of mockStateListeners) listener({ state: BleState.On });

    await expect(prepared).resolves.toBeUndefined();
  });

  it('reports a refused Bluetooth permission as a permission failure', async () => {
    ble.checkState.mockResolvedValueOnce(BleState.Unauthorized);
    const transport = new BleManagerTransport();

    const failure = await transport.prepare().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BleError);
    expect((failure as BleError).failure).toBe('permission');
  });

  it('gives up waiting when the radio never reports a state', async () => {
    jest.useFakeTimers();
    ble.checkState.mockResolvedValueOnce(BleState.Unknown);
    const transport = new BleManagerTransport();
    const prepared = transport.prepare().catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(5000);

    const failure = await prepared;
    expect(failure).toBeInstanceOf(BleError);
    expect((failure as BleError).failure).toBe('off');
  });
});

describe('BleManagerTransport on Android', () => {
  beforeEach(() => {
    setPlatform('android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    type Granted = Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
    const allGranted = Object.fromEntries(
      Object.values(PermissionsAndroid.PERMISSIONS).map((permission) => [permission, PermissionsAndroid.RESULTS.GRANTED]),
    ) as Granted;
    jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(allGranted);
  });

  it('still bonds explicitly and negotiates the MTU', async () => {
    ble.getBondedPeripherals.mockResolvedValueOnce([]);
    ble.createBond.mockResolvedValueOnce(undefined);
    const transport = new BleManagerTransport();
    await transport.connect('AA:BB:CC:DD:EE:FF');
    await transport.write('fd4b0001', 'fd4b0002', new Uint8Array(1));

    await expect(transport.bond()).resolves.toBe('bonded');
    expect(ble.requestMTU).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', 247);
    expect(ble.write).toHaveBeenCalledWith('AA:BB:CC:DD:EE:FF', 'fd4b0001', 'fd4b0002', [0], 244);
  });
});
