"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { deleteAudienceAction } from "@/app/(dashboard)/audiences/actions";

export function DeleteAudienceButton({
  audienceId,
  audienceName,
  variant = "icon",
  redirectToList = false,
}: {
  audienceId: string;
  audienceName: string;
  variant?: "icon" | "default";
  redirectToList?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3500);
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("audienceId", audienceId);
      if (redirectToList) fd.set("redirectToList", "1");
      const res = await deleteAudienceAction(fd);
      if (res.ok) {
        toast.success(`Deleted "${audienceName}"`);
        if (!redirectToList) router.refresh();
      } else {
        toast.error(`Delete failed: ${res.error}`);
        setConfirming(false);
      }
    });
  };

  if (variant === "icon") {
    return (
      <Button
        type="button"
        size="sm"
        variant={confirming ? "destructive" : "ghost"}
        disabled={pending}
        onClick={onClick}
        aria-label={`Delete audience ${audienceName}`}
        title={confirming ? "Click again to confirm" : "Delete"}
      >
        <Trash2 className="size-3.5" />
        {confirming ? " Confirm" : ""}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={confirming ? "destructive" : "outline"}
      disabled={pending}
      onClick={onClick}
    >
      <Trash2 className="size-3.5" />
      {confirming ? "Click again to confirm" : "Delete audience"}
    </Button>
  );
}
