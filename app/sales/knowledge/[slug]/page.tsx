import Link from "next/link";
import { notFound } from "next/navigation";

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
import { getBusinessArticleBySlug } from "@/lib/knowledge/business-knowledge";
import { cn } from "@/lib/utils";

import { deleteBusinessKnowledgeArticle, upsertBusinessKnowledgeArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditKnowledgeArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: slugParam } = await params;

  const slug = decodeURIComponent(slugParam);
  const article = await getBusinessArticleBySlug(slug);
  if (!article) notFound();

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
          <CardTitle>Edit: {article.slug}</CardTitle>
          <CardDescription>Changes apply to the next agent message.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={upsertBusinessKnowledgeArticle} className="space-y-4">
            <input type="hidden" name="slug" value={article.slug} />
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                defaultValue={article.title ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                defaultValue={article.sortOrder}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                name="body"
                required
                rows={14}
                defaultValue={article.body}
              />
            </div>
            <Button type="submit">Save</Button>
          </form>

          <form action={deleteBusinessKnowledgeArticle} className="border-t pt-6">
            <input type="hidden" name="slug" value={article.slug} />
            <Button type="submit" variant="destructive" size="sm">
              Delete article
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
