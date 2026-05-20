import type { CtwaSessionRow } from "@/actions/ctwa";
import type { ContactLookup } from "@/actions/contact";
import type { ProductRow } from "@/actions/products";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import { catalogUsdToDefaultAfn } from "@/lib/fx-afn-usd";
import { summarizeCtwaSessionLabel } from "@/lib/referral";
import type { NewOrderFormInput } from "@/lib/validations/order";

export type FormValues = NewOrderFormInput;

export type ContactPhase =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "found"; contact: ContactLookup };

export function sessionTriggerLabel(s: CtwaSessionRow): string {
  const clid = s.ctwaClid?.slice(0, 12) ?? "—";
  return `${clid}… · ${formatDateTimeKabul(s.sendTime)}`;
}

export function sessionOptionLabel(s: CtwaSessionRow): string {
  return `${sessionTriggerLabel(s)} · ${summarizeCtwaSessionLabel(s)}`;
}

export function CtwaSessionAttributionFooter({
  session,
}: {
  session: CtwaSessionRow | undefined;
}) {
  if (!session) return null;
  return (
    <>
      <p className="text-muted-foreground text-xs">
        Campaign:{" "}
        <span className="text-foreground font-medium">
          {session.campaignName?.trim() || "— (not linked to a synced campaign)"}
        </span>
      </p>
      {session.wabaId ? (
        <p className="text-muted-foreground font-mono text-xs">
          WABA {session.wabaId}
          {session.phoneNumberId
            ? ` · phone_number_id ${session.phoneNumberId}`
            : null}
        </p>
      ) : null}
    </>
  );
}

export function defaultLine(
  products: ProductRow[],
  fxValid: boolean,
  afnPerUsd: number,
) {
  const p = products[0];
  if (!p) {
    return { productId: "", quantity: 1, unitSalePrice: 1 };
  }
  if (!fxValid) {
    return { productId: p.id, quantity: 1, unitSalePrice: 1 };
  }
  const afn = catalogUsdToDefaultAfn(Number(p.defaultSalePrice), afnPerUsd);
  const safe = Number.isFinite(afn) && afn > 0 ? afn : 1;
  return { productId: p.id, quantity: 1, unitSalePrice: safe };
}
