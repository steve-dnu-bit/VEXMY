# Velbok Tap to Pay on iPhone — compliance journey

Source of truth (local copies from Apple Box, Mar 2026 **v1.6**):

- `Tap to Pay on iPhone App Requirements/Getting Started App Requirements and Review 1_6.pdf`
- `Tap to Pay on iPhone App Requirements/App Review Requirements Checklist 1_6.numbers`
- Extracted PDF text: `requirements-extracted.txt`

**Case-ID:** `20962240`  
**Branch:** `apple-app-store`  
**Current state:** Development entitlement granted. Publishing entitlement **not** granted yet (no TestFlight TTP until videos + checklist approved). UX gaps for awareness / Settings / warm-up / biometric / launch marketing have been implemented on this branch for filming.

Apple email asks for 3 videos + completed checklist. Official PDF names the same three recordings as:

1. **Onboarding flow** (= New User Flow)
2. **Enabling + Educating Merchants flow** (= Existing User Flow)
3. **Checkout flow**

---

## Phase 0 — Unblock development builds

| Step | Status | Notes |
|------|--------|--------|
| 0.1 Restore `com.apple.developer.proximity-reader.payment.acceptance` in `App.entitlements` | DONE | Restored |
| 0.2 Restore real `TapToPayEducationPlugin` / ProximityReaderDiscovery | DONE | iOS 18+ How to Tap |
| 0.3 Remove “blocked until Apple approves” iOS hard-block UI | DONE | Readiness plugin + location alerts |
| 0.4 Dev provisioning profile + registered test iPhone | TODO | Must include proximity-reader entitlement |
| 0.5 Confirm Stripe Terminal Tap to Pay works on that device | TODO | Use **Release** build (not Xcode Debug) |

---

## Phase 1 — Meet UX requirements (Apple checklist IDs)

Statuses: **PASS** / **PARTIAL** / **FAIL** / **N/A**

### 1.x General

| ID | Requirement (Apple v1.6) | Velbok | Work |
|----|--------------------------|--------|------|
| 1.1 | Compatible devices: iPhone XS+ | PASS | iPad blocked; XS+ copy in Settings / awareness / readiness |
| 1.2 | Deployment target if TTP is primary | PASS | iOS 16.4; WisePad also available |
| 1.3 | A12 UIRequiredDeviceCapabilities if TTP-only | N/A | Not TTP-only |
| 1.4 | Handle `osVersionNotSupported` | PASS | Mapped in `stripeTerminalErrorMessages.ts` |
| 1.5 | Warm-up / prepare at launch or foreground | PASS | `warmTapToPay.ts` + `main.tsx` listeners |
| 1.6 | Terms acceptance status from Apple, not local | PASS | Stripe/Apple on connect; no local Terms flag |
| 1.7 | Face ID / Touch ID login | PASS | `@aparajita/capacitor-biometric-auth` unlock + Settings toggle |
| 1.8–1.9 | HIG + Marketing guidelines | PARTIAL | Splash shell ready; drop Toolkit Hero into `public/marketing/ttpoi/` |

### 2.x Onboarding merchants → **Video 1: New User Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 2.1 | Discoverable account + path to TTP | PASS | Signup + Connect + shop-setup enable CTA + awareness splash |
| 2.2 | Digital onboarding completable on iPhone | PASS | Signup + Stripe Connect Account Link |
| 2.3 | Most users &lt; ~15 min to first payment | UNKNOWN | Depends on Stripe KYC |

### 3.x Enabling TTP → **Video 2: Existing User Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 3.1 | Highly visible communication | PASS | Full-screen awareness splash |
| 3.2 | Full-screen modal (splash) | PASS | `TapToPayAwarenessSplash` (Toolkit Hero slot) |
| 3.3 | Communicate to all eligible users ≥ once | PASS | Splash + `ttpoi-awareness-notify` push |
| 3.4 | Enable at end of new merchant onboarding | PASS | Shop setup payouts + review CTAs |
| 3.5 | Clear action to accept Apple Terms | PASS | Checkout / Settings enable → Stripe connect |
| 3.6 | Enable outside checkout (Settings) | PASS | `TapToPaySettingsCard` |
| 3.7 | Enable in checkout OR require before | PASS | Primary checkout CTA |
| 3.8 | Terms only by admin/authorized | PASS | `canManageBilling` |
| 3.8.1 | Non-admin → contact admin | PASS | `pos.tapToPayContactAdmin` |
| 3.8.2 | Enterprise Business Connect T&Cs | N/A | Public App Store |
| 3.9 | Try-it screen after education | PASS | `TapToPayTryItDialog` |
| 3.9.1 | Configuration progress indicator | PARTIAL | Initializing overlay + progress bar copy (no native `updateProgress` API in Capacitor plugin) |

