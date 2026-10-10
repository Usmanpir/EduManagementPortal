import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import type { TenantContext } from "@/server/auth/context";
import { ok, route } from "@/server/http/api";
import { forbidden } from "@/server/http/errors";
import { checkInWithQr } from "@/server/modules/attendance/staff";

/** Staff scan the campus QR code with their phone to check in (and again to check out). */
/** Only staff members (linked to a staff record) can check in. */
const staffOnly = (ctx: TenantContext) => {
  if (!ctx.staffId) throw forbidden("Only staff members can check in.");
};

export const POST = route({ guard: staffOnly, body: z.object({ campusId: z.uuid(), token: z.string().min(10).max(60) }) }, async ({ ctx, body }) => {
  const result = await checkInWithQr(ctx, body.campusId, body.token);
  const time = (d: Date | null) => (d ? formatInTimeZone(d, ctx.organization.timezone, "HH:mm") : null);
  const message =
    result.action === "check-out"
      ? `Checked out at ${time(result.record.checkOutAt)}.`
      : result.action === "already"
        ? `You already checked in at ${time(result.record.checkInAt)}.`
        : `Checked in at ${time(result.record.checkInAt)}${result.record.status === "LATE" ? " — marked late" : ""}.`;
  return ok({ action: result.action, status: result.record.status, checkIn: time(result.record.checkInAt), checkOut: time(result.record.checkOutAt) }, message);
});
