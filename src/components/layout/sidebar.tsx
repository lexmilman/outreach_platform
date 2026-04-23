"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  LayoutDashboard,
  ListChecks,
  Mail,
  Search,
  Settings,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/audiences", label: "Audiences", icon: ListChecks },
  { href: "/people", label: "People", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
];

const INSIGHTS: NavItem[] = [
  { href: "/search", label: "AI Search", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/jobs", label: "Jobs", icon: Workflow },
];

const SETTINGS: NavItem[] = [{ href: "/settings/integrations", label: "Settings", icon: Settings }];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r bg-card/40 p-4 lg:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2">
        <span className="size-7 rounded-md bg-brand-gradient" />
        <span className="font-display text-lg font-semibold">Leadflow</span>
      </Link>

      <SidebarSection label="Workspace" items={MAIN} pathname={pathname} />
      <SidebarSection label="Insights" items={INSIGHTS} pathname={pathname} />

      <div className="mt-auto">
        <div className="px-2 pt-1">
          <Link
            href="/search"
            className="flex w-full items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Search className="size-3.5" /> Search everything
          </Link>
        </div>
        <div className="mt-3">
          <SidebarSection items={SETTINGS} pathname={pathname} />
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({
  label,
  items,
  pathname,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-4">
      {label ? (
        <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      ) : null}
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => {
          const Icon = it.icon;
          const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-brand-500/10 font-medium text-brand-500"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
