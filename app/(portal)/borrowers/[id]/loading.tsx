import { Card, SkeletonBlock } from "@/components/ui";

export default function LoadingBorrower() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="mt-2 h-7 w-64 max-w-full" />
        <SkeletonBlock className="mt-2 h-4 w-52" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SkeletonBlock className="h-5 w-24" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="mt-2 h-4 w-40" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <SkeletonBlock className="h-5 w-36" />
          <SkeletonBlock className="mt-4 h-4 w-full" />
          <SkeletonBlock className="mt-2 h-4 w-2/3" />
        </Card>
      </div>
      <Card className="p-5">
        <SkeletonBlock className="h-5 w-28" />
        <SkeletonBlock className="mt-4 h-4 w-full" />
      </Card>
    </div>
  );
}
