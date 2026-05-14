import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SalesSignOutButton } from "@/components/sales-sign-out-button";
import { Separator } from "@/components/ui/separator";
import { getSalesConversationDetail } from "@/lib/sales-inbox/data";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import { cn } from "@/lib/utils";

import {
  salesMarkClosed,
  salesMarkHandoff,
  salesResumeBot,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function SalesConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const detail = await getSalesConversationDetail(conversationId);
  if (!detail) notFound();

  const { conversation, profile, contact, messages, drafts, ctwa } = detail;
  const orderHref = contact
    ? `/?contactId=${encodeURIComponent(contact.id)}`
    : "/";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/sales"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← Inbox
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <SalesSignOutButton />
          <Link
            href={orderHref}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Create order
          </Link>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversation</h1>
        <p className="text-muted-foreground font-mono text-sm">{conversation.id}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{conversation.stage}</Badge>
        {conversation.leadScore ? (
          <Badge variant="outline">lead: {conversation.leadScore}</Badge>
        ) : null}
        <Badge>{conversation.status}</Badge>
        <Badge variant="outline">CAPI events: {detail.agentEventCount}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
          <CardDescription>
            WhatsApp: <span className="font-mono">{conversation.waId}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {contact ? (
            <>
              <p>
                <span className="text-muted-foreground">Contact id:</span>{" "}
                <span className="font-mono">{contact.id}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Phone:</span>{" "}
                {contact.phoneNumber}
              </p>
              {contact.name ? <p>Name (profile): {contact.name}</p> : null}
            </>
          ) : (
            <p className="text-muted-foreground">No linked contact row.</p>
          )}
          {profile ? (
            <div className="pt-2">
              <p className="font-medium">Profile facts</p>
              <ul className="text-muted-foreground list-inside list-disc">
                {profile.customerName ? (
                  <li>customer_name: {profile.customerName}</li>
                ) : null}
                {profile.city ? <li>city: {profile.city}</li> : null}
                {profile.addressNote ? (
                  <li>address: {profile.addressNote}</li>
                ) : null}
                {profile.budgetBand ? (
                  <li>budget: {profile.budgetBand}</li>
                ) : null}
                {profile.urgency ? <li>urgency: {profile.urgency}</li> : null}
                {profile.interestedProductIds ? (
                  <li>products: {profile.interestedProductIds}</li>
                ) : null}
                {profile.trustObjection ? <li>trust_objection: yes</li> : null}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {ctwa.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">CTWA sessions (recent)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ctwa.map((s) => (
              <div key={s.id} className="rounded-md border p-2">
                <p className="font-mono text-xs">clid: {s.ctwaClid}</p>
                {s.sourceUrl ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {s.sourceUrl}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {conversation.conversationSummary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI summary</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">
            {conversation.conversationSummary}
          </CardContent>
        </Card>
      ) : null}

      {conversation.handoffReason ? (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-base">Handoff</CardTitle>
            <CardDescription>
              {conversation.handoffAt
                ? formatDateTimeKabul(conversation.handoffAt)
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">{conversation.handoffReason}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <form action={salesMarkHandoff}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input type="hidden" name="reason" value="manual_inbox_handoff" />
            <Button type="submit" variant="destructive" size="sm">
              Mark handoff
            </Button>
          </form>
          <form action={salesResumeBot}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <Button type="submit" variant="outline" size="sm">
              Resume bot
            </Button>
          </form>
          <form action={salesMarkClosed}>
            <input type="hidden" name="conversationId" value={conversation.id} />
            <Button type="submit" variant="secondary" size="sm">
              Close conversation
            </Button>
          </form>
        </CardContent>
      </Card>

      {drafts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Draft orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {drafts.map((d) => (
              <div key={d.id} className="rounded-md border p-3">
                <p className="text-muted-foreground font-mono text-xs">{d.id}</p>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(d.payload, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transcript</CardTitle>
          <CardDescription>{messages.length} messages</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "user" ? "default" : "secondary"}>
                  {m.role}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatDateTimeKabul(m.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.content}</p>
              <Separator className="mt-3" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
