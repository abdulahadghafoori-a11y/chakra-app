import { redirect } from "next/navigation";

import { MetaDmBridgeLogsSection } from "@/app/meta-engagement/dm-bridge-logs";
import { TablePagination } from "@/components/table-pagination";
import {
  MetaEngagementTable,
  MetaEngagementToolbar,
} from "@/app/meta-engagement/meta-engagement-client";
import {
  listDmBridgeLogs,
  listEngagementComments,
  type EngagementPlatform,
} from "@/lib/meta-engagement-store";
import {
  META_ENGAGEMENT_PAGE_SIZE,
  parseTablePage,
} from "@/lib/table-pagination";

export const dynamic = "force-dynamic";

type SearchParams = { platform?: string; status?: string; page?: string; dmPage?: string };

function parsePlatform(
  v: string | undefined,
): "all" | EngagementPlatform {
  if (v === "facebook" || v === "instagram") return v;
  return "all";
}

function parseStatus(
  v: string | undefined,
): "all" | "active" | "hidden" | "deleted" {
  if (v === "active" || v === "hidden" || v === "deleted") return v;
  return "all";
}

export default async function MetaEngagementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const platform = parsePlatform(sp.platform);
  const status = parseStatus(sp.status);
  const requestedPage = parseTablePage(sp.page);
  const requestedDmPage = parseTablePage(sp.dmPage);

  const [commentsResult, dmResult] = await Promise.all([
    listEngagementComments({
      platform,
      status,
      page: requestedPage,
    }),
    listDmBridgeLogs({ page: requestedDmPage }),
  ]);
  const { rows, total, page } = commentsResult;
  const {
    rows: dmLogs,
    total: dmTotal,
    page: dmPage,
  } = dmResult;
  if (total > 0 && requestedPage !== page) {
    const p = new URLSearchParams();
    if (platform !== "all") p.set("platform", platform);
    if (status !== "all") p.set("status", status);
    p.set("page", String(page));
    if (requestedDmPage > 1) p.set("dmPage", String(requestedDmPage));
    redirect(`/meta-engagement?${p.toString()}`);
  }
  if (dmTotal > 0 && requestedDmPage !== dmPage) {
    const p = new URLSearchParams();
    if (platform !== "all") p.set("platform", platform);
    if (status !== "all") p.set("status", status);
    if (page > 1) p.set("page", String(page));
    p.set("dmPage", String(dmPage));
    redirect(`/meta-engagement?${p.toString()}`);
  }
  const pageCount = Math.max(1, Math.ceil(total / META_ENGAGEMENT_PAGE_SIZE));
  const dmPageCount = Math.max(
    1,
    Math.ceil(dmTotal / META_ENGAGEMENT_PAGE_SIZE),
  );

  const serialized = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    externalCommentId: r.externalCommentId,
    authorName: r.authorName,
    messageText: r.messageText,
    permalinkUrl: r.permalinkUrl,
    status: r.status,
    parentPostId: r.parentPostId,
    createdAt: r.createdAt.toISOString(),
  }));

  const dmSerialized = dmLogs.map((r) => ({
    id: r.id,
    channel: r.channel,
    scopeId: r.scopeId,
    participantId: r.participantId,
    direction: r.direction,
    body: r.body,
    model: r.model,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Meta comments
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Inbox for Facebook Page and Instagram comments delivered by{" "}
          <code className="bg-muted rounded px-1">POST /api/webhooks/meta</code>.
          Reply, hide, or delete via Graph using{" "}
          <code className="bg-muted rounded px-1">META_PAGE_ACCESS_TOKEN</code>{" "}
          (optional) or{" "}
          <code className="bg-muted rounded px-1">META_ACCESS_TOKEN</code>.
          Messenger and Instagram DM use the same webhook URL with a one-shot AI
          redirect when{" "}
          <code className="bg-muted rounded px-1">WHATSAPP_REDIRECT_URL</code> is
          set (see env example).
        </p>
      </header>

      <MetaEngagementToolbar platform={platform} status={status} />
      <MetaEngagementTable rows={serialized} />
      <TablePagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemLabel="comments"
        preserveKeys={["platform", "status", "dmPage"]}
      />

      <MetaDmBridgeLogsSection rows={dmSerialized} />
      <TablePagination
        page={dmPage}
        pageCount={dmPageCount}
        total={dmTotal}
        itemLabel="DM logs"
        preserveKeys={["platform", "status", "page"]}
        paramKey="dmPage"
      />
    </div>
  );
}
