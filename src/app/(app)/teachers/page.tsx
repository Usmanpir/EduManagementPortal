import type { Metadata } from "next";
import { renderStaffDirectory } from "@/server/modules/people/directory-page";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage({ searchParams }: PageProps<"/teachers">) {
  return renderStaffDirectory("teacher", await searchParams);
}
