"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const baseAuthedNavLinks: { href: string; label: string }[] = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/orders", label: "Orders" },
  { href: "/expenses", label: "Expenses" },
  { href: "/products", label: "Products" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/meta-engagement", label: "Meta comments" },
  { href: "/sales", label: "AI agent" },
];

const CORE_HIDDEN_HREFS = new Set(["/expenses", "/meta-engagement", "/sales"]);

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

function navDrawerLinkClass(pathname: string, href: string) {
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  return cn(
    "hover:bg-muted flex min-h-11 w-full items-center rounded-lg px-3 text-sm font-medium transition-colors",
    active ? "bg-muted text-foreground" : "text-muted-foreground",
  );
}

function MobileNavDrawer({
  titleId,
  children,
}: {
  titleId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="shrink-0 sm:hidden"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={titleId}
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon className="size-5" aria-hidden />
      </Button>
      <DialogContent
        showCloseButton={false}
        id={titleId}
        aria-labelledby={`${titleId}-heading`}
        className={cn(
          "fixed inset-y-0 top-0 right-0 left-auto z-50 flex h-[100dvh] max-h-none w-[min(100vw,20rem)] max-w-none translate-none flex-col gap-0 overflow-hidden rounded-none rounded-l-xl border border-border border-r-0 p-0 shadow-lg outline-none sm:hidden",
          "data-open:slide-in-from-right data-open:fade-in-0 data-open:animate-in data-closed:slide-out-to-right data-closed:fade-out-0 data-closed:animate-out",
        )}
      >
        <DialogTitle id={`${titleId}-sr`} className="sr-only">
          Navigation menu
        </DialogTitle>
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-3">
          <span id={`${titleId}-heading`} className="text-sm font-semibold">
            Menu
          </span>
          <DialogClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Close menu" />
            }
          >
            <XIcon className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3"
          aria-labelledby={`${titleId}-heading`}
          onClick={(e) => {
            const a = (e.target as HTMLElement).closest("a");
            if (a?.href) setOpen(false);
          }}
        >
          {children}
        </nav>
      </DialogContent>
    </Dialog>
  );
}

export function SiteHeaderNav({
  authenticated,
  coreMode,
}: {
  authenticated: boolean;
  coreMode: boolean;
}) {
  const pathname = usePathname() ?? "";
  const drawerTitleId = "mobile-primary-nav-menu";

  const authedNavLinks = coreMode
    ? baseAuthedNavLinks.filter((l) => !CORE_HIDDEN_HREFS.has(l.href))
    : baseAuthedNavLinks;

  if (!authenticated) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        <nav className="hidden flex-1 flex-wrap items-center justify-end gap-2 sm:flex sm:gap-3">
          <ThemeToggle />
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
        <div className="flex flex-1 items-center justify-end gap-2 sm:hidden">
          <ThemeToggle />
          <MobileNavDrawer titleId={drawerTitleId}>
            <Link
              href="/login"
              className={navDrawerLinkClass(pathname, "/login")}
            >
              Log in
            </Link>
            <Link
              href="/orders/new"
              className={navDrawerLinkClass(pathname, "/orders/new")}
            >
              New order
            </Link>
          </MobileNavDrawer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:flex-nowrap sm:justify-between">
      <Separator className="hidden h-6 sm:block" orientation="vertical" />
      <nav
        className="hidden flex-1 flex-wrap items-center gap-x-1 gap-y-1 sm:flex sm:gap-x-3"
        aria-label="Primary"
      >
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
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <ThemeToggle />
        <SalesSignOutButton />
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 sm:hidden">
        <ThemeToggle />
        <MobileNavDrawer titleId={drawerTitleId}>
          {authedNavLinks.map((l) => (
            <Link
              className={navDrawerLinkClass(pathname, l.href)}
              href={l.href}
              key={l.href}
            >
              {l.label}
            </Link>
          ))}
          <div className="border-muted mt-auto w-full border-t pt-3 [&_button]:min-h-11 [&_button]:w-full">
            <SalesSignOutButton />
          </div>
        </MobileNavDrawer>
      </div>
    </div>
  );
}
