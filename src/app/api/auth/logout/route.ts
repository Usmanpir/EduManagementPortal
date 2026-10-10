import { ok, route } from "@/server/http/api";
import { logout } from "@/server/modules/auth/service";

export const POST = route({ auth: false }, async () => {
  await logout();
  return ok({ redirectTo: "/login" }, "Signed out.");
});
