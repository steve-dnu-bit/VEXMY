import { differenceInMinutes, parseISO } from "date-fns";

export type ScheduleBookingSpan = {
  id: string;
  starts_at: string;
  ends_at: string;
};

export type BookingBlockLayout = {
  id: string;
  top: number;
  height: number;
};

/** Stack overlapping bookings vertically within their shared time span. */
export function layoutStackedBookingBlocks(
  bookings: ScheduleBookingSpan[],
  rowH: number,
  firstHour: number,
): Map<string, BookingBlockLayout> {
  const result = new Map<string, BookingBlockLayout>();
  if (bookings.length === 0) return result;

  const pxPerMin = rowH / 60;
  const toTop = (startsAt: string) => {
    const d = parseISO(startsAt);
    return (d.getHours() - firstHour) * rowH + (d.getMinutes() / 60) * rowH;
  };
  const toHeight = (b: ScheduleBookingSpan) =>
    Math.max(24, differenceInMinutes(parseISO(b.ends_at), parseISO(b.starts_at)) * pxPerMin);

  const sorted = [...bookings].sort(
    (a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime(),
  );

  const clusters: ScheduleBookingSpan[][] = [];
  let current: ScheduleBookingSpan[] = [];
  let currentEnd = -1;

  for (const b of sorted) {
    const start = parseISO(b.starts_at).getTime();
    const end = parseISO(b.ends_at).getTime();
    if (current.length === 0 || start < currentEnd) {
      current.push(b);
      currentEnd = Math.max(currentEnd, end);
    } else {
      clusters.push(current);
      current = [b];
      currentEnd = end;
    }
  }
  if (current.length > 0) clusters.push(current);

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const b = cluster[0];
      result.set(b.id, { id: b.id, top: toTop(b.starts_at), height: toHeight(b) });
      continue;
    }

    const tops = cluster.map((b) => toTop(b.starts_at));
    const bottoms = cluster.map((b) => toTop(b.starts_at) + toHeight(b));
    const clusterTop = Math.min(...tops);
    const clusterBottom = Math.max(...bottoms);
    const slice = (clusterBottom - clusterTop) / cluster.length;

    cluster.forEach((b, i) => {
      result.set(b.id, {
        id: b.id,
        top: clusterTop + i * slice + 1,
        height: Math.max(22, slice - 2),
      });
    });
  }

  return result;
}
