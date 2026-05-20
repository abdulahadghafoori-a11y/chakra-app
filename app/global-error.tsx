"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center p-6 font-sans antialiased">
        <main className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">Application error</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            A critical error prevented the app from loading. Please refresh or try
            again in a moment.
          </p>
          <button
            type="button"
            className="bg-primary text-primary-foreground inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium"
            onClick={() => reset()}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
