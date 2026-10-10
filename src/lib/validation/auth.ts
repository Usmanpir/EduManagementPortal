import { z } from "zod";
import { email, password, requiredText } from "./common";

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required.").max(128),
  remember: z.boolean().default(false),
});
export type LoginInput = z.input<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  email,
  password,
  organizationName: requiredText("Institution name", 120).min(2, "Institution name is too short."),
  country: z.string().length(2, "Choose a country."),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const acceptInviteSchema = z
  .object({
    token: z.string().min(20).max(200),
    firstName: requiredText("First name", 60),
    lastName: requiredText("Last name", 60),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "PK", name: "Pakistan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "IN", name: "India" },
  { code: "BD", name: "Bangladesh" },
  { code: "XX", name: "Other" },
];
