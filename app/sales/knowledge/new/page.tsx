import Link from "next/link";

import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { upsertBusinessKnowledgeArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewKnowledgeArticlePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/sales/knowledge"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← All articles
        </Link>
        <SalesSignOutButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New article</CardTitle>
          <CardDescription>
            Use lowercase slug with hyphens, e.g. <code>about_us</code>,{" "}
            <code>how_to_order</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upsertBusinessKnowledgeArticle} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" required placeholder="about_us" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input id="title" name="title" placeholder="Short label" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body (Dari / any language)</Label>
              <Textarea id="body" name="body" required rows={12} />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
