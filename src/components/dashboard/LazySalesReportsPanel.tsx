import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const SalesReportsPanel = lazy(() => import("@/components/dashboard/SalesReportsPanel"));

type Props = {
  currency: string;
  showCharts?: boolean;
};

const LazySalesReportsPanel = ({ currency, showCharts }: Props) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    }
  >
    <SalesReportsPanel currency={currency} showCharts={showCharts} />
  </Suspense>
);

export default LazySalesReportsPanel;
