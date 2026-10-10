import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { integrationStatus, removeIntegration, saveIntegration } from "@/server/modules/communication/integrations";
import { integrationSchema } from "@/lib/validation/communication";

export const GET = route({ permission: "settings.manage" }, async ({ ctx }) => ok(await integrationStatus(ctx)));

export const PUT = route({ permission: "settings.manage", body: integrationSchema }, async ({ ctx, body }) => {
  await saveIntegration(ctx, body);
  return ok(await integrationStatus(ctx), "Integration saved.");
});

export const DELETE = route({ permission: "settings.manage", body: z.object({ provider: z.enum(["whatsapp_cloud", "http_sms"]) }) }, async ({ ctx, body }) => {
  await removeIntegration(ctx, body.provider);
  return ok(null, "Integration removed.");
});
