import { Link } from "react-router-dom";

const LegalPageLayout = ({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-gradient-gold">{title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <Link to="/terms" className="text-primary hover:underline">Terms</Link>
            <Link to="/privacy" className="text-primary hover:underline">Privacy</Link>
            <Link to="/cookies" className="text-primary hover:underline">Cookies</Link>
            <Link to="/auth" className="text-primary hover:underline">Back to login</Link>
          </div>
        </div>
        <div className="space-y-5 text-sm leading-6 text-muted-foreground">{children}</div>
      </div>
    </div>
  );
};

export default LegalPageLayout;
