import { cn } from "@/lib/utils";

export function PageLoadingShell({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-5xl animate-pulse space-y-6", className)}
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="space-y-2">
        <div className="bg-muted h-7 w-48 max-w-[70%] rounded-md" />
        <div className="bg-muted h-4 w-full max-w-md rounded-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-muted/60 h-24 rounded-xl border" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="bg-muted h-10 w-full rounded-lg" />
        <div className="bg-muted/60 h-64 rounded-xl border" />
      </div>
    </div>
  );
}
