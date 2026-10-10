/** Lookups for people forms, passed from server pages. */
export type PeopleLookups = {
  campuses: { id: string; name: string }[];
  sections: { id: string; label: string; classId: string; className: string; name: string; campusId: string }[];
  departments: { id: string; name: string }[];
  identity: { studentBForm: boolean; studentCnic: boolean; guardianCnic: boolean; staffCnic: boolean };
};

export const STUDENT_STATUS_BADGE: Record<string, { label: string; variant: "success" | "neutral" | "info" | "warning" | "danger" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  INACTIVE: { label: "Inactive", variant: "neutral" },
  GRADUATED: { label: "Graduated", variant: "info" },
  TRANSFERRED: { label: "Transferred", variant: "warning" },
  ARCHIVED: { label: "Archived", variant: "neutral" },
};

export const STAFF_STATUS_BADGE: Record<string, { label: string; variant: "success" | "neutral" | "info" | "warning" | "danger" }> = {
  ACTIVE: { label: "Active", variant: "success" },
  ON_LEAVE: { label: "On leave", variant: "warning" },
  RESIGNED: { label: "Resigned", variant: "neutral" },
  TERMINATED: { label: "Terminated", variant: "danger" },
};

export const RELATION_LABELS: Record<string, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  GUARDIAN: "Guardian",
  SIBLING: "Sibling",
  OTHER: "Other",
};

export const GENDER_LABELS: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
