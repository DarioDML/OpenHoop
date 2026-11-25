export interface DiscoveredDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface GattService {
  uuid: string;
  characteristics: { uuid: string; properties: string[] }[];
}

export type BondResult = 'bonded' | 'already-bonded' | 'refused' | 'unsupported';

export interface Transport {
  scan(timeoutMs: number): Promise<DiscoveredDevice[]>;
  connect(id: string): Promise<void>;
  disconnect(): Promise<void>;
  services(): Promise<GattService[]>;
  read(service: string, characteristic: string): Promise<Uint8Array>;
  write(service: string, characteristic: string, data: Uint8Array): Promise<void>;
  subscribe(
    service: string,
    characteristic: string,
    onData: (data: Uint8Array) => void,
  ): Promise<() => Promise<void>>;
  bond(): Promise<BondResult>;
  onDisconnect(callback: () => void): () => void;
}
