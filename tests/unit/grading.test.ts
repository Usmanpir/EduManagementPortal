import { describe, expect, it } from "vitest";
import { computeResult, gradeFor, ordinal, rankByScore } from "@/lib/grading";

const scale = [
  { grade: "A", min: 80, remark: "Excellent" },
  { grade: "B", min: 60, remark: "Good" },
  { grade: "F", min: 0, remark: "Needs improvement" },
];
const paper = (marks: number | null, opts: { absent?: boolean; entered?: boolean } = {}) => ({ maxMarks: 100, passMarks: 40, marks, absent: opts.absent ?? false, entered: opts.entered ?? true });

describe("grading", () => {
  it("picks the highest band a percentage reaches, regardless of scale order", () => {
    expect(gradeFor(80, scale).grade).toBe("A");
    expect(gradeFor(79.99, scale).grade).toBe("B");
    expect(gradeFor(0, [...scale].reverse()).grade).toBe("F");
  });

  it("passes only when every paper and the overall percentage pass", () => {
    expect(computeResult([paper(70), paper(90)], scale, 40)).toMatchObject({ totalObtained: 160, totalMax: 200, percentage: 80, grade: "A", status: "PASS" });
    // 95 + 35: overall 65% but one paper below its pass mark.
    expect(computeResult([paper(95), paper(35)], scale, 40)).toMatchObject({ status: "FAIL", failedSubjects: 1 });
  });

  it("treats absence as zero and a failed paper; missing marks make it incomplete", () => {
    expect(computeResult([paper(90), paper(null, { absent: true })], scale, 40)).toMatchObject({ totalObtained: 90, percentage: 45, status: "FAIL" });
    expect(computeResult([paper(90), paper(null, { entered: false })], scale, 40).status).toBe("INCOMPLETE");
    expect(computeResult([], scale, 40).status).toBe("INCOMPLETE");
  });

  it("ranks with ties sharing a position (1, 2, 2, 4) and skips unranked", () => {
    const pos = rankByScore([
      { id: "a", score: 91 },
      { id: "b", score: 80 },
      { id: "c", score: 80 },
      { id: "d", score: 70 },
      { id: "e", score: null },
    ]);
    expect([pos.get("a"), pos.get("b"), pos.get("c"), pos.get("d"), pos.get("e")]).toEqual([1, 2, 2, 4, undefined]);
  });

  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th"]);
  });
});
