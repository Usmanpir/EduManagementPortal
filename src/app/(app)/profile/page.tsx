import type { Metadata } from "next";
import { db } from "@/server/db/client";
import { requirePageContext } from "@/server/auth/context";
import { listSessions } from "@/server/modules/users/service";
import { PageHeader } from "@/components/common/page-header";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await requirePageContext();
  const [user, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { firstName: true, lastName: true, phone: true, email: true } }),
    listSessions(ctx.user.id, ctx.sessionId),
  ]);
  return (
    <div>
      <PageHeader title="Your profile" description="Personal details, password and devices you're signed in on." />
      <ProfileView user={{ ...user, phone: user.phone ?? "" }} sessions={sessions} timezone={ctx.organization.timezone} />
    </div>
  );
}
