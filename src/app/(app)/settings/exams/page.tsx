import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { ExamSettingsForm } from "./exam-settings-form";

export const metadata: Metadata = { title: "Exam settings" };

export default async function ExamSettingsPage() {
  const ctx = await requirePageContext("settings.manage");
  return <ExamSettingsForm initial={ctx.settings.exams} />;
}
