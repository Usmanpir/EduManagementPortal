import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requirePageContext } from "@/server/auth/context";
import { resolveStudent } from "@/server/modules/portal/service";

export const CHILD_COOKIE = "ea_child";

/**
 * Context for a /my page: the signed-in family member, their children and the
 * selected one (URL first, then the last child they looked at). Staff are
 * sent to the matching staff screen instead.
 */
export async function portalPage(searchParams: Promise<Record<string, string | string[] | undefined>>, staffFallback: string) {
  const ctx = await requirePageContext();
  if (!ctx.guardianId && !ctx.studentId) redirect(staffFallback);
  const sp = await searchParams;
  const requested = typeof sp.student === "string" ? sp.student : (await cookies()).get(CHILD_COOKIE)?.value;
  const { students, student } = await resolveStudent(ctx, requested);
  return { ctx, sp, students, student, isParent: !!ctx.guardianId };
}
