import "server-only";
import type { z } from "zod";
import type { StaffAttendanceStatus } from "@/generated/prisma/enums";
import { auditFor } from "@/server/audit";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { hashToken, hmac, randomToken, safeEqual, encryptJson, decryptJson } from "@/server/auth/crypto";
import { db } from "@/server/db/client";
import { AppError, badRequest, forbidden, notFound } from "@/server/http/errors";
import { minutesOf, parseOrgSettings } from "@/server/modules/organizations/settings";
import { dateOnly, todayIn } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import type { saveStaffRegisterSchema } from "@/lib/validation/attendance";

export async function getStaffRegister(ctx: TenantContext, date: string, departmentId?: string) {
  const day = dateOnly(date);
  const staff = await ctx.db.staff.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...campusScope(ctx), ...(departmentId ? { departmentId } : {}) },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      teacher: { select: { id: true } },
      department: { select: { name: true } },
      campus: { select: { name: true } },
      attendance: { where: { date: day }, take: 1 },
      leaveRequests: { where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { type: true }, take: 1 },
    },
  });
  const tz = ctx.organization.timezone;
  return {
    date,
    rows: staff.map((s) => {
      const r = s.attendance[0];
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        employeeCode: s.employeeCode,
        designation: s.designation,
        department: s.department?.name ?? null,
        campusName: s.campus.name,
        isTeacher: !!s.teacher,
        status: (r?.status ?? (s.leaveRequests.length ? "LEAVE" : null)) as StaffAttendanceStatus | null,
        checkIn: r?.checkInAt ? formatInTimeZone(r.checkInAt, tz, "HH:mm") : null,
        checkOut: r?.checkOutAt ? formatInTimeZone(r.checkOutAt, tz, "HH:mm") : null,
        source: r?.source ?? null,
        note: r?.note ?? null,
        approvedLeave: s.leaveRequests[0]?.type ?? null,
      };
    }),
  };
}

/** "08:05" on a local date → UTC instant. */
function localTime(date: string, hhmm: string, timezone: string) {
  // Find the offset for that date in the org timezone, then build the instant.
  const probe = new Date(`${date}T12:00:00Z`);
  const offset = formatInTimeZone(probe, timezone, "xxx"); // e.g. +05:00
  return new Date(`${date}T${hhmm}:00${offset}`);
}

export async function saveStaffRegister(ctx: TenantContext, input: z.output<typeof saveStaffRegisterSchema>) {
  if (input.date > todayIn(ctx.organization.timezone)) throw badRequest("Attendance can't be marked for a future date.");
  const ids = input.records.map((r) => r.staffId);
  const staff = await ctx.db.staff.findMany({ where: { id: { in: ids }, deletedAt: null, ...campusScope(ctx) }, select: { id: true, campusId: true } });
  if (staff.length !== new Set(ids).size) throw notFound("Staff member");
  const campusOf = new Map(staff.map((s) => [s.id, s.campusId]));
  const date = dateOnly(input.date);
  const tz = ctx.organization.timezone;

  await ctx.db.$transaction(async (tx) => {
    for (const r of input.records) {
      const checkInAt = r.checkIn ? localTime(input.date, r.checkIn, tz) : null;
      await tx.staffAttendance.upsert({
        where: { staffId_date: { staffId: r.staffId, date } },
        create: {
          organizationId: ctx.orgId,
          campusId: campusOf.get(r.staffId)!,
          staffId: r.staffId,
          date,
          status: r.status,
          checkInAt,
          note: r.note,
          source: "MANUAL",
          markedById: ctx.user.id,
        },
        update: { status: r.status, note: r.note, markedById: ctx.user.id, ...(r.checkIn !== undefined ? { checkInAt } : {}) },
      });
    }
  });
  const counts = input.records.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  await auditFor(ctx)({ action: "staff_attendance.mark", entityType: "staff_attendance", metadata: { date: input.date, counts } });
  return { total: input.records.length, counts };
}

// ── QR check-in ──

/** Daily-rotating code shown on the campus QR poster/screen. */
export function checkInToken(orgId: string, campusId: string, date: string) {
  return hmac(`checkin:${orgId}:${campusId}:${date}`).slice(0, 22);
}

/**
 * Records a check-in (or check-out on the second scan) for the signed-in
 * staff member. The QR token proves they're physically at the campus today.
 */
export async function checkInWithQr(ctx: TenantContext, campusId: string, token: string) {
  if (!ctx.settings.attendance.staffQrCheckIn) throw forbidden("QR check-in is turned off for your institution.");
  const tz = ctx.organization.timezone;
  const today = todayIn(tz);
  if (!safeEqual(token, checkInToken(ctx.orgId, campusId, today))) {
    throw badRequest("This QR code has expired. Scan today's code at reception.");
  }
  if (!ctx.staffId) throw forbidden("Only staff members can check in.");
  const staff = await ctx.db.staff.findFirst({ where: { id: ctx.staffId, deletedAt: null }, select: { id: true, campusId: true, firstName: true } });
  if (!staff) throw forbidden("Only staff members can check in.");
  if (staff.campusId !== campusId) throw badRequest("This code is for a different campus.");
  return recordPunch(ctx.orgId, staff, new Date(), "QR", tz, ctx.settings.attendance.staffLateAfter);
}

