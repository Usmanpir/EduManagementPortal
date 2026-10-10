import "server-only";
import { assertCan, type TenantContext } from "@/server/auth/context";
import { notFound } from "@/server/http/errors";
import { commitStaffImport, previewStaffImport, STAFF_TEMPLATE_EXAMPLE, STAFF_TEMPLATE_HEADERS } from "./staff";
import { commitStudentImport, previewStudentImport, STUDENT_TEMPLATE_EXAMPLE, STUDENT_TEMPLATE_HEADERS } from "./students";

/** The import types EduAttend supports and what each needs. */
export function importer(type: string, ctx: TenantContext) {
  switch (type) {
    case "students":
      assertCan(ctx, "students.import");
      return {
        label: "students",
        headers: STUDENT_TEMPLATE_HEADERS,
        example: STUDENT_TEMPLATE_EXAMPLE,
        preview: previewStudentImport,
        commit: commitStudentImport,
      };
    case "staff":
    case "teachers":
      assertCan(ctx, type === "teachers" ? "teachers.manage" : "staff.manage");
      return {
        label: type,
        headers: STAFF_TEMPLATE_HEADERS,
        example: type === "teachers" ? STAFF_TEMPLATE_EXAMPLE : { ...STAFF_TEMPLATE_EXAMPLE, Type: "Staff", Designation: "Accounts Officer", Qualification: "", Specialization: "" },
        preview: previewStaffImport,
        commit: commitStaffImport,
      };
    default:
      throw notFound("Import type");
  }
}
