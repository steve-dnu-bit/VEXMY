export type DocSection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
};

export type DocPage = {
  slug: string;
  title: string;
  description: string;
  category: string;
  sections: DocSection[];
};

export const DOC_CATEGORY_IDS = ["start", "staff", "clients", "ops", "admin"] as const;
export type DocCategoryId = (typeof DOC_CATEGORY_IDS)[number];

/** Page order and category assignment — prose lives in i18n docs namespace. */
export const DOC_PAGE_ORDER: { slug: string; category: DocCategoryId }[] = [
  { slug: "getting-started", category: "start" },
  { slug: "schedule", category: "staff" },
  { slug: "clients", category: "staff" },
  { slug: "deposits", category: "ops" },
  { slug: "billing", category: "ops" },
  { slug: "pos-checkout", category: "ops" },
  { slug: "pos-split-payments", category: "ops" },
  { slug: "consent", category: "clients" },
  { slug: "customer-portal", category: "clients" },
  { slug: "inbox", category: "staff" },
  { slug: "sms-twilio-setup", category: "admin" },
  { slug: "stock", category: "ops" },
  { slug: "stencil", category: "staff" },
  { slug: "admin", category: "admin" },
  { slug: "settings", category: "admin" },
  { slug: "setup", category: "admin" },
];
