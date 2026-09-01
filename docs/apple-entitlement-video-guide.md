# Apple Tap to Pay on iPhone — publishing entitlement video guide

**App:** Velbok (`com.velbok.app`) · **Version to film:** 1.0.106 (build 106) · **Branch:** `apple-app-store` (HEAD `f33c130`)
**Region:** United Kingdom · **PSP:** Stripe Terminal · **Case-ID:** `20962240`
**Purpose:** re-record the demo video for the Tap to Pay on iPhone **publishing (distribution) entitlement** after Apple's rejections on requirements 3.5, 4.1, checkout button HIG (5.4/5.5) and UK regional PIN + fallback (5.11).

Everything below is taken from the code on this branch. Every button label quoted here is the literal English string in `src/i18n/locales/en.json`. Nothing in this guide describes UI that does not exist.

---

## 0. READ THIS FIRST — things that will sink the take if you skip them

### 0.1 One requirement is only *partly* satisfied by the app today (no code change required to film, but know the risk)

**Apple 5.11 / your point 4 — "fallback payment method when Tap to Pay can't complete".**
Velbok has two real fallbacks (WisePad Bluetooth reader, Stripe payment link), but **neither is offered from inside the failure screen**. When a Tap to Pay payment declines or times out, `PosPaymentFlowOverlay` shows only *"Payment declined"* / *"Payment cancelled"*, an optional detail line, receipt tools and a **Done** button. The fallback is communicated by a permanent caption under the checkout CTA:

> *"If the card cannot complete contactless, switch to WisePad (Bluetooth reader) in POS setup, or ask for another contactless card or wallet."*
> (`pos.tapToPayFallbackWisePad`, rendered at `src/pages/PosCheckoutPage.tsx:1932-1934`)

…and the merchant then has to leave the overlay and change reader mode in **POS setup**, or create a payment link from **Billing → Invoices → Copy Pay Link**.

**This is filmable and honest** — Shots 14–18 below do exactly that, on camera, in one continuous move. But if Apple pushes back a third time on 5.11, the fix is a code change you should expect to make: add a **"Use a different payment method"** button to the declined/timed-out state of `PosPaymentFlowOverlay` that (a) switches `readerMode` to `bluetooth` and reopens the POS setup dialog, or (b) creates a payment link for the same sale. Do not attempt that change before filming — film 1.0.106 as it stands.

### 0.2 The terms sheet reset must be DONE and VERIFIED before you press record

Apple's Terms & Conditions sheet is raised by Apple inside Stripe's `connectReader`, and it appears **once per merchant ID / Apple Account** — never again after acceptance. Your test device has already accepted. **If you film without resetting, requirement 3.5 fails again and the whole take is wasted.** See §2.

### 0.3 Apple's own UI is not reliably capturable with iOS screen recording — film with a second camera

Apple states plainly, in the Tap to Pay on iPhone security documentation:

> *"Tap to Pay on iPhone is designed to prevent all photo, video, screenshot and screen-recording features from capturing PIN information."*
> — https://support.apple.com/en-gb/guide/security/sec72cb155f4/web

In practice the **PIN entry screen will not appear** in an iOS screen recording, and the ProximityReader card-read sheet is frequently blank/black in recordings too. Developers who got the entitlement granted describe submitting *"a video recorded from an external device showing the full checkout flow"* (Apple Developer Forums, Tap to Pay topic). The internal note on this branch already says the same: `docs/apple-ttpoi/COMPLIANCE-JOURNEY.md` → *"Record with a second phone (especially Checkout — Apple UI often blank in screen recording)."*

**Decision: film the primary video with a second camera pointed at the iPhone.** Optionally also run an iOS screen recording at the same time as B-roll for the Velbok-only screens — but the file you send Apple is the camera one.

### 0.4 Reader-mode sequencing (the 1.0.105 trap, fixed in 1.0.106)

`readerMode` is a device-local preference in `localStorage` (`terminalReaderModeStorage.ts`). Selecting **"WisePad (separate card reader)"** flips it to `bluetooth`, and before 1.0.106 that made the Tap to Pay enable button a no-op. 1.0.106 fixes it in two places: the Settings enable button calls `saveTerminalReaderMode("tap_to_pay")` before navigating (`TapToPaySettingsCard.tsx:48`), and the checkout deep link corrects the mode on arrival (`PosCheckoutPage.tsx:253-262`).

**Filming consequence: do the Tap to Pay take FIRST and the WisePad fallback take LAST.** If you must go back to Tap to Pay after touching WisePad, go through **Settings → Tap to Pay on iPhone → Enable Tap to Pay on iPhone** (that path forces the mode back), not through the checkout button.

---

## 1. Pre-flight checklist

