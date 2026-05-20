"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 py-12 sm:py-16">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Something went wrong
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          An unexpected error occurred while loading this page. You can try again,
          or return to the dashboard.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground font-mono text-xs">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" className="min-h-11" onClick={() => reset()}>
          Try again
        </Button>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
