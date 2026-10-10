import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { authenticateDevice, ingestDevicePunches } from "@/server/modules/attendance/staff";

const body = z.object({
  source: z.enum(["BIOMETRIC", "RFID"]).default("BIOMETRIC"),
  punches: z
    .array(z.object({ employeeCode: z.string().trim().min(1).max(30), timestamp: z.iso.datetime({ offset: true }), deviceId: z.string().max(60).optional() }))
    .min(1)
    .max(500),
});

/**
 * Integration endpoint for biometric/RFID terminals or their middleware.
 *   POST /api/devices/attendance
 *   Authorization: Bearer ead_<org>.<secret>   (issued in Settings → Attendance)
 *   { "punches": [{ "employeeCode": "EMP-001", "timestamp": "2026-10-02T08:03:00+05:00" }] }
 */
export const POST = route({ auth: false }, async ({ req }) => {
  // Authenticate the device before looking at the payload.
  const org = await authenticateDevice(req.headers.get("authorization"));
  await enforceRateLimit(`device:${org.id}`, { limit: 120, windowSeconds: 60 });
  const input = body.parse(await req.json().catch(() => ({})));
  const results = await ingestDevicePunches(org, input.punches, input.source);
  return ok({ results }, `${results.length} punches processed.`);
});
