import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ComingSoon({
  title,
  description,
  sprint,
}: {
  title: string;
  description: string;
  sprint: number;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-10 text-center">
      <div className="inline-flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-white">
        <Sparkles className="size-6" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-2">
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <Badge variant="secondary">Sprint {sprint}</Badge>
        </div>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
