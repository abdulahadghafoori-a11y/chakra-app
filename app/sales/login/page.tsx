import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LegacySalesLoginRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  const next = sp.next;
  const err = sp.error;
  if (typeof next === "string" && next) q.set("next", next);
  if (typeof err === "string" && err) q.set("error", err);
  const qs = q.toString();
  redirect(`/login${qs ? `?${qs}` : ""}`);
}
