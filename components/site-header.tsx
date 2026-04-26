import Link from "next/link";

import { Separator } from "@/components/ui/separator";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/contacts", label: "Contacts" },
  { href: "/orders/new", label: "New order" },
  { href: "/products", label: "Products" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-card/80">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <Link
          className="min-h-11 min-w-0 shrink-0 py-2 pr-2 text-base font-semibold leading-none tracking-tight sm:min-h-0 sm:py-0 sm:text-[0.9375rem]"
          href="/"
        >
          Chakra App
        </Link>
        <Separator className="hidden h-6 sm:block" orientation="vertical" />
        <nav className="flex flex-1 flex-wrap items-center gap-x-1 gap-y-1 sm:gap-x-4">
          {links.map((l) => (
            <Link
              className="text-muted-foreground hover:text-foreground min-h-11 inline-flex items-center rounded-md px-2.5 text-sm transition-colors sm:min-h-10 sm:px-2 sm:text-sm"
              href={l.href}
              key={l.href}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
