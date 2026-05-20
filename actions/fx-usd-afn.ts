"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { fetchAfnPerOneUsdFromPublicApis } from "@/lib/fetch-afn-per-usd";
import { upsertAppFxAfnPerUsd } from "@/lib/app-fx-usd-afn";
import { assertStaffSession } from "@/lib/staff-auth/guard";

const manualRateSchema = z.object({
  afnPerOneUsd: z
    .number()
    .finite()
    .gt(0, "Rate must be positive")
    .max(1_000_000, "Rate too large"),
});

export async function saveManualAfnPerUsd(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertStaffSession();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }
  const parsed = manualRateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid rate",
    };
  }
  const v = parsed.data.afnPerOneUsd;
  await upsertAppFxAfnPerUsd({
    afnPerOneUsd: v.toFixed(6),
    rateSource: "manual",
    syncedAt: null,
  });
  revalidatePath("/orders/new");
  revalidateTag("app-fx-usd-afn");
  return { ok: true };
}

export async function syncAfnPerUsdFromApi(): Promise<
  { ok: true; afnPerOneUsd: number; source: string } | { ok: false; error: string }
> {
  try {
    await assertStaffSession();
  } catch {
    return { ok: false, error: "Unauthorized" };
  }
  try {
    const { afnPerOneUsd, source } = await fetchAfnPerOneUsdFromPublicApis();
    const now = new Date();
    await upsertAppFxAfnPerUsd({
      afnPerOneUsd: afnPerOneUsd.toFixed(6),
      rateSource: source,
      syncedAt: now,
    });
    revalidatePath("/orders/new");
    revalidateTag("app-fx-usd-afn");
    return { ok: true, afnPerOneUsd, source };
  } catch (e) {
    const message = e instanceof Error ? e.message : "FX sync failed";
    return { ok: false, error: message };
  }
}
