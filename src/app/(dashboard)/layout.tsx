import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  // Ensure we have an org (idempotent RPC).
  await supabase.rpc("bootstrap_user_org", { p_org_name: "My Agency" });

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar email={userData.user.email ?? null} />
        <main className="flex-1 overflow-x-hidden px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
