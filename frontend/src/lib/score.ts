/**
 * Security Score — computes an A–F grade and 0–100 numeric score
 * based on issue density and severity distribution.
 */

import type { Issue } from "./store";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface SecurityScore {
  grade:       Grade;
  score:       number;          // 0–100
  label:       string;          // "Excellent" … "Critical"
  color:       string;          // CSS color
  description: string;
  breakdown: {
    highPenalty:   number;
    mediumPenalty: number;
    lowPenalty:    number;
    densityFactor: number;
  };
}

const GRADE_THRESHOLDS: Array<{ min: number; grade: Grade; label: string; color: string; description: string }> = [
  { min: 90, grade: "A", label: "Excellent",    color: "#34d399", description: "Very few issues found — this codebase follows strong security practices." },
  { min: 75, grade: "B", label: "Good",          color: "#6ee7b7", description: "Minor issues found but no critical vulnerabilities. Worth addressing." },
  { min: 60, grade: "C", label: "Fair",           color: "#fbbf24", description: "Several medium-severity issues. Some security debt to address." },
  { min: 40, grade: "D", label: "Poor",            color: "#f97316", description: "Multiple high-severity issues detected. Needs immediate attention." },
  { min: 0,  grade: "F", label: "Critical",        color: "#ff4d6d", description: "Critical vulnerabilities found. This codebase poses significant risk." },
];

/**
 * Compute a security score for a scan result.
 * @param issues   Array of issues from the scan
 * @param totalLines Number of lines scanned (for density calculation)
 */
export function computeScore(issues: Issue[], totalLines: number): SecurityScore {
  const high   = issues.filter((i) => i.severity === "HIGH").length;
  const medium = issues.filter((i) => i.severity === "MEDIUM").length;
  const low    = issues.filter((i) => i.severity === "LOW").length;

  // Density = issues per 1000 lines of code
  const kLines       = Math.max(totalLines / 1000, 0.1);
  const highDensity   = high   / kLines;
  const mediumDensity = medium / kLines;
  const lowDensity    = low    / kLines;

  // Penalty weights (tuned so typical real repos land in B-C range)
  const highPenalty   = Math.min(highDensity   * 18, 60);
  const mediumPenalty = Math.min(mediumDensity  * 5,  25);
  const lowPenalty    = Math.min(lowDensity     * 1,  10);

  // Absolute penalty for very high raw counts (catches tiny files with many issues)
  const absolutePenalty = Math.min(high * 3 + medium * 1, 20);

  const densityFactor = highPenalty + mediumPenalty + lowPenalty;
  const totalPenalty  = Math.min(densityFactor + absolutePenalty * 0.3, 100);
  const score         = Math.max(0, Math.round(100 - totalPenalty));

  const threshold = GRADE_THRESHOLDS.find((t) => score >= t.min)!;

  return {
    grade:    threshold.grade,
    score,
    label:    threshold.label,
    color:    threshold.color,
    description: threshold.description,
    breakdown: {
      highPenalty:   Math.round(highPenalty),
      mediumPenalty: Math.round(mediumPenalty),
      lowPenalty:    Math.round(lowPenalty),
      densityFactor: Math.round(densityFactor),
    },
  };
}

export function gradeColor(grade: Grade): string {
  return GRADE_THRESHOLDS.find((t) => t.grade === grade)?.color ?? "#fff";
}
