import { STORAGE_PREFIX } from "@/lib/branding";

const SEEN_PREFIX = `${STORAGE_PREFIX}.ttpoi_awareness_seen:`;
const PUSH_SENT_PREFIX = `${STORAGE_PREFIX}.ttpoi_awareness_push_sent:`;

function keyFor(prefix: string, organizationId: string, userId: string): string {
  return `${prefix}${organizationId}:${userId}`;
}

export function hasSeenTapToPayAwareness(organizationId: string, userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(SEEN_PREFIX, organizationId, userId)) === "1";
  } catch {
    return false;
  }
}

export function markTapToPayAwarenessSeen(organizationId: string, userId: string): void {
  try {
    localStorage.setItem(keyFor(SEEN_PREFIX, organizationId, userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasSentTapToPayAwarenessPush(organizationId: string, userId: string): boolean {
  try {
    return localStorage.getItem(keyFor(PUSH_SENT_PREFIX, organizationId, userId)) === "1";
  } catch {
    return false;
  }
}

export function markTapToPayAwarenessPushSent(organizationId: string, userId: string): void {
  try {
    localStorage.setItem(keyFor(PUSH_SENT_PREFIX, organizationId, userId), "1");
  } catch {
    /* ignore */
  }
}