Tick every line before recording. Anything marked **blocker** will stop the take dead.

### 1.1 Device and OS

- [ ] iPhone **XS or later** (Velbok blocks iPad entirely — `isIpadDevice()`).
- [ ] **iOS 18.0 or later** — **blocker for requirement 4.1.** Apple's "How to Tap" education is presented through `ProximityReaderDiscovery.content(for: .payment(.howToTap))`, and `TapToPayEducationPlugin.isAvailable` returns `false` below iOS 18 (`ios/App/App/TapToPayEducationPlugin.swift:32-44, 86-89`). On iOS 17 you get a toast instead of Apple's education and requirement 4.1 fails on video.
- [ ] Phone language / Velbok language set to **English** so the button literally reads "Tap to Pay on iPhone" (`tapToPayLabels.ts` localises this string for de/fr/ro/it/es/sv/no/nl/bg).
- [ ] **Location Services ON** globally, and Velbok → Location = **While Using the App** with **Precise Location ON**. Missing location is a hard blocker (`tapToPayReadiness.ts:87-93`).
- [ ] Wi-Fi or good 4G/5G. First Tap to Pay activation downloads a configuration and can take 1–2 minutes.
- [ ] iOS **Settings → Velbok → "Tap to Pay on iPhone Screen Lock" = OFF**. If it is on, the phone locks while the PIN pad is shown and you must Face ID before continuing — it breaks a continuous take.
- [ ] Do Not Disturb ON, alarms off, battery > 60%, brightness high, auto-lock set to 5 minutes.
- [ ] Clean status bar (no personal notifications), and no other Bluetooth reader connected.

### 1.2 Build

- [ ] Velbok **1.0.106 / build 106**, installed as a **Release** build signed with a development (or TestFlight) profile that includes `com.apple.developer.proximity-reader.payment.acceptance`. An Xcode **Debug** run is a hard blocker (`tapToPayReadiness.ts:68-74`).
- [ ] Verify on-device: **Settings → Tap to Pay on iPhone** card shows the green alert **"This phone is ready for Tap to Pay"** with the line **"Velbok 1.0.106 · release build…"** and your iPhone model. That single line is your on-camera proof of app version — film it (Shot 2).
- [ ] Confirm the checkout button renders the **real SF Symbol**, not the SVG fallback. On iOS the icon is drawn by UIKit from `wave.3.right.circle.fill` and passed to the WebView as a masked PNG (`TapToPayEducationPlugin.sfSymbolPng` → `TapToPayWaveIcon.tsx`). If the native call fails, an approximate SVG is used instead — visually similar, but **not** Apple's symbol, and that is exactly what Apple rejected before. Compare the on-screen glyph against `wave.3.right.circle.fill` in the SF Symbols app before you record.

### 1.3 Velbok / Stripe account state

- [ ] Signed in as a user who **can manage billing** (owner/admin). Non-admins get *"Only a studio owner or admin can enable Tap to Pay on iPhone and accept Apple's Terms"* and the enable path aborts.
- [ ] **Admin → POS checkout**: checkout **enabled**, **"Use simulated reader" OFF** (a simulated reader silently skips the whole Tap to Pay path — `usingTapToPay` requires `!simulatedReader`).
- [ ] Stripe **Connect ready** and a **Terminal location** exists. If either is missing, the checkout screen shows *"Finish setup to take payments"* and the enable action is blocked with *"Complete Stripe Connect setup before taking payments."* / *"Set up a Terminal location in Admin → POS checkout first."*
- [ ] Optional sanity check: **Checkout → POS setup → "Test Stripe server link"** must return *"Stripe server link OK — connection token received."*
- [ ] **VAT/tax rate = 0** and **gratuity OFF** for the filmed sale, so the "Amount due" is exactly the number you intend to charge (this matters for the PIN amount — see §4).
- [ ] Cart empty, no leftover draft items, client name field ready (a name is mandatory before charging).
- [ ] Decide your data: use a fictional client name (e.g. "Demo Client") — the recording goes to Apple.

### 1.4 Stripe mode decision (important, and constrained by how Velbok is deployed)

Velbok's server picks the Stripe key from the Supabase secret `STRIPE_CONNECT_SECRET_KEY` (`supabase/functions/_shared/stripe-keys.ts`). There is **no per-device or per-org test-mode switch** — `stripeTerminalIsTestMode()` always returns `false` in native builds. So:

