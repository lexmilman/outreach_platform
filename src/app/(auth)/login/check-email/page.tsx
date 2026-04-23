import Link from "next/link";
import { MailCheck } from "lucide-react";

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="inline-flex size-12 items-center justify-center rounded-xl bg-brand-gradient text-white">
        <MailCheck className="size-6" />
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We just sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{email ?? "your email"}</span>.
          The link expires in 60 minutes.
        </p>
      </div>
      <Link href="/login" className="text-sm text-brand-500 underline-offset-4 hover:underline">
        Use a different email
      </Link>
    </div>
  );
}
