import type { Metadata } from "next";
import { listPlansForAdmin } from "@/server/modules/platform/billing";
import { PlansEditor } from "./plans-editor";

export const metadata: Metadata = { title: "Plans" };

export default async function AdminPlansPage() {
  const plans = await listPlansForAdmin();
  return <PlansEditor plans={plans} />;
}
