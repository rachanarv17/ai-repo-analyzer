/**
 * Centralized API client.
 * Points to Next.js API routes (/api/*) — no external backend needed.
 */
import axios from "axios";

// Always use relative URL so it works on any host/port
const API_BASE = "/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ---- Types ----------------------------------------------------------------

export type ScanStatus = "pending" | "running" | "completed" | "failed";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type Category = "security" | "quality" | "dependency";

export interface Repo {
  id: number;
  url: string;
  name: string;
  created_at: string;
}

export interface Scan {
  id: number;
  repo_id: number;
  status: ScanStatus;
  progress: number;
  detailed_status?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  repo?: Repo;
}

export interface Issue {
  id: number;
  scan_id: number;
  file_path: string;
  line_number?: number | null;
  severity: Severity;
  category: Category;
  tool: string;
  message: string;
  rule_id?: string | null;
  ai_explanation?: string | null;
  suggested_fix?: string | null;
  before_code?: string | null;
  after_code?: string | null;
  created_at: string;
}

export interface IssueFilters {
  severity?: Severity | "";
  file?: string;
  tool?: string;
  skip?: number;
  limit?: number;
}

// ---- API calls ------------------------------------------------------------

export async function submitScan(repoUrl: string): Promise<Scan> {
  const res = await api.post<Scan>("/scan", { repo_url: repoUrl });
  return res.data;
}

export async function getScan(scanId: number): Promise<Scan> {
  const res = await api.get<Scan>(`/scan/${scanId}`);
  return res.data;
}

export async function getScanIssues(
  scanId: number,
  filters: IssueFilters = {}
): Promise<Issue[]> {
  const params: Record<string, string | number> = {};
  if (filters.severity) params.severity = filters.severity;
  if (filters.file)     params.file     = filters.file;
  if (filters.tool)     params.tool     = filters.tool;
  if (filters.skip  !== undefined) params.skip  = filters.skip;
  if (filters.limit !== undefined) params.limit = filters.limit;

  const res = await api.get<Issue[]>(`/scan/${scanId}/issues`, { params });
  return res.data;
}

export async function pollScanUntilComplete(
  scanId: number,
  onUpdate: (scan: Scan) => void,
  intervalMs = 3000,
  timeoutMs  = 300_000
): Promise<Scan> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(async () => {
      try {
        const scan = await getScan(scanId);
        onUpdate(scan);
        if (scan.status === "completed" || scan.status === "failed") {
          clearInterval(timer);
          resolve(scan);
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Scan timed out after 5 minutes"));
        }
      } catch (err) {
        clearInterval(timer);
        reject(err);
      }
    }, intervalMs);
  });
}

// ---- Export utilities -----------------------------------------------------

/** Export scan results as a downloadable JSON file */
export function exportResultsAsJson(scan: Scan, issues: Issue[]) {
  const payload = {
    exported_at: new Date().toISOString(),
    scan: {
      id: scan.id,
      repository: scan.repo?.url,
      status: scan.status,
      analyzed_at: scan.updated_at,
    },
    summary: {
      total: issues.length,
      high:   issues.filter((i) => i.severity === "HIGH").length,
      medium: issues.filter((i) => i.severity === "MEDIUM").length,
      low:    issues.filter((i) => i.severity === "LOW").length,
      tools:  [...new Set(issues.map((i) => i.tool))],
    },
    issues: issues.map((i) => ({
      severity:    i.severity,
      category:    i.category,
      tool:        i.tool,
      rule:        i.rule_id,
      file:        i.file_path,
      line:        i.line_number,
      message:     i.message,
      explanation: i.ai_explanation,
      fix:         i.suggested_fix,
    })),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ai-repo-analysis-${scan.repo?.name?.replace("/", "-") ?? scan.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export scan results as markdown report */
export function exportResultsAsMarkdown(scan: Scan, issues: Issue[]) {
  const high   = issues.filter((i) => i.severity === "HIGH");
  const medium = issues.filter((i) => i.severity === "MEDIUM");
  const low    = issues.filter((i) => i.severity === "LOW");

  const issueSection = (list: Issue[], title: string) => {
    if (!list.length) return "";
    return (
      `\n## ${title} (${list.length})\n\n` +
      list
        .map(
          (i) =>
            `### [${i.tool}] ${i.file_path}${i.line_number ? `:${i.line_number}` : ""}\n` +
            `**Rule:** \`${i.rule_id || "N/A"}\`  \n` +
            `**Message:** ${i.message}\n\n` +
            (i.ai_explanation ? `> 🤖 ${i.ai_explanation}\n\n` : "") +
            (i.suggested_fix  ? `💡 **Fix:** ${i.suggested_fix}\n\n` : "")
        )
        .join("---\n\n")
    );
  };

  const md = `# AI Repository Analysis Report

**Repository:** ${scan.repo?.url || "Unknown"}  
**Analyzed at:** ${new Date(scan.updated_at).toLocaleString()}  
**Scan ID:** #${scan.id}

## Summary

| Severity | Count |
|----------|-------|
| 🔴 HIGH   | ${high.length}   |
| 🟡 MEDIUM | ${medium.length} |
| 🟢 LOW    | ${low.length}    |
| **Total** | **${issues.length}** |

${issueSection(high,   "🔴 High Severity Issues")}
${issueSection(medium, "🟡 Medium Severity Issues")}
${issueSection(low,    "🟢 Low Severity Issues")}

---
*Generated by [AI Repository Analyzer](https://github.com)*
`;

  const blob = new Blob([md], { type: "text/markdown" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `ai-repo-analysis-${scan.repo?.name?.replace("/", "-") ?? scan.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