- **Option A (recommended): stay in live mode and reset Apple's terms (§2.1).** You charge a real card and refund it afterwards in the Stripe Dashboard (Velbok has no in-app refund).
- **Option B (not recommended for this submission): switch the backend to a sandbox key.** Swapping `STRIPE_CONNECT_SECRET_KEY` to `sk_test_…` changes the mode for the **entire deployment**, and every stored live `acct_…` Connect ID and Terminal location becomes invalid, so the shop would fail `connect_status` and you could not even reach checkout. Only viable on a separate Supabase project / test org. If you do it, you get a *virgin* merchant ID (a fresh terms sheet without touching Apple Business Connect) and you can use Stripe **physical test cards** to force PIN deterministically — see §4.2.

### 1.5 Recording setup

- [ ] **Primary: external camera** (a second iPhone on a small tripod/gooseneck, or a DSLR). 1080p or 4K, 30 fps, landscape, locked focus/exposure on the phone screen.
- [ ] Test iPhone lying flat in a stand or held in a fixed cradle so the frame never moves and the customer can tap the top edge without you moving the phone.
- [ ] Whole screen in frame with a small margin. No glare, no reflections of you or the room in the glass. Overhead diffuse light, not a window behind the phone.
- [ ] Quiet room. Record narration live (§6 gives the exact words) or add on-screen captions in post. Either is fine — Apple needs to know what they are looking at.
- [ ] **One continuous take** for Shots 1–13. Do not cut inside the 3.5 → 4.1 sequence: the whole point of Apple's rejection was that they could not see the education follow the terms acceptance in sequence.
- [ ] Optionally start an iOS screen recording as well (Control Centre) — useful backup for the Velbok screens, expect Apple's sheets and the PIN pad to be blank in it.
- [ ] Have a card ready that will trigger PIN (§4) plus a second card from a different bank as a spare.

---

## 2. The terms reset — do this BEFORE recording day

Apple's sheet only ever appears for a merchant ID that has not accepted yet. `tapToPayDiagnostics.ts` documents this exactly: *"Apple's Terms and Conditions sheet is presented inside Stripe's connectReader and only ever appears once per Stripe account."*

### 2.1 Option A — remove the merchant IDs (live mode, recommended)

1. Go to **https://businessconnect.apple.com/taptopay/removeall**
2. Sign in with **the Apple Account that is signed in on the test iPhone**.
3. Confirm **"Remove all merchant IDs"**.
   Apple: *"Removing a Merchant ID provided by the payment service provider disables the Tap to Pay on iPhone feature on all iPhones linked to the Merchant ID."*
   Note: if your organisation is registered in Apple Business Connect, the "remove all" page will not work — you must sign in to Apple Business Connect → **Tap to Pay on iPhone** → select the merchant ID → **Remove**.
4. **Reboot the iPhone.** Then wait — Apple publishes no propagation SLA; treat it as *do it the evening before and film the next morning*.
5. In Velbok, **force-close and reopen** the app (swipe away from the app switcher) so no cached Stripe reader connection survives.

**Verify the reset without burning it.** Trigger the enable path (Shot 4) and, when Apple's sheet appears, **swipe it down / cancel instead of agreeing**. Cancelling does not record acceptance — you will get a Velbok error toast, which is fine. Then force-close Velbok, reopen, and start the real take. If the sheet did **not** appear, the reset has not propagated: do not film, and confirm with the diagnostics trick below.

**Diagnostics confirmation (very useful).** Velbok traces the enable flow. **Settings → Tap to Pay on iPhone → "Copy Tap to Pay diagnostics"** dumps lines like `enable.connect.start`, `enable.connect.ok`, `education.presented`. A connect that completes in **under ~12 seconds** means Apple had nothing to ask, i.e. terms were already accepted (`describeConnectDuration()` in `tapToPayDiagnostics.ts`). A connect that takes clearly longer, with a human reading the sheet, is the state you want on camera. Paste this trace into your reply to Apple as supporting evidence.

### 2.2 Option B — fresh Stripe sandbox account (virgin merchant ID)

A sandbox Connect account produces a **new merchant ID**, so Apple's sheet appears again without touching Apple Business Connect, and Stripe physical test cards let you force PIN and declines on demand. The cost is the deployment-wide key switch described in §1.4 — only do this on a separate Supabase project.

---

## 3. Exact navigation map (literal labels, as of 1.0.106)

