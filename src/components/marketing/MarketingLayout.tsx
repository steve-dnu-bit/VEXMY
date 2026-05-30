import { Link } from "react-router-dom";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRANDING } from "@/lib/branding";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Documentation", href: "/docs" },
  { label: "Contact", href: "/contact" },
];

const MarketingLayout = ({ children }: { children: React.ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative min-h-screen bg-[#090a0f] text-foreground">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,0.08),transparent_45%),linear-gradient(180deg,#07080d_0%,#0d0f17_100%)]" />

      <header className="sticky top-0 z-50 border-b border-[#d4af37]/30 bg-[#090a0f]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="group flex flex-col leading-none">
            <span className="font-display text-xl font-bold tracking-[0.12em] text-[#d4af37]">
              {BRANDING.platformName.toUpperCase()}
            </span>
            <span className="mt-0.5 text-[9px] tracking-[0.35em] text-[#d4af37]/70">STUDIO PLATFORM</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-[#d4af37]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button variant="gold" asChild>
              <Link to="/subscribe">Start free trial</Link>
            </Button>
          </div>

          <button
            type="button"
            className="md:hidden text-foreground"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen ? (
          <div className="border-t border-[#d4af37]/30 bg-[#090a0f] px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-sm text-muted-foreground"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link to="/contact" className="text-sm text-[#d4af37]" onClick={() => setMobileOpen(false)}>
                Contact
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
            </div>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-[#d4af37]/30 bg-[#07080d]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-lg font-semibold text-gradient-gold">{BRANDING.platformName}</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              The all-in-one platform for tattoo studios — scheduling, deposits, consent, billing, and client
              communication in one place.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]/80">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/#features" className="hover:text-foreground">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><Link to="/docs" className="hover:text-foreground">Documentation</Link></li>
              <li><Link to="/contact" className="hover:text-foreground">Contact</Link></li>
              <li><Link to="/auth" className="hover:text-foreground">Studio login</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]/80">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/terms" className="hover:text-foreground">Terms</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link to="/cookies" className="hover:text-foreground">Cookies</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {BRANDING.platformName}. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
