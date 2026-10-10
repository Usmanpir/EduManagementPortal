import type { Metadata } from "next";
import { renderStaffProfile } from "@/server/modules/people/profile-page";

export const metadata: Metadata = { title: "Teacher" };

export default async function TeacherProfilePage({ params, searchParams }: PageProps<"/teachers/[id]">) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return renderStaffProfile("teacher", id, typeof tab === "string" ? tab : "overview");
}
