import { redirect } from "next/navigation";
import { requirePageContext } from "@/server/auth/context";
import { visibleSections } from "./settings-nav";

export default async function SettingsIndex() {
  const ctx = await requirePageContext();
  const first = visibleSections(ctx.permissions)[0];
  redirect(first?.href ?? "/forbidden");
}
