# Importing contacts into `bookings` (Supabase Dashboard)

If you use **Table Editor → Import data**, the CSV columns must match the **Postgres column names** and include every **NOT NULL** field.

Your export (`Name`, `Email`, `Phone`, …) does **not** match `bookings`, so Supabase shows:

> The data that you are trying to import is incompatible with your table structure

## Recommended: use the app

In **Clients → Import → CSV**, the app maps your file and fills required fields for you. Prefer this over the Supabase UI.

## If you still want Supabase CSV import

### `bookings` required columns (minimum)

| Column          | Type    | Notes |
|----------------|---------|--------|
| `artist_id`     | UUID    | Must be a real `auth.users` id (e.g. your staff account). Same value on every row is OK. |
| `client_name`   | text    | Not `Name`. |
| `client_email`  | text    | Optional; can be empty. Not `Email`. |
| `client_phone`  | text    | Optional. Not `Phone`. |
| `booking_type`  | text    | Use `consultation` for imported contacts. |
| `status`        | text    | Use `confirmed`. |
| `starts_at`     | timestamptz | Any valid timestamp (e.g. `2026-01-01 12:00:00+00`). |
| `ends_at`       | timestamptz | After `starts_at`. |

Do **not** include columns that don’t exist on `bookings` (`Company`, `Address`, `Email1`, `Phone1`) unless you add them via migration first.

`id`, `created_at`, and `updated_at` can be omitted if they have defaults (they do).

### Rename your spreadsheet columns

- `Name` → `client_name`
- `Email` or `Email1` → `client_email`
- `Phone` or `Phone1` → `client_phone`

Add columns:

- `artist_id` — paste your user UUID from **Authentication → Users** (same for all rows).
- `booking_type` — `consultation`
- `status` — `confirmed`
- `starts_at` / `ends_at` — e.g. copy a formula so each row has valid times.

Then export as CSV and import into **`bookings`**.

### Get your `artist_id` (UUID)

Supabase Dashboard → **Authentication** → **Users** → copy the user id for the artist/admin account that should “own” these rows.

---

If import still fails, check the error detail: often it’s a bad UUID, wrong `booking_type` / `status`, or timestamps without timezone.

## Merged export (contacts CSV + appointments spreadsheet)

To turn **ExportContacts**-style CSV plus an **Appointments.xlsx** (e.g. Fresha) into one `bookings` CSV:

```bash
python scripts/merge_contacts_and_appointments_for_supabase_bookings.py \
  --artist-id "PASTE_YOUR_USER_UID_FROM_AUTHENTICATION" \
  --contacts path/to/ExportContacts.csv \
  --appointments path/to/Appointments.xlsx \
  --out import-templates/merged-bookings-supabase.csv
```

`--artist-id` is **required**: Postgres rejects non-UUID text (e.g. `REPLACE_WITH_YOUR_AUTH_USER_UUID`). Use the same **User UID** you copy from **Authentication → Users**.

- Appointment rows keep real `starts_at` / `ends_at` (Europe/London → UTC in the file), `status` from the sheet (e.g. cancelled), and `booking_type` `consultation` vs `session` from the service title. Extra fields go into `notes`.
- CRM rows whose **email** already appears on an appointment are skipped so you don’t duplicate people who are already on the schedule.
- Remaining CRM rows become `consultation` / `confirmed` with placeholder times starting `2026-01-01 09:00:00+00` (staggered by one minute per row). `Company`, `Address`, `Email1`, `Phone1` are folded into `notes` only.

If you already have a CSV with the old placeholder, use your editor’s **find and replace**: replace `REPLACE_WITH_YOUR_AUTH_USER_UUID` with your real User UID (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
