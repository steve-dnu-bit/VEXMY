"""
Merge ExportContacts CSV + Appointments.xlsx into one Supabase `bookings`-compatible CSV.

Usage:
  python scripts/merge_contacts_and_appointments_for_supabase_bookings.py \\
    --artist-id "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \\
    --contacts "path/to/ExportContacts.csv" \\
    --appointments "path/to/Appointments.xlsx" \\
    --out import-templates/merged-bookings-supabase.csv

`--artist-id` must be a real User UID from Supabase Dashboard → Authentication → Users
(same value on every row is fine).
"""

from __future__ import annotations

import argparse
import csv
import re
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

TZ = ZoneInfo("Europe/London")


def parse_artist_uuid(value: str) -> str:
    s = (value or "").strip()
    if not s:
        raise argparse.ArgumentTypeError("empty UUID")
    try:
        return str(uuid.UUID(s))
    except ValueError as e:
        raise argparse.ArgumentTypeError(
            "must be a valid UUID (Supabase → Authentication → Users → copy User UID)"
        ) from e

# Placeholder slot for CRM-only contacts (UTC in output; importer accepts timestamptz)
CONTACT_BASE_START = datetime(2026, 1, 1, 9, 0, 0, tzinfo=ZoneInfo("UTC"))


def norm_email(v: object) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip().lower()
    return s if s else None


def norm_phone_digits(v: object) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    if isinstance(v, (int, float)):
        s = str(int(float(v)))
    else:
        s = re.sub(r"\D+", "", str(v))
    return s if s else None


def format_phone_from_row(country_code: object, phone: object) -> str:
    digits = norm_phone_digits(phone)
    if not digits:
        return ""
    if country_code is not None and not (isinstance(country_code, float) and pd.isna(country_code)):
        cc = str(int(float(country_code)))
        return f"+{cc}{digits}"
    if digits.startswith("44") and len(digits) >= 10:
        return f"+{digits}"
    return digits if digits.startswith("+") else f"+{digits}" if len(digits) > 11 else digits


def map_status(raw: object) -> str:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return "confirmed"
    s = str(raw).strip().lower()
    if "cancel" in s:
        return "cancelled"
    if "no-show" in s or "no show" in s:
        return "no-show"
    if "complet" in s:
        return "completed"
    return "confirmed"


def map_booking_type(service: object) -> str:
    if service is None or (isinstance(service, float) and pd.isna(service)):
        return "session"
    t = str(service).lower()
    if "consultation" in t:
        return "consultation"
    return "session"


def parse_appointment_window(date_str: object, time_range: object) -> tuple[datetime, datetime]:
    if date_str is None or (isinstance(date_str, float) and pd.isna(date_str)):
        raise ValueError("Missing appointment date")
    if time_range is None or (isinstance(time_range, float) and pd.isna(time_range)):
        raise ValueError("Missing appointment time")
    d = pd.to_datetime(str(date_str).strip(), dayfirst=True, utc=False)
    if d.tzinfo is None:
        d = d.replace(tzinfo=TZ)
    tr = str(time_range).strip()
    m = re.match(r"(.+?)\s*-\s*(.+)", tr)
    if not m:
        raise ValueError(f"Unparsed time range: {tr!r}")
    start_t = m.group(1).strip()
    end_t = m.group(2).strip()
    day = d.strftime("%Y-%m-%d")
    start_dt = datetime.strptime(f"{day} {start_t}", "%Y-%m-%d %I:%M %p").replace(tzinfo=TZ)
    end_dt = datetime.strptime(f"{day} {end_t}", "%Y-%m-%d %I:%M %p").replace(tzinfo=TZ)
    if end_dt <= start_dt:
        end_dt = end_dt + timedelta(days=1)
    return start_dt, end_dt


def to_iso_z(dt: datetime) -> str:
    return dt.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S+00")


def client_name_from_appointment(row: pd.Series) -> str:
    name = row.get("Customer name")
    if name is not None and not (isinstance(name, float) and pd.isna(name)):
        s = str(name).strip()
        if s:
            return s
    em = norm_email(row.get("Email"))
    if em:
        return em.split("@")[0].replace(".", " ").title()
    return "Unknown client"


