import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { requirePageContext } from "@/server/auth/context";
import { visibleSections } from "./settings-nav";
import { SettingsSidebar } from "./settings-sidebar";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const ctx = await requirePageContext();
  const sections = visibleSections(ctx.permissions);
  if (sections.length === 0) redirect("/forbidden");

  return (
    <div>
      <PageHeader title="Settings" description="Manage your organization, people and preferences." />
      <div className="lg:flex lg:gap-10">
        <SettingsSidebar sections={sections} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
