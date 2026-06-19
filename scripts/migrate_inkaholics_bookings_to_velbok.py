#!/usr/bin/env python3
"""
Migrate Inkaholics bookings (staff, clients, deposits) into a Velbok organization.

Uses Supabase REST + Auth Admin APIs with service role keys (bypasses RLS).
Does not copy auth users — staff are matched on Velbok by email (invite them first).

Prerequisites
-------------
1. Brentwood org exists on Velbok; note its UUID (organizations.id).
2. Staff already invited on Velbok with the **same emails** as Inkaholics.
3. Service role keys for source + target (Dashboard → Settings → API). Never commit these.

Dry run (recommended first)
-------------------------
  python scripts/migrate_inkaholics_bookings_to_velbok.py \\
    --org-id "brentwood-org-uuid" \\
    --source-url https://obxnxazrivonewlbyqap.supabase.co \\
    --source-service-key "$INKAHOLICS_SERVICE_ROLE" \\
    --target-url https://tkremoxfkgoiuwghtzwd.supabase.co \\
    --target-service-key "$VELBOK_SERVICE_ROLE" \\
    --dry-run

Live import
-----------
  python scripts/migrate_inkaholics_bookings_to_velbok.py \\
    --org-id "brentwood-org-uuid" \\
    ...same flags... \\
    --link-staff

Offline mode (export once from Inkaholics SQL → JSON, then import)
------------------------------------------------------------------
  python scripts/migrate_inkaholics_bookings_to_velbok.py \\
    --bookings-export backups/inkaholics-bookings.json \\
    --org-id "brentwood-org-uuid" \\
    --target-url https://tkremoxfkgoiuwghtzwd.supabase.co \\
    --target-service-key "$VELBOK_SERVICE_ROLE" \\
    --dry-run

Export JSON shape (array of objects with booking fields + artist_email):
  [{"client_name":"...", "artist_email":"steve@...", "starts_at":"...", ...}, ...]
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# Inkaholics (legacy single-tenant) may lack organization_id and other Velbok-only columns.
SOURCE_BOOKING_SELECT = (
    "id,artist_id,client_name,client_email,client_phone,"
    "client_user_id,tattoo_style,tattoo_size,tattoo_placement,reference_image_url,"
    "notes,booking_type,service_category,status,starts_at,ends_at,"
    "deposit_amount,deposit_paid,deposit_link_sent,vip_client,company_id"
)

CHUNK_SIZE = 100


def parse_uuid(value: str, label: str) -> str:
    try:
        return str(uuid.UUID(value.strip()))
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"{label} must be a valid UUID") from e


def http_json(
    method: str,
    url: str,
    apikey: str,
    *,
    body: dict | list | None = None,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    headers = {
        "apikey": apikey,
        "Authorization": f"Bearer {apikey}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            if not raw:
                return None
            return json.loads(raw)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed ({e.code}): {detail}") from e


def list_auth_users(base_url: str, service_key: str) -> list[dict]:
    users: list[dict] = []
    page = 1
    per_page = 200
    while True:
        qs = urlencode({"page": page, "per_page": per_page})
        batch = http_json(
            "GET",
            f"{base_url.rstrip('/')}/auth/v1/admin/users?{qs}",
            service_key,
        )
        if not batch or not batch.get("users"):
            break
        users.extend(batch["users"])
        if len(batch["users"]) < per_page:
            break
        page += 1
    return users


def email_map(users: list[dict]) -> dict[str, str]:
    out: dict[str, str] = {}
    for u in users:
        email = (u.get("email") or "").strip().lower()
        uid = u.get("id")
        if email and uid:
            out[email] = uid
    return out


def fetch_source_bookings(base_url: str, service_key: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        qs = urlencode(
            {
                "select": SOURCE_BOOKING_SELECT,
                "order": "starts_at.asc",
                "offset": offset,
                "limit": page_size,
            }
        )
        batch = http_json(
            "GET",
            f"{base_url.rstrip('/')}/rest/v1/bookings?{qs}",
            service_key,
            extra_headers={"Prefer": "count=exact"},
        )
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def attach_artist_emails(
    bookings: list[dict], source_users: dict[str, str]
) -> list[dict]:
    id_to_email = {v: k for k, v in source_users.items()}
    enriched = []
    for b in bookings:
        row = dict(b)
        artist_id = row.get("artist_id")
        row["artist_email"] = id_to_email.get(artist_id or "", "") or None
        enriched.append(row)
    return enriched


def load_export(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and isinstance(data.get("bookings"), list):
        return data["bookings"]
    if isinstance(data, list):
        return data
    raise ValueError("Export must be a JSON array or { \"bookings\": [...] }")


def normalize_bool(v: Any) -> bool | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.strip().lower() in ("true", "t", "1", "yes")
    return bool(v)


def build_target_row(
    src: dict,
    *,
    org_id: str,
    artist_id: str,
    default_artist_id: str | None,
    skip_cancelled: bool,
    clear_client_user_id: bool,
    migration_note: str,
) -> dict | None:
    status = (src.get("status") or "confirmed").strip()
    if skip_cancelled and status == "cancelled":
        return None

    client_name = (src.get("client_name") or "").strip()
    if not client_name:
        return None

    starts_at = src.get("starts_at")
    ends_at = src.get("ends_at")
    if not starts_at or not ends_at:
        return None

    resolved_artist = artist_id or default_artist_id
    if not resolved_artist:
        return None

    service_category = (src.get("service_category") or "tattoo").strip().lower()
    if service_category not in ("tattoo", "piercing", "laser", "consultation"):
        service_category = "tattoo"

    booking_type = (src.get("booking_type") or "session").strip()
    notes = (src.get("notes") or "").strip()
    if migration_note:
        tag = migration_note.strip()
        if tag and tag not in notes:
            notes = f"{notes}\n[{tag}]".strip() if notes else f"[{tag}]"

    row: dict[str, Any] = {
        "artist_id": resolved_artist,
        "organization_id": org_id,
        "client_name": client_name,
        "client_email": (src.get("client_email") or "").strip().lower() or None,
        "client_phone": (src.get("client_phone") or "").strip() or None,
        "tattoo_style": (src.get("tattoo_style") or "").strip() or None,
        "tattoo_size": (src.get("tattoo_size") or "").strip() or None,
        "tattoo_placement": (src.get("tattoo_placement") or "").strip() or None,
        "reference_image_url": src.get("reference_image_url") or None,
        "notes": notes or None,
        "booking_type": booking_type,
        "service_category": service_category,
        "status": status,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "deposit_amount": src.get("deposit_amount"),
        "deposit_paid": normalize_bool(src.get("deposit_paid")),
        "deposit_link_sent": normalize_bool(src.get("deposit_link_sent")),
        "vip_client": bool(normalize_bool(src.get("vip_client")) or False),
        "company_id": None,
        "client_user_id": None if clear_client_user_id else src.get("client_user_id"),
    }
    return row


def insert_bookings(
    base_url: str,
    service_key: str,
    rows: list[dict],
    *,
    dry_run: bool,
) -> int:
    if dry_run or not rows:
        return len(rows)
    inserted = 0
    for i in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[i : i + CHUNK_SIZE]
        http_json(
            "POST",
            f"{base_url.rstrip('/')}/rest/v1/bookings",
            service_key,
            body=chunk,
            extra_headers={"Prefer": "return=minimal"},
        )
        inserted += len(chunk)
    return inserted


def link_staff_to_org(
    base_url: str,
    service_key: str,
    org_id: str,
    user_ids: list[str],
    *,
    dry_run: bool,
) -> int:
    members = [
        {"organization_id": org_id, "user_id": uid, "role": "member"}
        for uid in sorted(set(user_ids))
    ]
    if dry_run or not members:
        return len(members)
    linked = 0
    for member in members:
        try:
            http_json(
                "POST",
                f"{base_url.rstrip('/')}/rest/v1/organization_members",
                service_key,
                body=[member],
                extra_headers={"Prefer": "resolution=ignore-duplicates,return=minimal"},
            )
            linked += 1
        except RuntimeError as err:
            if "23505" not in str(err) and "409" not in str(err):
                raise
    return linked


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate Inkaholics bookings into a Velbok organization."
    )
    parser.add_argument("--org-id", required=True, type=lambda s: parse_uuid(s, "org-id"))
    parser.add_argument("--target-url", required=True)
    parser.add_argument("--target-service-key", required=True)
    parser.add_argument("--source-url")
    parser.add_argument("--source-service-key")
    parser.add_argument("--bookings-export", help="JSON file instead of live source API")
    parser.add_argument(
        "--artist-map",
        help='JSON file: {"old@email.com": "velbok-user-uuid", ...} overrides auto-match',
    )
    parser.add_argument(
        "--default-artist-id",
        help="Velbok user UUID when artist email is missing or unmatched",
        type=lambda s: parse_uuid(s, "default-artist-id"),
    )
    parser.add_argument("--skip-cancelled", action="store_true")
    parser.add_argument("--clear-client-user-id", action="store_true", default=True)
    parser.add_argument(
        "--keep-client-user-id",
        action="store_true",
        help="Keep client_user_id (only if you copied auth users with same UUIDs)",
    )
    parser.add_argument("--link-staff", action="store_true", help="Insert organization_members for mapped artists")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--migration-note",
        default="Migrated from Inkaholics",
        help="Tag appended to notes (set \"\" to skip)",
    )
    args = parser.parse_args()

    if args.keep_client_user_id:
        args.clear_client_user_id = False

    if args.bookings_export:
        source_rows = load_export(args.bookings_export)
    else:
        if not args.source_url or not args.source_service_key:
            parser.error("Provide --source-url + --source-service-key or --bookings-export")
        source_rows = fetch_source_bookings(args.source_url, args.source_service_key)
        source_users = list_auth_users(args.source_url, args.source_service_key)
        source_rows = attach_artist_emails(source_rows, email_map(source_users))

    target_users = list_auth_users(args.target_url, args.target_service_key)
    target_by_email = email_map(target_users)

    artist_overrides: dict[str, str] = {}
    if args.artist_map:
        with open(args.artist_map, encoding="utf-8") as f:
            raw = json.load(f)
        artist_overrides = {k.strip().lower(): v for k, v in raw.items()}

    target_rows: list[dict] = []
    unmatched_emails: set[str] = set()
    used_artist_ids: set[str] = set()
    skipped = 0

    for src in source_rows:
        email = (src.get("artist_email") or "").strip().lower()
        artist_id = artist_overrides.get(email) or target_by_email.get(email)
        if email and not artist_id:
            unmatched_emails.add(email)
        if not artist_id and not args.default_artist_id:
            skipped += 1
            continue

        row = build_target_row(
            src,
            org_id=args.org_id,
            artist_id=artist_id or "",
            default_artist_id=args.default_artist_id,
            skip_cancelled=args.skip_cancelled,
            clear_client_user_id=args.clear_client_user_id,
            migration_note=args.migration_note,
        )
        if row is None:
            skipped += 1
            continue
        target_rows.append(row)
        used_artist_ids.add(row["artist_id"])

    print(f"Source bookings: {len(source_rows)}")
    print(f"Ready to import: {len(target_rows)} (skipped {skipped})")
    if unmatched_emails:
        print("Unmatched artist emails (invite on Velbok or use --artist-map / --default-artist-id):")
        for e in sorted(unmatched_emails):
            print(f"  - {e}")

    if args.dry_run:
        print("Dry run — no rows written.")
        if target_rows:
            print("Sample row:", json.dumps(target_rows[0], indent=2))
        return 0 if not unmatched_emails or args.default_artist_id else 1

    if unmatched_emails and not args.default_artist_id:
        print("Aborting: unmatched artists and no --default-artist-id.", file=sys.stderr)
        return 1

    count = insert_bookings(
        args.target_url,
        args.target_service_key,
        target_rows,
        dry_run=False,
    )
    print(f"Inserted {count} bookings into org {args.org_id}")

    if args.link_staff:
        linked = link_staff_to_org(
            args.target_url,
            args.target_service_key,
            args.org_id,
            list(used_artist_ids),
            dry_run=False,
        )
        print(f"Linked {linked} staff user(s) to organization_members")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
