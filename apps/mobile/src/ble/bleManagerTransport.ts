/*
 * UNTESTED until day 1.
 *
 * This Transport has never run against a physical band: the owner's WHOOP 5.0 / MG bands have not
 * arrived and the Android emulator has no Bluetooth radio. Everything below follows the documented
 * behaviour of react-native-ble-manager 13 and the Android Bluetooth stack. Open points to verify on
 * day 1: which advertisement fields the band exposes (scan accepts the custom service UUID or a name
 * starting with WHOOP), whether the library reports characteristic UUIDs in long or short form
 * (both are normalised), the MTU the band accepts, and whether createBond succeeds without a PIN.
 */
import type { BondResult, DiscoveredDevice, GattService, Transport } from '@stoop/core';
import { GATT } from '@stoop/protocol';
import { PermissionsAndroid, Platform, type EventSubscription, type Permission } from 'react-native';
import BleManager, { BleScanMode, BleState, ConnectionPriority, type Peripheral } from 'react-native-ble-manager';

import { BleError, describeBleRejection } from './errors';
import {
  advertisesService,
  bytesFromNumbers,
  chunkSizeForMtu,
  isBandName,
  normalizeUuid,
  numbersFromBytes,
} from './helpers';

const REQUESTED_MTU = 247;
const DEFAULT_MTU = 23;
const ANDROID_12 = 31;

type Listener = (data: Uint8Array) => void;

function subscriptionKey(service: string, characteristic: string): string {
  return `${normalizeUuid(service)}/${normalizeUuid(characteristic)}`;
}

function peripheralName(peripheral: Peripheral): string | null {
  return peripheral.name ?? peripheral.advertising.localName ?? null;
}

function isBand(peripheral: Peripheral): boolean {
  return isBandName(peripheralName(peripheral)) || advertisesService(peripheral.advertising.serviceUUIDs, GATT.service);
}

async function requestAndroidPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const needed: Permission[] =
    Number(Platform.Version) >= ANDROID_12
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const result = await PermissionsAndroid.requestMultiple(needed);
  for (const permission of needed) {
    if (result[permission] !== PermissionsAndroid.RESULTS.GRANTED) throw new BleError('permission', permission);
  }
}

export class BleManagerTransport implements Transport {
  private peripheralId: string | null = null;
  private mtu = DEFAULT_MTU;
  private started = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly disconnectCallbacks = new Set<() => void>();
  private eventSubscriptions: EventSubscription[] = [];

  async prepare(): Promise<void> {
    await requestAndroidPermissions();
    if (!this.started) {
      try {
        await BleManager.start({ showAlert: false });
      } catch (error) {
        throw new BleError('unavailable', describeBleRejection(error));
      }
      this.started = true;
    }
    let state: BleState;
    try {
      state = await BleManager.checkState();
    } catch (error) {
      throw new BleError('unavailable', describeBleRejection(error));
    }
    if (state === BleState.Unsupported) throw new BleError('unavailable', state);
    if (state !== BleState.On) throw new BleError('off', state);
    this.attachEvents();
  }

  async scan(timeoutMs: number): Promise<DiscoveredDevice[]> {
    await this.prepare();
    const found = new Map<string, DiscoveredDevice>();
    const discover = BleManager.onDiscoverPeripheral((peripheral) => {
      if (!isBand(peripheral)) return;
      found.set(peripheral.id, { id: peripheral.id, name: peripheralName(peripheral), rssi: peripheral.rssi });
    });
    const stop: { subscription: EventSubscription | null } = { subscription: null };
    const stopped = new Promise<void>((resolve) => {
      stop.subscription = BleManager.onStopScan(() => resolve());
    });
    try {
      await BleManager.scan({
        serviceUUIDs: [],
        seconds: Math.max(1, Math.round(timeoutMs / 1000)),
        allowDuplicates: false,
        scanMode: BleScanMode.LowLatency,
      });
      await stopped;
    } catch (error) {
      throw new BleError('unavailable', describeBleRejection(error));
    } finally {
      discover.remove();
      stop.subscription?.remove();
    }
    return [...found.values()];
  }

