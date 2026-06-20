# Velbok User Guide

This folder mirrors the product documentation published at **[velbok.com/docs](https://velbok.com/docs)**.

## For studio staff & owners

| Topic | Web doc |
|-------|---------|
| Getting started | [/docs/getting-started](https://velbok.com/docs/getting-started) |
| Schedule | [/docs/schedule](https://velbok.com/docs/schedule) |
| Clients & CRM | [/docs/clients](https://velbok.com/docs/clients) |
| Deposits & payments | [/docs/deposits](https://velbok.com/docs/deposits) |
| Billing & invoices | [/docs/billing](https://velbok.com/docs/billing) |
| **POS checkout & Tap to Pay** | [/docs/pos-checkout](https://velbok.com/docs/pos-checkout) |
| **POS split payments** | [/docs/pos-split-payments](https://velbok.com/docs/pos-split-payments) |
| Consent forms | [/docs/consent](https://velbok.com/docs/consent) |
| Customer portal | [/docs/customer-portal](https://velbok.com/docs/customer-portal) |
| Inbox & messaging | [/docs/inbox](https://velbok.com/docs/inbox) |
| Stock management | [/docs/stock](https://velbok.com/docs/stock) |
| Stencil tools | [/docs/stencil](https://velbok.com/docs/stencil) |
| Admin & permissions | [/docs/admin](https://velbok.com/docs/admin) |
| Settings & profile | [/docs/settings](https://velbok.com/docs/settings) |

## For technical setup

| Topic | Location |
|-------|----------|
| Studio instance setup | [/docs/setup](https://velbok.com/docs/setup) |
| Production go-live checklist | [../Velbok-go-live-checklist.md](../Velbok-go-live-checklist.md) |
| POS & Tap to Pay (supported phones) | [../pos-tap-to-pay.md](../pos-tap-to-pay.md) |
| Developer README | [../../README.md](../../README.md) |

## Source of truth

In-app documentation content lives in `src/i18n/locales/docs/en.json` and page order in `src/lib/docsContent.ts`. Update those when adding or changing product docs, then redeploy the site. Repo copies: `docs/pos-tap-to-pay.md`, `docs/pos-split-payments.md`.
