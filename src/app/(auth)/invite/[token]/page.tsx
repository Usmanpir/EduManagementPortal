import type { Metadata } from "next";
import Link from "next/link";
import { MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInvitationByToken } from "@/server/modules/users/service";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invitation = await getInvitationByToken(token);

  if (!invitation) {
    return (
      <div className="flex flex-col gap-6">
        <span className="grid size-11 place-items-center rounded-xl bg-warning-subtle text-warning-foreground">
          <MailX className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-h1">This invitation can&apos;t be used</h1>
          <p className="text-muted-foreground">
            It may have expired, been revoked, or already been accepted. Ask your school administrator to send a new one.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return <AcceptInviteForm token={token} invitation={invitation} />;
}
