import type { ReaderInterface } from "@capacitor-community/stripe-terminal";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function mergeDiscoveredReaders(...groups: Array<ReaderInterface[] | undefined>): ReaderInterface[] {
  const merged = new Map<string, ReaderInterface>();
  for (const group of groups) {
    for (const reader of group ?? []) {
      const key = reader.serialNumber || reader.label || String(reader.id);
      if (key) merged.set(key, reader);
    }
  }
  return Array.from(merged.values());
}
