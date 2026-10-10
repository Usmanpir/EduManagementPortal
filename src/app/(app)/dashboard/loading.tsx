import { ChartSkeleton, PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="Loading">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartSkeleton className="xl:col-span-2" />
        <TableSkeleton rows={4} columns={3} />
      </div>
    </div>
  );
}
