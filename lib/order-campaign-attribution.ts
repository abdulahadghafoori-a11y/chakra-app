import { eq } from "drizzle-orm";

import { ctwaSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { kabulDateTimeLocalToDate } from "@/lib/kabul-time";
import type { OrderSalesChannel } from "@/lib/sales-channel";

export type ResolveCampaignAttributedAtInput = {
  salesChannel: OrderSalesChannel;
  ctwaSessionId: string | null;
  manualMetaCampaignId: string | null;
  /** Required when `manualMetaCampaignId` is set and there is no CTWA session. */
  manualCampaignAttributedAtKabul?: string | null;
};

export type ResolveCampaignAttributedAtResult =
  | { ok: true; at: Date | null }
  | { ok: false; error: string };

/**
 * Lead / campaign attribution instant stored on `orders.campaign_attributed_at`.
 * In-store orders always return null (excluded from campaign rollups).
 */
export async function resolveCampaignAttributedAt(
  input: ResolveCampaignAttributedAtInput,
): Promise<ResolveCampaignAttributedAtResult> {
  if (input.salesChannel === "offline") {
    return { ok: true, at: null };
  }

  const sessionId = input.ctwaSessionId?.trim() || null;
  if (sessionId) {
    const [row] = await db
      .select({ sendTime: ctwaSessions.sendTime })
      .from(ctwaSessions)
      .where(eq(ctwaSessions.id, sessionId))
      .limit(1);
    if (!row) {
      return { ok: false, error: "Selected CTWA session was not found." };
    }
    return { ok: true, at: row.sendTime };
  }

  const manualId = input.manualMetaCampaignId?.trim() || null;
  if (manualId) {
    const when = input.manualCampaignAttributedAtKabul?.trim() ?? "";
    if (!when) {
      return {
        ok: false,
        error:
          "Set the campaign attribution date and time (Kabul) for manual campaign orders.",
      };
    }
    try {
      return { ok: true, at: kabulDateTimeLocalToDate(when) };
    } catch {
      return {
        ok: false,
        error: "Invalid campaign attribution date and time (Kabul).",
      };
    }
  }

  return { ok: true, at: null };
}
