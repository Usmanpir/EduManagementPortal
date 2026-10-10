import { PageHeaderSkeleton, TableSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy aria-label="Loading">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} />
    </div>
  );
}
