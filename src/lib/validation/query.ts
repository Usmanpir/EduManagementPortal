import { z } from "zod";
import { pagination } from "./common";

/** "a,b,c" → ["a","b","c"] for multi-value filters carried in the URL. */
export const csvList = z
  .string()
  .optional()
  .transform((v) => v?.split(",").filter(Boolean));

export const studentListQuery = pagination.extend({
  classId: csvList,
  sectionId: csvList,
  status: csvList,
  gender: csvList,
  campusId: csvList,
});

export const staffListQuery = pagination.extend({
  kind: z.enum(["teacher", "staff", "all"]).optional(),
  departmentId: csvList,
  status: csvList,
});
