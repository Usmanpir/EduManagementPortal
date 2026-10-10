import "server-only";
import { tenantDb } from "@/server/db/tenant";
import { fanout, guardianRecipients } from "@/server/modules/communication/fanout";
import { fromCents, toCents } from "@/server/modules/finance/money";
import { addDays, dateOnly, formatDate, formatMoney, toDateString } from "@/lib/format";
import type { OrgTask } from "../types";

/** Marks past-due invoices overdue and applies the configured late fee once. */
export const overdueInvoices: OrgTask = {
  name: "overdue-invoices",
  hour: 1,
  async run({ org, today, settings }) {
    const db = tenantDb(org.id);
    await db.invoice.updateMany({ where: { status: { in: ["PENDING", "PARTIAL"] }, dueDate: { lt: dateOnly(today) } }, data: { status: "OVERDUE" } });
    const lateFee = toCents(settings.finance.lateFee);
    if (lateFee <= 0) return;
    const cutoff = dateOnly(addDays(today, -settings.finance.lateFeeGraceDays));
    const due = await db.invoice.findMany({ where: { status: "OVERDUE", fine: 0, dueDate: { lt: cutoff } }, select: { id: true, total: true } });
    for (const inv of due) {
      // `fine: 0` in the where clause makes this safe to retry.
      await db.invoice.updateMany({
        where: { id: inv.id, fine: 0 },
        data: { fine: fromCents(lateFee), total: fromCents(toCents(inv.total) + lateFee) },
      });
    }
  },
};

/** Reminds guardians a few days before due, and weekly while overdue. */
export const feeReminders: OrgTask = {
  name: "fee-reminders",
  hour: 9,
  async run({ org, today, settings }) {
    const db = tenantDb(org.id);
    const soon = addDays(today, settings.finance.reminderDaysBeforeDue);
    const invoices = await db.invoice.findMany({
      where: {
        OR: [
          { status: { in: ["PENDING", "PARTIAL"] }, dueDate: dateOnly(soon) },
          { status: "OVERDUE", OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: new Date(Date.now() - 7 * 86_400_000) } }] },
        ],
      },
      include: { student: { select: { firstName: true, lastName: true } } },
      take: 2000,
    });
    if (!invoices.length) return;
    const guardians = await guardianRecipients(org.id, [...new Set(invoices.map((i) => i.studentId))]);
    for (const inv of invoices) {
      const name = `${inv.student.firstName} ${inv.student.lastName}`;
      const amount = formatMoney(Number(inv.total) - Number(inv.amountPaid), org.currency);
      const overdue = inv.status === "OVERDUE";
      await fanout(org.id, guardians.get(inv.studentId) ?? [], {
        type: overdue ? "fee.overdue" : "fee.reminder",
        title: overdue ? "Fee overdue" : "Fee due soon",
        body: `${amount} for ${name} ${overdue ? "was" : "is"} due on ${formatDate(toDateString(inv.dueDate), "long")}.`,
        link: `/my/fees?student=${inv.studentId}`,
        entityType: "invoice",
        entityId: inv.id,
        template: "fee_reminder",
        payload: { amount, studentName: name, invoiceNo: inv.invoiceNo, dueDate: formatDate(toDateString(inv.dueDate), "long") },
        dedupeKey: `fee-reminder:${inv.id}:${today}`,
      });
      await db.invoice.update({ where: { id: inv.id }, data: { lastReminderAt: new Date() } });
    }
  },
};
