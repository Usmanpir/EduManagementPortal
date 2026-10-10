import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ImportWizard } from "@/components/imports/import-wizard";
import { requirePageContext } from "@/server/auth/context";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requirePageContext("students.import");
  return (
    <div>
      <PageHeader title="Import students" description="Bring your existing student list in from Excel or CSV." />
      <ImportWizard
        type="students"
        noun="students"
        backHref="/students"
        description="Fill in one row per student. Class and section must match names in EduAttend (e.g. “Grade 8” and “A”). Admission numbers are generated if left blank."
      />
    </div>
  );
}
