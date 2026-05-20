import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 py-12 sm:py-16">
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-muted-foreground text-sm font-medium tabular-nums">
          404
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Page not found
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          The page you requested does not exist or may have been moved.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-start">
        <Link href="/" className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}>
          Dashboard
        </Link>
        <Link
          href="/orders"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full sm:w-auto",
          )}
        >
          Orders
        </Link>
      </div>
    </div>
  );
}
