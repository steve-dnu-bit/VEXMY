# POS split payments

Share in-person card takings between your studio and artists. Web doc: [/docs/pos-split-payments](https://velbok.com/docs/pos-split-payments).

## What split payments do

When an artist is assigned on a POS charge, Velbok:

1. Collects the **full amount** from the client on the **studio’s** Stripe Connect account.
2. Keeps the configured **shop share** in that account.
3. **Transfers** the artist’s share to the artist’s own Connect account.

The split % controls how money is divided in Stripe — **not** how much of the client payment each party declares for tax (see below).

## Both studio and artist need Connect accounts

| Party | Where to set up |
|-------|-----------------|
| **Studio (shop)** | Admin → POS checkout → Stripe Connect / Payouts |
| **Each artist** | Settings → POS payout account |

Both accounts must be fully onboarded on Velbok’s Connect platform. Missing or external account IDs cause artist transfers to fail after the client has already paid.

**Artists:** use **Settings → POS payout account** (self-service). Admins can paste `acct_…` under Admin → POS → Artist overrides, but onboarding via Settings is recommended.

## Studio checklist

1. Admin → POS checkout — complete Stripe Connect (identity, business, bank).
2. Create a **Terminal location** on the same page.
3. Set default shop split % and enable POS checkout.
4. Optional per-artist overrides (custom % or account ID).

The studio is the **merchant of record** for the client payment.

## Artist checklist

1. Sign in with a Velbok user linked to the studio.
2. **Settings → POS payout account** → Connect payout account.
3. Complete Stripe Express onboarding (identity + bank).
4. Status should show **Connected** when payouts are enabled.

## At checkout

- Staff assigns the artist on the charge.
- Client pays the full amount (e.g. £200).
- Studio Connect account receives the payment (minus Stripe fees).
- Velbok transfers the artist share (e.g. £100 at 50/50) to the artist Connect account.
- Failed transfers can be retried from Admin → POS after Connect is fixed.

## Subcontractor model and turnover

Velbok follows a common studio model: the **shop supplies the client**; the **artist is paid a fee/commission** from the studio (subcontractor).

- The **full client payment** is normally **100% of the studio’s gross takings/turnover** — not only the shop’s split percentage.
- The **artist’s income** is usually the amount the studio pays them (their split), not half of the client receipt on their own books.
- The split % in Velbok only routes money between two Stripe accounts; it does not replace invoicing, payroll, or tax reporting between studio and artist.

Confirm your structure with a qualified adviser — rules differ by country and legal setup.

## Tax disclaimer

**Velbok does not provide tax, VAT, accounting, or legal advice.** We are not responsible for your tax status or compliance. Each country has different rules for turnover, VAT, subcontractor payments, and self-employment.

You and your artists should obtain advice from a qualified accountant or tax professional. Velbok is a **payment routing tool only**, not your tax agent.
