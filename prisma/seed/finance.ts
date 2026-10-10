import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import type { DemoContext } from "./demo";
import { createRandom } from "./random";

const r = createRandom(29);
const METHODS = ["CASH", "CASH", "CASH", "BANK_TRANSFER", "BANK_TRANSFER", "MOBILE_WALLET", "MOBILE_WALLET", "CHEQUE"] as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(d(s).getTime() + n * 86_400_000));

/** Tuition steps up with the grade, in PKR. */
const tuitionFor = (level: number) => (level <= 3 ? 6500 : level <= 5 ? 7500 : level <= 8 ? 9000 : 11000);

/**
 * Fee structures, a few discounts and transport opt-ins, then three months of
 * invoices with a realistic payment pattern (most paid, some partial, some overdue).
 */
export async function seedFinance(ctx: DemoContext, today = new Date().toISOString().slice(0, 10)) {
  const orgId = ctx.orgId;
  if ((await db.feeStructure.count({ where: { organizationId: orgId } })) > 0) return;
  const year = await db.academicYear.findFirst({ where: { organizationId: orgId, isCurrent: true } });
  const classes = await db.class.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, level: true, name: true } });

  const fees: Prisma.FeeStructureCreateManyInput[] = classes.map((c) => ({ organizationId: orgId, academicYearId: year?.id ?? null, classId: c.id, name: "Tuition fee", category: "TUITION", amount: tuitionFor(c.level), frequency: "MONTHLY", dueDay: 10 }));
  fees.push(
    { organizationId: orgId, academicYearId: year?.id ?? null, name: "Computer lab fee", category: "LAB", amount: 800, frequency: "MONTHLY", dueDay: 10 },
    { organizationId: orgId, academicYearId: year?.id ?? null, name: "School van", category: "TRANSPORT", amount: 4000, frequency: "MONTHLY", dueDay: 10 },
    { organizationId: orgId, academicYearId: year?.id ?? null, name: "Annual exam fee", category: "EXAM", amount: 2500, frequency: "ANNUAL", dueDay: 10 },
  );
  await db.feeStructure.createMany({ data: fees });
  const structures = await db.feeStructure.findMany({ where: { organizationId: orgId } });
  const van = structures.find((f) => f.category === "TRANSPORT")!;
  const lab = structures.find((f) => f.category === "LAB")!;
  const monthly = structures.filter((f) => f.frequency === "MONTHLY");

  const students = await db.student.findMany({
    where: { organizationId: orgId, status: "ACTIVE", archivedAt: null },
    select: { id: true, campusId: true, classId: true, guardians: { select: { guardianId: true } } },
    orderBy: { admissionNo: "asc" },
  });

  // Siblings (shared guardian) get 10% off tuition; ~18% take the van; a few scholarships.
  const byGuardian = new Map<string, number>();
  for (const s of students) for (const g of s.guardians) byGuardian.set(g.guardianId, (byGuardian.get(g.guardianId) ?? 0) + 1);
  const studentFees: Prisma.StudentFeeCreateManyInput[] = [];
  for (const s of students) {
    const tuition = structures.find((f) => f.category === "TUITION" && f.classId === s.classId);
    const sibling = s.guardians.some((g) => (byGuardian.get(g.guardianId) ?? 0) > 1);
    if (tuition && sibling) studentFees.push({ organizationId: orgId, studentId: s.id, feeStructureId: tuition.id, discountType: "PERCENT", discountValue: 10, discountReason: "Sibling discount" });
    else if (tuition && r.chance(0.03)) studentFees.push({ organizationId: orgId, studentId: s.id, feeStructureId: tuition.id, discountType: "PERCENT", discountValue: 50, discountReason: "Merit scholarship" });
    if (r.chance(0.18)) studentFees.push({ organizationId: orgId, studentId: s.id, feeStructureId: van.id, isActive: true });
  }
  await db.studentFee.createMany({ data: studentFees });
  const assignments = await db.studentFee.findMany({ where: { organizationId: orgId } });
  const plan = new Map<string, typeof assignments>();
  for (const a of assignments) plan.set(a.studentId, [...(plan.get(a.studentId) ?? []), a]);
  const classLevel = new Map(classes.map((c) => [c.id, c.level]));

  // Three billing months ending with the current one.
  const [y, m] = today.split("-").map(Number) as [number, number];
  const periods = [-2, -1, 0].map((off) => {
    const dt = new Date(Date.UTC(y, m - 1 + off, 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  });

  let invoiceSeq = 0;
  let receiptSeq = 0;
  const cashier = ctx.users.accountant ?? null;
  for (const period of periods) {
    const issue = `${period}-01`;
    const due = `${period}-10`;
    const isCurrent = period === today.slice(0, 7);
    for (const s of students) {
      const mine = plan.get(s.id) ?? [];
      const items = monthly
        .filter((f) => (f.classId === null || f.classId === s.classId) && (f.campusId === null || f.campusId === s.campusId))
        .filter((f) => f.id !== lab.id || (classLevel.get(s.classId ?? "") ?? 0) >= 6)
        .flatMap((f) => {
          const a = mine.find((x) => x.feeStructureId === f.id);
          if (f.category === "TRANSPORT" && !a?.isActive) return [];
          const amount = Number(f.amount);
          const discount = a && a.discountType === "PERCENT" ? Math.round(amount * Number(a.discountValue)) / 100 : 0;
          return [{ organizationId: orgId, feeStructureId: f.id, description: f.name, category: f.category, amount, discount, total: amount - discount }];
        });
      if (!items.length) continue;
      const subtotal = items.reduce((n, i) => n + i.amount, 0);
      const discount = items.reduce((n, i) => n + i.discount, 0);
      const total = subtotal - discount;

      // Payment behaviour: older months mostly settled; this month only early payers.
      const roll = r.next();
      const paidShare = isCurrent ? (roll < 0.12 ? 1 : 0) : period === periods[0] ? (roll < 0.9 ? 1 : roll < 0.95 ? 0.5 : 0) : roll < 0.78 ? 1 : roll < 0.86 ? 0.5 : 0;
      const paid = Math.round(total * paidShare);
      const pastDue = due < today;
      const status = paid >= total ? "PAID" : pastDue ? "OVERDUE" : paid > 0 ? "PARTIAL" : "PENDING";

      invoiceSeq++;
      const invoice = await db.invoice.create({
        data: {
          organizationId: orgId,
          campusId: s.campusId,
          studentId: s.id,
          invoiceNo: `INV-${period.slice(0, 4)}-${String(invoiceSeq).padStart(5, "0")}`,
          billingPeriod: period,
          title: `Fees — ${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`,
          issueDate: d(issue),
          dueDate: d(due),
          subtotal,
          discount,
          total,
          amountPaid: paid,
          status,
          createdById: cashier,
          items: { createMany: { data: items } },
        },
      });
      if (paid > 0) {
        const paidAt = isCurrent ? today : addDays(issue, r.int(1, paidShare < 1 ? 20 : 12));
        receiptSeq++;
        const method = r.pick(METHODS);
        await db.payment.create({
          data: {
            organizationId: orgId,
            campusId: s.campusId,
            invoiceId: invoice.id,
            studentId: s.id,
            receiptNo: `RCP-${String(receiptSeq).padStart(6, "0")}`,
            amount: paid,
            method,
            reference: method === "CASH" ? null : `${method === "CHEQUE" ? "CHQ" : "TXN"}${r.int(100000, 999999)}`,
            paidAt: d(paidAt < today ? paidAt : today),
            receivedById: cashier,
          },
        });
      }
    }
  }
  await db.$executeRaw`
    INSERT INTO "sequences" ("organizationId", "key", "value") VALUES (${orgId}::uuid, 'invoice', ${invoiceSeq}), (${orgId}::uuid, 'receipt', ${receiptSeq})
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = GREATEST("sequences"."value", EXCLUDED."value")`;
  console.log(`  finance: ${structures.length} fees, ${invoiceSeq} invoices, ${receiptSeq} payments`);
}
