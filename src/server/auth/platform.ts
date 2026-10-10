import "server-only";
import { redirect } from "next/navigation";
import { AppError } from "@/server/http/errors";
import { getSession } from "./session";

/** For platform (super admin) pages: anyone else is sent to their own home. */
export async function requireSuperAdminPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=%2Fadmin");
  if (!session.user.isSuperAdmin) redirect("/dashboard");
  return session;
}

/** For platform API routes. */
export async function requireSuperAdminApi() {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
  if (!session.user.isSuperAdmin) throw new AppError("FORBIDDEN", "You don't have permission to do that.");
  return session;
}
