export type ConsentDeclarations = {
  agree: string;
  age: string;
  sober: string;
  risk: string;
  photo: string;
};

export type ConsentFormContent = {
  formTitle: string;
  pdfTitle: string;
  introText: string;
  healthQuestions: string[];
  statements: string[];
  placementLabel: string;
  declColumns: 1 | 2;
  declarations: ConsentDeclarations;
};

export type ConsentFormTemplateRow = {
  id?: string;
  slug: string;
  name: string;
  version: string;
  isActive: boolean;
  defaultForCategory: "tattoo" | "piercing" | null;
  sortOrder: number;
  content: ConsentFormContent;
};

const TATTOO_DATA_STORAGE =
  "I give my permission for {{shopName}} to store my personal data for legal, medical, and insurance reasons.";

const PIERCING_DATA_STORAGE =
  "I give my permission for {{shopName}} and any piercer in the shop to store my personal data for legal, medical, and insurance reasons.";

export const DEFAULT_TATTOO_CONSENT_CONTENT: ConsentFormContent = {
  formTitle: "Tattoo consent form",
  pdfTitle: "TATTOO CONSENT FORM",
  introText:
    "I hereby declare that I give my full consent to be tattooed by {{artistName}} of {{shopName}} and that the information given below is true to the best of my knowledge.",
  healthQuestions: [
    "Any heart condition?",
    "Seizures e.g. epilepsy?",
    "Hemophilia?",
    "Compromised immune system e.g. HIV/Hepatitis",
    "Diabetes",
    "Allergic responses to adhesives, plasters, creams, latex, foods, etc?",
    "Pregnant or nursing mother?",
    "Prone to fainting or dizziness?",
    "Taking blood thinning medication e.g. aspirin/wafarin?",
    "Are you under 18?",
    "Do you need extra privacy or a separate room for your treatment",
  ],
  statements: [
    "I understand that a Tattoo is a permanent mark for life and that no form of anesthetic will be used in the procedure.",
    "I understand that every care will be taken to ensure that the tattoo procedure is performed in a hygienic way including the use of pre-sterilized single use needles and plastic tubes.",
    "I understand that a new tattoo is susceptible to infection until healed and that the care of the tattoo is solely my responsibility once I leave the studio.",
    "I will follow the aftercare procedures as explained and given to me in writing.",
    "Associated risks include blood poisoning (septicemia), scarring, allergic reactions, immunological responses and localized swelling and trauma.",
    "New research could link tattooing to skin or other cancers therefore you must be aware of that possibility too.",
    TATTOO_DATA_STORAGE,
    "I consent for promotional pictures and videos to be taken of me and my new tattoo for the purpose of advertising.",
    "I AM OVER 18 YEARS OLD. (Tattooing a minor Act 1969).",
    "I AM NOT UNDER THE INFLUENCE OF ALCOHOL OR DRUGS.",
    "I HAVE REQUESTED THIS TATTOO OF MY OWN FREE WILL.",
  ],
  placementLabel: "Tattoo location / description:",
  declColumns: 2,
  declarations: {
    agree:
      "I hereby declare that I give my full consent and that the information given above is true to the best of my knowledge.",
    age: "I AM OVER 18 YEARS OLD. (Tattooing a minor Act 1969)",
    sober: "I AM NOT UNDER THE INFLUENCE OF ALCOHOL OR DRUGS.",
    risk: "I HAVE REQUESTED THIS TATTOO OF MY OWN FREE WILL.",
    photo: "I consent for promotional pictures and videos to be taken of me and my new treatment for advertising.",
  },
};

export const DEFAULT_PIERCING_CONSENT_CONTENT: ConsentFormContent = {
  formTitle: "Piercing consent form",
  pdfTitle: "PIERCING CONSENT FORM",
  introText:
    "I hereby declare that I give my full consent to be pierced by {{artistName}} of {{shopName}} and that the information given below is true to the best of my knowledge.",
  healthQuestions: [...DEFAULT_TATTOO_CONSENT_CONTENT.healthQuestions],
  statements: [
    "I understand that a Piercing could leave a permanent scar or mark.",
    "I understand that every care will be taken to ensure that the piercing procedure is performed in a hygienic way including the use of pre-sterilized single use needles and sterilized equipment.",
    "I understand that a new piercing is susceptible to infection until healed and that it is solely my responsibility to take care of it, once I leave the studio.",
    "I will follow the aftercare procedures as explained and given to me in writing.",
    "Associated risks include blood poisoning (septicemia), permanent scarring, keloid scarring, allergic reactions, localized swelling and trauma, cauliflower ear.",
    PIERCING_DATA_STORAGE,
    "I consent for promotional pictures and videos to be taken of me and my new piercing for the purpose of advertising.",
    "I have requested this piercing on my own free will and I am not under the influence of drugs or alcohol.",
    "If I am under the legal age, I understand that photocopies of our photo IDs will be made and stored.",
    "I fully acknowledge the above risks and statements and take full responsibility if any of them occur.",
  ],
  placementLabel: "Location of piercing, Description, Other:",
  declColumns: 1,
  declarations: {
    agree:
      "I hereby declare that I give my full consent and that the information given above is true to the best of my knowledge.",
    age: "If I am under the legal age, I understand that photocopies of our photo IDs will be made and stored, with parent/legal guardian consent.",
    sober:
      "I have requested this piercing on my own free will and I am not under the influence of drugs or alcohol.",
    risk: "I fully acknowledge the above risks and statements and take full responsibility if any of them occur.",
    photo: "I consent for promotional pictures and videos to be taken of me and my new treatment for advertising.",
  },
};

export function defaultConsentForSlug(slug: string): ConsentFormContent | null {
  if (slug === "piercing") return { ...DEFAULT_PIERCING_CONSENT_CONTENT, healthQuestions: [...DEFAULT_PIERCING_CONSENT_CONTENT.healthQuestions] };
  if (slug === "tattoo") return { ...DEFAULT_TATTOO_CONSENT_CONTENT, healthQuestions: [...DEFAULT_TATTOO_CONSENT_CONTENT.healthQuestions] };
  return null;
}

export function defaultConsentTemplates(): ConsentFormTemplateRow[] {
  return [
    {
      slug: "tattoo",
      name: "Tattoo consent",
      version: "1.0",
      isActive: true,
      defaultForCategory: "tattoo",
      sortOrder: 0,
      content: { ...DEFAULT_TATTOO_CONSENT_CONTENT, healthQuestions: [...DEFAULT_TATTOO_CONSENT_CONTENT.healthQuestions] },
    },
    {
      slug: "piercing",
      name: "Piercing consent",
      version: "1.0",
      isActive: true,
      defaultForCategory: "piercing",
      sortOrder: 1,
      content: { ...DEFAULT_PIERCING_CONSENT_CONTENT, healthQuestions: [...DEFAULT_PIERCING_CONSENT_CONTENT.healthQuestions] },
    },
  ];
}

export function slugFromBookingCategory(category: string, bookingType: string): "tattoo" | "piercing" {
  const cat = (category || "").toLowerCase();
  if (cat === "piercing") return "piercing";
  const bt = (bookingType || "").toLowerCase();
  if (bt === "piercing-session" || bt.includes("piercing")) return "piercing";
  return "tattoo";
}
