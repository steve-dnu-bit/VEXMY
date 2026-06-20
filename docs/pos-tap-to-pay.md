# POS checkout & Tap to Pay

Velbok staff can take in-person card payments from **Checkout** in the mobile app.

## Tap to Pay — no separate card reader

**Tap to Pay** turns the staff phone into the payment terminal. Customers tap:

- Contactless debit/credit cards  
- **Google Pay** (Android)  
- **Apple Pay** (iPhone and supported Android wallets)  
- Samsung Pay and other NFC wallets  

You **do not need a WisePad** or other Stripe hardware for this mode.

Stripe Terminal is still used behind the scenes (connection token + Terminal **location** on your studio’s Stripe Connect account). Velbok creates the location in **Admin → POS checkout**. You do **not** register a physical reader in Stripe Dashboard for Tap to Pay.

### Using Tap to Pay in Velbok

1. Finish Stripe Connect and create a Terminal location (Admin → POS).  
2. Install the **release** Velbok app on a compatible phone.  
3. Open **Checkout** → reader mode **Tap to Pay (this phone)**.  
4. Tap **Enable phone payments**, then **Charge** as usual.  
5. Customer holds card or phone near the **top** of your device.

### Stripe setup checklist

| Step | Required for Tap to Pay? |
|------|--------------------------|
| Stripe Connect (studio account) | Yes |
| Terminal location (Velbok Admin → POS) | Yes |
| Buy / register WisePad or reader | **No** |
| Separate “Tap to Pay” toggle in Stripe | **No** (for Velbok) |

---

## Supported Android phones

Requirements (Stripe): NFC, **Android 13+**, Google Play Services, hardware security keystore (ECDH), **Developer options OFF**, release app, Location allowed.

### Works (examples — not exhaustive)

| Brand | Examples |
|-------|----------|
| **Google** | Pixel 6 and newer (6a, 7, 8, 9, 10, Fold) |
| **Samsung Galaxy S** | S22, S22+, S22 Ultra, S23 series, S24 series, S25 series, S26 series |
| **Samsung Galaxy Z** | Z Flip4, Z Flip5, Z Flip6, **Z Flip7**, Z Flip7 FE, Z Fold4–Z Fold7, Z TriFold |
| **Samsung Galaxy A/M/F** | Many recent models (A14 5G+, A53 5G+, M14 5G+, etc.) |
| **Motorola** | edge (2022+), razr / razr+ (2022+) |
| **OnePlus** | 10 series and newer, Nord 3 5G+, Open |
| **Xiaomi / Redmi** | 12+ and many Note 13/14 models |

**Authoritative list (Stripe):**  
https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android#device-types

### Does NOT work

- **Samsung Galaxy S21, S20, S10** and older S flagships (hardware keystore — use S22+ or WisePad)  
- Phones without NFC or without Stripe’s security hardware  
- Rooted devices, emulators, debug Velbok APKs  
- Android 12 or older  

---

## iPhone

- **Tap to Pay on iPhone** in the Velbok iOS app  
- Generally **iPhone XS or later**, iOS **16.4+**  
- Apple **Tap to Pay on iPhone** entitlement required on the app (requested from Apple)  
- Same Stripe Connect + Terminal location setup  

https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=ios

---

## WisePad (optional)

Use **WisePad (Bluetooth)** in Checkout when:

- The phone is not on Stripe’s supported list (e.g. Galaxy S21), or  
- You prefer a separate reader  

Register the WisePad serial in **Stripe Dashboard → Terminal → Readers** on your Connect account.

---

## In-app documentation

Published at [/docs/pos-checkout](https://velbok.com/docs/pos-checkout) (content: `src/i18n/locales/docs/en.json`).

**Splitting takings with artists:** [/docs/pos-split-payments](https://velbok.com/docs/pos-split-payments) — both studio and artist need Connect accounts, turnover notes, and tax disclaimer. Repo copy: [pos-split-payments.md](./pos-split-payments.md).
