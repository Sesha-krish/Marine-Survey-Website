import Link from "next/link";
import { redirect } from "next/navigation";
import { Anchor } from "lucide-react";
import { getSession, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await getSession();
  if (u) redirect(homeFor(u.role));
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-white lg:flex dark:bg-[#0b2545]">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10"><Anchor className="h-5 w-5" aria-hidden /></span>
          Marine Survey Portal
        </Link>
        <div>
          <p className="max-w-md text-3xl font-semibold leading-tight">From the first phone call to the signed report — one auditable chain.</p>
          <p className="mt-4 max-w-md text-white/75">RFQs, job orders, surveyor allocation, offline survey capture and versioned reports for marine survey companies.</p>
        </div>
        <p className="text-sm text-white/60">© {new Date().getFullYear()} Marine Survey Portal</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Vendors, surveyors and requesters all sign in here.</p>
          <LoginForm next={next} />
          <details className="mt-8 rounded-lg border border-border bg-surface p-4 text-[13px] text-muted">
            <summary className="cursor-pointer font-medium text-text">Demo accounts (password Demo@1234)</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>admin@coastal.demo — vendor admin</li>
              <li>ops@coastal.demo — vendor staff</li>
              <li>surveyor@coastal.demo — in-house surveyor</li>
              <li>indie@msp.demo — independent surveyor</li>
              <li>veera@demo-customer.in — requester</li>
              <li>admin@harbour.demo — second tenant</li>
              <li>admin@msp.demo — platform admin</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
