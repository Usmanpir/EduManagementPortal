import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { completeSetup, dismissSetup, setupChecklist } from "@/server/modules/organizations/onboarding";

export const GET = route({ permission: "settings.manage" }, async ({ ctx }) => ok(await setupChecklist(ctx)));

export const POST = route({ permission: "settings.manage", body: z.object({ action: z.enum(["complete", "dismiss"]) }) }, async ({ ctx, body }) => {
  if (body.action === "complete") await completeSetup(ctx);
  else await dismissSetup(ctx);
  return ok(null, body.action === "complete" ? "Setup complete. You're all set." : "Setup reminder hidden. Open the Setup guide from Help any time.");
});
