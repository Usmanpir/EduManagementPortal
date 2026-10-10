import { clientIp, ok, route } from "@/server/http/api";
import { acceptInvitation } from "@/server/modules/users/service";
import { RATE_LIMITS } from "@/server/security/rate-limit";
import { acceptInviteSchema } from "@/lib/validation/auth";

export const POST = route(
  {
    auth: false,
    body: acceptInviteSchema,
    rateLimit: { key: (req) => `accept-invite:${clientIp(req)}`, rule: RATE_LIMITS.passwordReset },
  },
  async ({ body }) => ok(await acceptInvitation(body), "Welcome to EduAttend!"),
);
