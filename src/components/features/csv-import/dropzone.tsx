"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dropzone({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file && /\.csv$/i.test(file.name)) onFile(file);
    },
    [onFile, disabled],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
        dragOver
          ? "border-brand-500 bg-brand-500/5"
          : "border-muted-foreground/30 hover:border-brand-500/60 hover:bg-brand-500/5",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <span className="inline-flex size-11 items-center justify-center rounded-lg bg-brand-gradient text-white">
        <Upload className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium">Drop your CSV here, or click to browse</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Up to 100,000 rows · up to 25MB · LinkedHelper format auto-detected
      </p>
    </div>
  );
}
