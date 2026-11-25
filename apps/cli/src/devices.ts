import type { BandModel, DeviceRow, DiscoveredDevice } from '@stoop/core';
import { CliError } from './args';

function matches(selector: string, id: string, name: string | null): boolean {
  const wanted = selector.trim().toLowerCase();
  if (wanted.length === 0) return false;
  return id.toLowerCase() === wanted || id.toLowerCase().includes(wanted) || (name?.toLowerCase().includes(wanted) ?? false);
}

export function describeStored(device: DeviceRow): string {
  return `#${device.id} ${device.name ?? '(unnamed)'} ${device.bleId}`;
}

export function describeFound(device: DiscoveredDevice): string {
  const rssi = device.rssi === null ? '' : `  ${device.rssi} dBm`;
  return `${device.name ?? '(no name)'}  ${device.id}${rssi}`;
}

export function chooseStored(devices: readonly DeviceRow[], selector: string | undefined): DeviceRow {
  if (selector !== undefined) {
    const byNumber = /^\d+$/.test(selector) ? devices.find((d) => d.id === Number(selector)) : undefined;
    const hits = byNumber === undefined ? devices.filter((d) => matches(selector, d.bleId, d.name)) : [byNumber];
    const [only, ...rest] = hits;
    if (only === undefined) throw new CliError(`no stored device matches "${selector}"`);
    if (rest.length > 0) throw new CliError(`"${selector}" matches several stored devices:\n${hits.map(describeStored).join('\n')}`);
    return only;
  }
  const [only, ...rest] = devices;
  if (only === undefined) {
    throw new CliError('the database has no device yet. Run `stoop sim --days 3`, or `stoop sync` with a band, first.');
  }
  if (rest.length > 0) {
    throw new CliError(`the database has several devices, pick one with --device:\n${devices.map(describeStored).join('\n')}`);
  }
  return only;
}

export function chooseScanned(
  found: readonly DiscoveredDevice[],
  stored: readonly DeviceRow[],
  selector: string | undefined,
): DiscoveredDevice {
  if (found.length === 0) {
    throw new CliError('no band found. Wear it or put it on its charger, keep it close to the laptop, and try again.');
  }
  if (selector !== undefined) {
    const hits = found.filter((d) => matches(selector, d.id, d.name));
    const [only, ...rest] = hits;
    if (only === undefined) throw new CliError(`no band found that matches "${selector}"`);
    if (rest.length > 0) throw new CliError(`"${selector}" matches several bands:\n${hits.map(describeFound).join('\n')}`);
    return only;
  }
  const [only, ...rest] = found;
  if (only !== undefined && rest.length === 0) return only;
  const known = found.filter((d) => stored.some((s) => s.bleId === d.id));
  const [familiar, ...others] = known;
  if (familiar !== undefined && others.length === 0) return familiar;
  throw new CliError(`several bands found, pick one with --device:\n${found.map(describeFound).join('\n')}`);
}

export function modelFromText(text: string | null): BandModel | null {
  if (text === null) return null;
  if (/\bMG\b/i.test(text)) return 'MG';
  if (/5\.0|\b5\b/.test(text)) return '5.0';
  return null;
}
