import { z } from "zod";
import { optionalUuid } from "./common";

export const AUDIENCES = ["ORGANIZATION", "CAMPUS", "CLASS", "SECTION", "TEACHERS", "STAFF", "PARENTS", "STUDENTS"] as const;
export const EXTERNAL_CHANNELS = ["EMAIL", "WHATSAPP", "SMS"] as const;

export const audienceSchema = z
  .object({
    audience: z.enum(AUDIENCES),
    /** Class or section id for CLASS / SECTION audiences. */
    audienceRefId: optionalUuid,
    /** Optional campus filter (required for CAMPUS). */
    campusId: optionalUuid,
  })
  .refine((v) => !["CLASS", "SECTION"].includes(v.audience) || !!v.audienceRefId, { path: ["audienceRefId"], message: "Choose who should receive it." })
  .refine((v) => v.audience !== "CAMPUS" || !!v.campusId, { path: ["campusId"], message: "Choose a campus." });

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Give it a short title.").max(120),
    body: z.string().trim().min(1, "Write the announcement.").max(5000),
    audience: z.enum(AUDIENCES),
    audienceRefId: optionalUuid,
    campusId: optionalUuid,
    channels: z.array(z.enum(EXTERNAL_CHANNELS)).max(3).default([]),
    isPinned: z.boolean().default(false),
    publish: z.boolean().default(false),
  })
  .refine((v) => !["CLASS", "SECTION"].includes(v.audience) || !!v.audienceRefId, { path: ["audienceRefId"], message: "Choose who should receive it." })
  .refine((v) => v.audience !== "CAMPUS" || !!v.campusId, { path: ["campusId"], message: "Choose a campus." });

export const integrationSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("whatsapp_cloud"),
    isEnabled: z.boolean(),
    /** Blank secret = keep the stored one. */
    config: z.object({ phoneNumberId: z.string().trim().min(5, "Enter the phone number ID.").max(40), accessToken: z.string().trim().max(1000).optional().default("") }),
  }),
  z.object({
    provider: z.literal("http_sms"),
    isEnabled: z.boolean(),
    config: z.object({
      endpoint: z.url("Enter the gateway URL.").refine((u) => u.startsWith("https://"), "Use an https:// URL."),
      apiKey: z.string().trim().max(500).optional().default(""),
      senderId: z.string().trim().max(20).optional().default(""),
    }),
  }),
]);

export const testMessageSchema = z.object({ channel: z.enum(EXTERNAL_CHANNELS), to: z.string().trim().min(5).max(120) });
