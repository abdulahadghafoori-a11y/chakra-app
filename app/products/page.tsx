import Link from "next/link";

import { ProductForm } from "@/components/product-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProducts } from "@/actions/products";
import { isCoreFeatureSet } from "@/lib/feature-set";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const productRows = await listProducts();
  const coreMode = isCoreFeatureSet();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Products</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Catalog used when creating orders and CAPI item payloads. All amounts are USD.
          {!coreMode ? (
            <>
              {" "}
              Use <strong>Agent</strong> to edit long product copy the WhatsApp sales agent may
              cite.
            </>
          ) : null}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add product</CardTitle>
          <CardDescription>SKU is generated automatically when you save.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm />
        </CardContent>
      </Card>

      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Default sale</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead>Created</TableHead>
              {coreMode ? null : <TableHead className="w-[1%]"> </TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {productRows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-muted-foreground"
                  colSpan={coreMode ? 5 : 6}
                >
                  No products yet.
                </TableCell>
              </TableRow>
            ) : (
              productRows.map((p) => (
                <TableRow
                  key={p.id}
                  id={`product-${p.id}`}
                  className="scroll-mt-24"
                >
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="text-right">
                    USD {p.defaultSalePrice}
                  </TableCell>
                  <TableCell className="text-right">USD {p.cogs}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.createdAt}
                  </TableCell>
                  {coreMode ? null : (
                    <TableCell className="text-right">
                      <Link
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                        href={`/products/${p.id}/agent`}
                      >
                        Agent
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
  );
}
