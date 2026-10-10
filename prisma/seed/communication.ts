import { db } from "@/server/db/client";
import type { DemoContext } from "./demo";

const daysAgo = (n: number, hour = 10) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour - 5, 0, 0, 0); // Pakistan time
  return d;
};

/** A few realistic notices, delivered in-app to their audiences, plus a draft. */
export async function seedCommunication(ctx: DemoContext) {
  const orgId = ctx.orgId;
  if ((await db.announcement.count({ where: { organizationId: orgId } })) > 0) return;
  const author = ctx.users.principal ?? ctx.users.admin ?? null;
  const allUsers = (await db.user.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true } })).map((u) => u.id);
  const grade5 = await db.class.findFirst({ where: { organizationId: orgId, name: "Grade 5", campusId: ctx.campuses.isb } });
  const grade5Users = grade5
    ? (
        await db.studentGuardian.findMany({ where: { organizationId: orgId, student: { classId: grade5.id }, guardian: { userId: { not: null } } }, select: { guardian: { select: { userId: true } } } })
      ).map((g) => g.guardian.userId!)
    : [];
  const term = await db.exam.findFirst({ where: { organizationId: orgId, status: "SCHEDULED" } });

  const notices = [
    {
      title: "First term examination date sheet",
      body: "The first term examination begins next week. The full date sheet for every class is available in the app under Exams. Students must arrive 15 minutes before each paper and bring their admit card. Regular classes will not be held on exam days.",
      audience: "ORGANIZATION" as const,
      isPinned: true,
      at: daysAgo(1, 11),
      users: allUsers,
      channels: ["IN_APP", "WHATSAPP"] as const,
      skip: !term,
    },
    {
      title: "Winter uniform from 1 November",
      body: "Please note that winter uniform (navy sweater with school logo and grey trousers/shalwar) becomes compulsory from 1 November. Sweaters are available at the school shop on all working days from 8:00 to 1:00.",
      audience: "ORGANIZATION" as const,
      isPinned: false,
      at: daysAgo(4, 9),
      users: allUsers,
      channels: ["IN_APP"] as const,
      skip: false,
    },
    {
      title: "Parent–teacher meeting: Grade 5",
      body: "A parent–teacher meeting for Grade 5 will be held on Saturday from 9:00 to 12:00 in the main hall. Class teachers will share September test results and discuss each child's progress. We look forward to seeing you.",
      audience: "CLASS" as const,
      audienceRefId: grade5?.id ?? null,
      campusId: ctx.campuses.isb,
      isPinned: false,
      at: daysAgo(2, 14),
      users: grade5Users,
      channels: ["IN_APP", "WHATSAPP", "SMS"] as const,
      skip: !grade5,
    },
  ];

  for (const n of notices.filter((x) => !x.skip)) {
    const a = await db.announcement.create({
      data: {
        organizationId: orgId,
        campusId: "campusId" in n ? n.campusId : null,
        title: n.title,
        body: n.body,
        audience: n.audience,
        audienceRefId: "audienceRefId" in n ? n.audienceRefId : null,
        channels: [...n.channels],
        status: "PUBLISHED",
        isPinned: n.isPinned,
        authorId: author,
        publishedAt: n.at,
        createdAt: n.at,
      },
    });
    await db.notification.createMany({
      data: n.users.map((userId, i) => ({
        organizationId: orgId,
        userId,
        type: "announcement",
        title: n.title,
        body: n.body.length > 280 ? `${n.body.slice(0, 277)}…` : n.body,
        link: `/communication/announcements?id=${a.id}`,
        entityType: "announcement",
        entityId: a.id,
        dedupeKey: `announcement:${a.id}`,
        createdAt: n.at,
        // Most staff have opened older notices.
        readAt: i % 3 === 0 ? null : new Date(n.at.getTime() + 3_600_000),
      })),
      skipDuplicates: true,
    });
  }

  await db.announcement.create({
    data: {
      organizationId: orgId,
      title: "Annual sports day",
      body: "Our annual sports day will be held on the school ground. Parents are warmly invited. Events include races, tug of war and a march-past by every house. Details of timings to follow.",
      audience: "ORGANIZATION",
      channels: ["IN_APP"],
      status: "DRAFT",
      authorId: author,
    },
  });
  console.log(`  communication: ${notices.filter((x) => !x.skip).length + 1} announcements`);
}
