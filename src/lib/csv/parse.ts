import Papa from "papaparse";

export type ParsedCsv = {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
};

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((f) => String(f));
        resolve({
          headers,
          rows: results.data,
          errors: results.errors.map((e) => `${e.type}: ${e.message} (row ${e.row ?? "?"})`),
        });
      },
    });
  });
}

export function parseCsvText(text: string): ParsedCsv {
  const results = Papa.parse<Record<string, string>>(text, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (results.meta.fields ?? []).map((f) => String(f));
  return {
    headers,
    rows: results.data,
    errors: results.errors.map((e) => `${e.type}: ${e.message} (row ${e.row ?? "?"})`),
  };
}
