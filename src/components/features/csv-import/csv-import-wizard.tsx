"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsvFile, type ParsedCsv } from "@/lib/csv/parse";
import { autoMapColumns, type FieldMapping } from "@/lib/csv/auto-map";
import { mapRows } from "@/lib/csv/map-rows";
import { ALL_CANONICAL_FIELDS, type CanonicalField } from "@/lib/csv/linked-helper";
import { importCsvAction } from "@/app/(dashboard)/audiences/import/actions";
import { Dropzone } from "./dropzone";
import { ColumnMapper } from "./column-mapper";
import { PreviewTable } from "./preview-table";
import { ImportReportPanel } from "./import-report";

type ClientOption = { id: string; name: string; slug: string };
type Step = "upload" | "map" | "review";

export function CsvImportWizard({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [clientId, setClientId] = useState<string>("");
  const [audienceName, setAudienceName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [pending, startTransition] = useTransition();

  const { validCount, rejectedPreview } = useMemo(() => {
    if (!csv) return { validCount: 0, rejectedPreview: [] as { index: number; reason: string }[] };
    const { mapped, rejected } = mapRows(
      csv.rows,
      mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
    );
    return {
      validCount: mapped.length,
      rejectedPreview: rejected.slice(0, 10),
    };
  }, [csv, mappings]);

  async function handleFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large. Max 25MB for now — split and retry.");
      return;
    }
    const parsed = await parseCsvFile(file);
    if (parsed.rows.length === 0) {
      toast.error("No data rows found in CSV.");
      return;
    }
    if (parsed.rows.length > 100_000) {
      toast.error("Too many rows (max 100,000 per import).");
      return;
    }
    const { mappings: auto } = autoMapColumns(parsed.headers);
    setCsv(parsed);
    setMappings(auto);
    if (!audienceName) setAudienceName(file.name.replace(/\.csv$/i, ""));
    setStep("map");
  }

  function updateMapping(csvHeader: string, canonical: CanonicalField | null) {
    setMappings((prev) =>
      prev.map((m) => (m.csvHeader === csvHeader ? { ...m, canonical, confidence: 1 } : m)),
    );
  }

  function runImport() {
    if (!csv) return;
    startTransition(async () => {
      const res = await importCsvAction({
        clientId: clientId || null,
        audienceName,
        mappings: mappings.map((m) => ({ csvHeader: m.csvHeader, canonical: m.canonical })),
        rows: csv.rows,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Imported ${res.report.insertedPeople.toLocaleString()} new people · ${res.report.matchedExistingPeople.toLocaleString()} matched existing`,
      );
      router.push(`/audiences`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>
            Step {step === "upload" ? 1 : step === "map" ? 2 : 3} of 3 —{" "}
            {step === "upload"
              ? "Upload CSV"
              : step === "map"
                ? "Map columns"
                : "Review & import"}
          </CardTitle>
          <CardDescription>
            {step === "upload"
              ? "Pick the client, give this audience a name, and drop your LinkedHelper export."
              : step === "map"
                ? "Review the auto-mapped columns. Green is confident, amber is uncertain, red means you need to choose."
                : "Everything looks right? Press import. Large files take up to a minute."}
          </CardDescription>
        </div>
        <Stepper step={step} />
      </CardHeader>

      <CardContent className="space-y-6">
        {step === "upload" ? (
          <UploadStep
            clients={clients}
            clientId={clientId}
            setClientId={setClientId}
            audienceName={audienceName}
            setAudienceName={setAudienceName}
            onFile={handleFile}
          />
        ) : null}

        {step === "map" && csv ? (
          <>
            <ColumnMapper
              mappings={mappings}
              sampleRow={csv.rows[0] ?? {}}
              onChange={updateMapping}
              canonicalFields={ALL_CANONICAL_FIELDS}
            />
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button variant="brand" onClick={() => setStep("review")}>
                Continue to review
              </Button>
            </div>
          </>
        ) : null}

        {step === "review" && csv ? (
          <>
            <ImportReportPanel
              totalRows={csv.rows.length}
              validCount={validCount}
              rejectedPreview={rejectedPreview}
              audienceName={audienceName}
              clientName={clients.find((c) => c.id === clientId)?.name}
            />
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Preview · first 5 mapped rows
              </Label>
              <PreviewTable
                rows={csv.rows.slice(0, 5)}
                mappings={mappings}
              />
            </div>
            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep("map")} disabled={pending}>
                Back
              </Button>
              <Button
                variant="brand"
                onClick={runImport}
                disabled={pending || validCount === 0 || !audienceName.trim()}
              >
                {pending ? "Importing…" : `Import ${validCount.toLocaleString()} rows`}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: Step[] = ["upload", "map", "review"];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const state =
          s === step ? "current" : steps.indexOf(step) > i ? "done" : "upcoming";
        return (
          <span
            key={s}
            className={
              state === "current"
                ? "h-1.5 w-10 rounded-full bg-brand-gradient"
                : state === "done"
                  ? "h-1.5 w-6 rounded-full bg-brand-500/60"
                  : "h-1.5 w-6 rounded-full bg-muted"
            }
          />
        );
      })}
    </div>
  );
}

function UploadStep({
  clients,
  clientId,
  setClientId,
  audienceName,
  setAudienceName,
  onFile,
}: {
  clients: ClientOption[];
  clientId: string;
  setClientId: (v: string) => void;
  audienceName: string;
  setAudienceName: (v: string) => void;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="client">Client</Label>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet. Create one first, then return here.
            </p>
          ) : (
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="client">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="audience">Audience name</Label>
          <Input
            id="audience"
            value={audienceName}
            onChange={(e) => setAudienceName(e.target.value)}
            placeholder="e.g. VP Eng at Series B SaaS"
          />
        </div>
      </div>
      <Dropzone onFile={onFile} disabled={!clientId && clients.length > 0} />
      {clients.length > 0 && !clientId ? (
        <p className="text-xs text-muted-foreground">Pick a client to enable upload.</p>
      ) : null}
    </div>
  );
}
