let cachedLocationId: string | null = null;

export function setCachedTerminalLocationId(locationId: string | null): void {
  cachedLocationId = locationId?.trim() || null;
}

export function getCachedTerminalLocationId(): string | null {
  return cachedLocationId;
}
