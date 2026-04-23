import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="bg-pattern-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="relative w-full max-w-sm">
        <Link href="/" className="mb-10 inline-flex items-center gap-2">
          <span className="size-6 rounded-md bg-brand-gradient" />
          <span className="font-display text-xl font-semibold">Leadflow</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
