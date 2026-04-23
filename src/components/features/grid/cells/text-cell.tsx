"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TextCell({
  value,
  editable = false,
  onCommit,
}: {
  value: string | null | undefined;
  editable?: boolean;
  onCommit?: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value ?? ""), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editable || !editing) {
    return (
      <div
        className={cn(
          "truncate px-2 py-1.5 text-sm",
          editable && "cursor-text hover:bg-accent/40",
        )}
        onDoubleClick={() => editable && setEditing(true)}
        title={value ?? ""}
      >
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim() === "" ? null : draft;
        if ((next ?? null) !== (value ?? null)) onCommit?.(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
      }}
      className="h-full w-full bg-transparent px-2 py-1.5 text-sm outline-none ring-2 ring-brand-500 ring-inset"
    />
  );
}
