"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updatePersonFieldAction } from "@/app/(dashboard)/people/actions";

type EditableField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "current_title"
  | "location"
  | "country";

export function useCommitPersonCell(options?: {
  onOptimistic?: (id: string, field: EditableField, value: string | null) => void;
  onRollback?: (id: string, field: EditableField, previous: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function commit(args: {
    id: string;
    field: EditableField;
    value: string | null;
    previous: string | null;
  }) {
    options?.onOptimistic?.(args.id, args.field, args.value);
    startTransition(async () => {
      const res = await updatePersonFieldAction({
        id: args.id,
        field: args.field,
        value: args.value,
      });
      if (!res.ok) {
        options?.onRollback?.(args.id, args.field, args.previous);
        toast.error(`Update failed: ${res.error}`);
      }
    });
  }

  return { commit, pending };
}
