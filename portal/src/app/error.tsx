"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[70dvh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-warning" aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">Your data is safe. Try again, and if it keeps happening raise a support ticket{error.digest ? ` quoting ${error.digest}` : ""}.</p>
        <Button className="mt-4" onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
