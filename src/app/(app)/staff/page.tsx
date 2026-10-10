import type { Metadata } from "next";
import { renderStaffDirectory } from "@/server/modules/people/directory-page";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  return renderStaffDirectory("staff", await searchParams);
}
