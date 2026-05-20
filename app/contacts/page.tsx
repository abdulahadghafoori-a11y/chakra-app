import { redirect } from "next/navigation";

import { ContactsListView } from "@/components/contacts-list-view";
import { ContactsToolbar } from "@/components/contacts-toolbar";
import { listContactsWithStats, CONTACTS_PAGE_SIZE } from "@/lib/contacts-list";

export const dynamic = "force-dynamic";

type SearchParams = { q?: string; order?: string; page?: string };

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim() || undefined;
  const order = sp.order === "oldest" ? "oldest" : "newest";
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, total, page } = await listContactsWithStats({
    q,
    order,
    page: requestedPage,
  });
  const rankOffset = (page - 1) * CONTACTS_PAGE_SIZE;
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("order", order);
    p.set("page", String(page));
    redirect(`/contacts?${p.toString()}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Contacts
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Search WhatsApp contacts, CTWA session counts, and order history. Created
          time is when the contact first entered the system. Timestamps use{" "}
          <span className="text-foreground font-medium">Kabul</span> (UTC+4:30);
          the database stores UTC.
        </p>
      </div>

      <ContactsToolbar
        initialQ={q ?? ""}
        order={order}
        page={page}
        total={total}
      />

      <ContactsListView
        rows={rows}
        rankOffset={rankOffset}
        emptyMessage={
          q
            ? "No contacts match this search."
            : "No contacts yet. WhatsApp CTWA webhooks will create them."
        }
      />
    </div>
  );
}