async function recordPunch(
  organizationId: string,
  staff: { id: string; campusId: string },
  at: Date,
  source: "QR" | "BIOMETRIC" | "RFID",
  timezone: string,
  lateAfter: string,
  deviceId?: string | null,
) {
  const date = dateOnly(formatInTimeZone(at, timezone, "yyyy-MM-dd"));
  const localMinute = minutesOf(formatInTimeZone(at, timezone, "HH:mm"));
  const existing = await db.staffAttendance.findUnique({ where: { staffId_date: { staffId: staff.id, date } } });
  if (existing?.checkInAt) {
    // Second scan of the day = check-out (ignored if within 10 minutes of check-in).
    if (at.getTime() - existing.checkInAt.getTime() < 10 * 60_000) return { action: "already" as const, record: existing };
    const record = await db.staffAttendance.update({ where: { id: existing.id }, data: { checkOutAt: at } });
    return { action: "check-out" as const, record };
  }
  const status = existing && existing.status === "LEAVE" ? "LEAVE" : localMinute > minutesOf(lateAfter) ? "LATE" : "PRESENT";
  const record = await db.staffAttendance.upsert({
    where: { staffId_date: { staffId: staff.id, date } },
    create: { organizationId, campusId: staff.campusId, staffId: staff.id, date, status, checkInAt: at, source, deviceId: deviceId ?? null },
    update: { status, checkInAt: at, source, deviceId: deviceId ?? null },
  });
  return { action: "check-in" as const, record };
}

// ── Attendance devices (biometric / RFID terminals) ──

const DEVICE_PROVIDER = "attendance_device";

/** Issues a new device key (shown once). Replaces any previous key. */
export async function issueDeviceKey(ctx: TenantContext) {
  const secret = randomToken(24);
  const key = `ead_${ctx.orgId}.${secret}`;
  await ctx.db.integrationCredential.upsert({
    where: { organizationId_provider: { organizationId: ctx.orgId, provider: DEVICE_PROVIDER } },
    create: { organizationId: ctx.orgId, provider: DEVICE_PROVIDER, encryptedConfig: encryptJson({ keyHash: hashToken(secret) }), isEnabled: true },
    update: { encryptedConfig: encryptJson({ keyHash: hashToken(secret) }), isEnabled: true },
  });
  await auditFor(ctx)({ action: "integration.device_key_issue", entityType: "integration", metadata: { provider: DEVICE_PROVIDER } });
  return key;
}

export async function revokeDeviceKey(ctx: TenantContext) {
  await ctx.db.integrationCredential.updateMany({ where: { provider: DEVICE_PROVIDER }, data: { isEnabled: false } });
  await auditFor(ctx)({ action: "integration.device_key_revoke", entityType: "integration", metadata: { provider: DEVICE_PROVIDER } });
}

export async function deviceKeyStatus(ctx: TenantContext) {
  const row = await ctx.db.integrationCredential.findFirst({ where: { provider: DEVICE_PROVIDER }, select: { isEnabled: true, updatedAt: true } });
  return row?.isEnabled ? { active: true, issuedAt: row.updatedAt.toISOString() } : { active: false, issuedAt: null };
}

/** Authenticates a device key and returns its organization. */
export async function authenticateDevice(authorization: string | null) {
  const key = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const m = /^ead_([0-9a-f-]{36})\.([\w-]{20,})$/.exec(key);
  if (!m) throw new AppError("UNAUTHORIZED", "Invalid device key.");
  const [, organizationId, secret] = m;
  const row = await db.integrationCredential.findUnique({ where: { organizationId_provider: { organizationId: organizationId!, provider: DEVICE_PROVIDER } } });
  if (!row?.isEnabled) throw new AppError("UNAUTHORIZED", "Invalid device key.");
  const { keyHash } = decryptJson<{ keyHash: string }>(row.encryptedConfig);
  if (!safeEqual(keyHash, hashToken(secret!))) throw new AppError("UNAUTHORIZED", "Invalid device key.");
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, timezone: true, settings: true, status: true } });
  if (!org || org.status === "SUSPENDED") throw new AppError("UNAUTHORIZED", "Invalid device key.");
  return org;
}

/** Records punches sent by a terminal. Each punch identifies staff by employee ID. */
export async function ingestDevicePunches(
  org: { id: string; timezone: string; settings: unknown },
  punches: { employeeCode: string; timestamp: string; deviceId?: string | null }[],
  source: "BIOMETRIC" | "RFID",
) {
  const lateAfter = parseOrgSettings(org.settings).attendance.staffLateAfter;
  const staff = await db.staff.findMany({
    where: { organizationId: org.id, deletedAt: null, employeeCode: { in: punches.map((p) => p.employeeCode) } },
    select: { id: true, campusId: true, employeeCode: true },
  });
  const byCode = new Map(staff.map((s) => [s.employeeCode, s]));
  const results: { employeeCode: string; result: string }[] = [];
  for (const p of [...punches].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const s = byCode.get(p.employeeCode);
    const at = new Date(p.timestamp);
    if (!s) results.push({ employeeCode: p.employeeCode, result: "unknown_employee" });
    else if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60_000) results.push({ employeeCode: p.employeeCode, result: "invalid_timestamp" });
    else results.push({ employeeCode: p.employeeCode, result: (await recordPunch(org.id, s, at, source, org.timezone, lateAfter, p.deviceId)).action });
  }
  return results;
}
