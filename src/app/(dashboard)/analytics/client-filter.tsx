"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Client = { id: string; name: string };

const ALL_CLIENTS = "__all__";

export function AnalyticsClientFilter({
  clients,
  selectedClient,
  from,
  to,
}: {
  clients: Client[];
  selectedClient: string | null;
  from: string;
  to: string;
}) {
  const router = useRouter();

  function apply(nextClient: string | null, nextFrom: string, nextTo: string) {
    const qp = new URLSearchParams();
    if (nextClient) qp.set("client", nextClient);
    if (nextFrom) qp.set("from", nextFrom);
    if (nextTo) qp.set("to", nextTo);
    const qs = qp.toString();
    router.push(qs ? `/analytics?${qs}` : "/analytics");
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Client</Label>
        <Select
          value={selectedClient ?? ALL_CLIENTS}
          onValueChange={(v) => apply(v === ALL_CLIENTS ? null : v, from, to)}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">From</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => apply(selectedClient, e.target.value, to)}
          className="w-40"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">To</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => apply(selectedClient, from, e.target.value)}
          className="w-40"
        />
      </div>
    </div>
  );
}
