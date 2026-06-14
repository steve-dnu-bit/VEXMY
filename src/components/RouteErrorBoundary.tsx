import React from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteErrorBoundaryProps = {
  children: React.ReactNode;
  label?: string;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export default class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Something went wrong" };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-medium">{this.props.label ?? "This page"} failed to load</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">{this.state.message}</p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
