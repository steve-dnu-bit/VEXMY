import { BRANDING } from "@/lib/branding";

export type CustomerPortalEmbedOptions = {
  origin: string;
  shopName: string;
  loginLabel?: string;
  poweredByLabel?: string;
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function customerPortalLoginUrl(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth?next=${encodeURIComponent("/account")}`;
}

export function customerPortalEmbedPageUrl(origin: string, shopName: string): string {
  const base = origin.replace(/\/$/, "");
  const shop = shopName.trim() || BRANDING.shopName;
  return `${base}/embed/customer-login?shop=${encodeURIComponent(shop)}`;
}

/** Standalone login button + shop name + Powered by Velbok (for any website). */
export function buildCustomerLoginButtonEmbed(options: CustomerPortalEmbedOptions): string {
  const { origin, shopName, loginLabel = "Login", poweredByLabel = "Powered by Velbok" } = options;
  const loginUrl = customerPortalLoginUrl(origin);
  const name = escapeHtml(shopName.trim() || BRANDING.shopName);
  const platform = BRANDING.platformName;

  return `<!-- ${platform} customer login — paste into your website -->
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:320px;margin:0 auto;text-align:center;padding:8px 0;">
  <p style="margin:0 0 14px;font-size:1.125rem;font-weight:600;color:#e8e6e1;letter-spacing:0.02em;">${name}</p>
  <a href="${loginUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 28px;background:hsl(43,34%,54%);color:#0a0a0a;font-weight:600;text-decoration:none;border-radius:6px;font-size:14px;letter-spacing:0.06em;">${escapeHtml(loginLabel)}</a>
  <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;">${escapeHtml(poweredByLabel)}</p>
</div>`;
}

/** iframe embed — full login form hosted on your Velbok app (same origin as auth). */
export function buildCustomerLoginIframeEmbed(options: CustomerPortalEmbedOptions): string {
  const { origin, shopName, poweredByLabel = "Powered by Velbok" } = options;
  const iframeSrc = customerPortalEmbedPageUrl(origin, shopName);
  const platform = BRANDING.platformName;

  return `<!-- ${platform} customer login form — paste into your website -->
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:360px;margin:0 auto;">
  <iframe src="${iframeSrc}" title="${escapeHtml(shopName.trim() || BRANDING.shopName)} customer login" style="display:block;width:100%;height:440px;border:1px solid hsla(43,34%,54%,0.35);border-radius:12px;background:#101216;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
  <p style="margin:10px 0 0;text-align:center;font-size:11px;color:#9ca3af;">${escapeHtml(poweredByLabel)}</p>
</div>`;
}
