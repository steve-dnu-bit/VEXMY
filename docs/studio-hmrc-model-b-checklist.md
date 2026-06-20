# Studio tax model checklist (HMRC Option B focus)

Use this with your accountant. It maps HMRC’s **hairdressing salon** guidance to tattoo studios — HMRC has no tattoo-specific VAT manual, but officers use the same “who supplies the client?” tests.

**Official HMRC references**

- [VTAXPER68600 — Three possibilities](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper68600)
- [VTAXPER68900 — Stylist supplies salon or customer?](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper68900)
- [VTAXPER69000 — Accounting consequences](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper69000)
- [VTAXPER69100 — Independent contractor guidelines (NHBF)](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper69100)
- [Employment status — hair and beauty (public)](https://www.gov.uk/guidance/check-employment-status-if-you-work-in-hair-and-beauty)

**Not tax advice.** Facts and contracts decide the model; this checklist only helps you see gaps.

---

## Which model are you aiming for?

| Model | Client buys from | Studio VAT turnover | Artist income (typical) |
|-------|----------------|---------------------|-------------------------|
| **A — Employed** | Studio | Full gross client takings | PAYE wages |
| **B — Self-employed contractor** | **Studio** | **Full gross client takings** | **Commission / fee from studio** |
| **C — Chair rental / direct** | Each artist | Studio rent & services only | Each artist’s gross client takings |

**Velbok POS (one charge on shop account + artist transfer)** aligns with **B** if your **legal and client-facing setup** matches B. Stripe does not determine the model.

---

## Part 1 — Quick outcome (5 minutes)

Answer honestly for **typical practice**, not what the contract says if reality differs.

| # | Question | B (contractor) | A (employed) | C (direct) |
|---|----------|----------------|--------------|------------|
| 1 | Client booking / receipt is mainly in **studio name**? | Yes | Yes | Often artist name |
| 2 | **Studio sets** (or must approve) session prices? | Usually yes | Yes | Usually no |
| 3 | **One payment** at desk to the studio (card/POS)? | Yes | Yes | Often artist’s money |
| 4 | Artist paid a **% or fee from studio** after the job? | Yes | N/A (wage) | No (artist keeps gross, pays rent) |
| 5 | Client told they are contracting with **named artist** as supplier? | No | No | Yes |
| 6 | Artist declares **only net from studio** on tax return (not full client price)? | Yes | N/A | No — gross takings |
| 7 | Studio declares **full client takings** for VAT (if registered)? | Yes | Yes | No — rent/services only |

**Rough read**

- Mostly column **B** → Option B is plausible; use Part 2 to tighten documentation.
- Mostly column **A** → Treat as employment (PAYE); do not rely on “self-employed” labels.
- Mostly column **C** → You are **not** Option B; studio should not treat full tattoo price as studio turnover. Payment flow and marketing usually need restructuring.

---

## Part 2 — Detailed checklist (HMRC VTAXPER69100 themes)

For each row: **Yes / No / Partly** and a one-line note. HMRC weights **money handling**, **written agreement**, and **employment status** heavily.

### Status & independence

| # | Indicator (Option **C** / direct-to-client leans Yes) | Your studio |
|---|------------------------------------------------------|-------------|
| S1 | Artist is genuinely **self-employed** (not employee) — use [CEST](https://www.tax.service.gov.uk/check-employment-status-for-tax/about-you) | |
| S2 | Artist maintains **own books** and Self Assessment | |
| S3 | Artist has **own insurance** (public liability, etc.) | |
| S4 | Artist can **suffer losses** (not guaranteed minimum pay like wage) | |
| S5 | Artist **sets own prices** (or published own price list) | |
| S6 | Artist free to work **elsewhere** / own marketing | |
| S7 | Artist can **accept or reject** clients | |
| S8 | Artist uses **own business name** on display / invoices where applicable | |

**Option B note:** Many S5–S8 are **No** in real studios — that does **not** automatically mean employment. It often means **B** (artist supplies **studio**, not client). HMRC expects fewer “C” pointers if B applies ([VTAXPER68900](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper68900)).

### Clients & marketing

| # | Indicator (Option **C** leans Yes) | Your studio |
|---|-----------------------------------|-------------|
| C1 | Client in **direct contract with artist**; client **knows** this | |
| C2 | Complaints handled by **artist**, not studio as supplier | |
| C3 | **Separate** appointment book / CRM identity per artist | |
| C4 | Reception shows **artist names, prices, portfolios** as distinct businesses | |
| C5 | **Client records** owned by artist | |

**Option B:** Usually C1 = **No**, studio handles client relationship; artist is backstage contractor.

### Money (critical for HMRC)

| # | Indicator | Option B target | Your studio |
|---|-----------|-----------------|-------------|
| M1 | Client payment is legally **studio’s sale** | Yes | |
| M2 | Studio accounts show **gross client takings** | Yes | |
| M3 | Artist paid **commission/fee** (e.g. 50%) from studio | Yes | |
| M4 | Artist tax return shows **fees from studio**, not full client gross | Yes | |
| M5 | Money described as **artist’s property** before studio split | No (that’s C) | |
| M6 | Central till/POS is **collection for studio**, then internal split | Yes | |
| M7 | Written rule: **VAT on studio sale** to client; separate VAT on artist→studio fee if artist registered | Document | |

**Velbok POS:** One PaymentIntent on **shop Connect account** + transfer to artist supports **M1, M3, M6** if contracts match.

### Studio control (employment risk)

| # | Indicator (employment / Model **A** leans Yes) | Your studio |
|---|--------------------------------------------------|-------------|
| E1 | Studio **sets hours** / rota artist must follow | |
| E2 | Studio **provides** all equipment & ink (artist doesn’t) | |
| E3 | Studio **finds all clients**; artist cannot bring own | |
| E4 | Artist must follow studio **instructions** on how to work | |
| E5 | Artist paid **fixed hourly/salary** regardless of jobs | |
| E6 | Holiday/sick pay like an employee | |

**Many Yes on E1–E6** → HMRC may treat as **employed (A)** even with “contractor” label.

### Written agreement

| # | Document | Present? | Matches practice? |
|---|----------|----------|-------------------|
| W1 | **Contractor / commission agreement** (artist supplies services to studio) | | |
| W2 | States **commission %** or fee formula (e.g. 50/50 after VAT/fees) | | |
| W3 | Termination, notice, confidentiality | | |
| W4 | Artist responsible for **own tax & NI** | | |
| W5 | **Client terms** — sale is with studio | | |
| W6 | Review date when practices change (HMRC asks this — VTAXPER68900) | | |

---

## Part 3 — Accounting alignment (what HMRC compares)

HMRC cross-checks **VAT vs Income Tax** stories ([VTAXPER68900](https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper68900)).

| Party | Option B — should show | Red flag |
|-------|------------------------|----------|
| **Studio accounts** | Turnover = **gross client payments**; expense = **artist commission/fees** | Turnover = net after artist share only |
| **Studio VAT return** (if registered) | Output tax on **full taxable sales** to clients | Only declaring studio’s retained 50% |
| **Artist Self Assessment** | Income = **amounts received from studio** | Declaring full client price as own turnover while studio also declares gross |
| **Artist** | “Chair rental” as **expense** | Usually **C**, not B |
| **Studio** | “Wages” expense | Usually **A**, not B |

---

## Part 4 — Numeric example (Option B, VAT-registered studio)

Six jobs in a month, **£100 each** ex VAT, **50%** artist commission, 20% VAT.

| | Studio | Artist (2 jobs) |
|--|--------|-----------------|
| Client pays (incl VAT) | 6 × £120 = **£720** | — |
| Taxable turnover (net) | **£600** | — |
| Output VAT | **£120** | — |
| Paid to artist | **£300** total | **£100** |
| Studio retained (net, before costs) | **£300** | — |
| Artist VAT | — | Only if artist registered on **their** supplies to studio |

---

## Part 5 — Action list if you want Option B documented

**Studio owner**

- [ ] Written **commission/contractor agreement** with each artist (services supplied **to studio**)
- [ ] Client **terms & receipts** in studio name
- [ ] Price list / booking flow shows **studio as seller**
- [ ] Accounts: record **gross POS/deposit takings**; artist payments as **subcontractor/commission**
- [ ] VAT registration monitoring on **studio gross taxable turnover**
- [ ] Run **CEST** for each artist; keep result on file
- [ ] Brief artists: they report **studio payments**, not full client price (unless you deliberately move to Model C)

**Artist**

- [ ] Self Assessment on **fees from studio**
- [ ] Own insurance & UTR
- [ ] If VAT registered: invoice studio for commission (+ VAT); studio may reclaim input VAT
- [ ] Complete **Settings → POS payout account** in Velbok (Connect) for automated split

**Velbok / ops**

- [ ] POS split % matches written commission (e.g. 50/50)
- [ ] Keep **pos_sales** / Stripe reports for accountant (gross, shop share, artist share, transfer IDs)
- [ ] Do not tell clients “half goes to artist’s business” on receipt if legal model is studio sale (internal split only)

---

## Part 6 — When to stop calling it Option B

Discuss with accountant urgently if:

- Artists are treated as **employees** in practice (E1–E6 mostly Yes)
- Marketing says **“book Artist X Ltd”** but studio books **full turnover** (mixed B/C)
- Artists declare **gross client takings** while studio also declares **gross** (double counting risk)
- You want **each artist VAT-registered on half the tattoo price** without Model C facts — Stripe split alone is not enough

---

## Part 7 — One page for your accountant

**Business:** Tattoo studio, multiple self-employed artists, client pays at desk.

**Payment tech:** Stripe Connect — direct charge on studio account; application fee + transfer of artist commission (Velbok POS).

**Intended model:** HMRC **Option B** — studio supplies client; artists supply services to studio; commission e.g. 50%.

**Ask accountant to confirm:**

1. Facts support B vs A vs C under VTAXPER68600–69100  
2. VAT registration threshold on **studio gross takings**  
3. Whether artist fees need VAT invoices (artist registrable?)  
4. Contract wording + client terms + accounts alignment  
5. CEST outcomes for each artist  

---

*Last updated: 2026-06-20 — for Inkaholics / Velbok studio operators.*
