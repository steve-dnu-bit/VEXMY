import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BOOKING_TYPE_VALUES, type BookingTypeValue } from "@/lib/bookingTypes";
import { getBookingDepositStatus, type BookingDepositLookup } from "@/lib/serviceDeposit";

export function useScheduleI18n() {
  const { t } = useTranslation();

  const bookingTypeLabel = useCallback(
    (value: string) => t(`schedule.bookingTypes.${value}`, { defaultValue: value.replace(/-/g, " ") }),
    [t],
  );

  const bookingTypeOptions = useMemo(
    () =>
      BOOKING_TYPE_VALUES.map((value) => ({
        value,
        label: t(`schedule.bookingTypes.${value}`),
      })),
    [t],
  );

  const statusLabel = useCallback((status: string) => t(`schedule.status.${status}`, { defaultValue: status }), [t]);

  const tattooSizeLabel = useCallback((size: string) => t(`schedule.tattooSizes.${size}`, { defaultValue: size }), [t]);

  const depositLabel = useCallback((paid: boolean) => (paid ? t("schedule.depositPaid") : t("schedule.depositPending")), [t]);

  const depositStatusLabel = useCallback(
    (booking: BookingDepositLookup, shopDefaultAmount: number) => {
      const status = getBookingDepositStatus(booking, shopDefaultAmount);
      if (status === "not_required") return t("services.noDeposit");
      if (status === "paid") return t("schedule.depositPaid");
      return t("schedule.depositPending");
    },
    [t],
  );

  const blockerKindLabel = useCallback(
    (kind: string) => t(`schedule.blockerKinds.${kind}`, { defaultValue: kind }),
    [t],
  );

  return { t, bookingTypeLabel, bookingTypeOptions, statusLabel, tattooSizeLabel, depositLabel, depositStatusLabel, blockerKindLabel };
}

export function useBookingTypeLabelI18n() {
  const { bookingTypeLabel } = useScheduleI18n();
  return bookingTypeLabel;
}
