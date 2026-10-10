import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ImportWizard } from "@/components/imports/import-wizard";
import { requirePageContext } from "@/server/auth/context";

export const metadata: Metadata = { title: "Import staff" };

export default async function ImportStaffPage() {
  await requirePageContext("staff.manage");
  return (
    <div>
      <PageHeader title="Import staff" description="Add employees from Excel or CSV." />
      <ImportWizard
        type="staff"
        noun="staff"
        backHref="/staff"
        description="One row per employee. Use Type “Teacher” or “Staff”. Department and campus must match names in EduAttend."
      />
    </div>
  );
}
