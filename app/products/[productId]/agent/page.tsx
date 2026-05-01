import Link from "next/link";
import { notFound } from "next/navigation";

import { getProductAgentFields, saveProductAgentForm } from "@/actions/products";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProductAgentKnowledgePage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = await getProductAgentFields(productId);
  if (!product) notFound();

  const specsText = JSON.stringify(product.specsJson ?? {}, null, 2);
  const faqText = JSON.stringify(product.faqJson ?? [], null, 2);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/products"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        ← Products
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Agent knowledge: {product.name}
        </h1>
        <p className="text-muted-foreground font-mono text-xs">{product.sku}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editable fields</CardTitle>
          <CardDescription>
            Shown to the sales agent via <code>get_product</code> (specs_json, faq_json,
            knowledge_notes) and search when text matches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProductAgentForm} className="space-y-4">
            <input type="hidden" name="id" value={product.id} />
            <div className="space-y-2">
              <Label htmlFor="description">Short description</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={product.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge_notes">Knowledge notes (long Dari OK)</Label>
              <Textarea
                id="knowledge_notes"
                name="knowledge_notes"
                rows={8}
                defaultValue={product.knowledgeNotes ?? ""}
                placeholder="Warranty detail, what is in the box, compatibility…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specs_json">specs_json (JSON object)</Label>
              <Textarea
                id="specs_json"
                name="specs_json"
                rows={10}
                defaultValue={specsText}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="faq_json">faq_json (JSON array of q/a)</Label>
              <Textarea
                id="faq_json"
                name="faq_json"
                rows={10}
                defaultValue={faqText}
                className="font-mono text-xs"
                placeholder='[{"q":"...","a":"..."}]'
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
