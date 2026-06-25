import type { EmailAttachment } from "./email.ts";

export type IcsBookingEvent = {
  uid: string;
  title: string;
  description: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  organizerName: string;
  organizerEmail: string;
  attendeeName?: string;
  attendeeEmail?: string;
  method: "REQUEST" | "CANCEL" | "PUBLISH";
  status: "CONFIRMED" | "CANCELLED";
};

function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function foldIcsLine(line: string): string {
  const max = 73;
  if (line.length <= max) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, max));
  rest = rest.slice(max);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, max - 1));
    rest = rest.slice(max - 1);
  }
  return parts.join("\r\n");
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildBookingIcs(event: IcsBookingEvent): string {
  const now = toIcsUtc(new Date().toISOString());
  const prodId = event.organizerName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "Studio";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${prodId}//Booking//EN`,
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toIcsUtc(event.startsAt)}`,
    `DTEND:${toIcsUtc(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `STATUS:${event.status}`,
    `ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:${event.organizerEmail}`,
  ];

  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.attendeeEmail) {
    const cn = event.attendeeName ? escapeIcsText(event.attendeeName) : "Guest";
    lines.push(`ATTENDEE;CN=${cn};RSVP=TRUE:mailto:${event.attendeeEmail}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}

export function bookingIcsAttachment(event: IcsBookingEvent): EmailAttachment {
  const content = buildBookingIcs(event);
  return {
    filename: event.status === "CANCELLED" ? "booking-cancelled.ics" : "booking.ics",
    content,
    contentType: `text/calendar; charset=utf-8; method=${event.method}`,
    contentDisposition: "attachment",
  };
}
