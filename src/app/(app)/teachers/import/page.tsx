import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ImportWizard } from "@/components/imports/import-wizard";
import { requirePageContext } from "@/server/auth/context";

export const metadata: Metadata = { title: "Import teachers" };

export default async function ImportTeachersPage() {
  await requirePageContext("teachers.manage");
  return (
    <div>
      <PageHeader title="Import teachers" description="Add your teaching staff from Excel or CSV." />
      <ImportWizard
        type="teachers"
        noun="teachers"
        backHref="/teachers"
        description="One row per teacher. Set Type to “Teacher”. Employee IDs are generated if left blank; you can send sign-in invitations afterwards."
      />
    </div>
  );
}
