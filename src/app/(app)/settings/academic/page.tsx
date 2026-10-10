import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { academicLookups, listAcademicYears, listDepartments, listRooms } from "@/server/modules/academics/service";
import { AcademicSettingsView } from "./academic-view";

export const metadata: Metadata = { title: "Academic settings" };

export default async function AcademicSettingsPage() {
  const ctx = await requirePageContext("academics.manage");
  const [years, departments, rooms, lookups] = await Promise.all([listAcademicYears(ctx), listDepartments(ctx), listRooms(ctx), academicLookups(ctx)]);
  return <AcademicSettingsView years={years} departments={departments} rooms={rooms} campuses={lookups.campuses} defaultCampusId={ctx.campusId} />;
}
