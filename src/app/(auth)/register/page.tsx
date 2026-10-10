import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { homePathFor } from "@/server/modules/auth/service";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create your institution" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(homePathFor(session.user));
  return <RegisterForm />;
}
