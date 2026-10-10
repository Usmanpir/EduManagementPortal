/** Pure exam-result maths shared by the server, tests and report cards. */

export type GradeBand = { grade: string; min: number; remark: string };

/** The band for a percentage: the highest band whose minimum it reaches. */
export function gradeFor(percentage: number, scale: GradeBand[]): GradeBand {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((b) => percentage >= b.min) ?? sorted[sorted.length - 1] ?? { grade: "—", min: 0, remark: "" };
}

export type SubjectScore = { maxMarks: number; passMarks: number; marks: number | null; absent: boolean; entered: boolean };

export type ComputedResult = {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  remark: string;
  status: "PASS" | "FAIL" | "INCOMPLETE";
  failedSubjects: number;
};

/**
 * Totals one student's marks. Missing marks make the result INCOMPLETE; an
 * absence counts as zero and fails that subject. A student passes when every
 * subject reaches its pass mark and the overall percentage reaches `passPercentage`.
 */
export function computeResult(scores: SubjectScore[], scale: GradeBand[], passPercentage: number): ComputedResult {
  const totalMax = scores.reduce((n, s) => n + s.maxMarks, 0);
  const totalObtained = round2(scores.reduce((n, s) => n + (s.absent ? 0 : (s.marks ?? 0)), 0));
  const percentage = totalMax ? round2((totalObtained / totalMax) * 100) : 0;
  const band = gradeFor(percentage, scale);
  const failedSubjects = scores.filter((s) => s.entered && (s.absent || (s.marks ?? 0) < s.passMarks)).length;
  const incomplete = scores.length === 0 || scores.some((s) => !s.entered);
  const status = incomplete ? "INCOMPLETE" : failedSubjects > 0 || percentage < passPercentage ? "FAIL" : "PASS";
  return { totalObtained, totalMax, percentage, grade: band.grade, remark: band.remark, status, failedSubjects };
}

/**
 * Standard competition ranking ("1, 2, 2, 4") by percentage, highest first.
 * Entries with `null` score get no position.
 */
export function rankByScore<T extends { id: string; score: number | null }>(rows: T[]): Map<string, number> {
  const ranked = rows.filter((r) => r.score !== null).sort((a, b) => b.score! - a.score!);
  const positions = new Map<string, number>();
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    positions.set(r.id, prev && prev.score === r.score ? positions.get(prev.id)! : i + 1);
  });
  return positions;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** "1st", "2nd", "3rd", "11th"… */
export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