  async connect(id: string): Promise<void> {
    await this.prepare();
    try {
      await BleManager.connect(id);
      this.peripheralId = id;
      await BleManager.retrieveServices(id);
    } catch (error) {
      this.peripheralId = null;
      throw new BleError('connect', describeBleRejection(error));
    }
    try {
      this.mtu = await BleManager.requestMTU(id, REQUESTED_MTU);
    } catch {
      this.mtu = DEFAULT_MTU;
    }
    try {
      await BleManager.requestConnectionPriority(id, ConnectionPriority.high);
    } catch {
      // the default connection interval still works, only slower
    }
  }

  async disconnect(): Promise<void> {
    const id = this.peripheralId;
    this.peripheralId = null;
    this.listeners.clear();
    if (id === null) return;
    try {
      await BleManager.disconnect(id);
    } catch {
      // already gone
    }
  }

  async services(): Promise<GattService[]> {
    const info = await BleManager.retrieveServices(this.requireId());
    const byService = new Map<string, GattService>();
    for (const service of info.services ?? []) {
      const uuid = normalizeUuid(service.uuid);
      byService.set(uuid, { uuid, characteristics: [] });
    }
    for (const characteristic of info.characteristics ?? []) {
      const key = normalizeUuid(characteristic.service);
      const service = byService.get(key) ?? { uuid: key, characteristics: [] };
      byService.set(key, service);
      service.characteristics.push({
        uuid: normalizeUuid(characteristic.characteristic),
        properties: Object.keys(characteristic.properties).map((property) => property.toLowerCase()),
      });
    }
    return [...byService.values()];
  }

  async read(service: string, characteristic: string): Promise<Uint8Array> {
    return bytesFromNumbers(await BleManager.read(this.requireId(), service, characteristic));
  }

  async write(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    await BleManager.write(this.requireId(), service, characteristic, numbersFromBytes(data), chunkSizeForMtu(this.mtu));
  }

  async subscribe(service: string, characteristic: string, onData: Listener): Promise<() => Promise<void>> {
    const id = this.requireId();
    const key = subscriptionKey(service, characteristic);
    const set = this.listeners.get(key) ?? new Set<Listener>();
    const first = set.size === 0;
    set.add(onData);
    this.listeners.set(key, set);
    if (first) {
      try {
        await BleManager.startNotification(id, service, characteristic);
      } catch (error) {
        set.delete(onData);
        throw new BleError('connect', describeBleRejection(error));
      }
    }
    return async () => {
      set.delete(onData);
      if (set.size === 0 && this.peripheralId === id) {
        this.listeners.delete(key);
        try {
          await BleManager.stopNotification(id, service, characteristic);
        } catch {
          // the link is already down
        }
      }
    };
  }

  async bond(): Promise<BondResult> {
    const id = this.requireId();
    try {
      const bonded = await BleManager.getBondedPeripherals();
      if (bonded.some((peripheral) => peripheral.id === id)) return 'already-bonded';
      await BleManager.createBond(id);
      return 'bonded';
    } catch {
      return 'refused';
    }
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => {
      this.disconnectCallbacks.delete(callback);
    };
  }

  private requireId(): string {
    if (this.peripheralId === null) throw new BleError('connect', 'not connected');
    return this.peripheralId;
  }

  private attachEvents(): void {
    if (this.eventSubscriptions.length > 0) return;
    const update = BleManager.onDidUpdateValueForCharacteristic((event) => {
      const set = this.listeners.get(subscriptionKey(event.service, event.characteristic));
      if (set === undefined) return;
      const data = bytesFromNumbers(event.value);
      for (const listener of [...set]) listener(data);
    });
    const drop = BleManager.onDisconnectPeripheral((event) => {
      if (event.peripheral !== this.peripheralId) return;
      this.peripheralId = null;
      this.listeners.clear();
      for (const callback of [...this.disconnectCallbacks]) callback();
    });
    this.eventSubscriptions = [update, drop];
  }
}
