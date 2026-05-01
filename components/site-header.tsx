import Link from "next/link";

import { SiteHeaderNav } from "@/components/site-header-nav";
import { getStaffSessionOptional } from "@/lib/staff-auth/guard";

export async function SiteHeader() {
  const session = await getStaffSessionOptional();

  return (
    <header className="sticky top-0 z-50 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-card/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <Link
          className="min-h-11 min-w-0 shrink-0 py-2 pr-2 text-base font-semibold leading-none tracking-tight sm:min-h-0 sm:py-0 sm:text-[0.9375rem]"
          href="/"
        >
          Chakra App
        </Link>
        {!session ? (
          <SiteHeaderNav authenticated={false} />
        ) : (
          <SiteHeaderNav authenticated />
        )}
      </div>
    </header>
  );
}
