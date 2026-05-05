"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  deleteMetaCommentAction,
  hideMetaCommentAction,
  replyMetaCommentAction,
  suggestMetaCommentReplyAction,
  unhideMetaCommentAction,
} from "@/app/meta-engagement/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type MetaEngagementCommentRow = {
  id: string;
  platform: string;
  externalCommentId: string;
  authorName: string | null;
  messageText: string | null;
  permalinkUrl: string | null;
  status: string;
  parentPostId: string;
  createdAt: string;
};

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

export function MetaEngagementToolbar(props: {
  platform: "all" | "facebook" | "instagram";
  status: "all" | "active" | "hidden" | "deleted";
}) {
  const { platform, status } = props;

  const plat = useMemo(
    () =>
      [
        { v: "all" as const, label: "All platforms" },
        { v: "facebook" as const, label: "Facebook" },
        { v: "instagram" as const, label: "Instagram" },
      ],
    [],
  );

  const stat = useMemo(
    () =>
      [
        { v: "all" as const, label: "All statuses" },
        { v: "active" as const, label: "Active" },
        { v: "hidden" as const, label: "Hidden" },
        { v: "deleted" as const, label: "Deleted" },
      ],
    [],
  );

  const href = (p: typeof platform, s: typeof status) => {
    const q = new URLSearchParams();
    if (p !== "all") q.set("platform", p);
    if (s !== "all") q.set("status", s);
    const qs = q.toString();
    return qs ? `/meta-engagement?${qs}` : "/meta-engagement";
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {plat.map((x) => (
          <Link
            className={cn(
              buttonVariants({
                variant: platform === x.v ? "default" : "outline",
                size: "sm",
              }),
            )}
            href={href(x.v, status)}
            key={x.v}
          >
            {x.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {stat.map((x) => (
          <Link
            className={cn(
              buttonVariants({
                variant: status === x.v ? "secondary" : "outline",
                size: "sm",
              }),
            )}
            href={href(platform, x.v)}
            key={x.v}
          >
            {x.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MetaEngagementTable({ rows }: { rows: MetaEngagementCommentRow[] }) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<MetaEngagementCommentRow | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openReply(row: MetaEngagementCommentRow) {
    setActiveRow(row);
    setDraft("");
    setBanner(null);
    setReplyOpen(true);
  }

  function runSuggest() {
    if (!activeRow) return;
    startTransition(async () => {
      setBanner(null);
      const r = await suggestMetaCommentReplyAction(activeRow.id);
      if (!r.ok) {
        setBanner(r.error);
        return;
      }
      setDraft(r.data?.draft ?? "");
    });
  }

  function sendReply() {
    if (!activeRow) return;
    startTransition(async () => {
      setBanner(null);
      const r = await replyMetaCommentAction(activeRow.id, draft);
      if (!r.ok) {
        setBanner(r.error);
        return;
      }
      setReplyOpen(false);
      setActiveRow(null);
      router.refresh();
    });
  }

  function runHide(row: MetaEngagementCommentRow) {
    if (!window.confirm("Hide this comment on the platform?")) return;
    startTransition(async () => {
      const r = await hideMetaCommentAction(row.id);
      if (!r.ok) window.alert(r.error);
      else router.refresh();
    });
  }

  function runUnhide(row: MetaEngagementCommentRow) {
    if (!window.confirm("Unhide this Facebook comment?")) return;
    startTransition(async () => {
      const r = await unhideMetaCommentAction(row.id);
      if (!r.ok) window.alert(r.error);
      else router.refresh();
    });
  }

  function runDelete(row: MetaEngagementCommentRow) {
    if (
      !window.confirm(
        "Delete this comment permanently on the platform? This cannot be undone.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const r = await deleteMetaCommentAction(row.id);
      if (!r.ok) window.alert(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="-mx-3 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full overflow-hidden rounded-xl border align-middle">
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[9rem]">When</TableHead>
                <TableHead className="w-[7rem]">Channel</TableHead>
                <TableHead className="w-[7rem]">Status</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="w-[1%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No comments ingested yet. Subscribe the Page object to{" "}
                    <code className="bg-muted rounded px-1">feed</code> and{" "}
                    <code className="bg-muted rounded px-1">messages</code>, and
                    the Instagram object to{" "}
                    <code className="bg-muted rounded px-1">comments</code> and{" "}
                    <code className="bg-muted rounded px-1">messages</code>, all
                    pointing at{" "}
                    <code className="bg-muted rounded px-1">
                      /api/webhooks/meta
                    </code>
                    .
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const disabled = row.status === "deleted";
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap align-top text-xs">
                        {formatWhen(row.createdAt)}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline">
                          {row.platform === "instagram" ? "Instagram" : "Facebook"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={
                            row.status === "active"
                              ? "default"
                              : row.status === "hidden"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[10rem] align-top text-sm">
                        <div className="font-medium">
                          {row.authorName?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5 font-mono text-[10px] leading-tight break-all">
                          {row.externalCommentId}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xl align-top text-sm leading-snug">
                        <p className="whitespace-pre-wrap">{row.messageText || "—"}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {row.permalinkUrl ? (
                            <a
                              className="text-primary underline-offset-3 hover:underline"
                              href={row.permalinkUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Open thread
                            </a>
                          ) : null}
                          <span className="text-muted-foreground">
                            Post/media:{" "}
                            <span className="font-mono">{row.parentPostId}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            disabled={disabled || pending}
                            onClick={() => openReply(row)}
                            size="sm"
                            variant="default"
                          >
                            Reply
                          </Button>
                          <Button
                            disabled={
                              disabled || pending || row.status === "hidden"
                            }
                            onClick={() => runHide(row)}
                            size="sm"
                            variant="outline"
                          >
                            Hide
                          </Button>
                          <Button
                            disabled={
                              disabled ||
                              pending ||
                              row.platform !== "facebook" ||
                              row.status !== "hidden"
                            }
                            onClick={() => runUnhide(row)}
                            size="sm"
                            variant="outline"
                          >
                            Unhide
                          </Button>
                          <Button
                            disabled={disabled || pending}
                            onClick={() => runDelete(row)}
                            size="sm"
                            variant="destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          setReplyOpen(open);
          if (!open) setActiveRow(null);
        }}
        open={replyOpen}
      >
        <DialogContent className="max-w-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reply publicly</DialogTitle>
            <DialogDescription>
              Sends a nested reply via Graph API. Review before sending — this is
              visible on the post.
            </DialogDescription>
          </DialogHeader>
          {banner ? (
            <p className="text-destructive text-sm">{banner}</p>
          ) : null}
          <Textarea
            className="min-h-28"
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a reply…"
            value={draft}
          />
          <div className="-mx-4 -mb-4 flex flex-col gap-3 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              disabled={pending || !activeRow}
              onClick={runSuggest}
              type="button"
              variant="secondary"
            >
              Suggest draft (AI)
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                disabled={pending}
                onClick={() => setReplyOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={pending || !draft.trim()} onClick={sendReply}>
                Send reply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
