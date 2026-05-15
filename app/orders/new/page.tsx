import { NewOrderForm } from "@/components/new-order-form";
import { listProducts } from "@/actions/products";
import { listMetaCampaignsForManualAttribution } from "@/lib/campaigns-rollups";
import { getPublicFxStateForOrderForm } from "@/lib/app-fx-usd-afn";

export const dynamic = "force-dynamic";

type SearchParams = { phone?: string };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const initialPhone = (sp.phone ?? "").trim() || undefined;
  const [products, metaCampaignOptions, fxState] = await Promise.all([
    listProducts(),
    listMetaCampaignsForManualAttribution(),
    getPublicFxStateForOrderForm(),
  ]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Create order
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Select the CTWA session that matches the customer, then send Purchase to Meta.
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
          initialPhone={initialPhone}
          initialFx={fxState}
          canStaffEditFx
        />
      )}
    </div>
  );
}
