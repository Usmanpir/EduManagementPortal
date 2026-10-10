import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { deliverySummary, integrationStatus } from "@/server/modules/communication/integrations";
import { NotificationSettingsForm } from "./notification-settings-form";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const ctx = await requirePageContext("settings.manage");
  const [integrations, summary] = await Promise.all([integrationStatus(ctx), deliverySummary(ctx)]);
  return <NotificationSettingsForm initial={ctx.settings.notifications} integrations={integrations} summary={summary} userEmail={ctx.user.email} />;
}
