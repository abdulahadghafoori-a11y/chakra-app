"use server";

import {
  listWhatsAppWabaAccountOptions,
  type WhatsAppWabaAccountOption,
} from "@/lib/whatsapp-waba-registry";

export type { WhatsAppWabaAccountOption };

export async function getWhatsAppWabaAccountOptions(): Promise<
  WhatsAppWabaAccountOption[]
> {
  try {
    return listWhatsAppWabaAccountOptions();
  } catch {
    return [];
  }
}
