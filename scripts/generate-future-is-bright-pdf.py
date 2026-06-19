"""Generate Velbok scaling capacity PDF for desktop."""
from fpdf import FPDF


class ReportPDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(100, 100, 100)
        self.cell(0, 8, "Velbok - Platform Scaling & Capacity Planning", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(2)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")

    def section_title(self, title: str):
        self.set_x(self.l_margin)
        self.ln(4)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(20, 20, 20)
        self.multi_cell(0, 8, title)
        self.ln(2)

    def sub_title(self, title: str):
        self.set_x(self.l_margin)
        self.ln(2)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 7, title)
        self.ln(1)

    def body(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def bullet(self, text: str):
        self.set_x(self.l_margin)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(30, 30, 30)
        self.multi_cell(0, 5.5, f"  -  {text}")

    def table_row(self, cols: list[str], bold: bool = False, fill: bool = False):
        self.set_x(self.l_margin)
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 9)
        if fill:
            self.set_fill_color(245, 245, 245)
        col_w = (self.w - self.l_margin - self.r_margin) / len(cols)
        for col in cols:
            self.cell(col_w, 7, col, border=1, fill=fill)
        self.ln()


def build_pdf(output_path: str):
    pdf = ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(10, 10, 10)
    pdf.cell(0, 12, "The Future Is Bright", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 8, "Velbok Platform Scaling & Capacity Planning", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    pdf.body(
        "This document estimates computing and infrastructure needs as Velbok grows from "
        "100 shops to 100,000 shops, with 1,000 to 5,000 customers per shop. "
        "It is based on the actual Velbok architecture: React SPA on Netlify, Supabase "
        "(Postgres, Auth, Storage, Realtime, Edge Functions), Stripe, SMTP/Resend email, "
        "and capped AI stencil generation."
    )

    pdf.section_title("What You Are Running Today")
    pdf.table_row(["Layer", "Service", "Scaling note"], bold=True, fill=True)
    pdf.table_row(["Frontend", "Netlify (static React SPA)", "Scales easily; cheap at any size"])
    pdf.table_row(["Database / auth / storage / realtime", "Supabase (Postgres)", "Main bottleneck"])
    pdf.table_row(["Background jobs", "pg_cron every 15 min + triggers", "Global scans - won't scale as-is"])
    pdf.table_row(["Payments", "Stripe", "Offloads payment compute"])
    pdf.table_row(["Email", "SMTP / Resend", "Scales with volume/cost"])
    pdf.table_row(["AI stencils", "Edge function + Netlify AI", "Capped (quotas per user/org, 12-24h retention)"])

    pdf.body(
        "Current architecture is single-tenant per Supabase project, with multi-tenant SaaS as the "
        "next phase. At 100,000 shops, one shared database (or 100,000 separate projects) both break "
        "down - you need multi-tenant isolation plus sharding/cells before you get there."
    )

    pdf.section_title("Assumptions for the Math (per shop, mid-range)")
    pdf.bullet("3,000 customers (CRM records; not all have login accounts)")
    pdf.bullet("~6,000 bookings (~2 years of history)")
    pdf.bullet("~8 staff users")
    pdf.bullet("~150 portal customers with accounts")
    pdf.bullet("~30,000 chat messages over time")
    pdf.bullet("~4,000 consent PDFs (~200 KB each ~ 800 MB/shop long-term)")
    pdf.ln(2)
    pdf.body("These are planning numbers, not guarantees.")

    pdf.section_title("Scale Tiers")

    pdf.sub_title("100 shops (~300,000 customers)")
    pdf.table_row(["Resource", "Estimate"], bold=True, fill=True)
    pdf.table_row(["DB rows", "~600k bookings, ~300k clients, ~3M chat msgs"])
    pdf.table_row(["DB storage", "20-80 GB (with indexes + PDFs)"])
    pdf.table_row(["Object storage", "50-100 GB"])
    pdf.table_row(["Peak concurrent users", "100-300 staff + portal users"])
    pdf.table_row(["Infra", "Supabase Pro / Medium compute"])
    pdf.table_row(["Monthly infra (rough)", "$150-500"])
    pdf.body("Verdict: Fine on current stack after proper multi-tenant organization_id on all tables.")

    pdf.sub_title("1,000 shops (~3 million customers)")
    pdf.table_row(["Resource", "Estimate"], bold=True, fill=True)
    pdf.table_row(["DB rows", "~6M bookings, ~3M clients, ~30M messages"])
    pdf.table_row(["DB storage", "200 GB - 1 TB"])
    pdf.table_row(["Object storage", "0.5-1 TB"])
    pdf.table_row(["Peak concurrent", "1,000-3,000"])
    pdf.table_row(["Infra", "Supabase Large compute + read replica"])
    pdf.table_row(["Monthly infra (rough)", "$1,500-5,000"])
    pdf.body(
        "Verdict: Needs partitioning (bookings/messages by organization_id + date), better indexes, "
        "and queue-based cron instead of one global 15-minute scan."
    )

    pdf.sub_title("10,000 shops (~30 million customers)")
    pdf.table_row(["Resource", "Estimate"], bold=True, fill=True)
    pdf.table_row(["DB rows", "~60M bookings, ~30M clients, ~300M messages"])
    pdf.table_row(["DB storage", "2-8 TB"])
    pdf.table_row(["Peak concurrent", "10k-30k"])
    pdf.table_row(["Infra", "Sharded Postgres (multiple clusters)"])
    pdf.table_row(["Monthly infra (rough)", "$15k-60k"])
    pdf.body(
        "Verdict: One monolithic DB is not realistic. Move to cell-based architecture "
        "(e.g. 500-2,000 shops per DB shard)."
    )

    pdf.sub_title("100,000 shops (~300 million customers)")
    pdf.table_row(["Resource", "Estimate"], bold=True, fill=True)
    pdf.table_row(["DB rows", "~600M bookings, ~300M clients, ~3B messages"])
    pdf.table_row(["DB storage", "20-80 TB"])
    pdf.table_row(["Peak concurrent", "50k-150k"])
    pdf.table_row(["Infra", "Multi-region, many shards, dedicated platform team"])
    pdf.table_row(["Monthly infra (rough)", "$150k-500k+"])
    pdf.body(
        "Verdict: Full SaaS platform territory (Shopify/Calendly-scale ops), not just "
        "'upgrade Supabase tier.'"
    )

    pdf.section_title("What Actually Limits You (in order)")
    pdf.bullet("1. Postgres - bookings, messages, consent records grow forever.")
    pdf.bullet(
        "2. Multi-tenant isolation - many tables still behave like single-studio. "
        "At scale, every query must be scoped by organization_id with proper indexes."
    )
    pdf.bullet(
        "3. Cron jobs - send-booking-reminders / send-aftercare-emails every 15 minutes "
        "over all shops will time out. Replace with per-org job queues."
    )
    pdf.bullet(
        "4. Realtime - chat/deposits/stock use Supabase channels; connection limits "
        "become costly past ~1k-5k concurrent."
    )
    pdf.bullet("5. AI stencils - not the main problem; quotas cap cost. Storage is short-lived.")
    pdf.bullet("6. Netlify frontend - basically free at all these sizes.")

    pdf.sub_title("Scaling bottleneck flow")
    pdf.body(
        "More shops -> Postgres size + query speed -> RLS without org_id indexes -> "
        "Global cron/reminder jobs -> Realtime connection limits -> "
        "Chat media + consent PDF storage -> Email volume"
    )

    pdf.section_title("Practical Roadmap")
    pdf.table_row(["Milestone", "What to do"], bold=True, fill=True)
    pdf.table_row(["100 shops", "Finish multi-tenant RLS, organization_id on all core tables, org-scoped indexes"])
    pdf.table_row(["1,000 shops", "Read replica, archive old bookings, queue-based reminders, CDN for assets"])
    pdf.table_row(["10,000 shops", "Shard by region or shop ID range; separate read/write paths for chat"])
    pdf.table_row(["100,000 shops", "Multi-region cells, cold storage for old data, dedicated SRE/DBA"])

    pdf.section_title("Bottom Line - Computing Power by Tier")
    pdf.table_row(["Shops", "Computing power (plain English)"], bold=True, fill=True)
    pdf.table_row(["100", "1 medium Postgres instance (4-8 vCPU, 16-32 GB RAM)"])
    pdf.table_row(["1,000", "1 large Postgres + replica (8-16 vCPU, 64+ GB RAM)"])
    pdf.table_row(["10,000", "5-20 database shards, worker pool for jobs"])
    pdf.table_row(["100,000", "50-200+ shards, multi-region, platform engineering team"])

    pdf.ln(4)
    pdf.body(
        "You do not need a fixed 'X vCPUs' upfront. You need tiered architecture that evolves "
        "with shop count."
    )
    pdf.body(
        "Revenue check: at pricing of ~GBP 15-30/shop/month, 100k shops is roughly "
        "GBP 1.5M-3M MRR. At that point, $150k-500k/mo infra (5-15% of revenue) is normal "
        "for a B2B SaaS like this."
    )

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.multi_cell(
        0,
        5,
        "Generated from Velbok codebase analysis - Netlify + Supabase + Stripe architecture. "
        "June 2026.",
    )

    pdf.output(output_path)


if __name__ == "__main__":
    out = r"C:\Users\mrtat\Desktop\future is bright.pdf"
    build_pdf(out)
    print(f"Saved: {out}")
