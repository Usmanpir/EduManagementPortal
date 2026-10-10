import "server-only";
import { createHash } from "node:crypto";
import type { DocumentCategory } from "@/generated/prisma/enums";
import { auditFor } from "@/server/audit";
import { can, campusScope, type TenantContext } from "@/server/auth/context";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import { findAccessibleStudent } from "@/server/modules/people/students";
import { sanitizeFileName } from "@/server/modules/imports/parse";
import { buildStorageKey, storage } from "@/server/storage";
import { signedFileUrl } from "@/server/storage/urls";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Allowed types, identified by content signature — never by the browser's claim. */
const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: "pdf", mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { ext: "png", mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  // Office Open XML documents are ZIP containers; the extension decides which.
  { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

export function detectFileType(fileName: string, bytes: Buffer) {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const normalizedExt = ext === "jpeg" ? "jpg" : ext;
  const match = SIGNATURES.find((s) => s.ext === normalizedExt && s.test(bytes));
  return match ?? null;
}

export type EntityRef = { entityType: "student" | "staff" | null; entityId: string | null };

/** Checks that the user may see/manage documents of the owning record. */
async function assertEntityAccess(ctx: TenantContext, ref: EntityRef) {
  if (ref.entityType === "student" && ref.entityId) {
    if (!(await findAccessibleStudent(ctx, ref.entityId))) throw notFound("Student");
  } else if (ref.entityType === "staff" && ref.entityId) {
    if (!can(ctx, "staff.view") && !can(ctx, "teachers.view")) throw forbidden();
    const staff = await ctx.db.staff.findFirst({ where: { id: ref.entityId, deletedAt: null, ...campusScope(ctx) }, select: { id: true } });
    if (!staff) throw notFound("Staff member");
  }
}

/**
 * Lists documents. With an entity: that student's / staff member's files.
 * Without one: the school library (files not attached to anyone). `scope: "all"`
 * also includes people's files, and is only for users who can see every class.
 */
export async function listDocuments(ctx: TenantContext, opts: EntityRef & { scope?: "library" | "all"; category?: DocumentCategory[]; q?: string; page?: number; pageSize?: number }) {
  await assertEntityAccess(ctx, opts);
  const all = !opts.entityType && opts.scope === "all";
  if (all && !(can(ctx, "records.all") && can(ctx, "students.view") && can(ctx, "staff.view"))) throw forbidden("You can only see the school library and the people you work with.");
  const where = {
    archivedAt: null,
    ...(opts.entityType ? { entityType: opts.entityType, entityId: opts.entityId } : all ? {} : { entityType: null }),
    ...(opts.category?.length ? { category: { in: opts.category } } : {}),
    ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" as const } } : {}),
    // Campus-restricted users see their campus' documents plus organization-wide ones.
    ...(ctx.allowedCampusIds ? { OR: [{ campusId: null }, { campusId: { in: ctx.allowedCampusIds } }] } : {}),
  };
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const [rows, total] = await Promise.all([
    ctx.db.document.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ctx.db.document.count({ where }),
  ]);
  const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter((x): x is string => !!x))];
  const uploaders = uploaderIds.length ? await ctx.db.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(uploaders.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  const owners = new Map<string, string>();
  if (all) {
    const sIds = rows.filter((r) => r.entityType === "student" && r.entityId).map((r) => r.entityId!);
    const fIds = rows.filter((r) => r.entityType === "staff" && r.entityId).map((r) => r.entityId!);
    const [students, staff] = await Promise.all([
      sIds.length ? ctx.db.student.findMany({ where: { id: { in: sIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
      fIds.length ? ctx.db.staff.findMany({ where: { id: { in: fIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    ]);
    for (const p of [...students, ...staff]) owners.set(p.id, `${p.firstName} ${p.lastName}`);
  }
  return {
    total,
    rows: rows.map((d) => ({
      id: d.id,
      title: d.title,
      fileName: d.fileName,
      category: d.category,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      entityType: d.entityType,
      entityId: d.entityId,
      owner: d.entityId ? (owners.get(d.entityId) ?? null) : null,
      uploadedBy: d.uploadedById ? (names.get(d.uploadedById) ?? "Former user") : null,
      createdAt: d.createdAt.toISOString(),
      url: signedFileUrl(d.storageKey, 900),
      downloadUrl: signedFileUrl(d.storageKey, 900, d.fileName),
    })),
  };
}

export async function uploadDocument(
  ctx: TenantContext,
  file: File,
  meta: EntityRef & { title: string; category: DocumentCategory; campusId?: string | null },
) {
  await assertEntityAccess(ctx, meta);
  if (file.size === 0) throw badRequest("The file is empty.");
  if (file.size > MAX_DOCUMENT_BYTES) throw badRequest("Documents can be up to 10 MB.");
  const fileName = sanitizeFileName(file.name);
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(fileName, bytes);
  if (!type) throw badRequest("Upload a PDF, image (JPG, PNG, WebP), Word or Excel file.");
  await assertWithinLimit(ctx.orgId, "storageMb", Math.ceil(file.size / (1024 * 1024)));

  const key = buildStorageKey(ctx.orgId, "documents", type.ext);
  await storage().put(key, bytes, type.mime);
  try {
    const doc = await ctx.db.document.create({
      data: {
        organizationId: ctx.orgId,
        campusId: meta.campusId ?? ctx.campusId,
        category: meta.category,
        title: meta.title.trim().slice(0, 160) || fileName,
        fileName,
        storageKey: key,
        mimeType: type.mime,
        sizeBytes: file.size,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        entityType: meta.entityType,
        entityId: meta.entityId,
        uploadedById: ctx.user.id,
      },
    });
    await auditFor(ctx)({ action: "document.upload", entityType: "document", entityId: doc.id, after: { title: doc.title, fileName, category: meta.category, entityType: meta.entityType, entityId: meta.entityId } });
    return doc;
  } catch (error) {
    // Never leave orphaned objects in storage.
    await storage().delete(key).catch(() => undefined);
    throw error;
  }
}

export async function archiveDocument(ctx: TenantContext, id: string) {
  const doc = await ctx.db.document.findFirst({ where: { id, archivedAt: null } });
  if (!doc) throw notFound("Document");
  if (doc.campusId && ctx.allowedCampusIds && !ctx.allowedCampusIds.includes(doc.campusId)) throw notFound("Document");
  await assertEntityAccess(ctx, { entityType: doc.entityType as EntityRef["entityType"], entityId: doc.entityId });
  await ctx.db.document.update({ where: { id }, data: { archivedAt: new Date() } });
  await auditFor(ctx)({ action: "document.archive", entityType: "document", entityId: id, before: { title: doc.title } });
}