### 4.x Educating merchants → part of **Video 2**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 4.1 | ProximityReaderDiscovery on iOS 18+ | PASS | `TapToPayEducationPlugin` |
| 4.2 | Education after Terms | PASS | After `discoverAndConnect` |
| 4.3 | Education in Settings/Help | PASS | Settings → How to Tap |
| 4.4 | Outside-app education Marketing Toolkit | N/A for in-app | Use Toolkit for email/web at GA |
| 4.5–4.8 | Contactless / wallets / PIN / fallback | PASS | Covered by Apple How to Tap when 4.1 works |

### 5.x Checking out → **Video 3: Checkout Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 5.1 | Prominent TTP button | PASS | Gold CTA |
| 5.2 | Visible without scrolling / top of options | PARTIAL | First in payment stack; may sit below cart |
| 5.3 | Never greyed for “not enabled” | PASS | Enable path on tap |
| 5.4 | Regional button copy | PASS | `tapToPayLabels.ts` |
| 5.5 | SF Symbol `wave.3.right.circle` | PARTIAL | SVG approximation in WebView |
| 5.6 | UI within ~1s ≥90% | PARTIAL | Warm-up implemented; measure on device |
| 5.7 | Initializing screen | PASS | Overlay + progress messaging |
| 5.8 | Processing screen | PASS | Overlay |
| 5.9 | Approved / declined / timed out | PASS | Overlay outcomes |
| 5.10 | Digital receipt | PASS | Email / SMS / QR / Share |
| 5.11 | Regional (UK PIN + fallback) | PARTIAL | PIN via Apple education; WisePad + payment links as fallback |

### 6.x Marketing (at launch / GA)

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 6.1 | Launch email (Toolkit) | PASS (shell) | `ttpoi-awareness-notify` action `launch_email` — swap Toolkit art before GA marketing |
| 6.2 | In-app Hero splash | PASS (shell) | Splash + `public/marketing/ttpoi/hero.jpg` slot |
| 6.3 | Push Value Proposition | PASS | Auto one-shot push via `ttpoi-awareness-notify` |

---

## Phase 2 — Film & submit (publishing entitlement)

Record with a **second phone** (especially Checkout — Apple UI often blank in screen recording).

### Video 1 — New User / Onboarding
- [ ] New account creation (Solo trial OK)
- [ ] Stripe Connect KYC (test mode OK)
- [ ] After approval: shop-setup **Enable Tap to Pay on iPhone** CTA and/or awareness splash

### Video 2 — Existing User / Enable + Educate
- [ ] Awareness splash (or Settings path)
- [ ] Accept Terms via Enable (Checkout or Settings)
- [ ] Education immediately after Terms
- [ ] Try-it dialog → Checkout
- [ ] Re-open How to Tap from **Settings → Tap to Pay on iPhone**
- [ ] Config / initializing progress if education finishes before ready

### Video 3 — Checkout
- [ ] Amount / cart
- [ ] Payment options + TTP button
- [ ] Initializing if slow
- [ ] Successful tap transaction
- [ ] Receipt share
- [ ] UK: mention / show WisePad fallback if asked

### Upload package
- [ ] 3 videos
- [ ] Completed `App Review Requirements Checklist 1_6.numbers`
- [ ] Reply to `ttpoientitlements@apple.com` with **Case-ID: 20962240**

### Other Information (checklist form)

| Field | Answer |
|-------|--------|
| Supported schemes | Visa, Mastercard, American Express (via Stripe Terminal) |
| Is Refund supported | **No** via Tap to Pay on iPhone today |
| Receipt methods | Email, SMS, QR code, iOS Share |
| PIN fallback (UK) | WisePad (card reader), Payment Link / invoice links |

---

## Phase 3 — After publishing entitlement

1. TestFlight / App Store build with publishing entitlement  
2. App Store Connect notes + test account + checkout video/wireframes  
3. Marketing Toolkit only for external marketing (launch email / splash / push per §6) — drop assets into `public/marketing/ttpoi/`  
4. Do not put “Tap to Pay on iPhone” in the **app name**  
5. Deploy edge function: `supabase functions deploy ttpoi-awareness-notify`

---

## Key code map

| Area | Path |
|------|------|
| Warm-up | `src/lib/terminal/warmTapToPay.ts` |
| Awareness splash | `src/components/pos/TapToPayAwarenessSplash.tsx`, `TapToPayAwarenessHost.tsx` |
| Settings enable / education | `src/components/settings/TapToPaySettingsCard.tsx` |
| Biometric unlock | `src/lib/biometricUnlock.ts`, `BiometricUnlockGate.tsx` |
| Try-it | `src/components/pos/TapToPayTryItDialog.tsx` |
| Launch email / push | `supabase/functions/ttpoi-awareness-notify/` |
| Toolkit assets | `public/marketing/ttpoi/README.md` |
