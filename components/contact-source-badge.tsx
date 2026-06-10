import { Badge } from "@/components/ui/badge";
import {
  contactSourceBadgeClass,
  contactSourceFromDb,
  formatContactSourceLabel,
  formatOrderSalesChannelLabel,
  isOrderSalesChannel,
  orderSalesChannelBadgeClass,
  type ContactSource,
} from "@/lib/sales-channel";
import { cn } from "@/lib/utils";

export function ContactSourceBadge({
  source,
  className,
}: {
  source: ContactSource | string;
  className?: string;
}) {
  const normalized = contactSourceFromDb(source);
  const label = formatContactSourceLabel(normalized);
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        contactSourceBadgeClass(normalized),
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function OrderSalesChannelBadge({
  channel,
  className,
}: {
  channel: string;
  className?: string;
}) {
  const label = isOrderSalesChannel(channel)
    ? formatOrderSalesChannelLabel(channel)
    : channel === "offline"
      ? "In-store"
      : "Online";
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        orderSalesChannelBadgeClass(channel),
        className,
      )}
    >
      {label}
    </Badge>
  );
}
