import { created, clientIp, route } from "@/server/http/api";
import { register } from "@/server/modules/auth/service";
import { registerSchema } from "@/lib/validation/auth";

export const POST = route({ auth: false, body: registerSchema }, async ({ req, body }) => {
  const result = await register(body, clientIp(req));
  return created(result, "Your institution has been created.");
});
