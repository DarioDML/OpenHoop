export interface BuzzGate {
  connected(): boolean;
  syncing(): boolean;
  exclusive<T>(task: () => Promise<T>): Promise<T>;
  buzz(): Promise<void>;
}

export async function buzzIfConnected(gate: BuzzGate): Promise<boolean> {
  if (gate.syncing() || !gate.connected()) return false;
  try {
    return await gate.exclusive(async () => {
      if (gate.syncing() || !gate.connected()) return false;
      await gate.buzz();
      return true;
    });
  } catch {
    return false;
  }
}
