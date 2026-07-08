import type { ShopBranding } from "./branding.ts";
import { formatBookingDateRange } from "./email.ts";
import type { BookingEmailDetails } from "./email-templates.ts";
import type { EmailLanguage } from "./email-i18n.ts";
import { t } from "./email-i18n.ts";
import { formatShopMoney } from "./shop-currency.ts";

export function isEmailReminderChannel(reminderChannel: string): boolean {
  return reminderChannel === "email" || reminderChannel === "both";
}

export function isSmsReminderChannel(reminderChannel: string): boolean {
  return reminderChannel === "sms" || reminderChannel === "both";
}

export function buildAppointmentReminderSms(
  booking: BookingEmailDetails,
  locale: EmailLanguage,
  brand: ShopBranding,
): string {
  const when = formatBookingDateRange(booking.starts_at, booking.ends_at, locale);
  return t(locale, "sms.reminders.appointment", {
    shopName: brand.shopName,
    when,
    artist: booking.artistName,
  });
}

export function buildDepositReminderSms(
  booking: BookingEmailDetails,
  locale: EmailLanguage,
  brand: ShopBranding,
): string {
  const when = formatBookingDateRange(booking.starts_at, booking.ends_at, locale);
  const amount = booking.deposit_amount
    ? formatShopMoney(Number(booking.deposit_amount), "gbp")
    : t(locale, "depositReminder.amountPlaceholder");
  return t(locale, "sms.reminders.deposit", {
    shopName: brand.shopName,
    when,
    amount,
  });
}
