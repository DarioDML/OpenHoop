/*
 * UNTESTED until day 1.
 *
 * This is the only code in the repository that talks to a real Bluetooth adapter. It has never run
 * against a WHOOP band: the bands have not arrived, the simulator replaces this class in every test,
 * and the native @stoprocent/noble module is never loaded by the test suite. What is checked offline
 * is only the pure part in matching.ts. Everything below (scan filtering, GATT discovery, notification
 * subscription, Windows pairing) is written against the library's documented API and must be
 * confirmed on the first real connection, for example with `openhoop triage`.
 */
import type { BondResult, DiscoveredDevice, GattService, Transport } from '@openhoop/core';
import { GATT } from '@openhoop/protocol';
import type { Characteristic, Noble, Peripheral } from '@stoprocent/noble';
import { interpretPairingError, isBandAdvertisement, normalizeUuid } from './matching';

const POWER_ON_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 20_000;
const DISCOVER_TIMEOUT_MS = 30_000;
const IO_TIMEOUT_MS = 10_000;
const PAIR_TIMEOUT_MS = 90_000;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)} s`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function slot(service: string, characteristic: string): string {
  return `${normalizeUuid(service)}/${normalizeUuid(characteristic)}`;
}

interface Notification {
  characteristic: Characteristic;
  listeners: number;
}

export class NobleTransport implements Transport {
  private noble: Noble | null = null;
  private peripheral: Peripheral | null = null;
  private readonly seen = new Map<string, Peripheral>();
  private characteristics = new Map<string, Characteristic>();
  private readonly notifications = new Map<string, Notification>();
  private readonly disconnectCallbacks = new Set<() => void>();

  private async adapter(): Promise<Noble> {
    if (this.noble !== null) return this.noble;
    const module = await import('@stoprocent/noble');
    const noble = module.default;
    try {
      await noble.waitForPoweredOnAsync(POWER_ON_TIMEOUT_MS);
    } catch {
      throw new Error(`Bluetooth adapter is not powered on (state: ${noble.state}). Turn Bluetooth on in Windows settings.`);
    }
    this.noble = noble;
    return noble;
  }

  async scan(timeoutMs: number): Promise<DiscoveredDevice[]> {
    const noble = await this.adapter();
    const found = new Map<string, DiscoveredDevice>();
    const onDiscover = (peripheral: Peripheral): void => {
      if (!isBandAdvertisement(peripheral.advertisement)) return;
      this.seen.set(peripheral.id, peripheral);
      const name = peripheral.advertisement.localName;
      found.set(peripheral.id, {
        id: peripheral.id,
        name: name === undefined || name === '' ? null : name,
        rssi: Number.isFinite(peripheral.rssi) ? peripheral.rssi : null,
      });
    };
    noble.on('discover', onDiscover);
    try {
      await noble.startScanningAsync([], true);
      await pause(timeoutMs);
    } finally {
      noble.removeListener('discover', onDiscover);
      await noble.stopScanningAsync().catch(() => undefined);
    }
    return [...found.values()];
  }

  async connect(id: string): Promise<void> {
    const noble = await this.adapter();
    const known = this.seen.get(id);
    let peripheral: Peripheral;
    if (known === undefined) {
      peripheral = await withTimeout(noble.connectAsync(id), CONNECT_TIMEOUT_MS, 'connecting');
    } else {
      await withTimeout(known.connectAsync(), CONNECT_TIMEOUT_MS, 'connecting');
      peripheral = known;
    }
    this.peripheral = peripheral;
    this.characteristics = new Map();
    peripheral.once('disconnect', () => this.handleDisconnect());
  }

  async disconnect(): Promise<void> {
    const peripheral = this.peripheral;
    if (peripheral === null) return;
    await withTimeout(peripheral.disconnectAsync(), IO_TIMEOUT_MS, 'disconnecting');
  }

  async services(): Promise<GattService[]> {
    const peripheral = this.requirePeripheral();
    const { services } = await withTimeout(
      peripheral.discoverAllServicesAndCharacteristicsAsync(),
      DISCOVER_TIMEOUT_MS,
      'GATT discovery',
    );
    this.characteristics = new Map();
    return services.map((service) => ({
      uuid: normalizeUuid(service.uuid),
      characteristics: service.characteristics.map((characteristic) => {
        this.characteristics.set(slot(service.uuid, characteristic.uuid), characteristic);
        return { uuid: normalizeUuid(characteristic.uuid), properties: [...characteristic.properties] };
      }),
    }));
  }

  async read(service: string, characteristic: string): Promise<Uint8Array> {
    const target = await this.locate(service, characteristic);
    const data = await withTimeout(target.readAsync(), IO_TIMEOUT_MS, 'reading');
    return new Uint8Array(data);
  }

  async write(service: string, characteristic: string, data: Uint8Array): Promise<void> {
    const target = await this.locate(service, characteristic);
    const acknowledged = target.properties.includes('write');
    await withTimeout(target.writeAsync(Buffer.from(data), !acknowledged), IO_TIMEOUT_MS, 'writing');
  }

  async subscribe(
    service: string,
    characteristic: string,
    onData: (data: Uint8Array) => void,
  ): Promise<() => Promise<void>> {
    const target = await this.locate(service, characteristic);
    const key = slot(service, characteristic);
    const listener = (data: Buffer): void => onData(new Uint8Array(data));
    target.on('data', listener);
    const active = this.notifications.get(key);
    if (active === undefined) {
      try {
        await withTimeout(target.subscribeAsync(), IO_TIMEOUT_MS, 'subscribing');
      } catch (error) {
        target.removeListener('data', listener);
        throw error;
      }
      this.notifications.set(key, { characteristic: target, listeners: 1 });
    } else {
      active.listeners += 1;
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      target.removeListener('data', listener);
      const current = this.notifications.get(key);
      if (current === undefined) return;
      current.listeners -= 1;
      if (current.listeners > 0) return;
      this.notifications.delete(key);
      await withTimeout(target.unsubscribeAsync(), IO_TIMEOUT_MS, 'unsubscribing');
    };
  }

  async bond(): Promise<BondResult> {
    const peripheral = this.requirePeripheral();
    if (process.platform !== 'win32') return 'unsupported';
    try {
      await withTimeout(peripheral.pairAsync(), PAIR_TIMEOUT_MS, 'pairing');
      return 'bonded';
    } catch (error) {
      const result = interpretPairingError(error);
      if (result === null) throw error;
      return result;
    }
  }

  onDisconnect(callback: () => void): () => void {
    this.disconnectCallbacks.add(callback);
    return () => {
      this.disconnectCallbacks.delete(callback);
    };
  }

  async dispose(): Promise<void> {
    this.noble?.stop();
  }

  private requirePeripheral(): Peripheral {
    if (this.peripheral === null) throw new Error('not connected');
    return this.peripheral;
  }

  private async locate(service: string, characteristic: string): Promise<Characteristic> {
    const key = slot(service, characteristic);
    const cached = this.characteristics.get(key);
    if (cached !== undefined) return cached;
    await this.services();
    const found = this.characteristics.get(key);
    if (found === undefined) {
      throw new Error(`characteristic ${characteristic} of service ${service} not found on the band`);
    }
    return found;
  }

  private handleDisconnect(): void {
    this.peripheral = null;
    this.notifications.clear();
    this.characteristics = new Map();
    for (const callback of [...this.disconnectCallbacks]) {
      try {
        callback();
      } catch {
        continue;
      }
    }
  }
}

export const BAND_SERVICE_UUID: string = normalizeUuid(GATT.service);
