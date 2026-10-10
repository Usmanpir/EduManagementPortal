import { clientIp, ok, route } from "@/server/http/api";
import { requestPasswordReset } from "@/server/modules/auth/service";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export const POST = route({ auth: false, body: forgotPasswordSchema }, async ({ req, body }) => {
  await requestPasswordReset(body.email, clientIp(req));
  return ok(null, "If an account exists for that email, we've sent a reset link.");
});
