import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "@/components/auth/auth-showcase";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid grid-cols-1 min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Link href="/" className="w-fit rounded-md" aria-label="EduAttend home">
          <Logo />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px] animate-enter">{children}</div>
        </main>
        <footer className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
          <span>© {new Date().getFullYear()} EduAttend</span>
          <Link href="/#security" className="hover:text-foreground">
            Security
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
        </footer>
      </div>
      <AuthShowcase />
    </div>
  );
}
