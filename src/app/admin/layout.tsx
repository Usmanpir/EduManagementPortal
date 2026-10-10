import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Logo } from "@/components/brand/logo";
import { requireSuperAdminPage } from "@/server/auth/platform";
import { AdminNav, AdminSignOut } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Platform admin", template: "%s · Platform admin" }, robots: { index: false } };

/** Separate shell for EduAttend platform staff — never shows tenant data navigation. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireSuperAdminPage();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-(--z-header) border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-header max-w-content items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2 rounded-md">
            <Logo />
            <Badge variant="primary">Platform</Badge>
          </Link>
          <div className="hidden min-w-0 flex-1 sm:block">
            <AdminNav />
          </div>
          <span className="ms-auto hidden truncate text-small text-muted-foreground md:block">{session.user.email}</span>
          <AdminSignOut />
        </div>
        <div className="border-t px-4 py-2 sm:hidden">
          <AdminNav />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-content px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
