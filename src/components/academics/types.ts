/** Lookup lists passed from server pages into academic forms. */
export type AcademicLookups = {
  campuses: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  years: { id: string; name: string; isCurrent: boolean }[];
  staff: { id: string; name: string; campusId: string; designation: string; teacherId: string | null }[];
  rooms: { id: string; name: string; campusId: string }[];
};

export const NONE = "__none__";

export const SUBJECT_TYPE_LABELS: Record<string, string> = {
  CORE: "Core",
  ELECTIVE: "Elective",
  LAB: "Lab / practical",
  ACTIVITY: "Activity",
};

export const ROOM_TYPE_LABELS: Record<string, string> = {
  CLASSROOM: "Classroom",
  LAB: "Laboratory",
  LIBRARY: "Library",
  HALL: "Hall",
  OFFICE: "Office",
  OTHER: "Other",
};

/** Default palette for subject colour chips (timetable & schedules). */
export const SUBJECT_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#7c3aed", "#475569"];
