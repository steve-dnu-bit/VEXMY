import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const AccountingPanel = lazy(() => import("@/components/billing/AccountingPanel"));

type Props = {
  currency: string;
};

const LazyAccountingPanel = ({ currency }: Props) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }
  >
    <AccountingPanel currency={currency} />
  </Suspense>
);

export default LazyAccountingPanel;
