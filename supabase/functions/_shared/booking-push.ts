import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { BOOKING_DISPLAY_TIMEZONE } from "./email.ts";
import { sendPushToUser, type PushDeliveryResult } from "./push-notify.ts";

type BookingPushAction = "created" | "updated" | "deleted" | "deposit_confirmed";

type BookingPushBooking = {
  id: string;
  artist_id: string;
  client_user_id?: string | null;
  client_name: string;
  starts_at: string;
};

function formatWhen(startsAt: string): string {
  try {
    return new Date(startsAt).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: BOOKING_DISPLAY_TIMEZONE,
    });
  } catch {
    return startsAt;
  }
}

function bookingPushCopy(
  action: BookingPushAction,
  role: "artist" | "customer",
  booking: BookingPushBooking,
  shopName: string,
): { title: string; body: string; path: string } {
  const when = formatWhen(booking.starts_at);
  const client = booking.client_name || "Client";

  if (role === "artist") {
    if (action === "created") {
      return {
        title: `New booking — ${shopName}`,
        body: `${client} · ${when}`,
        path: "/schedule",
      };
    }
    if (action === "deposit_confirmed") {
      return {
        title: `Appointment confirmed — ${shopName}`,
        body: `${client} confirmed · ${when}`,
        path: "/schedule",
      };
    }
    if (action === "updated") {
      return {
        title: `Booking updated — ${shopName}`,
        body: `${client} · ${when}`,
        path: "/schedule",
      };
    }
    return {
      title: `Booking cancelled — ${shopName}`,
      body: `${client} · ${when}`,
      path: "/schedule",
    };
  }

  if (action === "created") {
    return {
      title: `Appointment confirmed — ${shopName}`,
      body: when,
      path: "/account",
    };
  }
  if (action === "updated") {
    return {
      title: `Appointment updated — ${shopName}`,
      body: when,
      path: "/account",
    };
  }
  return {
    title: `Appointment cancelled — ${shopName}`,
    body: when,
    path: "/account",
  };
}

async function sendArtistBookingPush(
  admin: SupabaseClient,
  action: BookingPushAction,
  booking: BookingPushBooking,
  shopName: string,
): Promise<PushDeliveryResult> {
  const artistCopy = bookingPushCopy(action, "artist", booking, shopName);
  return sendPushToUser(admin, booking.artist_id, {
    title: artistCopy.title,
    body: artistCopy.body,
    data: {
      type: "booking",
      action,
      booking_id: booking.id,
      path: artistCopy.path,
    },
  });
}

/** Artist push when a customer confirms by paying their deposit. */
export async function sendDepositConfirmedArtistPush(
  admin: SupabaseClient,
  params: {
    booking: BookingPushBooking;
    shopName: string;
  },
): Promise<PushDeliveryResult> {
  return sendArtistBookingPush(admin, "deposit_confirmed", params.booking, params.shopName);
}

export async function sendBookingPushNotifications(
  admin: SupabaseClient,
  params: {
    action: BookingPushAction;
    booking: BookingPushBooking;
    shopName: string;
  },
): Promise<{ artist: PushDeliveryResult; customer: PushDeliveryResult }> {
  const { action, booking, shopName } = params;

  const artistCopy = bookingPushCopy(action, "artist", booking, shopName);
  const customerCopy = bookingPushCopy(action, "customer", booking, shopName);

  const [artist, customer] = await Promise.all([
    sendPushToUser(admin, booking.artist_id, {
      title: artistCopy.title,
      body: artistCopy.body,
      data: {
        type: "booking",
        action,
        booking_id: booking.id,
        path: artistCopy.path,
      },
    }),
    booking.client_user_id
      ? sendPushToUser(admin, booking.client_user_id, {
          title: customerCopy.title,
          body: customerCopy.body,
          data: {
            type: "booking",
            action,
            booking_id: booking.id,
            path: customerCopy.path,
          },
        })
      : Promise.resolve({ attempted: 0, sent: 0, failed: 0, deactivated: 0, skipped: "no_customer_user" }),
  ]);

  return { artist, customer };
}

export async function sendReminderPushNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    reminderType: "appointment" | "deposit";
    shopName: string;
    whenLabel: string;
    bookingId: string;
  },
): Promise<PushDeliveryResult> {
  const { userId, reminderType, shopName, whenLabel, bookingId } = params;
  const title =
    reminderType === "deposit"
      ? `Deposit reminder — ${shopName}`
      : `Appointment reminder — ${shopName}`;
  const body =
    reminderType === "deposit"
      ? `Deposit due for your appointment on ${whenLabel}`
      : `Your appointment is on ${whenLabel}`;

  return sendPushToUser(admin, userId, {
    title,
    body,
    data: {
      type: "reminder",
      reminder_type: reminderType,
      booking_id: bookingId,
      path: "/account",
    },
  });
}

export async function sendTicketPushNotification(
  admin: SupabaseClient,
  params: {
    recipientId: string;
    senderName: string;
    previewText: string;
    ticketId: string;
    isStaffRecipient: boolean;
    shopName: string;
  },
): Promise<PushDeliveryResult> {
  const path = params.isStaffRecipient
    ? `/inbox?ticketId=${encodeURIComponent(params.ticketId)}`
    : `/account/tickets?ticketId=${encodeURIComponent(params.ticketId)}`;

  return sendPushToUser(admin, params.recipientId, {
    title: `New message — ${params.shopName}`,
    body: `${params.senderName}: ${params.previewText.slice(0, 120)}`,
    data: {
      type: "ticket",
      ticket_id: params.ticketId,
      path,
    },
  });
}
