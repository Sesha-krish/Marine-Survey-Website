import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <Compass className="mx-auto h-10 w-10 text-subtle" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="mt-1 text-sm text-muted">The record may not exist, or it belongs to another workspace.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-accent-strong hover:underline">Go home</Link>
      </div>
    </main>
  );
}
