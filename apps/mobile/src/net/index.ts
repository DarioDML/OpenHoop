import { defaultNetworkPrefs, type NetworkPrefs } from './features';
import { createGate, type GatedFetch } from './gate';

let current: NetworkPrefs = defaultNetworkPrefs();

export function setNetworkPrefs(prefs: NetworkPrefs): void {
  current = prefs;
}

export function currentNetworkPrefs(): NetworkPrefs {
  return current;
}

export const netFetch: GatedFetch = createGate(
  () => current,
  (url, init) => fetch(url, init),
);
