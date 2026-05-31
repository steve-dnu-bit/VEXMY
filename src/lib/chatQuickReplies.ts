import { format, parseISO } from "date-fns";
import type { ThreadBookingContext } from "./chatThreadContext";

export type QuickReply = {
  id: string;
  label: string;
  text: string;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function buildStaffQuickReplies(
  ctx: ThreadBookingContext,
  origin: string,
  t: TranslateFn,
): QuickReply[] {
  const replies: QuickReply[] = [
    {
      id: "references",
      label: t("chat.quickReplyReferences"),
      text: t("chat.quickReplyReferencesText", { name: ctx.customerName }),
    },
  ];

  if (ctx.booking) {
    const dateLabel = format(parseISO(ctx.booking.starts_at), "EEE d MMM, h:mm a");
    replies.push({
      id: "see-you",
      label: t("chat.quickReplySeeYou"),
      text: t("chat.quickReplySeeYouText", { date: dateLabel }),
    });

    if (!ctx.booking.deposit_paid) {
      const depositUrl = `${origin}/deposit-payment/checkout?bookingId=${encodeURIComponent(ctx.booking.id)}`;
      replies.push({
        id: "deposit",
        label: t("chat.quickReplyDeposit"),
        text: t("chat.quickReplyDepositText", { url: depositUrl }),
      });
    }

    if (!ctx.hasConsent) {
      const consentUrl = `${origin}/consent?bookingId=${encodeURIComponent(ctx.booking.id)}`;
      replies.push({
        id: "consent",
        label: t("chat.quickReplyConsent"),
        text: t("chat.quickReplyConsentText", { url: consentUrl }),
      });
    }
  }

  return replies;
}
