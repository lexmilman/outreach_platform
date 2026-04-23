import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ComingSoon } from "@/components/features/coming-soon";

export default async function ClientPromptsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back to client
      </Link>
      <ComingSoon
        title="Prompt manager"
        description="Versioned prompts (relevance, messages, enrichment). Test-runner with diff, A/B experiments. Ships with Sprint 3."
        sprint={3}
      />
    </div>
  );
}
