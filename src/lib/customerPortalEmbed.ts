import { BRANDING } from "@/lib/branding";

export type CustomerPortalEmbedOptions = {
  origin: string;
  shopName: string;
  organizationId?: string;
  loginLabel?: string;
  poweredByLabel?: string;
  variant?: CustomerLoginButtonVariant;
  theme?: CustomerLoginButtonTheme;
};

/** Large centered card (default). */
export type CustomerLoginButtonVariant = "card" | "compact" | "navbar" | "pill-sm" | "pill-md" | "link";

export type CustomerLoginButtonTheme = "gold" | "light" | "dark" | "outline";

export const CUSTOMER_LOGIN_BUTTON_VARIANTS: CustomerLoginButtonVariant[] = [
  "card",
  "compact",
  "navbar",
  "pill-sm",
  "pill-md",
  "link",
];

export const CUSTOMER_LOGIN_BUTTON_THEMES: CustomerLoginButtonTheme[] = [
  "gold",
  "light",
  "dark",
  "outline",
];

type ThemeTokens = {
  buttonBg: string;
  buttonColor: string;
  buttonBorder: string;
  titleColor: string;
  mutedColor: string;
  wrapBg: string;
};

const THEMES: Record<CustomerLoginButtonTheme, ThemeTokens> = {
  gold: {
    buttonBg: "hsl(43,34%,54%)",
    buttonColor: "#0a0a0a",
    buttonBorder: "transparent",
    titleColor: "#e8e6e1",
    mutedColor: "#9ca3af",
    wrapBg: "transparent",
  },
  light: {
    buttonBg: "#ffffff",
    buttonColor: "#111827",
    buttonBorder: "#d1d5db",
    titleColor: "#111827",
    mutedColor: "#6b7280",
    wrapBg: "transparent",
  },
  dark: {
    buttonBg: "#18181b",
    buttonColor: "#fafafa",
    buttonBorder: "#3f3f46",
    titleColor: "#fafafa",
    mutedColor: "#a1a1aa",
    wrapBg: "transparent",
  },
  outline: {
    buttonBg: "transparent",
    buttonColor: "hsl(43,34%,54%)",
    buttonBorder: "hsl(43,34%,54%)",
    titleColor: "#e8e6e1",
    mutedColor: "#9ca3af",
    wrapBg: "transparent",
  },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Customer portal sign-in — includes org + intent so OAuth provisions the customer role. */
export function customerPortalLoginUrl(origin: string, organizationId?: string): string {
  const base = origin.replace(/\/$/, "");
  if (!organizationId?.trim()) {
    return `${base}/embed/customer-login`;
  }
  const params = new URLSearchParams({
    auth_intent: "customer",
    org: organizationId.trim(),
    next: "/account",
  });
  return `${base}/auth?${params.toString()}`;
}

export function customerPortalEmbedPageUrl(origin: string, shopName: string, organizationId?: string): string {
  const base = origin.replace(/\/$/, "");
  const shop = shopName.trim() || BRANDING.shopName;
  const params = new URLSearchParams({ shop });
  if (organizationId?.trim()) params.set("org", organizationId.trim());
  return `${base}/embed/customer-login?${params}`;
}

function buttonStyle(tokens: ThemeTokens, size: "lg" | "md" | "sm"): string {
  const pad = size === "lg" ? "12px 28px" : size === "md" ? "8px 18px" : "5px 12px";
  const font = size === "lg" ? "14px" : size === "md" ? "13px" : "12px";
  const radius = size === "sm" ? "999px" : "6px";
  return [
    "display:inline-block",
    `padding:${pad}`,
    `background:${tokens.buttonBg}`,
    `color:${tokens.buttonColor}`,
    `border:1px solid ${tokens.buttonBorder}`,
    "font-weight:600",
    "text-decoration:none",
    `border-radius:${radius}`,
    `font-size:${font}`,
    "letter-spacing:0.04em",
    "line-height:1.2",
    "white-space:nowrap",
  ].join(";");
}

function poweredByHtml(label: string, tokens: ThemeTokens, marginTop: string): string {
  return `<p style="margin:${marginTop} 0 0;font-size:10px;color:${tokens.mutedColor};">${escapeHtml(label)}</p>`;
}

/** Standalone login embed HTML for studio websites. */
export function buildCustomerLoginButtonEmbed(options: CustomerPortalEmbedOptions): string {
  const {
    origin,
    shopName,
    organizationId,
    loginLabel = "Login",
    poweredByLabel = "Powered by Velbok",
    variant = "card",
    theme = "gold",
  } = options;

  const loginUrl = customerPortalLoginUrl(origin, organizationId);
  const name = escapeHtml(shopName.trim() || BRANDING.shopName);
  const label = escapeHtml(loginLabel);
  const platform = BRANDING.platformName;
  const tokens = THEMES[theme];
  const btnLg = buttonStyle(tokens, "lg");
  const btnMd = buttonStyle(tokens, "md");
  const btnSm = buttonStyle(tokens, "sm");

  const comment = `<!-- ${platform} customer login (${variant}, ${theme}) — paste into your website -->`;

  if (variant === "link") {
    return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:inline-block;">
  <a href="${loginUrl}" rel="noopener noreferrer" style="font-size:13px;font-weight:600;color:${tokens.buttonColor};text-decoration:underline;text-underline-offset:3px;">${label}</a>
</div>`;
  }

  if (variant === "pill-sm") {
    return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:inline-block;">
  <a href="${loginUrl}" rel="noopener noreferrer" style="${btnSm}">${label}</a>
</div>`;
  }

  if (variant === "pill-md") {
    return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:inline-block;">
  <a href="${loginUrl}" rel="noopener noreferrer" style="${btnMd}">${label}</a>
</div>`;
  }

  if (variant === "navbar") {
    return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;">
  <span style="font-size:14px;font-weight:600;color:${tokens.titleColor};letter-spacing:0.02em;">${name}</span>
  <a href="${loginUrl}" rel="noopener noreferrer" style="${btnSm}">${label}</a>
</div>`;
  }

  if (variant === "compact") {
    return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:260px;margin:0 auto;text-align:center;padding:4px 0;">
  <p style="margin:0 0 10px;font-size:15px;font-weight:600;color:${tokens.titleColor};">${name}</p>
  <a href="${loginUrl}" rel="noopener noreferrer" style="${btnMd}">${label}</a>
  ${poweredByHtml(poweredByLabel, tokens, "10px")}
</div>`;
  }

  // card (default)
  return `${comment}
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:320px;margin:0 auto;text-align:center;padding:8px 0;">
  <p style="margin:0 0 14px;font-size:1.125rem;font-weight:600;color:${tokens.titleColor};letter-spacing:0.02em;">${name}</p>
  <a href="${loginUrl}" rel="noopener noreferrer" style="${btnLg}">${label}</a>
  ${poweredByHtml(poweredByLabel, tokens, "14px")}
</div>`;
}

/** iframe embed — full login form hosted on your Velbok app. */
export function buildCustomerLoginIframeEmbed(options: CustomerPortalEmbedOptions): string {
  const { origin, shopName, organizationId, poweredByLabel = "Powered by Velbok" } = options;
  const iframeSrc = customerPortalEmbedPageUrl(origin, shopName, organizationId);
  const platform = BRANDING.platformName;

  return `<!-- ${platform} customer login form — paste into your website -->
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:360px;margin:0 auto;">
  <iframe src="${iframeSrc}" title="${escapeHtml(shopName.trim() || BRANDING.shopName)} customer login" style="display:block;width:100%;height:440px;border:1px solid hsla(43,34%,54%,0.35);border-radius:12px;background:#101216;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <p style="margin:10px 0 0;text-align:center;font-size:11px;color:#9ca3af;">${escapeHtml(poweredByLabel)}</p>
</div>`;
}

export type CustomerLoginEmbedPreset = {
  id: CustomerLoginButtonVariant;
  labelKey: string;
  descKey: string;
  previewWrapClass?: string;
};

export const CUSTOMER_LOGIN_EMBED_PRESETS: CustomerLoginEmbedPreset[] = [
  { id: "card", labelKey: "admin.websiteEmbedVariantCard", descKey: "admin.websiteEmbedVariantCardDesc" },
  { id: "compact", labelKey: "admin.websiteEmbedVariantCompact", descKey: "admin.websiteEmbedVariantCompactDesc" },
  { id: "navbar", labelKey: "admin.websiteEmbedVariantNavbar", descKey: "admin.websiteEmbedVariantNavbarDesc" },
  { id: "pill-sm", labelKey: "admin.websiteEmbedVariantPillSm", descKey: "admin.websiteEmbedVariantPillSmDesc" },
  { id: "pill-md", labelKey: "admin.websiteEmbedVariantPillMd", descKey: "admin.websiteEmbedVariantPillMdDesc" },
  { id: "link", labelKey: "admin.websiteEmbedVariantLink", descKey: "admin.websiteEmbedVariantLinkDesc" },
];
