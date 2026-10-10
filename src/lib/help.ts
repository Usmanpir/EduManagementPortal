/**
 * Help centre articles. Every step describes a screen that exists in the app;
 * keep them in sync when flows change.
 */
export type HelpAudience = "staff" | "family";
export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  audience: HelpAudience[];
  /** Short paragraphs or "1. step" lines; `→` marks a menu path. */
  body: string[];
  related?: string[];
};

export const HELP_CATEGORIES = ["Getting started", "Attendance", "Fees", "Exams & results", "Communication", "Parents & students", "Account & billing"];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "set-up-your-school",
    title: "Set up your school",
    summary: "The order that gets you taking attendance fastest.",
    category: "Getting started",
    audience: ["staff"],
    body: [
      "The Setup guide (Help → Setup guide) walks you through these steps and ticks each one off as soon as it's done.",
      "1. Check your school's name, timezone and currency under Settings → General.",
      "2. Add your campuses under Settings → Campuses if you have more than one.",
      "3. Create classes and their sections under Academics → Classes.",
      "4. Add teachers under Teachers, then assign class teachers and subjects on each section.",
      "5. Add students one by one, or import your existing list from Excel/CSV under Students → Import.",
      "6. Invite colleagues under Settings → Users so they can sign in.",
    ],
    related: ["import-students", "take-attendance"],
  },
  {
    slug: "import-students",
    title: "Import students from Excel or CSV",
    summary: "Bring your existing student list in one go.",
    category: "Getting started",
    audience: ["staff"],
    body: [
      "Go to Students → Import and download the template. Fill one row per student — class and section names must match the ones in Academics.",
      "Upload the file. EduAttend checks every row and shows problems (missing names, unknown classes, duplicate admission numbers) before anything is saved.",
      "Fix the highlighted rows directly on screen or in your file, then confirm the import. Parents are matched by phone number and full name, so siblings share one guardian record.",
    ],
    related: ["set-up-your-school"],
  },
  {
    slug: "take-attendance",
    title: "Take a class register",
    summary: "Mark a section in under a minute, on a phone or computer.",
    category: "Attendance",
    audience: ["staff"],
    body: [
      "Open Attendance and choose your section (teachers see their own sections first).",
      "Everyone starts unmarked. Tap Present, Absent, Late or Leave for each student — on a keyboard, use P, A, L and V and the list moves to the next student.",
      "Save when every student is marked. If absence alerts are on, parents of absent students are notified straight away.",
      "Made a mistake? Teachers can edit within the edit window set by the school; after that, use Request correction and an administrator approves it.",
    ],
    related: ["leave-requests", "attendance-reports"],
  },
  {
    slug: "leave-requests",
    title: "Leave requests",
    summary: "How students and staff ask for leave, and how it's approved.",
    category: "Attendance",
    audience: ["staff", "family"],
    body: [
      "Parents request leave for their child from Leave in their portal; staff request their own leave from Attendance → Leave.",
      "Choose the type, dates and give a short reason. Overlapping requests are not allowed.",
      "Reviewers approve or reject from Attendance → Leave. Approved leave turns any absence in that period into Leave, so it doesn't count against attendance.",
    ],
  },
  {
    slug: "attendance-reports",
    title: "Attendance reports and the monthly register",
    summary: "Find low attendance and print registers.",
    category: "Attendance",
    audience: ["staff"],
    body: [
      "Reports → Monthly attendance register gives the classic one-row-per-student grid for any section and month. Print it or export to Excel.",
      "Reports → Low attendance lists students below the school's target with a parent's phone number, lowest first.",
      "Change the target and alert settings under Settings → Attendance.",
    ],
  },
  {
    slug: "monthly-fees",
    title: "Bill monthly fees",
    summary: "Fee structures, monthly invoices and discounts.",
    category: "Fees",
    audience: ["staff"],
    body: [
      "1. Under Finance → Fees, add each fee (e.g. Tuition for Grade 5, monthly). Transport and hostel fees only apply to students you opt in.",
      "2. Give discounts (sibling, scholarship) on a student's profile → Fees tab.",
      "3. Finance → Invoices → Generate monthly creates one invoice per student for the month. It's safe to run again — students already billed are skipped.",
      "Overdue invoices are marked automatically; if you set a late fee, it's added once.",
    ],
    related: ["record-payment"],
  },
  {
    slug: "record-payment",
    title: "Record a fee payment",
    summary: "Counter, bank transfer or mobile wallet — with a receipt.",
    category: "Fees",
    audience: ["staff"],
    body: [
      "Finance → Record payment (or Pay on a student's Fees tab). Pick the student, then the invoice.",
      "Enter the amount, method and reference (cheque or transaction number). Partial payments are fine; EduAttend won't accept more than the balance.",
      "Print the receipt from the confirmation or later from Payments. A payment entered by mistake can be voided by someone with permission; the invoice balance updates automatically.",
    ],
  },
  {
    slug: "enter-marks",
    title: "Enter exam marks",
    summary: "Fast keyboard entry for each paper.",
    category: "Exams & results",
    audience: ["staff"],
    body: [
      "Exams → Enter marks lists the papers you teach. Open one to get the class list.",
      "Type a mark and press Enter to move to the next student. Press A to mark someone absent. Ctrl+S saves.",
      "Marks above the paper's total are flagged before saving. Once results are published, marks are locked until an administrator unpublishes them.",
    ],
    related: ["publish-results"],
  },
  {
    slug: "publish-results",
    title: "Compute and publish results",
    summary: "Totals, grades, positions and report cards.",
    category: "Exams & results",
    audience: ["staff"],
    body: [
      "On the exam page, Publish results recomputes every student's result from the marks entered, then makes them visible to students and parents (optionally notifying them).",
      "A student passes only when every paper reaches its pass mark and the overall percentage reaches the school's pass percentage. Missing marks show as Incomplete.",
      "Positions are per section; tied students share a position. Print report cards from Exams → Results. Grading scale and pass percentage are under Settings → Exams & grading.",
    ],
  },
  {
    slug: "send-announcement",
    title: "Send an announcement",
    summary: "Reach parents, students or staff — in the app, WhatsApp, SMS or email.",
    category: "Communication",
    audience: ["staff"],
    body: [
      "Communication → Announcements → New announcement. Choose who should get it: everyone, a campus, a class, a section, teachers, staff, parents or students.",
      "Before sending you'll see exactly how many people it reaches and how many WhatsApp/SMS/email messages it creates.",
      "WhatsApp and SMS need to be connected first under Settings → Notifications. Every message is listed in the delivery log there.",
    ],
  },
  {
    slug: "parent-portal",
    title: "Using the parent portal",
    summary: "Attendance, results, fees and timetable for your children.",
    category: "Parents & students",
    audience: ["family"],
    body: [
      "Your dashboard shows each child: whether they were marked present today, this month's attendance, fees due, their latest result and the next exam.",
      "If you have more than one child at the school, switch between them with the buttons at the top of each page.",
      "My attendance shows a month calendar; Results shows published report cards you can print; Fees shows what's due and what you've paid, with printable invoices.",
      "You only ever see your own children's information.",
    ],
    related: ["leave-requests"],
  },
  {
    slug: "billing-and-plans",
    title: "Plans, billing and invoices",
    summary: "How payment works and what happens when a trial ends.",
    category: "Account & billing",
    audience: ["staff"],
    body: [
      "Settings → Billing shows your plan, usage against its limits, and your EduAttend invoices.",
      "To change plan, choose Request this plan. Our team confirms it and sends an invoice; pay by bank transfer and your plan is activated once the payment is confirmed.",
      "When a trial ends or an invoice is overdue, you get a grace period. After that the account becomes read-only — nothing is deleted, and billing and support keep working.",
    ],
  },
  {
    slug: "users-and-roles",
    title: "Users, roles and permissions",
    summary: "Who can see and change what.",
    category: "Account & billing",
    audience: ["staff"],
    body: [
      "Invite people under Settings → Users and give them a role: Administrator, Principal, Teacher, Accountant, Staff, Parent or Student. Roles can be limited to one campus.",
      "Settings → Roles shows each role's permissions; administrators can create custom roles. You can't give anyone a permission you don't have yourself.",
      "Teachers only see the sections they teach unless their role includes “Access all classes”. Every change is recorded in Settings → Audit log.",
    ],
  },
];

export const helpArticle = (slug: string) => HELP_ARTICLES.find((a) => a.slug === slug) ?? null;
