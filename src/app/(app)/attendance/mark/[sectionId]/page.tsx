import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canAny, requirePageContext } from "@/server/auth/context";
import { getRegister } from "@/server/modules/attendance/register";
import { AppError } from "@/server/http/errors";
import { todayIn } from "@/lib/format";
import { RegisterView } from "./register-view";

export const metadata: Metadata = { title: "Mark attendance" };

const params = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.uuid().optional(),
});

export default async function MarkAttendancePage({ params: routeParams, searchParams }: PageProps<"/attendance/mark/[sectionId]">) {
  const { sectionId } = await routeParams;
  const ctx = await requirePageContext();
  if (!canAny(ctx, "attendance.mark", "attendance.view")) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const q = params.safeParse(await searchParams);
  const date = (q.success && q.data.date) || todayIn(ctx.organization.timezone);
  const register = await getRegister(ctx, { sectionId, date, periodId: (q.success && q.data.period) || null }).catch((error: unknown) => {
    // Sections the user can't access look exactly like missing ones.
    if (error instanceof AppError && ["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"].includes(error.code)) notFound();
    throw error;
  });
  return <RegisterView register={register} today={todayIn(ctx.organization.timezone)} />;
}
