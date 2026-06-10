import { and, eq } from "drizzle-orm";

import { ctwaSessions } from "@/drizzle/schema";
import { db } from "@/lib/db";
import { getWhatsAppWabaAccount } from "@/lib/whatsapp-waba-registry";

export type OrderCapiAttribution = {
  ctwaSessionId: string | null;
  ctwaClid: string | null;
  capiWabaId: string;
};

/**
 * Resolves CTWA session, click id, and WABA for Purchase CAPI on order create.
 * WABA comes from the session when it has `ctwa_clid` + `waba_id`; otherwise staff must pass `capiWabaId`.
 */
export async function resolveOrderCapiAttribution(params: {
  contactId: string;
  ctwaSessionId?: string | null;
  capiWabaId?: string | null;
}): Promise<OrderCapiAttribution | { ok: false; error: string }> {
  const preferredId = params.ctwaSessionId?.trim() || null;
  const manualWaba = params.capiWabaId?.trim() || null;

  let session: {
    id: string;
    ctwaClid: string | null;
    wabaId: string | null;
  } | null = null;

  if (preferredId) {
    const [row] = await db
      .select({
        id: ctwaSessions.id,
        ctwaClid: ctwaSessions.ctwaClid,
        wabaId: ctwaSessions.wabaId,
      })
      .from(ctwaSessions)
      .where(
        and(
          eq(ctwaSessions.id, preferredId),
          eq(ctwaSessions.contactId, params.contactId),
        ),
      )
      .limit(1);

    if (!row) {
      return {
        ok: false,
        error: "CTWA session not found for this contact.",
      };
    }
    session = row;
  }

  const ctwaClid = session?.ctwaClid?.trim() || null;
  const sessionWabaId = session?.wabaId?.trim() || null;

  let capiWabaId: string;
  if (ctwaClid && sessionWabaId) {
    capiWabaId = sessionWabaId;
  } else if (manualWaba) {
    capiWabaId = manualWaba;
  } else {
    const reason = !session
      ? "Choose a WhatsApp business line for Meta CAPI."
      : !ctwaClid
        ? "This CTWA session has no click id — choose a WhatsApp business line."
        : "This CTWA session has no WABA id — choose a WhatsApp business line.";
    return { ok: false, error: reason };
  }

  try {
    getWhatsAppWabaAccount(capiWabaId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  return {
    ctwaSessionId: session?.id ?? null,
    ctwaClid,
    capiWabaId,
  };
}

/** True when the new-order form should show the WABA picker. */
export function orderFormNeedsWabaPicker(input: {
  isInStore: boolean;
  sessions: { id: string; ctwaClid: string | null; wabaId?: string | null }[];
  selectedSessionId: string | null | undefined;
}): boolean {
  if (input.isInStore) return false;
  if (input.sessions.length === 0) return true;
  const selectedId = input.selectedSessionId?.trim();
  const selected = selectedId
    ? input.sessions.find((s) => s.id === selectedId)
    : input.sessions[0];
  if (!selected) return true;
  const clid = selected.ctwaClid?.trim();
  if (!clid) return true;
  return !selected.wabaId?.trim();
}
