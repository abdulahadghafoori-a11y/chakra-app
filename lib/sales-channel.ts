export const CONTACT_SOURCES = ["whatsapp", "offline"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const ORDER_SALES_CHANNELS = ["online", "offline"] as const;
export type OrderSalesChannel = (typeof ORDER_SALES_CHANNELS)[number];

export const ORDER_SALES_CHANNEL_OPTIONS: ReadonlyArray<{
  value: OrderSalesChannel;
  label: string;
}> = [
  { value: "online", label: "Online (WhatsApp / Meta)" },
  { value: "offline", label: "In-store" },
] as const;

export const CONTACT_SOURCE_OPTIONS: ReadonlyArray<{
  value: ContactSource;
  label: string;
}> = [
  { value: "whatsapp", label: "WhatsApp (online)" },
  { value: "offline", label: "In-store" },
] as const;

const ORDER_SALES_CHANNEL_LABEL_MAP = Object.fromEntries(
  ORDER_SALES_CHANNEL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<OrderSalesChannel, string>;

const CONTACT_SOURCE_LABEL_MAP = Object.fromEntries(
  CONTACT_SOURCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ContactSource, string>;

export function isOrderSalesChannel(v: string): v is OrderSalesChannel {
  return (ORDER_SALES_CHANNELS as readonly string[]).includes(v);
}

export function isContactSource(v: string): v is ContactSource {
  return (CONTACT_SOURCES as readonly string[]).includes(v);
}

export function contactSourceFromDb(source: string): ContactSource {
  return source === "offline" ? "offline" : "whatsapp";
}

export function formatOrderSalesChannelLabel(
  channel: OrderSalesChannel | string,
): string {
  if (isOrderSalesChannel(channel)) {
    return ORDER_SALES_CHANNEL_LABEL_MAP[channel];
  }
  return channel;
}

export function formatContactSourceLabel(source: ContactSource | string): string {
  if (isContactSource(source)) {
    return CONTACT_SOURCE_LABEL_MAP[source];
  }
  return source;
}

/** Tailwind classes for contact source badges (light + dark). */
export function contactSourceBadgeClass(source: ContactSource | string): string {
  const normalized = contactSourceFromDb(source);
  if (normalized === "offline") {
    return "border-amber-500/45 bg-amber-500/15 text-amber-950 dark:text-amber-100";
  }
  return "border-emerald-600/40 bg-emerald-600/12 text-emerald-950 dark:text-emerald-100";
}

export function orderSalesChannelBadgeClass(channel: string): string {
  if (channel === "offline") {
    return contactSourceBadgeClass("offline");
  }
  return contactSourceBadgeClass("whatsapp");
}
