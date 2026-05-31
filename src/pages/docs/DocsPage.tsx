import { Link, useParams, Navigate } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useDocsContent } from "@/hooks/useDocsContent";
import { ChevronRight } from "lucide-react";

const DocSectionView = ({
  heading,
  paragraphs,
  bullets,
  note,
}: {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  note?: string;
}) => (
  <section className="scroll-mt-24">
    <h2 className="font-display text-xl font-semibold text-foreground">{heading}</h2>
    {paragraphs?.map((p) => (
      <p key={p.slice(0, 40)} className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {p}
      </p>
    ))}
    {bullets?.length ? (
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    ) : null}
    {note ? (
      <p className="mt-4 rounded-lg border border-[#d4af37]/25 bg-[#d4af37]/5 px-4 py-3 text-sm text-muted-foreground">
        {note}
      </p>
    ) : null}
  </section>
);

const DocsPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const {
    categories,
    pages,
    getDocBySlug,
    getDocsByCategory,
    indexTitle,
    indexSubtitle,
    allDocs,
    breadcrumb,
    nextLabel,
  } = useDocsContent();
  const page = slug ? getDocBySlug(slug) : undefined;

  return (
    <MarketingLayout>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:flex-row lg:py-14">
        <aside className="lg:w-64 lg:shrink-0">
          <nav className="sticky top-24 rounded-xl border border-border/70 bg-card/55 p-4">
            <Link to="/docs" className="text-sm font-semibold text-[#d4af37] hover:underline">
              {allDocs}
            </Link>
            <div className="themed-scrollbar mt-4 max-h-[70vh] space-y-6 overflow-y-auto pr-1">
              {categories.map((cat) => {
                const catPages = getDocsByCategory(cat.id);
                if (!catPages.length) return null;
                return (
                  <div key={cat.id}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {cat.label}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {catPages.map((p) => (
                        <li key={p.slug}>
                          <Link
                            to={`/docs/${p.slug}`}
                            className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                              slug === p.slug
                                ? "bg-[#d4af37]/15 text-[#d4af37]"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {p.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </nav>
        </aside>

        <article className="min-w-0 flex-1">
          {!slug ? (
            <div>
              <h1 className="font-display text-3xl font-bold sm:text-4xl">{indexTitle}</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">{indexSubtitle}</p>
              <div className="mt-12 space-y-10">
                {categories.map((cat) => {
                  const catPages = getDocsByCategory(cat.id);
                  if (!catPages.length) return null;
                  return (
                    <div key={cat.id}>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[#d4af37]/80">
                        {cat.label}
                      </h2>
                      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                        {catPages.map((docPage) => (
                          <li key={docPage.slug}>
                            <Link
                              to={`/docs/${docPage.slug}`}
                              className="group flex items-start justify-between rounded-lg border border-border/70 bg-card/55 p-4 transition-colors hover:border-[#d4af37]/40"
                            >
                              <div>
                                <p className="font-medium group-hover:text-[#d4af37]">{docPage.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{docPage.description}</p>
                              </div>
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-[#d4af37]" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !page ? (
            <Navigate to="/docs" replace />
          ) : (
            <>
              <nav className="mb-6 text-xs text-muted-foreground">
                <Link to="/docs" className="hover:text-[#d4af37]">
                  {breadcrumb}
                </Link>
                <span className="mx-2">/</span>
                <span className="text-foreground">{page.title}</span>
              </nav>
              <h1 className="font-display text-3xl font-bold sm:text-4xl">{page.title}</h1>
              <p className="mt-3 text-muted-foreground">{page.description}</p>
              <div className="mt-10 space-y-10">
                {page.sections.map((section) => (
                  <DocSectionView key={section.heading} {...section} />
                ))}
              </div>
              <div className="mt-14 flex flex-wrap gap-4 border-t border-border/50 pt-8 text-sm">
                {pages.map((p, i) =>
                  p.slug === page.slug && pages[i + 1] ? (
                    <Link
                      key={p.slug}
                      to={`/docs/${pages[i + 1].slug}`}
                      className="text-[#d4af37] hover:underline"
                    >
                      {nextLabel(pages[i + 1].title)}
                    </Link>
                  ) : null,
                )}
              </div>
            </>
          )}
        </article>
      </div>
    </MarketingLayout>
  );
};

export default DocsPage;
