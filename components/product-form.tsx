"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createProduct } from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(1),
  defaultSalePrice: z.number().positive(),
  cogs: z.number().nonnegative(),
  description: z.string().optional(),
  knowledgeNotes: z.string().optional(),
  specsJsonText: z.string().optional(),
  faqJsonText: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function ProductForm() {
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      defaultSalePrice: 1,
      cogs: 0,
      description: "",
      knowledgeNotes: "",
      specsJsonText: "",
      faqJsonText: "",
    },
  });

  function onSubmit(values: Values) {
    startTransition(() => {
      void (async () => {
        const res = await createProduct(values);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success("Product created");
        form.reset({
          name: "",
          defaultSalePrice: 1,
          cogs: 0,
          description: "",
          knowledgeNotes: "",
          specsJsonText: "",
          faqJsonText: "",
        });
      })();
    });
  }

  return (
    <Form {...form}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Widget" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="defaultSalePrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default sale price (USD)</FormLabel>
              <FormControl>
                <Input
                  min={0}
                  name={field.name}
                  ref={field.ref}
                  step="0.01"
                  type="number"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) =>
                    field.onChange(Number.parseFloat(e.target.value || "0"))
                  }
                />
              </FormControl>
              <FormDescription>Used when creating orders; you can override per order.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cogs"
          render={({ field }) => (
            <FormItem>
              <FormLabel>COGS (USD)</FormLabel>
              <FormControl>
                <Input
                  min={0}
                  name={field.name}
                  ref={field.ref}
                  step="0.01"
                  type="number"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) =>
                    field.onChange(Number.parseFloat(e.target.value || "0"))
                  }
                />
              </FormControl>
              <FormDescription>Cost of goods sold per unit.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea placeholder="Optional" rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="knowledgeNotes"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Agent knowledge notes (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Long Dari notes: warranty, in-box, compatibility…"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Also editable later under Products → Agent.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="specsJsonText"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>specs JSON object (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="{}"
                  rows={4}
                  className="font-mono text-xs"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="faqJsonText"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>FAQ JSON array (optional)</FormLabel>
              <FormControl>
                <Textarea
                  placeholder='[{"q":"…","a":"…"}]'
                  rows={4}
                  className="font-mono text-xs"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="sm:col-span-2">
          <Button
            className="min-h-11 w-full touch-manipulation sm:min-h-8 sm:w-auto"
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Add product"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
