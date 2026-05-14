import { Badge } from "@/components/ui/badge";
import { formatDateTimeKabul } from "@/lib/kabul-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type MetaDmBridgeLogRow = {
  id: string;
  channel: string;
  scopeId: string;
  participantId: string;
  direction: string;
  body: string | null;
  model: string | null;
  createdAt: string;
};

export function MetaDmBridgeLogsSection({
  rows,
}: {
  rows: MetaDmBridgeLogRow[];
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Messenger / Instagram DM (bridge logs)
        </h2>
        <p className="text-muted-foreground max-w-3xl text-sm leading-relaxed">
          Inbound and outbound messages handled by the webhook DM bridge (
          <code className="bg-muted rounded px-1">meta_dm_bridge_logs</code>
          ). Facebook Messenger arrives on the{" "}
          <code className="bg-muted rounded px-1">page</code> webhook (
          <code className="bg-muted rounded px-1">messages</code>). Instagram
          Direct arrives on the separate{" "}
          <code className="bg-muted rounded px-1">instagram</code> webhook —
          subscribe to{" "}
          <code className="bg-muted rounded px-1">messages</code> there as well
          as <code className="bg-muted rounded px-1">comments</code>, or only
          comments will show up.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No DM bridge rows yet. Send a test DM while{" "}
          <code className="bg-muted rounded px-1">META_WEBHOOK_DEBUG=true</code>{" "}
          is on to confirm webhook routing in the server log.
        </p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">When</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="min-w-[10rem]">Body</TableHead>
                <TableHead className="text-muted-foreground text-xs">
                  scope / participant
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTimeKabul(r.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.channel}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.direction === "inbound" ? "outline" : "default"
                      }
                    >
                      {r.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-sm">
                    {r.body ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs leading-snug">
                    <div className="max-w-[14rem] truncate" title={r.scopeId}>
                      scope {r.scopeId}
                    </div>
                    <div
                      className="max-w-[14rem] truncate"
                      title={r.participantId}
                    >
                      psid {r.participantId}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
