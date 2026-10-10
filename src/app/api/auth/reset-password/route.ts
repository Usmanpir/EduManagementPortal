import { clientIp, ok, route } from "@/server/http/api";
import { resetPassword } from "@/server/modules/auth/service";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { resetPasswordSchema } from "@/lib/validation/auth";

export const POST = route(
  {
    auth: false,
    body: resetPasswordSchema,
    rateLimit: { key: (req) => `reset-submit:${clientIp(req)}`, rule: RATE_LIMITS.passwordReset },
  },
  async ({ body }) => {
    await resetPassword(body.token, body.password);
    return ok({ redirectTo: "/login" }, "Your password has been updated. Please sign in.");
  },
);
