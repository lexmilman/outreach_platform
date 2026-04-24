import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  running: "bg-brand-500/15 text-brand-500",
  succeeded: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-red-500/15 text-red-500",
  retrying: "bg-amber-500/15 text-amber-500",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={cn("font-mono text-[11px]", STYLES[status] ?? "")}>
      {status}
    </Badge>
  );
}
