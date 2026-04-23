import { ComingSoon } from "@/components/features/coming-soon";

export default function AudienceImportPage() {
  return (
    <ComingSoon
      title="CSV importer"
      description="Drop a LinkedHelper export; auto-map columns with confidence indicators; preview; bulk insert."
      sprint={2}
    />
  );
}
