import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { EditClientForm } from "./edit-client-form";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, slug, icp_description, brand_voice, is_archived")
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Edit client</CardTitle>
          <CardDescription>Update name, slug, ICP, or brand voice.</CardDescription>
        </CardHeader>
        <CardContent>
          <EditClientForm client={client} />
        </CardContent>
      </Card>
    </div>
  );
}