| Where | How you get there | Literal text on screen |
|---|---|---|
| Settings screen | Left nav / hamburger → **Settings** (`/settings`) | — |
| Tap to Pay settings card | Scroll down the Settings page, below **MFA** and the artist payout card | Card title: **"Tap to Pay on iPhone"** with the `wave.3.right.circle.fill` symbol. Description: *"Enable Tap to Pay on iPhone, accept Apple's Terms, and reopen the How to Tap guide anytime — outside of checkout."* |
| Readiness banner (same card) | — | Green: **"Location ready for Tap to Pay"**, then **"This phone is ready for Tap to Pay"** / *"Velbok 1.0.106 · release build…"* |
| **The 3.5 action** | In that card | Gold button, wave symbol: **"Enable Tap to Pay on iPhone"** |
| Re-open education (4.3) | Same card, next to it | **"Show How to Tap guide"** |
| Diagnostics | Same card, bottom | **"Copy Tap to Pay diagnostics"** |
| Checkout | Left nav → **Checkout** (`/checkout`) | Title **"Checkout"**, subtitle *"Take payment at the desk with a WisePad reader or Tap to Pay on this phone."* |
| POS setup dialog | Checkout, top-right | Button **"POS setup"** (gear icon) → dialog **"POS setup guide"** |
| Reader-mode switch (fallback) | Inside that dialog | Radio group **"How do you take card payments?"** → **"WisePad (separate card reader)"** / **"This phone (Tap to Pay)"** |
| **The checkout CTA (button HIG)** | Checkout, right-hand order summary, full-width gold button, `h-14` | `wave.3.right.circle.fill` + **"Tap to Pay on iPhone"**, amount printed underneath |
| Fallback caption | Directly under that button | *"If the card cannot complete contactless, switch to WisePad (Bluetooth reader) in POS setup, or ask for another contactless card or wallet."* |
| Non-Tap-to-Pay charge button | Only when reader mode is WisePad | **"Charge £120.00"** with a credit-card icon |
| Payment link fallback | Left nav → **Billing** → **Invoices** → an unpaid invoice | **"Copy Pay Link"** → toast *"Invoice payment link copied"* |

**What happens when you tap "Enable Tap to Pay on iPhone" in Settings** (`TapToPaySettingsCard.enable()` → `PosCheckoutPage`):

1. Reader mode is forced to `tap_to_pay`, and the local "education already shown" flag is cleared.
2. Navigate to `/checkout?enableTapToPay=1`.
3. Checkout auto-runs `runTapToPayEnable()`: readiness check → non-blocking toast *"Apple is opening its Tap to Pay on iPhone Terms and Conditions. Scroll to the end and tap Agree to continue."* → all Velbok overlays closed → `discoverAndConnect({ forceReconnect: true })`.
4. **Apple's native Terms & Conditions sheet appears** (raised by ProximityReader inside `connectReader`). Velbok never draws its own "terms" UI.
5. The moment connect returns, `presentTapToPayEducation()` runs → **Apple's "How to Tap" education** (`ProximityReaderDiscovery`, with a settle-and-retry so it is not swallowed by the dismissing sheet).
6. Then Velbok's own **"Try Tap to Pay on iPhone"** dialog → **"Go to Checkout"**, and a success toast *"This phone is ready for Tap to Pay"*.

That is requirement 3.5 immediately followed by 4.1, in one uninterrupted machine-driven sequence — which is exactly what the video has to show.

---

## 4. Getting the PIN pad to appear (UK)

PIN is decided by the card, the amount and the region — not by Velbok. Stripe: *"Some contactless card transactions above certain amounts require additional cardholder verification methods (CVM) such as PIN entry. Tap to Pay on iPhone supports PIN entry for devices running iOS 16.4 or later."*

### 4.1 Live mode (Option A) — charge above the UK contactless limit

- The UK contactless **no-CVM limit is £100**. Above it, the card demands cardholder verification, and Tap to Pay on iPhone presents Apple's on-device PIN pad.
- **Charge £120.00.** Concrete recipe in Velbok: Checkout → **"Add custom item"** → name *"Demo service"*, price **120**, quantity **1** → **"Add to order"**. With VAT 0% and gratuity off, the order total and "Amount due" both read **£120.00**.
- Use a **physical contactless debit/credit card**. Do **not** use Apple Pay / Google Pay — wallets perform verification on the customer's own device, so no PIN pad will ever appear on your iPhone.
- Not every card behaves identically: some issuers decline above-limit contactless outright instead of asking for PIN. Bring **two or three cards from different banks** and be ready for a second attempt at the same amount.
- Refund afterwards in the **Stripe Dashboard** (Velbok has no in-app refund; the checklist answer for "Is Refund supported via Tap to Pay" is **No**).

### 4.2 Sandbox mode (Option B) — deterministic PIN with a Stripe physical test card

