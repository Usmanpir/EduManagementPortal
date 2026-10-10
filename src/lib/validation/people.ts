import { z } from "zod";
import { cnic, optionalEmail, optionalIsoDate, optionalPhone, optionalText, optionalUuid, phone, requiredText, uuid } from "./common";

export const GENDERS = ["MALE", "FEMALE", "OTHER"] as const;
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED", "ARCHIVED"] as const;
export const STAFF_STATUSES = ["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"] as const;
export const GUARDIAN_RELATIONS = ["FATHER", "MOTHER", "GUARDIAN", "SIBLING", "OTHER"] as const;

const optionalGender = z
  .union([z.literal(""), z.enum(GENDERS)])
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const guardianInputSchema = z.object({
  /** Link an existing guardian (e.g. a sibling's parent) instead of creating a new one. */
  id: optionalUuid,
  firstName: requiredText("Guardian first name", 60),
  lastName: requiredText("Guardian last name", 60),
  relation: z.enum(GUARDIAN_RELATIONS),
  phone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  cnic,
  occupation: optionalText(80),
  isPrimary: z.boolean().default(true),
  receivesNotifications: z.boolean().default(true),
});

export const studentSchema = z.object({
  // Basic information
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  gender: optionalGender,
  dateOfBirth: optionalIsoDate,
  bFormNumber: cnic,
  cnic,
  bloodGroup: optionalText(5),
  religion: optionalText(40),
  nationality: optionalText(40),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(300),
  city: optionalText(60),
  // Academic placement
  campusId: uuid,
  sectionId: optionalUuid,
  rollNumber: optionalText(20),
  /** Leave empty to generate the next admission number automatically. */
  admissionNo: optionalText(30),
  admissionDate: optionalIsoDate,
  status: z.enum(STUDENT_STATUSES).default("ACTIVE"),
  // Emergency & notes
  emergencyContactName: optionalText(80),
  emergencyContactPhone: optionalPhone,
  medicalNotes: optionalText(500),
  notes: optionalText(1000),
  // Guardians (only used when creating)
  guardians: z.array(guardianInputSchema).max(4).optional(),
});
export type StudentInput = z.input<typeof studentSchema>;

export const staffSchema = z.object({
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  gender: optionalGender,
  dateOfBirth: optionalIsoDate,
  cnic,
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(300),
  campusId: uuid,
  departmentId: optionalUuid,
  designation: requiredText("Designation", 80),
  /** Leave empty to generate the next employee ID automatically. */
  employeeCode: optionalText(30),
  joiningDate: optionalIsoDate,
  status: z.enum(STAFF_STATUSES).default("ACTIVE"),
  isTeacher: z.boolean().default(false),
  qualification: optionalText(120),
  specialization: optionalText(120),
  /** Email an invitation to sign in (teacher or staff role). */
  inviteToSignIn: z.boolean().default(false),
});
export type StaffInput = z.input<typeof staffSchema>;

export const archiveSchema = z.object({ reason: optionalText(300) });

export const bulkStudentActionSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  action: z.enum(["archive", "restore", "move"]),
  sectionId: optionalUuid,
});
