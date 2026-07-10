# Velbok Tap to Pay on iPhone — compliance journey

Source of truth (local copies from Apple Box, Mar 2026 **v1.6**):

- `Tap to Pay on iPhone App Requirements/Getting Started App Requirements and Review 1_6.pdf`
- `Tap to Pay on iPhone App Requirements/App Review Requirements Checklist 1_6.numbers`
- Extracted PDF text: `requirements-extracted.txt`

**Case-ID:** `20962240`  
**Branch:** `apple-app-store`  
**Current state:** Development entitlement granted. App **1.0.69** restores proximity-reader entitlement + education/readiness plugins. Publishing entitlement **not** granted yet (no TestFlight TTP until videos + checklist approved).

Apple email asks for 3 videos + completed checklist. Official PDF names the same three recordings as:

1. **Onboarding flow** (= New User Flow)
2. **Enabling + Educating Merchants flow** (= Existing User Flow)
3. **Checkout flow**

---

## Phase 0 — Unblock development builds

| Step | Status | Notes |
|------|--------|--------|
| 0.1 Restore `com.apple.developer.proximity-reader.payment.acceptance` in `App.entitlements` | DONE | Restored in 1.0.69 |
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
| 1.1 | Compatible devices: iPhone XS+ | PARTIAL | Keep iPad off TTP; optionally surface XS+ messaging |
| 1.2 | Deployment target if TTP is primary | N/A / OK | Already 16.4; WisePad also available |
| 1.3 | A12 UIRequiredDeviceCapabilities if TTP-only | N/A | Not TTP-only |
| 1.4 | Handle `osVersionNotSupported` (pre-17.6 wording in PDF) | PARTIAL | Show clear update message via Stripe errors |
| 1.5 | Warm-up / prepare at launch or foreground | FAIL | Call Stripe prepare/warm-up on app active |
| 1.6 | Terms acceptance status from Apple, not local | FAIL | Use PSP/Apple status; drop local stub gate |
| 1.7 | Face ID / Touch ID login (recommended) | PARTIAL | Optional later |
| 1.8–1.9 | HIG + Marketing guidelines | PARTIAL | Use Apple Marketing Toolkit assets only |

### 2.x Onboarding merchants → **Video 1: New User Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 2.1 | Discoverable account + path to TTP | PARTIAL | After Connect/POS ready, introduce TTP clearly |
| 2.2 | Digital onboarding completable on iPhone | PASS | Signup + Stripe Connect Account Link |
| 2.3 | Most users &lt; ~15 min to first payment | UNKNOWN | Keep Connect + Terminal location in-app |

**Video 1 must show:** account/KYC path → merchant approved → TTP introduced → (then enable/educate can continue into video 2 if needed).

### 3.x Enabling TTP → **Video 2: Existing User Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 3.1 | Highly visible communication | FAIL | Awareness UI with Apple-approved copy/assets |
| 3.2 | Full-screen modal (recommended; also Marketing 6.2) | FAIL | Splash once for eligible users |
| 3.3 | Communicate to all eligible users ≥ once | FAIL | Splash and/or push |
| 3.4 | Obvious enable at end of new merchant onboarding | FAIL | Post-Connect / POS-ready enable CTA |
| 3.5 | Clear action to accept Apple Terms | PARTIAL | Checkout CTA starts connect (Stripe/Apple Terms); dedicated enable UX still thin |
| 3.6 | Enable outside checkout (e.g. Settings) | FAIL | Settings/Help “Tap to Pay on iPhone” section |
| 3.7 | Enable in checkout **or** require before checkout | PASS | Primary checkout CTA enables + charges |
| 3.8 | Terms only by admin/authorized party | PASS | `canManageBilling` gate before connect |
| 3.8.1 | Non-admin → contact admin message | PASS | `pos.tapToPayContactAdmin` |
| 3.8.2 | Enterprise Business Connect T&Cs | N/A | Public App Store path |
| 3.9 | Try-it screen after education (recommended) | TODO | Optional |
| 3.9.1 | Configuration progress indicator (PSP equivalent) | PARTIAL | Surface Stripe/Apple config progress |

