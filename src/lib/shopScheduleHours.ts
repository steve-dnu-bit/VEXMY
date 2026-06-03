import { supabase } from "@/integrations/supabase/client";
import { loadShopSettings } from "@/lib/shopSettings";

export const SCHEDULE_SLOT_MINUTES = 15;

export type ScheduleBufferAt = "start" | "end" | "both";

export interface ShopScheduleHours {
  openTime: string;
  closeTime: string;
  extraBufferMinutes: number;
  extraBufferAt: ScheduleBufferAt;
}

export interface ScheduleTimeSlot {
  hour: number;
  minute: number;
  minutes: number;
  isBuffer: boolean;
  isOpenHours: boolean;
}

export const defaultShopScheduleHours: ShopScheduleHours = {
  openTime: "11:00",
  closeTime: "23:00",
  extraBufferMinutes: 60,
  extraBufferAt: "end",
};

export function normalizeTimeValue(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseTimeToMinutes(time: string): number {
  const normalized = normalizeTimeValue(time, "00:00");
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapToScheduleSlot(minutes: number): number {
  return Math.round(minutes / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;
}

export function getScheduleGridRange(hours: ShopScheduleHours) {
  const openMinutes = parseTimeToMinutes(hours.openTime);
  const closeMinutes = Math.max(openMinutes + SCHEDULE_SLOT_MINUTES, parseTimeToMinutes(hours.closeTime));
  const buffer = Math.max(0, hours.extraBufferMinutes || 0);
  const at = hours.extraBufferAt;
  const gridStartMinutes =
    at === "start" || at === "both" ? Math.max(0, openMinutes - buffer) : openMinutes;
  const gridEndMinutes =
    at === "end" || at === "both"
      ? Math.min(24 * 60, closeMinutes + buffer)
      : Math.min(24 * 60, closeMinutes);

  return { gridStartMinutes, gridEndMinutes, openMinutes, closeMinutes };
}

export function buildScheduleSlots(hours: ShopScheduleHours): ScheduleTimeSlot[] {
  const { gridStartMinutes, gridEndMinutes, openMinutes, closeMinutes } = getScheduleGridRange(hours);
  const slots: ScheduleTimeSlot[] = [];

  for (let m = gridStartMinutes; m < gridEndMinutes; m += SCHEDULE_SLOT_MINUTES) {
    const inOpen = m >= openMinutes && m < closeMinutes;
    slots.push({
      hour: Math.floor(m / 60),
      minute: m % 60,
      minutes: m,
      isBuffer: !inOpen,
      isOpenHours: inOpen,
    });
  }

  return slots;
}

export function rowFromScheduleTime(
  minutes: number,
  gridStartMinutes: number,
  rowH: number,
  slotMinutes = SCHEDULE_SLOT_MINUTES,
): number {
  return ((minutes - gridStartMinutes) / slotMinutes) * rowH;
}

function rowToShopScheduleHours(row: {
  schedule_open_time?: string | null;
  schedule_close_time?: string | null;
  schedule_extra_buffer_minutes?: number | null;
  schedule_extra_buffer_at?: string | null;
}): ShopScheduleHours {
  return {
    openTime: normalizeTimeValue(row.schedule_open_time, defaultShopScheduleHours.openTime),
    closeTime: normalizeTimeValue(row.schedule_close_time, defaultShopScheduleHours.closeTime),
    extraBufferMinutes:
      typeof row.schedule_extra_buffer_minutes === "number"
        ? row.schedule_extra_buffer_minutes
        : defaultShopScheduleHours.extraBufferMinutes,
    extraBufferAt:
      row.schedule_extra_buffer_at === "start" ||
      row.schedule_extra_buffer_at === "end" ||
      row.schedule_extra_buffer_at === "both"
        ? row.schedule_extra_buffer_at
        : defaultShopScheduleHours.extraBufferAt,
  };
}

export async function loadShopScheduleHours(): Promise<ShopScheduleHours> {
  const shop = await loadShopSettings();
  if (!shop?.id) return { ...defaultShopScheduleHours };

  const { data, error } = await supabase
    .from("shop_settings" as any)
    .select(
      "schedule_open_time, schedule_close_time, schedule_extra_buffer_minutes, schedule_extra_buffer_at",
    )
    .eq("id", shop.id)
    .maybeSingle();

  if (error || !data) return { ...defaultShopScheduleHours };
  return rowToShopScheduleHours(data);
}

export async function saveShopScheduleHours(hours: ShopScheduleHours): Promise<{ error: string | null }> {
  const openMinutes = parseTimeToMinutes(hours.openTime);
  const closeMinutes = parseTimeToMinutes(hours.closeTime);
  if (closeMinutes <= openMinutes) {
    return { error: "Close time must be after open time" };
  }

  const shop = await loadShopSettings();
  if (!shop?.id) return { error: "Shop settings not found" };

  const { error } = await supabase
    .from("shop_settings" as any)
    .update({
      schedule_open_time: normalizeTimeValue(hours.openTime, defaultShopScheduleHours.openTime),
      schedule_close_time: normalizeTimeValue(hours.closeTime, defaultShopScheduleHours.closeTime),
      schedule_extra_buffer_minutes: Math.max(0, Math.min(180, hours.extraBufferMinutes || 0)),
      schedule_extra_buffer_at:
        hours.extraBufferAt === "start" || hours.extraBufferAt === "both" ? hours.extraBufferAt : "end",
      updated_at: new Date().toISOString(),
    })
    .eq("id", shop.id);

  return { error: error?.message ?? null };
}
