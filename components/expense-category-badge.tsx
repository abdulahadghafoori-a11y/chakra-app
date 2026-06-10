import { expenseCategoryBadge } from "@/lib/expense-category-colors";
import { cn } from "@/lib/utils";

export function ExpenseCategoryBadge({
  name,
  colorKey,
  inactive,
  className,
}: {
  name: string;
  colorKey: string;
  inactive?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        expenseCategoryBadge(colorKey),
        inactive && "opacity-60",
        className,
      )}
    >
      {name}
      {inactive ? (
        <span className="text-muted-foreground ml-1 font-normal">(inactive)</span>
      ) : null}
    </span>
  );
}
