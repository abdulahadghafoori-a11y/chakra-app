import { formatDateTimeKabul } from "@/lib/kabul-time";

/** Human-readable detail line for CTWA session pickers (name from contact, not stored JSON). */
export function summarizeCtwaSessionLabel(s: {
  contactName: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sendTime: string;
}): string {
  const parts: string[] = [];
  const name = s.contactName?.trim();
  if (name) parts.push(name);
  if (s.sourceType) parts.push(s.sourceType);
  if (s.sourceId) parts.push(`id ${s.sourceId}`);
  if (s.sourceUrl) {
    const u = s.sourceUrl.length > 40 ? `${s.sourceUrl.slice(0, 40)}…` : s.sourceUrl;
    parts.push(u);
  }
  const labeled = formatDateTimeKabul(s.sendTime);
  if (labeled !== "—") parts.push(labeled);
  else parts.push(s.sendTime);
  return parts.join(" · ") || "CTWA session";
}
