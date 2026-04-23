import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="bg-pattern-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-start justify-center gap-10 px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/5 px-3 py-1 text-xs font-medium text-brand-500">
          <span className="size-1.5 rounded-full bg-brand-500" /> Leadflow
        </div>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Cold outreach,
          <br />
          <span className="text-brand-gradient">on autopilot.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Import LinkedHelper CSVs, enrich with Apify + FindyMail + SignalHire,
          score with your LLM, push to Instantly, and track every dollar — for every client.
        </p>
        <div className="flex items-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              Sign in <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
