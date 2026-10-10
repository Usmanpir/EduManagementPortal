import { ok, route } from "@/server/http/api";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";
import { sendTestMessage } from "@/server/modules/communication/integrations";
import { testMessageSchema } from "@/lib/validation/communication";

export const POST = route({ permission: "settings.manage", body: testMessageSchema }, async ({ ctx, body }) => {
  await enforceRateLimit(`test-message:${ctx.orgId}`, RATE_LIMITS.testMessage, "You've sent several test messages. Try again in an hour.");
  const r = await sendTestMessage(ctx, body);
  const message = r.status === "SENT" ? `Test message sent via ${r.provider}.` : r.status === "SKIPPED" ? `Not sent: ${r.error}` : `Sending failed: ${r.error}`;
  return ok(r, message);
});
