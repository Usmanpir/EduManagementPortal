import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="Loading">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton rows={6} />
    </div>
  );
}
