import { getContactForNewOrderPrefill } from "@/actions/contact";
import { getWhatsAppWabaAccountOptions } from "@/actions/whatsapp-waba";
import { NewOrderForm } from "@/components/new-order-form";
import { listMetaCampaignsForManualAttribution } from "@/lib/campaigns-rollups";
import {
  getCachedProductsForOrderForm,
  getCachedPublicFxForOrderForm,
} from "@/lib/cached-reads";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";

export const dynamic = "force-dynamic";

type SearchParams = { phone?: string; contactId?: string };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const contactPrefill = sp.contactId?.trim()
    ? await getContactForNewOrderPrefill(sp.contactId.trim())
    : null;
  const initialPhone =
    (sp.phone ?? "").trim() ||
    contactPrefill?.phoneE164?.trim() ||
    undefined;
  const [products, metaCampaignOptions, fxState, session, wabaAccountOptions] =
    await Promise.all([
      getCachedProductsForOrderForm(),
      listMetaCampaignsForManualAttribution(),
      getCachedPublicFxForOrderForm(),
      getStaffSessionOptional(),
      getWhatsAppWabaAccountOptions(),
    ]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Create order
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Online orders can send Meta Purchase when Confirmed, Shipped, or Paid. In-store
          orders skip Meta and are excluded from Campaign reports.
        </p>
      </div>
      {products.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add at least one product before creating an order.{" "}
          <a className="underline underline-offset-2" href="/products">
            Go to Products
          </a>
          .
        </p>
      ) : (
        <NewOrderForm
          products={products}
          metaCampaignOptions={metaCampaignOptions}
          wabaAccountOptions={wabaAccountOptions}
          initialPhone={initialPhone}
          initialSalesChannel={contactPrefill?.salesChannel}
          initialOfflineContactName={contactPrefill?.name?.trim() || undefined}
          initialFx={fxState}
          canStaffEditFx={Boolean(session)}
        />
      )}
    </div>
  );
}
