import React from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  label?: string;
} & WithTranslation;

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class RouteErrorBoundaryInner extends React.Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Something went wrong" };
  }

  render() {
    const { t, label, children } = this.props;
    if (this.state.hasError) {
      const pageLabel = label ?? t("routeError.defaultLabel");
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-medium">{t("routeError.failedToLoad", { label: pageLabel })}</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">{this.state.message}</p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("routeError.refresh")}
          </Button>
        </div>
      );
    }
    return children;
  }
}

const RouteErrorBoundary = withTranslation()(RouteErrorBoundaryInner);

export default RouteErrorBoundary;
