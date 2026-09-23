import { Card, SkeletonBlock, SkeletonRows } from "@/components/ui";

// Shown while the segment streams. It is laid out like the real list so the
// page does not jump when the rows arrive.
export default function LoadingBorrowers() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="mt-2 h-4 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-9 w-28" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <SkeletonBlock className="h-9 w-full max-w-xs" />
          <SkeletonBlock className="ml-auto h-9 w-52" />
        </div>
        <SkeletonRows rows={8} />
        <div className="border-t border-line px-4 py-3">
          <SkeletonBlock className="h-4 w-32" />
        </div>
      </Card>
    </div>
  );
}
