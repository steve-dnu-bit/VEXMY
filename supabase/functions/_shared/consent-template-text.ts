import type { ConsentFormContent } from "./default-consent-templates.ts";

export type ConsentTemplateVars = {
  shopName?: string | null;
  artistName?: string | null;
};

export function renderConsentTemplateText(template: string, vars: ConsentTemplateVars): string {
  const shopName = vars.shopName?.trim() || "the studio";
  const artistName = vars.artistName?.trim() || "the practitioner";
  return template.replace(/\{\{shopName\}\}/g, shopName).replace(/\{\{artistName\}\}/g, artistName);
}

export function formatConsentArtistLine(artistName?: string | null, shopName?: string | null): string | null {
  const artist = artistName?.trim();
  const shop = shopName?.trim();
  if (artist && shop) return `${artist} of ${shop}`;
  if (artist) return artist;
  if (shop) return shop;
  return null;
}

export function applyConsentTemplateVars(content: ConsentFormContent, vars: ConsentTemplateVars): ConsentFormContent {
  const render = (text: string) => renderConsentTemplateText(text, vars);
  return {
    ...content,
    introText: render(content.introText),
    statements: content.statements.map(render),
    declarations: {
      agree: render(content.declarations.agree),
      age: render(content.declarations.age),
      sober: render(content.declarations.sober),
      risk: render(content.declarations.risk),
      photo: render(content.declarations.photo),
    },
  };
}
