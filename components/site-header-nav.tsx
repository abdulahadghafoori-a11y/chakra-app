"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const authedNavLinks: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/orders", label: "Orders" },
  { href: "/expenses", label: "Expenses" },
  { href: "/products", label: "Products" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/meta-engagement", label: "Meta comments" },
  { href: "/sales", label: "AI agent" },
];

function navLinkClass(pathname: string, href: string) {
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return cn(
    "hover:text-foreground min-h-11 inline-flex items-center rounded-md px-2.5 text-sm transition-colors sm:min-h-10 sm:px-2 sm:text-sm",
    active ? "text-foreground font-medium" : "text-muted-foreground",
  );
}

export function SiteHeaderNav({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname() ?? "";

  if (!authenticated) {
    return (
      <nav className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3">
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Log in
        </Link>
        <Link
          href="/orders/new"
          className={cn(buttonVariants({ size: "sm" }))}
        >
          New order
        </Link>
      </nav>
    );
  }

  return (
    <>
      <Separator className="hidden h-6 sm:block" orientation="vertical" />
      <nav className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1 sm:gap-x-3">
        {authedNavLinks.map((l) => (
          <Link
            className={navLinkClass(pathname, l.href)}
            href={l.href}
            key={l.href}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <SalesSignOutButton />
      </div>
    </>
  );
}
