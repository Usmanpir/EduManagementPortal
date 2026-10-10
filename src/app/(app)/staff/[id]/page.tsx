import type { Metadata } from "next";
import { renderStaffProfile } from "@/server/modules/people/profile-page";

export const metadata: Metadata = { title: "Staff member" };

export default async function StaffProfilePage({ params, searchParams }: PageProps<"/staff/[id]">) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return renderStaffProfile("staff", id, typeof tab === "string" ? tab : "overview");
}