def notes_from_appointment(row: pd.Series) -> str:
    parts: list[str] = []
    for label, col in [
        ("Service", "Service/class/event"),
        ("Label", "Label"),
        ("Comments", "Comments "),
        ("Address", "Address"),
        ("City", "City"),
        ("Booking ID", "Booking ID"),
    ]:
        v = row.get(col)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if s:
            parts.append(f"{label}: {s}")
    return " | ".join(parts)


def notes_from_contact(row: dict) -> str:
    parts: list[str] = []
    e1 = (row.get("Email1") or "").strip()
    p1 = (row.get("Phone1") or "").strip()
    co = (row.get("Company") or "").strip()
    ad = (row.get("Address") or "").strip()
    if e1:
        parts.append(f"Alt email: {e1}")
    if p1:
        parts.append(f"Alt phone: {p1}")
    if co:
        parts.append(f"Company: {co}")
    if ad:
        parts.append(f"Address: {ad}")
    return " | ".join(parts)


def merge_email(primary: str, alt: str) -> str:
    p, a = primary.strip(), alt.strip()
    if p:
        return p
    return a


def merge_phone(primary: str, alt: str) -> str:
    p, a = primary.strip(), alt.strip()
    if p:
        return p
    return a


def read_contacts_csv(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            rows.append({k: (v or "").strip() if isinstance(v, str) else v for k, v in raw.items()})
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--artist-id",
        type=parse_artist_uuid,
        required=True,
        help="Auth user UUID (Dashboard → Authentication → Users → User UID)",
    )
    ap.add_argument("--contacts", type=Path, required=True)
    ap.add_argument("--appointments", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()
    artist_id = args.artist_id

    apt = pd.read_excel(
        args.appointments,
        engine="openpyxl",
        dtype={"Phone": object},
    )
    appointment_emails: set[str] = set()
    for e in apt["Email"]:
        ne = norm_email(e)
        if ne:
            appointment_emails.add(ne)

    out_rows: list[dict[str, str]] = []

    for _, row in apt.iterrows():
        try:
            starts_at, ends_at = parse_appointment_window(
                row.get("Appointment date"), row.get("Appointment time")
            )
        except Exception as ex:
            # Skip rows we cannot schedule (broken export cells)
            continue
        name = client_name_from_appointment(row)
        email = norm_email(row.get("Email")) or ""
        phone = format_phone_from_row(row.get("Country code "), row.get("Phone"))
        status = map_status(row.get("Status"))
        btype = map_booking_type(row.get("Service/class/event"))
        notes = notes_from_appointment(row)
        out_rows.append(
            {
                "client_name": name,
                "client_email": email,
                "client_phone": phone,
                "artist_id": artist_id,
                "booking_type": btype,
                "status": status,
                "starts_at": to_iso_z(starts_at),
                "ends_at": to_iso_z(ends_at),
                "deposit_paid": "false",
                "notes": notes,
            }
        )

    contact_i = 0
    for crow in read_contacts_csv(args.contacts):
        name = (crow.get("Name") or "").strip() or "Unknown client"
        email = merge_email(crow.get("Email") or "", crow.get("Email1") or "")
        phone = merge_phone(crow.get("Phone") or "", crow.get("Phone1") or "")
        ne = norm_email(email) if email else None
        if ne and ne in appointment_emails:
            continue
        start = CONTACT_BASE_START + timedelta(minutes=contact_i)
        end = start + timedelta(hours=1)
        contact_i += 1
        notes = notes_from_contact(crow)
        out_rows.append(
            {
                "client_name": name,
                "client_email": email,
                "client_phone": phone,
                "artist_id": artist_id,
                "booking_type": "consultation",
                "status": "confirmed",
                "starts_at": to_iso_z(start),
                "ends_at": to_iso_z(end),
                "deposit_paid": "false",
                "notes": notes,
            }
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "client_name",
        "client_email",
        "client_phone",
        "artist_id",
        "booking_type",
        "status",
        "starts_at",
        "ends_at",
        "deposit_paid",
        "notes",
    ]
    with args.out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(out_rows)

    print(f"Wrote {len(out_rows)} rows to {args.out}")


if __name__ == "__main__":
    main()
