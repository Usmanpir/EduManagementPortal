import { z } from "zod";

export const requiredText = (label: string, max = 120) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be ${max} characters or fewer.`);

export const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const optionalEmail = z
  .union([z.literal(""), email])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const phone = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number.")
  .max(20, "Enter a valid phone number.")
  .regex(/^\+?[\d\s()-]+$/, "Enter a valid phone number.");

export const optionalPhone = z
  .union([z.literal(""), phone])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Pakistani CNIC / B-Form: 13 digits, optionally formatted 12345-1234567-1. */
export const cnic = z
  .union([z.literal(""), z.string().trim().regex(/^\d{5}-?\d{7}-?\d$/, "Use the format 12345-1234567-1.")])
  .optional()
  .nullable()
  .transform((v) => (v ? v.replace(/^(\d{5})-?(\d{7})-?(\d)$/, "$1-$2-$3") : null));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");
export const optionalIsoDate = z
  .union([z.literal(""), isoDate])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const uuid = z.uuid("Invalid id.");
export const optionalUuid = z
  .union([z.literal(""), z.uuid()])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.")
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), "Include at least one letter and one number.");

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});
