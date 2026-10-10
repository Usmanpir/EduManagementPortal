import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { homePathFor } from "@/server/modules/auth/service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

function safeNext(next: string | string[] | undefined) {
  // Only allow same-site relative paths to avoid open redirects.
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session) redirect(safeNext(next) ?? homePathFor(session.user));

  return <LoginForm next={safeNext(next)} />;
}