### 4.x Educating merchants → part of **Video 2**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 4.1 | Use ProximityReaderDiscovery on iOS 18+ | FAIL | Restore plugin |
| 4.2 | Education screens after Terms accepted | PARTIAL | `showTapToPayEducationIfAvailable` after connect from checkout |
| 4.3 | Education reachable later in Settings/Help | FAIL | Settings/Help entry |
| 4.4 | Outside-app education uses Marketing Toolkit | N/A for in-app if 4.1 | Use toolkit for email/web later |
| 4.5–4.6 | Contactless + Apple Pay / wallets in education | FAIL | Covered by ProximityReaderDiscovery |
| 4.7–4.8 | PIN / fallback education (regional) | CONDITIONAL | Check launch regions (UK/EU etc.) |

### 5.x Checking out → **Video 3: Checkout Flow**

| ID | Requirement | Velbok | Work |
|----|-------------|--------|------|
| 5.1 | Prominent TTP button at checkout | PASS | Primary gold “Tap to Pay on iPhone” CTA |
| 5.2 | Visible without scrolling; top of payment options | PARTIAL | CTA is first in payment stack; still below cart totals |
| 5.3 | Never greyed out for “not enabled”; tap opens Terms | PASS | Enablement no longer disables CTA; connect/Terms on tap |
| 5.4 | Regional button copy | PASS | `tapToPayLabels.ts` Apple localization table |
| 5.5 | SF Symbol `wave.3.right.circle` / `.fill` if icon used | PASS | `TapToPayWaveIcon` approximation |
| 5.6 | TTP UI within ~1s ≥90% (warm-up) | PARTIAL | Still need launch warm-up (1.5) |
| 5.7 | Initializing screen if still configuring | PASS | `PosPaymentFlowOverlay` initializing |
| 5.8 | Processing screen after successful card read | PASS | Overlay processing phase (+ Stripe/Apple UI) |
| 5.9 | Clear approved / declined / timed out | PASS | Dedicated outcome overlay |
| 5.10 | Digital receipt (email/SMS/QR/share) always possible | PASS | Share / mailto from outcome overlay |
| 5.11 | Regional checkout rules | CONDITIONAL | Per launch country |

---

## Phase 2 — Film & submit (publishing entitlement)

Record with a **second phone** (especially Checkout — Apple UI often blank in screen recording).

### Video 1 — New User / Onboarding
- [ ] New account creation
- [ ] Stripe Connect KYC
- [ ] After approval: TTP introduced on that path

### Video 2 — Existing User / Enable + Educate
- [ ] Awareness that TTP is available (full-screen preferred)
- [ ] Accept Terms (and Settings / Checkout paths)
- [ ] Education immediately after Terms
- [ ] Where to find education later (Settings/Help)
- [ ] Config progress if education finishes before ready

### Video 3 — Checkout
- [ ] Amount / cart
- [ ] Payment options + TTP button
- [ ] Initializing if &gt;300ms
- [ ] Successful tap transaction
- [ ] PIN / fallback if required for region

### Upload package
- [ ] 3 videos
- [ ] Completed `App Review Requirements Checklist 1_6.numbers`
- [ ] Reply to `ttpoientitlements@apple.com` with **Case-ID: 20962240**

---

## Phase 3 — After publishing entitlement

1. TestFlight / App Store build with publishing entitlement  
2. App Store Connect notes + test account + checkout video/wireframes  
3. Marketing Toolkit only for external marketing (launch email / splash / push per §6)  
4. Do not put “Tap to Pay on iPhone” in the **app name**

---

## Implementation order (build before filming)

1. Restore entitlement + ProximityReader education plugin  
2. Terms from Apple/PSP; admin-only + non-admin message  
3. Full-screen awareness once; Settings enable + education re-entry  
4. End-of-onboarding enable CTA  
5. Checkout: never grey Enable for “not accepted”; warm-up; progress; outcome; receipt share  
6. Film videos → fill Numbers checklist → email Apple
