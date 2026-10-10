import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { getOrganizationProfile } from "@/server/modules/organizations/service";
import { GeneralSettingsForm } from "./general-form";

export const metadata: Metadata = { title: "General settings" };

export default async function GeneralSettingsPage() {
  const ctx = await requirePageContext("organization.manage");
  const org = await getOrganizationProfile(ctx);
  return (
    <GeneralSettingsForm
      initial={{
        name: org.name,
        legalName: org.legalName ?? "",
        email: org.email ?? "",
        phone: org.phone ?? "",
        website: org.website ?? "",
        address: org.address ?? "",
        country: org.country,
        timezone: org.timezone,
        currency: org.currency,
        locale: org.locale as "en" | "ur" | "ar",
      }}
      timezones={Intl.supportedValuesOf("timeZone")}
    />
  );
}
