import { ProfileSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div aria-busy aria-label="Loading">
      <ProfileSkeleton />
    </div>
  );
}
