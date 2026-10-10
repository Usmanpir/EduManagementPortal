import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, can, type TenantContext } from "@/server/auth/context";
import { badRequest, notFound } from "@/server/http/errors";
import type { announcementSchema, audienceSchema } from "@/lib/validation/communication";
import { externalTargets, fanout, type Recipient } from "./fanout";

type Audience = z.output<typeof audienceSchema>;
type Group = "staff" | "parents" | "students" | "users";
type Tagged = Recipient & { group: Group };

export const AUDIENCE_LABELS: Record<string, string> = {
  ORGANIZATION: "Everyone",
  CAMPUS: "Everyone on a campus",
  CLASS: "A class",
  SECTION: "A section",
  TEACHERS: "Teachers",
  STAFF: "All staff",
  PARENTS: "Parents",
  STUDENTS: "Students",
};

/**
 * Everyone an announcement reaches: app users (in-app) plus contact details
 * for email / WhatsApp / SMS. Parents without an app login are still reached
 * on their phone.
 */
export async function resolveAudience(ctx: TenantContext, a: Audience): Promise<Tagged[]> {
  if (a.campusId) assertCampusAccess(ctx, a.campusId);
  const campus = a.campusId ? { campusId: a.campusId } : ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {};

  let sectionIds: string[] | null = null;
  if (a.audience === "CLASS" || a.audience === "SECTION") {
    const where = a.audience === "CLASS" ? { classId: a.audienceRefId!, deletedAt: null, ...campus } : { id: a.audienceRefId!, deletedAt: null, ...campus };
    sectionIds = (await ctx.db.section.findMany({ where, select: { id: true } })).map((s) => s.id);
    if (!sectionIds.length) throw notFound(a.audience === "CLASS" ? "Class" : "Section");
  }
  const wants = (g: "staff" | "teachers" | "parents" | "students") => {
    switch (a.audience) {
      case "ORGANIZATION":
      case "CAMPUS":
        return g !== "teachers";
      case "CLASS":
      case "SECTION":
        return g !== "staff";
      case "TEACHERS":
        return g === "teachers";
      case "STAFF":
        return g === "staff";
      case "PARENTS":
        return g === "parents";
      case "STUDENTS":
        return g === "students";
    }
  };
  const studentWhere: Prisma.StudentWhereInput = { status: "ACTIVE", archivedAt: null, ...campus, ...(sectionIds ? { sectionId: { in: sectionIds } } : {}) };
  const out: Tagged[] = [];

  if (wants("staff")) {
    const staff = await ctx.db.staff.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...campus }, select: { userId: true, email: true, phone: true } });
    out.push(...staff.map((s) => ({ ...s, group: "staff" as const })));
  }
  if (wants("teachers")) {
    // Teachers of the chosen sections, or every teacher.
    const where: Prisma.StaffWhereInput = { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, teacher: { isNot: null }, ...campus };
    if (sectionIds) where.OR = [{ classTeacherOf: { some: { id: { in: sectionIds } } } }, { teacher: { subjects: { some: { sectionId: { in: sectionIds } } } } }];
    const staff = await ctx.db.staff.findMany({ where, select: { userId: true, email: true, phone: true } });
    out.push(...staff.map((s) => ({ ...s, group: "staff" as const })));
  }
  if (wants("parents")) {
    const links = await ctx.db.studentGuardian.findMany({
      where: { receivesNotifications: true, guardian: { deletedAt: null }, student: studentWhere },
      select: { guardian: { select: { id: true, userId: true, email: true, phone: true, whatsapp: true } } },
    });
    const unique = new Map(links.map((l) => [l.guardian.id, l.guardian]));
    out.push(...[...unique.values()].map((g) => ({ userId: g.userId, email: g.email, phone: g.phone, whatsapp: g.whatsapp, group: "parents" as const })));
  }
  if (wants("students")) {
    const students = await ctx.db.student.findMany({ where: studentWhere, select: { userId: true, email: true, phone: true } });
    // Students are reached in the app or by their own email; their phone is usually a parent's.
    out.push(...students.filter((s) => s.userId || s.email).map((s) => ({ userId: s.userId, email: s.email, phone: null, group: "students" as const })));
  }
  if (a.audience === "ORGANIZATION" || a.audience === "CAMPUS") {
    // Office users with no staff record (e.g. the administrator).
    const users = await ctx.db.user.findMany({ where: { organizationId: ctx.orgId, deletedAt: null, status: "ACTIVE", roles: { some: a.campusId ? { OR: [{ campusId: null }, { campusId: a.campusId }] } : {} } }, select: { id: true, email: true } });
    out.push(...users.map((u) => ({ userId: u.id, email: u.email, group: "users" as const })));
  }

  // One entry per app user; contact-only people deduped by their details.
  const seen = new Set<string>();
  return out.filter((r) => {
    const key = r.userId ? `u:${r.userId}` : `c:${r.email ?? ""}:${r.whatsapp ?? r.phone ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** How many people and messages an announcement would produce, before sending it. */
export async function previewReach(ctx: TenantContext, a: Audience, channels: ("EMAIL" | "WHATSAPP" | "SMS")[]) {
  const recipients = await resolveAudience(ctx, a);
  const org = ctx.settings.notifications;
  const enabled = { email: org.email && channels.includes("EMAIL"), whatsapp: org.whatsapp && channels.includes("WHATSAPP"), sms: org.sms && channels.includes("SMS") };
  const targets = externalTargets(recipients, enabled);
  const count = (g: Group) => recipients.filter((r) => r.group === g).length;
  return {
    people: recipients.length,
    groups: { staff: count("staff") + count("users"), parents: count("parents"), students: count("students") },
    inApp: recipients.filter((r) => r.userId).length,
    email: targets.filter((t) => t.channel === "EMAIL").length,
    whatsapp: targets.filter((t) => t.channel === "WHATSAPP").length,
    sms: targets.filter((t) => t.channel === "SMS").length,
    channelsOff: channels.filter((c) => !(c === "EMAIL" ? org.email : c === "WHATSAPP" ? org.whatsapp : org.sms)),
  };
}

async function audienceLabel(ctx: TenantContext, a: { audience: string; audienceRefId: string | null; campusId: string | null }) {
  if (a.audience === "CLASS" && a.audienceRefId) return `Class ${(await ctx.db.class.findFirst({ where: { id: a.audienceRefId }, select: { name: true } }))?.name ?? ""}`.trim();
  if (a.audience === "SECTION" && a.audienceRefId) {
    const s = await ctx.db.section.findFirst({ where: { id: a.audienceRefId }, select: { name: true, class: { select: { name: true } } } });
    return s ? `${s.class.name}-${s.name}` : "Section";
  }
  const campus = a.campusId ? (await ctx.db.campus.findFirst({ where: { id: a.campusId }, select: { name: true } }))?.name : null;
  return `${AUDIENCE_LABELS[a.audience]}${campus ? ` · ${campus}` : ""}`;
}

/** Announcements this user can see: everything for managers; otherwise those addressed to them. */
export async function visibleWhere(ctx: TenantContext): Promise<Prisma.AnnouncementWhereInput> {
  if (can(ctx, "announcements.manage")) return ctx.allowedCampusIds ? { OR: [{ campusId: null }, { campusId: { in: ctx.allowedCampusIds } }] } : {};
  const received = await ctx.db.notification.findMany({ where: { userId: ctx.user.id, entityType: "announcement" }, select: { entityId: true } });
  return {
    status: "PUBLISHED",
    OR: [{ audience: "ORGANIZATION", campusId: null }, { id: { in: received.map((r) => r.entityId).filter((x): x is string => !!x) } }],
  };
}

export async function listAnnouncements(ctx: TenantContext, opts: { status?: "DRAFT" | "PUBLISHED" | "ARCHIVED"; page: number; pageSize: number }) {
  const base = await visibleWhere(ctx);
  const where: Prisma.AnnouncementWhereInput = { AND: [base, opts.status ? { status: opts.status } : { status: "PUBLISHED" }] };
  const [rows, total, counts] = await Promise.all([
    ctx.db.announcement.findMany({ where, orderBy: [{ isPinned: "desc" }, { publishedAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }], skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize }),
    ctx.db.announcement.count({ where }),
    can(ctx, "announcements.manage") ? ctx.db.announcement.groupBy({ by: ["status"], where: base, _count: true }) : Promise.resolve([]),
  ]);
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await ctx.db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const authorName = new Map(authors.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const reach = rows.length ? await ctx.db.notification.groupBy({ by: ["entityId"], where: { entityType: "announcement", entityId: { in: rows.map((r) => r.id) } }, _count: true }) : [];
  const read = rows.length ? await ctx.db.notification.groupBy({ by: ["entityId"], where: { entityType: "announcement", entityId: { in: rows.map((r) => r.id) }, readAt: { not: null } }, _count: true }) : [];
  return {
    total,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>,
    rows: await Promise.all(
      rows.map(async (a) => ({
        id: a.id,
        title: a.title,
        body: a.body,
        audience: a.audience,
        audienceRefId: a.audienceRefId,
        campusId: a.campusId,
        audienceLabel: await audienceLabel(ctx, a),
        channels: a.channels.filter((c) => c !== "IN_APP"),
        status: a.status,
        isPinned: a.isPinned,
        author: a.authorId ? (authorName.get(a.authorId) ?? "Former user") : null,
        publishedAt: a.publishedAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        recipients: reach.find((r) => r.entityId === a.id)?._count ?? 0,
        read: read.find((r) => r.entityId === a.id)?._count ?? 0,
      })),
    ),
  };
}

export async function saveAnnouncement(ctx: TenantContext, id: string | null, input: z.output<typeof announcementSchema>) {
  const audience = { audience: input.audience, audienceRefId: ["CLASS", "SECTION"].includes(input.audience) ? input.audienceRefId : null, campusId: input.campusId };
  // Validates the audience (and campus access) even for drafts.
  const recipients = await resolveAudience(ctx, audience);
  const data = { title: input.title, body: input.body, ...audience, channels: ["IN_APP" as const, ...input.channels], isPinned: input.isPinned };
  let announcement;
  if (id) {
    const existing = await ctx.db.announcement.findFirst({ where: { AND: [{ id }, await visibleWhere(ctx)] } });
    if (!existing) throw notFound("Announcement");
    if (existing.status !== "DRAFT") throw badRequest("Published announcements can't be edited. Archive it and send a new one.");
    announcement = await ctx.db.announcement.update({ where: { id }, data });
  } else {
    announcement = await ctx.db.announcement.create({ data: { organizationId: ctx.orgId, authorId: ctx.user.id, ...data } });
  }
  await auditFor(ctx)({ action: id ? "announcement.update" : "announcement.create", entityType: "announcement", entityId: announcement.id, after: { title: input.title, ...audience } });
  if (!input.publish) return { announcement, sent: null };
  return { announcement, sent: await publish(ctx, announcement.id, recipients) };
}

async function publish(ctx: TenantContext, id: string, recipients: Tagged[]) {
  // Claim the draft so a double-click can't send twice.
  const claimed = await ctx.db.announcement.updateMany({ where: { id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  if (!claimed.count) throw badRequest("This announcement was already sent.");
  const a = await ctx.db.announcement.findUniqueOrThrow({ where: { id } });
  if (!recipients.length) throw badRequest("Nobody is in this audience yet.");
  const result = await fanout(ctx.orgId, recipients, {
    type: "announcement",
    title: a.title,
    body: a.body.length > 280 ? `${a.body.slice(0, 277)}…` : a.body,
    link: `/communication/announcements?id=${a.id}`,
    entityType: "announcement",
    entityId: a.id,
    template: "announcement",
    payload: { title: a.title, body: a.body },
    dedupeKey: `announcement:${a.id}`,
    channels: a.channels.filter((c): c is "EMAIL" | "WHATSAPP" | "SMS" => c === "EMAIL" || c === "WHATSAPP" || c === "SMS"),
  });
  await auditFor(ctx)({ action: "announcement.publish", entityType: "announcement", entityId: id, metadata: { people: recipients.length, ...result } });
  return { people: recipients.length, ...result };
}

export async function publishAnnouncement(ctx: TenantContext, id: string) {
  const a = await ctx.db.announcement.findFirst({ where: { AND: [{ id }, await visibleWhere(ctx)] } });
  if (!a) throw notFound("Announcement");
  const recipients = await resolveAudience(ctx, { audience: a.audience, audienceRefId: a.audienceRefId, campusId: a.campusId });
  return publish(ctx, id, recipients);
}

export async function updateAnnouncementState(ctx: TenantContext, id: string, patch: { isPinned?: boolean; archived?: boolean }) {
  const a = await ctx.db.announcement.findFirst({ where: { AND: [{ id }, await visibleWhere(ctx)] } });
  if (!a) throw notFound("Announcement");
  if (patch.archived !== undefined && a.status === "DRAFT") throw badRequest("Drafts can be deleted instead.");
  await ctx.db.announcement.update({
    where: { id },
    data: { ...(patch.isPinned !== undefined ? { isPinned: patch.isPinned } : {}), ...(patch.archived !== undefined ? { status: patch.archived ? "ARCHIVED" : "PUBLISHED" } : {}) },
  });
  await auditFor(ctx)({ action: "announcement.update", entityType: "announcement", entityId: id, after: patch });
}

export async function deleteAnnouncement(ctx: TenantContext, id: string) {
  const a = await ctx.db.announcement.findFirst({ where: { AND: [{ id }, await visibleWhere(ctx)] } });
  if (!a) throw notFound("Announcement");
  if (a.status !== "DRAFT") throw badRequest("Sent announcements can only be archived.");
  await ctx.db.announcement.delete({ where: { id } });
  await auditFor(ctx)({ action: "announcement.delete", entityType: "announcement", entityId: id, before: { title: a.title } });
}

/** Options for the composer. */
export async function audienceOptions(ctx: TenantContext) {
  const campusWhere = ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {};
  const [campuses, classes, sections] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...campusWhere }, select: { id: true, name: true, code: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
    ctx.db.class.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true, campusId: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
    ctx.db.section.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true, campusId: true, class: { select: { name: true, level: true } } }, orderBy: [{ class: { level: "asc" } }, { name: "asc" }] }),
  ]);
  const multi = campuses.length > 1;
  const code = new Map(campuses.map((c) => [c.id, c.code]));
  const sfx = (campusId: string) => (multi ? ` · ${code.get(campusId)}` : "");
  return {
    campuses: campuses.map((c) => ({ value: c.id, label: c.name })),
    classes: classes.map((c) => ({ value: c.id, label: `${c.name}${sfx(c.campusId)}`, campusId: c.campusId })),
    sections: sections.map((s) => ({ value: s.id, label: `${s.class.name}-${s.name}${sfx(s.campusId)}`, campusId: s.campusId })),
    channels: ctx.settings.notifications,
  };
}
