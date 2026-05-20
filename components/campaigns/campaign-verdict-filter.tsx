"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignVerdictFilter } from "@/lib/campaigns-list-page";

export function CampaignVerdictFilter({
  value,
}: {
  value: CampaignVerdictFilter;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-col gap-1.5 sm:w-52">
      <Label htmlFor="verdict-filter" className="text-xs">
        Filter by verdict
      </Label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (!v) return;
          const p = new URLSearchParams(searchParams.toString());
          if (v === "ALL") p.delete("verdict");
          else p.set("verdict", v);
          p.delete("page");
          router.push(`/campaigns?${p.toString()}`);
        }}
      >
        <SelectTrigger id="verdict-filter" size="sm" className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All verdicts</SelectItem>
          <SelectItem value="SCALE">SCALE</SelectItem>
          <SelectItem value="KEEP">KEEP</SelectItem>
          <SelectItem value="OPTIMIZE">OPTIMIZE</SelectItem>
          <SelectItem value="KILL">KILL</SelectItem>
          <SelectItem value="LEARNING">LEARNING</SelectItem>
          <SelectItem value="ATTRIBUTION_ISSUE">ATTRIBUTION_ISSUE</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
