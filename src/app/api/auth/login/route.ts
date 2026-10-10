import { clientIp, ok, route } from "@/server/http/api";
import { login } from "@/server/modules/auth/service";
import { loginSchema } from "@/lib/validation/auth";

export const POST = route({ auth: false, body: loginSchema }, async ({ req, body }) => {
  const result = await login(body, clientIp(req));
  return ok(result, "Signed in.");
});
