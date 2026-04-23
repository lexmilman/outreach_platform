import { ComingSoon } from "@/components/features/coming-soon";

export default function SettingsLlmPage() {
  return (
    <ComingSoon
      title="LLM defaults"
      description="Per-feature model picker (scoring, messages, enrichment, search)."
      sprint={3}
    />
  );
}
