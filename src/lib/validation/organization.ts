import { z } from "zod";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { email, optionalEmail, optionalPhone, optionalText, optionalUuid, password, requiredText, uuid } from "./common";

export const organizationGeneralSchema = z.object({
  name: requiredText("Institution name", 120),
  legalName: optionalText(160),
  email: optionalEmail,
  phone: optionalPhone,
  website: z
    .union([z.literal(""), z.string().trim().url("Enter a full URL, e.g. https://school.edu.pk").max(200)])
    .optional()
    .nullable()
    .transform((v) => v || null),
  address: optionalText(300),
  country: z.string().length(2),
  timezone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone."),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PKR."),
  locale: z.enum(["en", "ur", "ar"]),
});

export const campusSchema = z.object({
  name: requiredText("Campus name", 100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Use 2–10 letters or numbers.")
    .max(10, "Use 2–10 letters or numbers.")
    .regex(/^[A-Z0-9-]+$/, "Use letters, numbers and dashes only."),
  city: optionalText(80),
  address: optionalText(300),
  phone: optionalPhone,
  email: optionalEmail,
});

export const roleAssignmentSchema = z.object({ roleId: uuid, campusId: optionalUuid });

export const inviteUserSchema = z.object({
  email,
  roleId: uuid,
  campusId: optionalUuid,
});

export const updateUserSchema = z.object({
  roles: z.array(roleAssignmentSchema).min(1, "Give the user at least one role.").max(10).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

const permissionKey = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

export const roleSchema = z.object({
  name: requiredText("Role name", 60),
  description: optionalText(200),
  permissions: z.array(permissionKey).max(ALL_PERMISSIONS.length),
});

export const profileSchema = z.object({
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  phone: optionalPhone,
});

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Enter your current password."), newPassword: password, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });
