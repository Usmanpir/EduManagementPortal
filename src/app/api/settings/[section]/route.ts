import { z } from "zod";
import { ok, param, route } from "@/server/http/api";
import { notFound } from "@/server/http/errors";
import { updateOrganizationSettings } from "@/server/modules/organizations/service";
import type { OrgSettings } from "@/server/modules/organizations/settings";

const SECTIONS = ["attendance", "finance", "exams", "notifications", "identity", "branding", "onboarding"] as const;

/** Partial update of one settings section; the merged result is validated as a whole. */
export const PATCH = route({ permission: "settings.manage", body: z.record(z.string(), z.unknown()) }, async ({ ctx, body, params }) => {
  const section = param(params, "section") as (typeof SECTIONS)[number];
  if (!SECTIONS.includes(section)) throw notFound("Settings section");
  const next = await updateOrganizationSettings(ctx, { [section]: body } as Partial<{ [K in keyof OrgSettings]: Partial<OrgSettings[K]> }>, `settings.${section}_update`);
  return ok(next[section], "Settings saved.");
});
