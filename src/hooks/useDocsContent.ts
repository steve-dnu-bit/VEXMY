import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DOC_CATEGORY_IDS, DOC_PAGE_ORDER, type DocPage, type DocSection } from "@/lib/docsContent";

export function useDocsContent() {
  const { t } = useTranslation("docs");

  const categories = useMemo(
    () => DOC_CATEGORY_IDS.map((id) => ({ id, label: t(`categories.${id}`) })),
    [t],
  );

  const pages = useMemo<DocPage[]>(() => {
    return DOC_PAGE_ORDER.map(({ slug, category }) => {
      const sections = t(`pages.${slug}.sections`, { returnObjects: true }) as DocSection[];
      return {
        slug,
        category,
        title: t(`pages.${slug}.title`),
        description: t(`pages.${slug}.description`),
        sections: Array.isArray(sections) ? sections : [],
      };
    });
  }, [t]);

  const getDocBySlug = (slug: string) => pages.find((p) => p.slug === slug);
  const getDocsByCategory = (categoryId: string) => pages.filter((p) => p.category === categoryId);

  return {
    categories,
    pages,
    getDocBySlug,
    getDocsByCategory,
    indexTitle: t("indexTitle"),
    indexSubtitle: t("indexSubtitle"),
    allDocs: t("allDocs"),
    breadcrumb: t("breadcrumb"),
    nextLabel: (title: string) => t("next", { title }),
  };
}
