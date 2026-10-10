import { created, ok, route } from "@/server/http/api";
import { issueDeviceKey, revokeDeviceKey } from "@/server/modules/attendance/staff";

export const POST = route({ permission: "settings.manage" }, async ({ ctx }) =>
  created({ key: await issueDeviceKey(ctx) }, "New device key created. Copy it now — it won't be shown again."),
);

export const DELETE = route({ permission: "settings.manage" }, async ({ ctx }) => {
  await revokeDeviceKey(ctx);
  return ok(null, "Device key revoked.");
});
