import { ok, route } from "@/server/http/api";
import { changePassword } from "@/server/modules/auth/service";
import { updateProfile } from "@/server/modules/users/service";
import { getSession } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { changePasswordSchema, profileSchema } from "@/lib/validation/organization";

export const PATCH = route({ body: profileSchema, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  await updateProfile(ctx, body);
  return ok(null, "Profile updated.");
});

/** Change password; signs out every other device. */
export const PUT = route({ body: changePasswordSchema, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
  await changePassword(ctx.user.id, body.currentPassword, body.newPassword, session.tokenHash);
  return ok(null, "Password changed. Other devices have been signed out.");
});
