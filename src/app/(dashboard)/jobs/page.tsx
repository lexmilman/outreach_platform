import { ComingSoon } from "@/components/features/coming-soon";

export default function JobsPage() {
  return (
    <ComingSoon
      title="Jobs"
      description="Live view of pgmq depth, job_runs, DLQ replay. Ships with Sprint 3."
      sprint={3}
    />
  );
}
