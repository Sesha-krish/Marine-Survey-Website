import Link from "next/link";
import { Anchor, ArrowRight, Boxes, ClipboardCheck, FileCheck2, HardHat, Ship, Smartphone, Truck, Warehouse, Weight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/app/theme-toggle";

export const metadata = { title: "Marine Survey Portal — RFQ to signed report" };

const SERVICES = [
  { icon: Ship, t: "Ship board surveys", d: "Draft surveys and on-board cargo surveys with initial/final draft calculations." },
  { icon: Boxes, t: "Container surveys", d: "Condition of container, tally stuffing and unstuffing with 12-angle photo evidence." },
  { icon: Truck, t: "PDI inspection", d: "Pre-delivery and pre-dispatch inspection of cargo, trucks and lifting arrangements." },
  { icon: Warehouse, t: "Warehouse tally", d: "Receipt and delivery tallies with discrepancy reporting." },
  { icon: Weight, t: "Weighbridge tally", d: "Attended weighments with gross / tare / net per vehicle." },
  { icon: ClipboardCheck, t: "Flat rack & open top", d: "Securing recommendations, lashing plans and attendance during stuffing." },
];

const FLOW = ["Customer calls", "RFQ created", "Job orders", "Surveyor accepts", "Survey captured offline", "Report issued & signed"];

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-fg"><Anchor className="h-5 w-5" aria-hidden /></span>Marine Survey Portal</Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Site">
            <a href="#services" className="hover:text-text">Services</a>
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#join" className="hover:text-text">Join us</a>
          </nav>
          <ThemeToggle />
          <ButtonLink href="/login" size="sm">Sign in</ButtonLink>
        </div>
      </header>

      <section className="bg-primary text-white dark:bg-[#0b2545]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-[#7fe0d2]">Marine survey management</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">From the first phone call to the signed report.</h1>
            <p className="mt-4 max-w-lg text-lg text-white/80">One auditable chain for survey companies: RFQs, job orders, in-house and independent surveyors, offline field capture, and versioned reports your clients can verify.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login" size="lg" variant="accent">Open the portal <ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink>
              <a href="#join" className="inline-flex h-11 items-center rounded-lg border border-white/30 px-5 text-[15px] font-medium hover:bg-white/10">Join as a surveyor</a>
            </div>
          </div>
          <ol className="grid gap-2" aria-label="Workflow">
            {FLOW.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-lg bg-white/[0.07] px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2a9d8f] text-sm font-bold">{i + 1}</span>
                <span className="font-medium">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Services</h2>
        <p className="mt-2 max-w-2xl text-muted">Every survey type is a versioned template — the same definition drives the field form, validation and the issued report.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div key={s.t} className="rounded-xl border border-border bg-surface p-6 shadow-card">
              <s.icon className="h-6 w-6 text-accent-strong" aria-hidden />
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-20 md:grid-cols-3">
          {[
            { icon: FileCheck2, t: "Reports that hold up", d: "Issued reports are locked. Corrections create tracked versions with an “Amended on … by …” banner, and every signed report carries a tamper-evident hash." },
            { icon: Smartphone, t: "Built for the yard", d: "Surveyors accept jobs on their phone, capture photos into named slots — even with no signal — and sync when they're back in range." },
            { icon: HardHat, t: "Your team and the marketplace", d: "Allocate in-house or independent surveyors from one drawer, filtered by location, capability, availability and workload." },
          ].map((f) => (
            <div key={f.t}>
              <f.icon className="h-7 w-7 text-accent-strong" aria-hidden />
              <h3 className="mt-3 text-lg font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="join" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-8 shadow-card">
            <h2 className="text-xl font-semibold">Join as a service provider</h2>
            <p className="mt-2 text-sm text-muted">Survey companies get the full portal: RFQs, allocation, reports, GST invoicing and credit-based pricing.</p>
            <a href="mailto:onboarding@example.com?subject=Service%20provider%20onboarding" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong hover:underline">Talk to onboarding <ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
          <div className="rounded-xl border border-border bg-surface p-8 shadow-card">
            <h2 className="text-xl font-semibold">Join as an independent surveyor</h2>
            <p className="mt-2 text-sm text-muted">Get offered jobs by survey companies near you, accept on your phone, and get paid per survey.</p>
            <a href="mailto:onboarding@example.com?subject=Independent%20surveyor" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-accent-strong hover:underline">Apply <ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Marine Survey Portal</footer>
    </div>
  );
}
