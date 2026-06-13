import type { ConsentFormContent } from "@/lib/defaultConsentTemplates";
import { defaultConsentForSlug } from "@/lib/defaultConsentTemplates";

export type ConsentTemplateVars = {
  shopName?: string | null;
  artistName?: string | null;
};

const LEGACY_TATTOO_INTRO =
  "I hereby declare that I give my full consent to TATTOO me and that the information given below is true to the best of my knowledge.";
const LEGACY_PIERCING_INTRO =
  "I hereby declare that I give my full consent to PIERCE me and that the information given below is true to the best of my knowledge.";
const LEGACY_TATTOO_DATA_STORAGE =
  "I give my permission for the studio to store my personal data for legal, medical, and insurance reasons.";
const LEGACY_PIERCING_DATA_STORAGE =
  "I give my permission for the studio and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.";

function replaceLegacyStudioPhrases(text: string): string {
  return text
    .replace(/\bthe studio and any piercer in the shop\b/gi, "{{shopName}} and any piercer in the shop")
    .replace(/\bfor the studio to store\b/gi, "for {{shopName}} to store")
    .replace(/\bwith the studio\b/gi, "with {{shopName}}")
    .replace(/\bthe studio\b/gi, "{{shopName}}");
}

/** Upgrade stored templates that still use the old generic studio wording. */
export function upgradeLegacyConsentContent(content: ConsentFormContent, slug: string): ConsentFormContent {
  const defaults = defaultConsentForSlug(slug === "piercing" ? "piercing" : "tattoo");
  if (!defaults) return content;

  let introText = content.introText;
  if (introText === LEGACY_TATTOO_INTRO || introText === LEGACY_PIERCING_INTRO) {
    introText = defaults.introText;
  } else if (!introText.includes("{{shopName}}") && !introText.includes("{{artistName}}")) {
    introText = replaceLegacyStudioPhrases(introText);
    if (!introText.includes("{{shopName}}") && !introText.includes("{{artistName}}")) {
      introText = defaults.introText;
    }
  }

  const statements = content.statements.map((statement) => {
    if (statement === LEGACY_TATTOO_DATA_STORAGE || statement === LEGACY_PIERCING_DATA_STORAGE) {
      return defaults.statements.find((s) => s.includes("{{shopName}}") && s.includes("personal data")) ?? statement;
    }
    if (!statement.includes("{{shopName}}") && /\bthe studio\b/i.test(statement)) {
      return replaceLegacyStudioPhrases(statement);
    }
    return statement;
  });

  const declarations = { ...content.declarations };
  for (const key of Object.keys(declarations) as Array<keyof typeof declarations>) {
    const value = declarations[key];
    if (!value.includes("{{shopName}}") && /\bthe studio\b/i.test(value)) {
      declarations[key] = replaceLegacyStudioPhrases(value);
    }
  }

  return { ...content, introText, statements, declarations };
}

export function renderConsentTemplateText(template: string, vars: ConsentTemplateVars): string {
  const shopName = vars.shopName?.trim() || "the studio";
  const artistName = vars.artistName?.trim() || "the practitioner";
  const withPlaceholders = replaceLegacyStudioPhrases(template);
  return withPlaceholders.replace(/\{\{shopName\}\}/g, shopName).replace(/\{\{artistName\}\}/g, artistName);
}

/** e.g. "Alex Rivera of Riverside Tattoo" */
export function formatConsentArtistLine(artistName?: string | null, shopName?: string | null): string | null {
  const artist = artistName?.trim();
  const shop = shopName?.trim();
  if (artist && shop) return `${artist} of ${shop}`;
  if (artist) return artist;
  if (shop) return shop;
  return null;
}

export function applyConsentTemplateVars(
  content: ConsentFormContent,
  vars: ConsentTemplateVars,
  slug = "tattoo",
): ConsentFormContent {
  const upgraded = upgradeLegacyConsentContent(content, slug);
  const render = (text: string) => renderConsentTemplateText(text, vars);
  return {
    ...upgraded,
    introText: render(upgraded.introText),
    statements: upgraded.statements.map(render),
    declarations: {
      agree: render(upgraded.declarations.agree),
      age: render(upgraded.declarations.age),
      sober: render(upgraded.declarations.sober),
      risk: render(upgraded.declarations.risk),
      photo: render(upgraded.declarations.photo),
    },
  };
}

export function consentContentNeedsLegacyUpgrade(content: ConsentFormContent, slug: string): boolean {
  const upgraded = upgradeLegacyConsentContent(content, slug);
  return JSON.stringify(upgraded) !== JSON.stringify(content);
}
