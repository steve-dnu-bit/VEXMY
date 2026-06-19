#!/usr/bin/env python3
"""
Fix Brentwood migration: create missing Inkaholics artists on Velbok and remap bookings.

Uses service role keys only (REST + Auth Admin API).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ORG_ID = "c94a7432-fd7c-4bf7-9ebc-e1c23cdd8ad2"
BACKUP = Path(__file__).resolve().parents[1] / "backups/inkaholics-bookings-pre-migration-2026-06-14.json"

INKAHOLICS_ARTIST_DEFAULTS = {
    "artbyzola@gmail.com": "Zola",
    "baby_anitzu@yahoo.com": "Anitzu",
    "ruzhytskaalina@gmail.com": "Alina",
    "zilchgarden@gmail.com": "Zilch Garden",
    "mr.tattooist@hotmail.com": "Mr Tattooist",
    "brentwoodinkaholics@gmail.com": "Brentwood Inkaholics",
}

ARTIST_FEATURES = [
    "schedule",
    "clients",
    "consent",
    "deposits",
    "billing",
    "stock",
    "stencil",
    "inbox",
]


def http_json(method: str, url: str, key: str, body=None, extra=None):
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        raise RuntimeError(f"{method} {url} -> {e.code}: {detail}") from e


def list_users(base: str, key: str) -> list[dict]:
    users = []
    page = 1
    while True:
        q = urllib.parse.urlencode({"page": page, "per_page": 200})
        batch = http_json("GET", f"{base}/auth/v1/admin/users?{q}", key)
        chunk = batch.get("users", [])
        users.extend(chunk)
        if len(chunk) < 200:
            break
        page += 1
    return users


def ensure_artist(base: str, key: str, email: str, display_name: str, by_email: dict[str, dict]) -> str:
    email = email.strip().lower()
    if email in by_email:
        user_id = by_email[email]["id"]
    else:
        created = http_json(
            "POST",
            f"{base}/auth/v1/admin/users",
            key,
            {
                "email": email,
                "email_confirm": True,
                "user_metadata": {"display_name": display_name},
            },
        )
        user_id = created["id"]
        by_email[email] = created
        print(f"Created user {email} -> {user_id}")

    try:
        http_json(
            "POST",
            f"{base}/rest/v1/user_roles",
            key,
            [{"user_id": user_id, "role": "artist"}],
            {"Prefer": "resolution=ignore-duplicates,return=minimal"},
        )
    except RuntimeError as err:
        if "23505" not in str(err) and "409" not in str(err):
            raise

    try:
        http_json(
            "POST",
            f"{base}/rest/v1/organization_members",
            key,
            [{"organization_id": ORG_ID, "user_id": user_id, "role": "member"}],
            {"Prefer": "resolution=ignore-duplicates,return=minimal"},
        )
    except RuntimeError as err:
        if "23505" not in str(err) and "409" not in str(err):
            raise

    perms = [{"user_id": user_id, "feature": f, "granted": True} for f in ARTIST_FEATURES]
    try:
        http_json(
            "POST",
            f"{base}/rest/v1/user_permissions",
            key,
            perms,
            {"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
    except RuntimeError as err:
        if "23505" not in str(err) and "409" not in str(err):
            raise

    http_json(
        "PATCH",
        f"{base}/rest/v1/profiles?user_id=eq.{user_id}",
        key,
        {"display_name": display_name},
        {"Prefer": "return=minimal"},
    )
    return user_id


def main() -> int:
    vel_key = os.environ.get("VELBOK_SERVICE_ROLE")
    if not vel_key:
        print("Set VELBOK_SERVICE_ROLE", file=sys.stderr)
        return 1

    vel_base = "https://tkremoxfkgoiuwghtzwd.supabase.co"
    by_email = {u["email"].lower(): u for u in list_users(vel_base, vel_key) if u.get("email")}

    with open(BACKUP, encoding="utf-8") as f:
        source_rows = json.load(f)["bookings"]

    artist_emails = sorted({(r.get("artist_email") or "").lower() for r in source_rows if r.get("artist_email")})
    email_to_id: dict[str, str] = {}
    for email in artist_emails:
        name = INKAHOLICS_ARTIST_DEFAULTS.get(email, email.split("@")[0].title())
        email_to_id[email] = ensure_artist(vel_base, vel_key, email, name, by_email)
        print(f"Artist ready: {email} -> {email_to_id[email]}")

    migrated = http_json(
        "GET",
        f"{vel_base}/rest/v1/bookings?"
        + urllib.parse.urlencode(
            {
                "select": "id,client_name,starts_at,artist_id",
                "organization_id": f"eq.{ORG_ID}",
                "notes": "like.*[Migrated from Inkaholics]*",
                "limit": 500,
            }
        ),
        vel_key,
    )

    source_index = {
        (r["client_name"], r["starts_at"]): (r.get("artist_email") or "").lower()
        for r in source_rows
    }

    updates = 0
    for row in migrated:
        email = source_index.get((row["client_name"], row["starts_at"]))
        if not email:
            continue
        target = email_to_id.get(email)
        if not target or row["artist_id"] == target:
            continue
        http_json(
            "PATCH",
            f"{vel_base}/rest/v1/bookings?id=eq.{row['id']}",
            vel_key,
            {"artist_id": target},
            {"Prefer": "return=minimal"},
        )
        updates += 1

    print(f"Remapped {updates} bookings to correct artists.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
