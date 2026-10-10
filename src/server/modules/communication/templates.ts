/**
 * Message templates for every outbound channel. Each template renders a
 * subject + HTML/text email body and a short plain-text form used for SMS,
 * WhatsApp and push.
 */

export type TemplateKey =
  | "welcome"
  | "invitation"
  | "password_reset"
  | "attendance_absent"
  | "attendance_late"
  | "low_attendance"
  | "fee_reminder"
  | "payment_receipt"
  | "leave_reviewed"
  | "exam_announcement"
  | "result_published"
  | "announcement"
  | "daily_summary";

export type Rendered = { subject: string; text: string; html: string; short: string };

type Payload = Record<string, string | number | null | undefined>;

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const s = (p: Payload, key: string) => String(p[key] ?? "");

type Def = {
  subject: (p: Payload) => string;
  heading: (p: Payload) => string;
  lines: (p: Payload) => string[];
  action?: (p: Payload) => { label: string; url: string } | null;
  short: (p: Payload) => string;
};

const TEMPLATES: Record<TemplateKey, Def> = {
  welcome: {
    subject: (p) => `Welcome to EduAttend, ${s(p, "firstName")}`,
    heading: () => "Your institution is ready",
    lines: (p) => [
      `Hi ${s(p, "firstName")}, ${s(p, "organizationName")} is now set up on EduAttend.`,
      "Finish the short setup to add your campuses, classes, staff and students.",
    ],
    action: (p) => ({ label: "Continue setup", url: s(p, "url") }),
    short: (p) => `Welcome to EduAttend, ${s(p, "firstName")}. ${s(p, "organizationName")} is ready.`,
  },
  invitation: {
    subject: (p) => `You're invited to ${s(p, "organizationName")} on EduAttend`,
    heading: (p) => `Join ${s(p, "organizationName")}`,
    lines: (p) => [
      `${s(p, "inviterName")} invited you to join ${s(p, "organizationName")} as ${s(p, "roleName")}.`,
      "This invitation expires in 7 days.",
    ],
    action: (p) => ({ label: "Accept invitation", url: s(p, "url") }),
    short: (p) => `You're invited to ${s(p, "organizationName")} on EduAttend: ${s(p, "url")}`,
  },
  password_reset: {
    subject: () => "Reset your EduAttend password",
    heading: () => "Reset your password",
    lines: () => [
      "We received a request to reset your password. This link expires in 60 minutes.",
      "If you didn't request this, you can safely ignore this email.",
    ],
    action: (p) => ({ label: "Choose a new password", url: s(p, "url") }),
    short: (p) => `Reset your EduAttend password: ${s(p, "url")}`,
  },
  attendance_absent: {
    subject: (p) => `${s(p, "studentName")} was marked absent today`,
    heading: () => "Attendance alert",
    lines: (p) => [
      `${s(p, "studentName")} (${s(p, "sectionName")}) was marked absent on ${s(p, "date")}.`,
      "If this is unexpected, please contact the school.",
    ],
    action: (p) => (p.url ? { label: "View attendance", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: Your child ${s(p, "studentName")} was marked absent today (${s(p, "date")}).`,
  },
  attendance_late: {
    subject: (p) => `${s(p, "studentName")} arrived late today`,
    heading: () => "Late arrival",
    lines: (p) => [`${s(p, "studentName")} (${s(p, "sectionName")}) was marked late on ${s(p, "date")}.`],
    action: (p) => (p.url ? { label: "View attendance", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: ${s(p, "studentName")} was marked late today (${s(p, "date")}).`,
  },
  low_attendance: {
    subject: (p) => `Low attendance: ${s(p, "studentName")} is at ${s(p, "percentage")}%`,
    heading: () => "Attendance below threshold",
    lines: (p) => [
      `${s(p, "studentName")}'s attendance is ${s(p, "percentage")}%, below the required ${s(p, "threshold")}%.`,
      "Regular attendance matters for learning and exam eligibility.",
    ],
    action: (p) => (p.url ? { label: "View attendance", url: s(p, "url") } : null),
    short: (p) =>
      `${s(p, "organizationName")}: ${s(p, "studentName")}'s attendance is ${s(p, "percentage")}% (required ${s(p, "threshold")}%).`,
  },
  fee_reminder: {
    subject: (p) => `Fee due: ${s(p, "amount")} for ${s(p, "studentName")}`,
    heading: () => "Fee reminder",
    lines: (p) => [
      `Invoice ${s(p, "invoiceNo")} for ${s(p, "studentName")} has ${s(p, "amount")} outstanding.`,
      `Due date: ${s(p, "dueDate")}.`,
    ],
    action: (p) => (p.url ? { label: "View invoice", url: s(p, "url") } : null),
    short: (p) =>
      `${s(p, "organizationName")}: Fee of ${s(p, "amount")} for ${s(p, "studentName")} is due on ${s(p, "dueDate")} (Invoice ${s(p, "invoiceNo")}).`,
  },
  payment_receipt: {
    subject: (p) => `Payment received — receipt ${s(p, "receiptNo")}`,
    heading: () => "Payment received",
    lines: (p) => [
      `We received ${s(p, "amount")} for ${s(p, "studentName")} on ${s(p, "date")}.`,
      `Receipt number: ${s(p, "receiptNo")}. Remaining balance: ${s(p, "balance")}.`,
    ],
    action: (p) => (p.url ? { label: "View receipt", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: Payment of ${s(p, "amount")} received for ${s(p, "studentName")}. Receipt ${s(p, "receiptNo")}.`,
  },
  leave_reviewed: {
    subject: (p) => `Leave request ${s(p, "decision")}`,
    heading: (p) => `Leave ${s(p, "decision")}`,
    lines: (p) => [
      `The leave request for ${s(p, "personName")} (${s(p, "dates")}) was ${s(p, "decision")}.`,
      ...(p.note ? [`Note: ${s(p, "note")}`] : []),
    ],
    action: (p) => (p.url ? { label: "View request", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: Leave for ${s(p, "personName")} (${s(p, "dates")}) was ${s(p, "decision")}.`,
  },
  exam_announcement: {
    subject: (p) => `${s(p, "examName")} starts ${s(p, "startDate")}`,
    heading: (p) => s(p, "examName"),
    lines: (p) => [`${s(p, "examName")} is scheduled from ${s(p, "startDate")} to ${s(p, "endDate")}.`],
    action: (p) => (p.url ? { label: "View schedule", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: ${s(p, "examName")} starts ${s(p, "startDate")}.`,
  },
  result_published: {
    subject: (p) => `${s(p, "examName")} results are published`,
    heading: () => "Results published",
    lines: (p) => [`Results for ${s(p, "examName")} are now available for ${s(p, "studentName")}.`],
    action: (p) => (p.url ? { label: "View result", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: ${s(p, "examName")} results for ${s(p, "studentName")} are published.`,
  },
  announcement: {
    subject: (p) => s(p, "title"),
    heading: (p) => s(p, "title"),
    lines: (p) => s(p, "body").split(/\n+/).filter(Boolean),
    action: (p) => (p.url ? { label: "Open in EduAttend", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")}: ${s(p, "title")} — ${s(p, "body").slice(0, 280)}`,
  },
  daily_summary: {
    subject: (p) => `Daily summary for ${s(p, "date")}`,
    heading: () => "Today at a glance",
    lines: (p) => [
      `Attendance: ${s(p, "present")} present, ${s(p, "absent")} absent, ${s(p, "late")} late (${s(p, "rate")}%).`,
      `Sections pending attendance: ${s(p, "pendingSections")}.`,
      `Payments collected today: ${s(p, "collected")}.`,
    ],
    action: (p) => (p.url ? { label: "Open dashboard", url: s(p, "url") } : null),
    short: (p) => `${s(p, "organizationName")} — ${s(p, "date")}: ${s(p, "rate")}% attendance, ${s(p, "collected")} collected.`,
  },
};

export function renderTemplate(key: TemplateKey, payload: Payload, brand?: { name?: string; footer?: string; color?: string }): Rendered {
  const def = TEMPLATES[key];
  const subject = def.subject(payload);
  const heading = def.heading(payload);
  const lines = def.lines(payload);
  const action = def.action?.(payload) ?? null;
  const brandName = brand?.name ?? "EduAttend";
  const color = brand?.color && /^#[0-9a-f]{6}$/i.test(brand.color) ? brand.color : "#4338ca";
  const footer = brand?.footer || `Sent by ${brandName} via EduAttend.`;

  const text = [heading, "", ...lines, ...(action ? ["", `${action.label}: ${action.url}`] : []), "", footer].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px" cellspacing="0" cellpadding="0">
<tr><td style="padding:24px 28px 0;font-size:14px;font-weight:600;color:${color}">${escapeHtml(brandName)}</td></tr>
<tr><td style="padding:12px 28px 0;font-size:20px;font-weight:600;line-height:1.3">${escapeHtml(heading)}</td></tr>
${lines.map((l) => `<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#454b57">${escapeHtml(l)}</td></tr>`).join("")}
${
  action
    ? `<tr><td style="padding:24px 28px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">${escapeHtml(action.label)}</a></td></tr>`
    : ""
}
<tr><td style="padding:28px;font-size:12px;color:#8a909c;line-height:1.5">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html, short: def.short(payload) };
}