Stripe test-card behaviour is driven by the **decimal** of the amount (https://docs.stripe.com/terminal/references/testing):

| Amount ends in | Result |
|---|---|
| `.03` | **PIN entry requested** — this is Stripe's documented way to test PIN in markets where PIN is accepted. Enter any 4-digit PIN. |
| `.02` | `offline_pin_required` — PIN requested if the reader supports chip entry |
| `.00` | Approved, no PIN |
| `.05` | `generic_decline` — useful for filming the fallback |
| `.55` | `incorrect_pin` |

Default PIN for Stripe physical test cards is **1234**. Requires: sandbox keys, a **production/release** build (simulated readers cannot take a physical tap), and a physical test card ordered from the Stripe Dashboard. Charge e.g. **£120.03** and make sure VAT and gratuity are zero so the final amount really ends in `.03`.

**On camera:** angle the shot so the PIN pad is clearly visible as a screen, but the individual digits you press are not legible. Apple's design intentionally resists capture of PIN information; showing that the PIN step exists is what the requirement asks for, not the PIN itself.

---

## 5. Shot list

Timings are minimums — err on the slow side, reviewers scrub. Requirement IDs use Apple's checklist v1.6 numbering, with your rejection points in brackets.

### TAKE A — one continuous take: 3.5 → 4.1 → button → payment → PIN

| # | Do this | On screen | Hold | Satisfies |
|---|---|---|---|---|
| 1 | Start camera. Show the iPhone unlocked, home screen, tap the Velbok icon. | App launch | 3–4 s | Context: real device, real app |
| 2 | Go to **Settings**, scroll to the **"Tap to Pay on iPhone"** card. Do not tap yet. | Card title + green **"This phone is ready for Tap to Pay"** + **"Velbok 1.0.106 · release build"** + iPhone model | 6–8 s, steady | 1.1 device support, version proof |
| 3 | Point the camera slightly closer at the card so the **"Enable Tap to Pay on iPhone"** button and its wave symbol are readable. | Gold button with `wave.3.right.circle.fill` | 4–5 s | **3.5** [your #1], **3.6** (enable outside checkout), 5.4/5.5 wording + symbol |
| 4 | **Tap "Enable Tap to Pay on iPhone".** | Navigation to **Checkout**, then toast *"Apple is opening its Tap to Pay on iPhone Terms and Conditions. Scroll to the end and tap Agree to continue."* | Let it run — do not touch anything | **3.5** [your #1] — a clear, discoverable merchant action, before any payment |
| 5 | **Apple's native Terms & Conditions sheet appears.** Scroll it visibly from top to bottom at reading speed. | Apple's own sheet (Apple branding, Apple's copy) | 10–20 s — genuinely scroll it | **3.5**, **1.6** (terms state owned by Apple, not Velbok) |
| 6 | Tap **Agree / Continue** on Apple's sheet. Keep filming; do not touch the phone afterwards. | Sheet dismisses | — | **3.5** accepted on camera |
| 7 | **Do nothing.** Apple's **"How to Tap"** education opens by itself. | Apple's education overlay (how to hold the card, where to tap) | Page through all its screens, 10–20 s | **4.1** + **4.2** [your #2] — education immediately after terms, in sequence |
| 8 | Dismiss Apple's education normally (Done/Continue). | Velbok's **"Try Tap to Pay on iPhone"** dialog: *"You're set up. Open Checkout to take a practice payment…"*, plus toast *"This phone is ready for Tap to Pay"* | 4–5 s | **3.9** try-it screen |
| 9 | Tap **"Go to Checkout"**. | Checkout screen, empty cart | 2–3 s | — |
| 10 | Add the sale: **"Add custom item"** → *Demo service*, **120**, qty 1 → **"Add to order"**. Type client name *Demo Client*. | Order summary: Total **£120.00**, Amount due **£120.00** | 8–10 s | 5.x checkout context |
| 11 | Hold the camera close on the checkout CTA **without tapping**. Let the reviewer read the symbol and the words. | Full-width gold button: `wave.3.right.circle.fill` + **"Tap to Pay on iPhone"**, **£120.00** underneath, and the caption *"If the card cannot complete contactless, switch to WisePad…"* | 6–8 s, absolutely still | **5.1** prominence, **5.4** exact copy, **5.5** SF Symbol [your #3], **5.11** fallback disclosed up front |
| 12 | Tap the button. | Velbok *"Configuring Tap to Pay on iPhone…"* / *"Processing payment…"* if shown, then **Apple's card-read sheet** ("Hold card near…", amount, merchant name) | Until the sheet is stable, 4–6 s | **5.6/5.7/5.8** initializing + processing states |
| 13 | Tap the **physical contactless card** on the top edge of the iPhone. When Apple's **PIN pad** appears, say what it is, then enter the PIN with the pad angled away from legibility. Wait for the result. | Apple PIN entry → Velbok **"Payment approved"** with **£120.00**, then the receipt panel (QR, **"Email receipt PDF"**, **"Text receipt link"**) | Hold the approved screen 6–8 s | **4.7/5.11 PIN** [your #4], **5.9** approved state, **5.10** digital receipt |

**Stop Take A here.** You now have 3.5 → 4.1 → button → payment → PIN in one unbroken shot.

### TAKE B — fallback when Tap to Pay cannot complete (continuation, or a second file)

Film this *after* Take A, for the reader-mode reason in §0.4.

| # | Do this | On screen | Hold | Satisfies |
|---|---|---|---|---|
| 14 | Back on Checkout with a **£120.00** order, point at the caption under the CTA and read it aloud. | *"If the card cannot complete contactless, switch to WisePad (Bluetooth reader) in POS setup, or ask for another contactless card or wallet."* | 5–6 s | **5.11** fallback is disclosed in the payment UI |
| 15 | *(Only if you can force a failure — sandbox amount ending `.05`, or a card you know declines above the limit.)* Attempt the tap and let it fail. | **"Payment declined"** / **"Payment cancelled"** + detail line + **Done** | 5–6 s | **5.9** declined/timed-out state |
| 16 | Tap **Done**, then **"POS setup"** (top right) → in **"How do you take card payments?"** select **"WisePad (separate card reader)"**. | POS setup guide dialog, radio switching to WisePad, WisePad panels appear | 6–8 s | **5.11** merchant can switch payment method |
| 17 | Close the dialog, tap **"Connect WisePad"**, wait for **"WisePad connected"**, then tap **"Charge £120.00"** and complete the payment on the reader (insert/tap + PIN on the reader). | Reader status badge, then **"Payment approved"** | As long as it takes | **5.11** fallback actually completes the sale |
| 18 | Second fallback: left nav → **Billing** → **Invoices** → unpaid invoice → **"Copy Pay Link"**. | Toast **"Invoice payment link copied"** | 4–5 s | **5.11** remote payment-link fallback |
| 19 | Close-out shot: **Settings → Tap to Pay on iPhone → "Show How to Tap guide"** and let Apple's education open again. | Apple's education overlay, reached outside checkout | 6–8 s | **4.3** education available from Settings/Help |
| 20 | Restore state: in that same card tap **"Enable Tap to Pay on iPhone"** so reader mode goes back to Tap to Pay. Stop recording. | — | — | Housekeeping (§0.4) |

---

## 6. Narration / caption text, shot by shot

Plain and factual. Say the requirement number out loud — reviewers like being told which box you are ticking.

- **Shot 1–2:** "This is Velbok version 1.0.106, a release build, running on iPhone with iOS 18. Bundle identifier com.velbok.app. Payments are processed by Stripe Terminal. The merchant is in the United Kingdom."
- **Shot 3:** "Requirement 3.5 and 3.6. Outside of checkout, in Settings, Velbok shows a Tap to Pay on iPhone card with a clear action: Enable Tap to Pay on iPhone. No payment has been attempted."
- **Shot 4:** "I am tapping Enable Tap to Pay on iPhone. Velbok hands over to Apple immediately — it does not present any terms of its own."
- **Shot 5:** "This is Apple's Tap to Pay on iPhone Terms and Conditions sheet, presented by ProximityReader inside Stripe's connectReader. I am scrolling through it."
- **Shot 6:** "I am accepting Apple's Terms and Conditions. That completes requirement 3.5."
- **Shot 7:** "Requirement 4.1 and 4.2. I have not touched the phone. Apple's How to Tap merchant education has opened automatically, immediately after terms acceptance, using ProximityReaderDiscovery on iOS 18."
- **Shot 8:** "Requirement 3.9. Velbok now invites the merchant to try Tap to Pay and go to checkout."
- **Shot 10:** "I am creating a sale of one hundred and twenty pounds."
- **Shot 11:** "Requirements 5.1, 5.4 and 5.5. The checkout button uses Apple's SF Symbol wave.3.right.circle.fill and the exact wording Tap to Pay on iPhone. It is the primary, full-width action and it is never greyed out. Underneath, Velbok tells the merchant what to do if the card cannot complete contactless."
- **Shot 12:** "I am tapping the button. Velbok shows its configuring and processing states, then Apple's card-read sheet appears with the amount and the merchant name."
- **Shot 13:** "The customer is tapping a physical contactless card. The amount is above the United Kingdom one hundred pound contactless limit, so the card requires cardholder verification. This is Apple's PIN entry screen on the merchant iPhone — requirement 5.11 for the United Kingdom. I will not show the digits. The payment is approved, and Velbok offers a digital receipt by QR code, email or text — requirements 5.9 and 5.10."
- **Shot 14:** "Requirement 5.11, fallback. Velbok states the fallback directly in the payment UI: switch to a WisePad Bluetooth card reader in POS setup, or ask for another contactless card or wallet."
- **Shot 15:** "This payment could not complete with Tap to Pay. Velbok shows the declined state and no charge was taken."
- **Shot 16–17:** "I am switching the reader mode to WisePad, a Stripe Bluetooth card reader, and taking the same one-hundred-and-twenty-pound payment on that reader, with PIN entered on the reader. Velbok merchants always have this hardware fallback."
- **Shot 18:** "The second fallback is a remote Stripe payment link, created from Billing and sent to the customer."
- **Shot 19:** "Requirement 4.3. Apple's How to Tap education can be reopened at any time from Settings, outside of checkout."

If you caption instead of narrating, use the same sentences as on-screen text, top or bottom third, at least 3 seconds each, with the requirement number first: e.g. `REQ 3.5 — Merchant taps "Enable Tap to Pay on iPhone" in Settings`.

---

## 7. Failure modes while filming, and how to recover

| Symptom | Cause | Recovery |
|---|---|---|
| **Apple's Terms sheet never appears; connect finishes in a few seconds** | Merchant ID has already accepted (the reset did not propagate, or you used the same Stripe account) | Stop filming. Confirm with **Copy Tap to Pay diagnostics**: a connect under ~12 s means Apple had nothing to ask. Redo §2.1, reboot, wait longer, or move to a sandbox account (§2.2). Do not try to fake it. |
| **Nothing happens when you tap "Enable Tap to Pay on iPhone"** | Not an admin, POS disabled, Connect not ready, no Terminal location, or simulated reader on | Read the toast — it names the reason. Fix in **Admin → POS checkout** / Stripe Connect, then retry. |
| **Education (How to Tap) does not open; you get a toast instead** | iOS below 18, iPad, or the build lacks the entitlement | Toast reads *"Setup finished, but Apple's How to Tap guide could not open…"*. Update to iOS 18+ and install an entitled release build. **Do not submit a take without Apple's education** — that is the 4.1 rejection repeating. |
| **Education flashes and disappears** | A Velbok modal won the presentation slot | 1.0.106 already waits for overlays to close and retries once (`settledPresentationHost`). Retry the enable from Settings; the enable path clears the education flag every time, so it replays. |
| **Connect hangs on "Activating Tap to Pay… first setup can take 1–2 minutes"** | First-ever configuration download on this device | Keep Velbok in the foreground, do not lock the screen. Let it finish; the timeout is generous. Film it — requirement 5.7 wants this state shown. |
| **PIN pad never appears** | Amount at or below £100, wallet used instead of a card, or issuer declined instead of stepping up | Re-run at £120.00 with a **physical** card; try a different bank's card; in sandbox use an amount ending `.03` with a Stripe physical test card. |
| **Tap to Pay enable does nothing after you touched WisePad** | `readerMode` is `bluetooth` in localStorage | Use **Settings → Tap to Pay on iPhone → Enable Tap to Pay on iPhone** (forces the mode back). 1.0.106 also self-corrects on the checkout deep link. |
| **"Fix this on your phone before enabling payments"** | Hard blocker: debug build, location denied, iPad, missing entitlement | The alert lists the exact blocker. Fix, force-close Velbok, reopen. |
| **Payment declined on a real card above the limit** | Issuer policy | Try another card. Then use the decline as your Shot 15 fallback material — it is genuinely useful footage. |
| **Screen recording shows black where Apple's UI should be** | By design (§0.3) | Expected. Use the external-camera file as the submission. |

Immediately after each take, before you touch anything: **Settings → Tap to Pay on iPhone → "Copy Tap to Pay diagnostics"** and paste the trace somewhere safe. It timestamps `enable.connect.start`, `enable.connect.ok`, `education.presented` and proves the sequence.

---

## 8. What to write to Apple in the resubmission

Reply on the existing thread to **ttpoientitlements@apple.com**, subject keeping **Case-ID: 20962240**. Fill in the real timestamps from your final file.

> **Case-ID: 20962240 — Velbok (com.velbok.app) — Tap to Pay on iPhone publishing entitlement, resubmission**
>
> Thank you for the previous feedback. We have addressed each point and re-recorded the demonstration. Velbok is a UK studio-management app; payments are processed through Stripe Terminal. The recording was made with an external camera pointed at the device, because iOS prevents screen recording from capturing Tap to Pay PIN entry.
>
> Device / build in the video: iPhone <model>, iOS <version>, Velbok **1.0.106 (build 106)**, release build signed with a profile containing `com.apple.developer.proximity-reader.payment.acceptance`. The app version is visible on screen at **00:0X**.
>
> **Requirement 3.5 — clear action to accept Apple's Terms and Conditions, before any payment.** `00:0X–00:0X`. In **Settings → Tap to Pay on iPhone** (outside checkout, satisfying 3.6) the merchant taps **"Enable Tap to Pay on iPhone"**. Velbok presents no terms UI of its own; it calls Stripe's `connectReader` and **Apple's own Terms and Conditions sheet** is shown at `00:0X`, scrolled and accepted at `00:0X`. Terms state is never stored locally — it is owned by Apple/Stripe (requirement 1.6). Only merchants with billing permission can perform this action (3.8); other users are told to contact an administrator.
>
> **Requirement 4.1 / 4.2 — merchant education immediately after enabling.** `00:0X–00:0X`. With no further merchant interaction, Apple's **How to Tap** education is presented via `ProximityReaderDiscovery.content(for: .payment(.howToTap))` on iOS 18, in the same code path that returns from `connectReader`. The video shows the terms sheet dismissing and Apple's education appearing in sequence. Requirement 3.9: Velbok then offers a "Try Tap to Pay on iPhone" screen. Requirement 4.3: the same education can be reopened at any time from **Settings → Tap to Pay on iPhone → "Show How to Tap guide"**, shown at `00:0X`.
>
> **Requirements 5.1 / 5.4 / 5.5 — checkout button.** `00:0X–00:0X`. The primary checkout action is a full-width button using the official SF Symbol **`wave.3.right.circle.fill`** (rendered by UIKit and passed to the app's WebView) with the exact regional wording **"Tap to Pay on iPhone"**. It is the first and most prominent payment action, and it is never disabled for "not enabled" — tapping it when Tap to Pay is not yet enabled starts the enable/terms flow (5.3).
>
> **Requirement 5.11 — UK regional: PIN entry and fallback.** `00:0X–00:0X`. A £120.00 sale is taken with Tap to Pay on iPhone. Because the amount exceeds the UK £100 contactless limit, the card requires cardholder verification and **Apple's PIN entry screen** is presented on the merchant device; PIN digits are deliberately not legible in the recording. The payment is approved at `00:0X` and Velbok offers a digital receipt by QR code, email or SMS (5.9, 5.10). Fallbacks: the checkout screen permanently states *"If the card cannot complete contactless, switch to WisePad (Bluetooth reader) in POS setup, or ask for another contactless card or wallet."* At `00:0X` the merchant switches reader mode to a **Stripe WisePad 3 Bluetooth reader** and completes the same sale there; at `00:0X` a **Stripe payment link** is generated from Billing → Invoices as a remote fallback.
>
> Also attached: the completed **App Review Requirements Checklist 1.6**. Refunds are not offered through Tap to Pay on iPhone in this version. Supported schemes via Stripe Terminal: Visa, Mastercard, American Express.
>
> Please let us know if you need any additional footage and we will record it the same day.

Attach: the camera video (Take A, and Take B either appended or as a second file), the completed checklist, and — optionally — the pasted `[VELBOK-TTP]` diagnostics trace showing `enable.connect.start` → `enable.connect.ok` → `education.presented` for the filmed run.

---

## 9. Quick reference — code behind each claim

| Claim in the video | Code |
|---|---|
| Enable action outside checkout | `src/components/settings/TapToPaySettingsCard.tsx:41-54` |
| Enable forces Tap to Pay reader mode and replays education | same file, lines 48-52 |
| Deep link auto-runs enable, corrects reader mode | `src/pages/PosCheckoutPage.tsx:253-314` |
| Apple Terms raised inside connectReader; no Velbok terms UI | `src/pages/PosCheckoutPage.tsx:945-1014`, `src/lib/terminal/nativeTerminalProvider.ts:513-708` |
| Education immediately after connect, with settle + retry | `PosCheckoutPage.tsx:864-893`, `ios/App/App/TapToPayEducationPlugin.swift:75-149` |
| Official SF Symbol in the WebView | `TapToPayEducationPlugin.swift:47-73`, `src/components/pos/TapToPayWaveIcon.tsx` |
| Exact button wording per region | `src/lib/terminal/tapToPayLabels.ts` |
| Checkout CTA, amount, fallback caption | `PosCheckoutPage.tsx:1874-1934` |
| Initializing / processing / approved / declined states | `src/components/pos/PosPaymentFlowOverlay.tsx` |
| Digital receipt (QR, email, SMS, share) | same file, lines 196-297 |
| Reader-mode switch (WisePad fallback) | `src/components/pos/PosSetupGuideDialog.tsx:74-135` |
| Payment-link fallback | `src/pages/BillingPage.tsx:146-165, 415-417` |
| Diagnostics trace + "terms likely shown" heuristic | `src/lib/terminal/tapToPayDiagnostics.ts` |

Related: `docs/apple-ttpoi/COMPLIANCE-JOURNEY.md` (full requirement-by-requirement status), `docs/pos-tap-to-pay.md` (merchant-facing POS documentation).
