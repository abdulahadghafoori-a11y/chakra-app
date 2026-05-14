import { eq } from "drizzle-orm";

import { appFxUsdAfn } from "@/drizzle/schema";
import { db } from "@/lib/db";

export const FX_SINGLETON_ID = "singleton";

export type AppFxUsdAfnRow = typeof appFxUsdAfn.$inferSelect;

export async function getAppFxUsdAfnRow(): Promise<AppFxUsdAfnRow | null> {
  const [row] = await db
    .select()
    .from(appFxUsdAfn)
    .where(eq(appFxUsdAfn.singletonId, FX_SINGLETON_ID))
    .limit(1);
  return row ?? null;
}

export async function upsertAppFxAfnPerUsd(args: {
  afnPerOneUsd: string;
  rateSource: string;
  syncedAt: Date | null;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(appFxUsdAfn)
    .values({
      singletonId: FX_SINGLETON_ID,
      afnPerOneUsd: args.afnPerOneUsd,
      rateSource: args.rateSource,
      syncedAt: args.syncedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appFxUsdAfn.singletonId,
      set: {
        afnPerOneUsd: args.afnPerOneUsd,
        rateSource: args.rateSource,
        syncedAt: args.syncedAt,
        updatedAt: now,
      },
    });
}

/** Client-safe shape for `/orders/new` — AFN equivalents to exactly 1.00 USD. */
export type PublicFxState = {
  afnPerOneUsd: number;
  rateSource: string;
  syncedAt: string | null;
  updatedAt: string;
};

/** Read singleton FX row (no auth — rate is visible to whoever can open the order form). */
export async function getPublicFxStateForOrderForm(): Promise<PublicFxState | null> {
  const row = await getAppFxUsdAfnRow();
  if (!row) return null;
  const n = Number(row.afnPerOneUsd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    afnPerOneUsd: n,
    rateSource: row.rateSource,
    syncedAt: row.syncedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
