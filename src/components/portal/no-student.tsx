import { UserRoundX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";

export function NoStudent({ isParent }: { isParent: boolean }) {
  return (
    <EmptyState
      icon={UserRoundX}
      title={isParent ? "No children linked yet" : "Your student record isn't linked yet"}
      description={isParent ? "Ask the school office to link your account to your child's admission record. You'll then see attendance, results and fees here." : "Ask the school office to link your account to your student record."}
    />
  );
}
