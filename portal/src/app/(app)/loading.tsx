import { Skeleton } from "@/components/ui/misc";

/** Skeletons instead of spinners while a page's server data loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-7 w-56" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="rounded-xl border border-border bg-surface p-4">
        <Skeleton className="mb-4 h-9 w-full max-w-md" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="mb-3 h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
