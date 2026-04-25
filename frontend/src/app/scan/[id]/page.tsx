"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getScan,
  getScanIssues,
  pollScanUntilComplete,
  exportResultsAsJson,
  exportResultsAsMarkdown,
  type Scan,
  type Issue,
  type Severity,
} from "@/lib/api";
import {
  MOCK_SCAN_ID,
  MOCK_SCAN,
  MOCK_ISSUES,
  saveToHistory,
} from "@/lib/mock";

// Extended Scan type with real stats from the API
interface ScanWithStats extends Scan {
  stats?: {
    totalPyFiles:  number;
    totalJsFiles?: number;
    analyzedFiles: number;
    totalLines:    number;
    fileList:      string[];
    depFiles:      string[];
    analysisMs:    number;
    languages?:    string[];
  } | null;
  score?: {
    grade:       string;
    score:       number;
    label:       string;
    color:       string;
    description: string;
  } | null;
}

// ─── Security Score Card ─────────────────────────────────────────────────────

function SecurityScoreCard({ score }: { score: NonNullable<ScanWithStats["score"]> }) {
  const circumference = 2 * Math.PI * 28;
  const filled = (score.score / 100) * circumference;
  const gap    = circumference - filled;
  return (
    <div className="glass-card animate-fade-in" style={{
      display: "flex", alignItems: "center", gap: "24px",
      padding: "24px 32px", marginBottom: "24px",
      border: `1px solid ${score.color}33`,
      background: `linear-gradient(135deg, var(--surface-container), ${score.color}08)`,
    }}>
      {/* Ring gauge */}
      <svg width="80" height="80" viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
        <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(71,71,84,0.25)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r="28" fill="none"
          stroke={score.color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${gap}`}
          strokeDashoffset={circumference / 4}
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text x="36" y="38" textAnchor="middle" fill={score.color} fontSize="16" fontWeight="800">
          {score.grade}
        </text>
        <text x="36" y="50" textAnchor="middle" fill="var(--on-surface-variant)" fontSize="8">
          {score.score}/100
        </text>
      </svg>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: score.color }}>{score.label}</span>
          <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", fontWeight: 500 }}>Security Score</span>
        </div>
        <p style={{ fontSize: "13px", color: "var(--on-surface-variant)", lineHeight: 1.5, margin: 0 }}>
          {score.description}
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  const c = severity === "HIGH" ? "badge-high" : severity === "MEDIUM" ? "badge-medium" : "badge-low";
  return (
    <span className={c} style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", letterSpacing: "0.04em" }}>
      {severity}
    </span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const map: Record<string, string> = { security: "🔒", quality: "⚡", dependency: "📦" };
  return <span title={category}>{map[category] || "●"}</span>;
}

function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div style={{ textAlign: "left", minWidth: "100px" }}>
      <div style={{ fontSize: "28px", fontWeight: 800, color, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--on-surface-variant)", marginTop: "6px", letterSpacing: "0.1em", opacity: 0.6 }}>
        {label.toUpperCase()}
      </div>
    </div>
  );
}


import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: "11px", fontWeight: 600, color: "var(--on-surface-variant)",
        letterSpacing: "0.06em", marginBottom: "8px",
      }}>
        <span>{label}</span>
        {code && (
          <button
            onClick={handleCopy}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: copied ? "#34d399" : "var(--outline)",
              fontSize: "11px", fontWeight: 600, padding: "0",
            }}
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        )}
      </div>
      <div style={{
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid rgba(71,71,84,0.3)",
        fontSize: "12px",
      }}>
        <SyntaxHighlighter
          language="python"
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: "16px",
            background: "var(--surface-low)",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
          codeTagProps={{
            style: { fontFamily: "'JetBrains Mono', monospace" }
          }}
        >
          {code || "N/A"}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}


function IssueDetailPanel({ issue, scanId }: { issue: Issue; scanId: number | string }) {
  const [generating, setGenerating] = useState(false);
  const [fixData, setFixData] = useState<{ explain?: string, fix?: string, after?: string } | null>(null);

  const handleGenerateFix = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/scan/${scanId}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issue, fileContext: issue.before_code || "Code snippet unavailable." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFixData({ explain: data.ai_explanation, fix: data.suggested_fix, after: data.after_code });
    } catch (e) {
      console.error(e);
      alert("AI generation failed or is unavailable in offline demo.");
    } finally {
      setGenerating(false);
    }
  };

  const explain = fixData?.explain || issue.ai_explanation;
  const fix = fixData?.fix || issue.suggested_fix;
  const afterCode = fixData?.after || issue.after_code;

  return (
    <div className="animate-fade-in" style={{
      background: "var(--surface-low)",
      borderRadius: "12px",
      padding: "28px",
      marginTop: "4px",
      border: "1px solid rgba(71,71,84,0.2)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
        <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--primary)", letterSpacing: "0.04em" }}>
          🤖 AI EXPLANATION
        </h4>
        
        {!fixData && (
          <button 
            onClick={handleGenerateFix}
            disabled={generating}
            style={{
              background: "rgba(196,167,255,0.1)", border: "1px solid rgba(196,167,255,0.25)",
              color: "var(--primary)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
              cursor: generating ? "wait" : "pointer", display: "flex", alignItems: "center", gap: "6px",
              transition: "all 0.2s"
            }}
          >
            {generating ? (
              <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "2px" }} />
            ) : "✨"}
            {generating ? "Generating Fix..." : "Auto-Fix with AI"}
          </button>
        )}
      </div>

      {explain && (
        <div style={{ marginBottom: "20px" }}>
          <p style={{ color: "var(--on-surface-variant)", fontSize: "14px", lineHeight: 1.7 }}>
            {explain}
          </p>
        </div>
      )}

      {fix && (
        <div style={{ marginBottom: "20px" }}>
          <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--secondary)", marginBottom: "10px", letterSpacing: "0.04em" }}>
            💡 SUGGESTED FIX
          </h4>
          <p style={{ color: "var(--on-surface-variant)", fontSize: "14px", lineHeight: 1.7 }}>
            {issue.suggested_fix}
          </p>
        </div>
      )}

      {(issue.before_code || afterCode) && (
        <div>
          <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--on-surface-variant)", marginBottom: "12px", letterSpacing: "0.04em" }}>
            ↔ BEFORE / AFTER
          </h4>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <CodeBlock code={issue.before_code || ""} label="BEFORE" />
            <CodeBlock code={afterCode || ""} label="AFTER (FIXED)" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Severity Donut Chart ────────────────────────────────────────────────────

function SeverityDonut({ high, medium, low }: { high: number; medium: number; low: number }) {
  const total = high + medium + low;
  if (total === 0) return null;

  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  const highPct   = high / total;
  const medPct    = medium / total;
  const lowPct    = low / total;

  const highDash   = circumference * highPct;
  const medDash    = circumference * medPct;
  const lowDash    = circumference * lowPct;

  const highOffset = 0;
  const medOffset  = -highDash;
  const lowOffset  = -(highDash + medDash);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={radius} fill="none" stroke="var(--surface-high)" strokeWidth="10" />
        {high > 0 && (
          <circle cx="45" cy="45" r={radius} fill="none"
            stroke="#ff6e84" strokeWidth="10"
            strokeDasharray={`${highDash} ${circumference - highDash}`}
            strokeDashoffset={highOffset}
            transform="rotate(-90 45 45)"
          />
        )}
        {medium > 0 && (
          <circle cx="45" cy="45" r={radius} fill="none"
            stroke="#fbbf24" strokeWidth="10"
            strokeDasharray={`${medDash} ${circumference - medDash}`}
            strokeDashoffset={medOffset}
            transform="rotate(-90 45 45)"
          />
        )}
        {low > 0 && (
          <circle cx="45" cy="45" r={radius} fill="none"
            stroke="#34d399" strokeWidth="10"
            strokeDasharray={`${lowDash} ${circumference - lowDash}`}
            strokeDashoffset={lowOffset}
            transform="rotate(-90 45 45)"
          />
        )}
        <text x="45" y="49" textAnchor="middle" fill="var(--on-surface)" fontSize="14" fontWeight="700">
          {total}
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {[
          { label: "High", count: high, color: "#ff6e84" },
          { label: "Medium", count: medium, color: "#fbbf24" },
          { label: "Low", count: low, color: "#34d399" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>{item.label}</span>
            <span style={{ fontSize: "12px", fontWeight: 600, color: item.color, marginLeft: "auto" }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScanLoadingView({ scan, repoUrl }: { scan: Scan; repoUrl: string }) {
  const dots = ".".repeat((Math.floor(Date.now() / 500) % 3) + 1);

  return (
    <main style={{
      minHeight: "100vh", background: "var(--surface)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden", padding: "24px",
    }}>
      <div style={{ position: "absolute", inset: 0, background: "var(--grad-glow-tl), var(--grad-glow-tr)", pointerEvents: "none" }} />

      <div className="gradient-text" style={{ fontSize: "18px", fontWeight: 700, marginBottom: "40px", letterSpacing: "-0.02em", position: "relative", zIndex: 1 }}>
        AI Repository Analyzer
      </div>

      <div className="glass-card" style={{
        width: "100%", maxWidth: "500px", padding: "44px 48px",
        position: "relative", zIndex: 1, textAlign: "center",
        boxShadow: "0 30px 80px rgba(138,76,252,0.12)",
      }}>
        {/* Spinner */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "50%",
            border: "3px solid rgba(189,157,255,0.12)",
            borderTopColor: "var(--primary)",
            borderRightColor: "var(--secondary)",
            animation: "spin 1s linear infinite",
          }} />
        </div>

        <p style={{ fontSize: "11px", color: "var(--on-surface-variant)", fontFamily: "'JetBrains Mono', monospace", marginBottom: "6px", opacity: 0.6 }}>
          {repoUrl}
        </p>
        <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "28px", letterSpacing: "-0.02em" }}>
          {scan.status === "pending" ? "Queued" : "Running Analysis"}{dots}
        </h2>

        {/* Active step display */}
        <div className="animate-fade-in" style={{
          background: "var(--surface-low)",
          borderRadius: "14px",
          padding: "18px 22px",
          marginBottom: "24px",
          border: "1px solid rgba(138,76,252,0.18)",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "50%",
              background: "rgba(138,76,252,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "20px",
            }}>
              🔍
            </div>
            <div style={{
              position: "absolute", inset: "-5px", borderRadius: "50%",
              border: "2px solid transparent",
              borderTopColor: "var(--primary)", borderRightColor: "var(--secondary)",
              animation: "spin 1.2s linear infinite",
            }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--on-surface)", marginBottom: "3px" }}>
              {scan.detailed_status || "Analyzing code quality..."}
            </div>
            <div style={{ fontSize: "12px", color: "var(--on-surface-variant)", opacity: 0.75, lineHeight: 1.4 }}>
              Step {scan.progress < 30 ? "1" : scan.progress < 60 ? "2" : scan.progress < 90 ? "3" : "4"} of 4
            </div>
          </div>
        </div>

        {/* Live progress bar */}
        <div style={{ background: "rgba(71,71,84,0.2)", borderRadius: "999px", height: "6px", overflow: "hidden", marginBottom: "14px" }}>
          <div style={{
            height: "100%", borderRadius: "999px",
            background: "linear-gradient(90deg, var(--primary), var(--secondary))",
            width: `${scan.progress}%`,
            transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "0 0 8px rgba(138,76,252,0.5)",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--on-surface-variant)", opacity: 0.55 }}>
          <span>Progress: {scan.progress}%</span>
          <span>Please wait...</span>
        </div>
      </div>

      <p style={{ marginTop: "20px", fontSize: "12px", color: "var(--on-surface-variant)", opacity: 0.45, position: "relative", zIndex: 1 }}>
        Usually takes 30–90 seconds
      </p>
    </main>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────

const TOOL_OPTIONS = [
  "All Tools",
  "pylint", "flake8", "bandit", "pip-audit",
  "hadolint", "shellcheck", "brakeman", "gosec", "phpstan",
  "config-audit", "secret-scan",
  "js-security", "js-quality",
];
const SEV_OPTIONS: Array<{ label: string; value: "" | Severity }> = [
  { label: "All Severity", value: "" },
  { label: "HIGH", value: "HIGH" },
  { label: "MEDIUM", value: "MEDIUM" },
  { label: "LOW", value: "LOW" },
];

export default function ScanPage() {
  const { id } = useParams<{ id: string }>();
  const scanId = Number(id);
  const isDemoMode = scanId === MOCK_SCAN_ID;

  const [scan, setScan] = useState<ScanWithStats | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]); // unfiltered, for export
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filterSev, setFilterSev] = useState<"" | Severity>("");
  const [filterTool, setFilterTool] = useState("");
  const [filterFile, setFilterFile] = useState("");

  // ─── Boot: handle demo mode or real API ───
  useEffect(() => {
    if (isDemoMode) {
      setScan(MOCK_SCAN as ScanWithStats);
      setIssues(MOCK_ISSUES);
      setAllIssues(MOCK_ISSUES);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const initial = await getScan(scanId) as ScanWithStats;
        if (!cancelled) setScan(initial);

        if (initial.status === "pending" || initial.status === "running") {
          await pollScanUntilComplete(scanId, (s) => {
            if (!cancelled) setScan(s as ScanWithStats);
          });
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
        if (axiosErr?.response?.status === 404) {
          setScanError(
            "This scan was not found. The server may have restarted and lost in-memory data. " +
            "Please go back and start a new scan."
          );
        } else {
          setScanError("Failed to load scan results. Please try again.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [scanId, isDemoMode]);

  // ─── Fetch issues when scan completes ─────────────
  useEffect(() => {
    if (isDemoMode) {
      // Filter mock issues client-side
      let filtered = MOCK_ISSUES;
      if (filterSev) filtered = filtered.filter((i) => i.severity === filterSev);
      if (filterTool) filtered = filtered.filter((i) => i.tool === filterTool);
      if (filterFile) filtered = filtered.filter((i) => i.file_path.includes(filterFile));
      setIssues(filtered);
      return;
    }

    if (scan?.status !== "completed") return;
    setLoadingIssues(true);
    getScanIssues(scanId, {
      severity: filterSev || undefined,
      tool: filterTool || undefined,
      file: filterFile || undefined,
      limit: 200,
    })
      .then((data) => {
        setIssues(data);
        if (!filterSev && !filterTool && !filterFile) setAllIssues(data);
      })
      .finally(() => setLoadingIssues(false));
  }, [scan?.status, scanId, filterSev, filterTool, filterFile, isDemoMode]);

  // Save to history when scan completes
  useEffect(() => {
    if (scan?.status === "completed" && scan.repo) {
      const highCount = (isDemoMode ? MOCK_ISSUES : allIssues).filter((i) => i.severity === "HIGH").length;
      saveToHistory({
        scanId: scan.id,
        repoUrl: scan.repo.url,
        repoName: scan.repo.name,
        status: scan.status,
        issueCount: isDemoMode ? MOCK_ISSUES.length : allIssues.length,
        highCount,
        scannedAt: scan.created_at,
        isMock: isDemoMode,
      });
    }
  }, [scan, allIssues, isDemoMode]);

  // ─── Tab title with issue count ───────────────────
  useEffect(() => {
    if (scan?.status === "completed") {
      const count = isDemoMode ? MOCK_ISSUES.length : allIssues.length;
      const name  = scan.repo?.name ?? "Scan";
      document.title = `[${count} issues] ${name} — AI Analyzer`;
    }
  }, [scan, allIssues, isDemoMode]);

  // ─── Keyboard shortcuts: j/k to navigate, Esc to close ──
  const issueRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
      if (e.key === "Escape") { setExpandedId(null); return; }
      if (e.key === "j" || e.key === "ArrowDown") {
        setExpandedId((prev) => {
          const displayed = issues;
          if (displayed.length === 0) return prev;
          const idx = prev === null ? 0 : displayed.findIndex((i) => i.id === prev);
          const next = Math.min(idx + 1, displayed.length - 1);
          issueRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return displayed[next].id;
        });
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        setExpandedId((prev) => {
          const displayed = issues;
          if (displayed.length === 0) return prev;
          const idx = prev === null ? 0 : displayed.findIndex((i) => i.id === prev);
          const next = Math.max(idx - 1, 0);
          issueRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return displayed[next].id;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [issues]);

  // ─── Rescan ───────────────────────────────────────
  const router = useRouter();
  const [rescanning, setRescanning] = useState(false);
  const handleRescan = useCallback(async () => {
    if (!scan?.repo?.url || rescanning) return;
    setRescanning(true);
    try {
      const res  = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repo_url: scan.repo.url }) });
      const data = await res.json();
      if (data.id) router.push(`/scan/${data.id}`);
    } finally {
      setRescanning(false);
    }
  }, [scan, rescanning, router]);

  // ─── Share / copy link ────────────────────────────
  const [copied, setCopied] = useState(false);
  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);


  if (scanError) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px" }}>
        <div style={{ fontSize: "48px" }}>🔍</div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "var(--error)" }}>Scan Not Found</h1>
        <p style={{ color: "var(--on-surface-variant)", maxWidth: "480px", textAlign: "center", lineHeight: 1.65 }}>
          {scanError}
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link href="/" style={{
            background: "var(--primary)", color: "#fff", textDecoration: "none",
            padding: "10px 24px", borderRadius: "10px", fontWeight: 600, fontSize: "14px"
          }}>← New Scan</Link>
          <Link href="/scan/9999" style={{
            background: "var(--surface-container)", color: "var(--on-surface)", textDecoration: "none",
            padding: "10px 24px", borderRadius: "10px", fontWeight: 600, fontSize: "14px",
            border: "1px solid rgba(71,71,84,0.3)"
          }}>View Demo</Link>
        </div>
      </main>
    );
  }

  if (!scan) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </main>
    );
  }

  if (scan.status === "pending" || scan.status === "running") {
    return <ScanLoadingView scan={scan} repoUrl={scan.repo?.url || "…"} />;
  }

  if (scan.status === "failed") {
    const errMsg    = scan.error_message || "An unknown error occurred.";
    const isNoFiles = errMsg.includes("no analyzable files") || errMsg.includes("no Python files");
    const isRate    = errMsg.includes("rate limit");
    const icon    = isNoFiles ? "🔎" : isRate ? "⏱" : "⚠";
    const title   = isNoFiles ? "No Analyzable Files Found" : isRate ? "GitHub Rate Limit" : "Analysis Failed";

    return (
      <main style={{ minHeight: "100vh", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "var(--grad-glow-tl)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: "580px", textAlign: "center" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>{icon}</div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: isNoFiles ? "var(--primary)" : "var(--error)", marginBottom: "16px", letterSpacing: "-0.02em" }}>
            {title}
          </h1>
          <div className="glass-card" style={{ padding: "28px", marginBottom: "24px", textAlign: "left" }}>
            <p style={{ color: "var(--on-surface-variant)", lineHeight: 1.75, fontSize: "14px" }}>
              {errMsg}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" style={{
              background: "var(--primary)", color: "#1a0055", textDecoration: "none",
              padding: "10px 24px", borderRadius: "10px", fontWeight: 700, fontSize: "14px",
            }}>← Try a New Repo</Link>
            <Link href="/scan/9999" style={{
              background: "var(--surface-container)", color: "var(--on-surface)", textDecoration: "none",
              padding: "10px 24px", borderRadius: "10px", fontWeight: 600, fontSize: "14px",
              border: "1px solid rgba(71,71,84,0.3)",
            }}>View Demo (psf/requests)</Link>
          </div>
          {isNoFiles && (
            <div style={{ marginTop: "24px", textAlign: "left" }}>
              <p style={{ fontSize: "13px", color: "var(--on-surface-variant)", marginBottom: "12px", fontWeight: 500 }}>
                💡 Try these repos — supports Python, JS/TS, Go, Ruby, PHP, Java, Docker, Shell & configs:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {[
                  { name: "psf/requests", lang: "🐍" },
                  { name: "pallets/flask", lang: "🐍" },
                  { name: "expressjs/express", lang: "🟡" },
                  { name: "microsoft/TypeScript", lang: "🔷" },
                  { name: "gin-gonic/gin", lang: "🔵" },
                  { name: "rails/rails", lang: "💎" },
                ].map((r) => (
                  <a key={r.name} href={`https://github.com/${r.name}`}
                    onClick={(e) => { e.preventDefault(); window.location.href = `/`; }}
                    style={{
                      color: "var(--secondary)", textDecoration: "none", fontSize: "12px",
                      background: "var(--surface-container)", border: "1px solid rgba(78,76,100,0.3)",
                      padding: "4px 12px", borderRadius: "999px",
                    }}
                  >{r.lang} {r.name}</a>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ─── Completed Dashboard ──────────────────────────
  const exportIssues = isDemoMode ? MOCK_ISSUES : allIssues;
  const totalHigh = issues.filter((i) => i.severity === "HIGH").length;
  const totalMed  = issues.filter((i) => i.severity === "MEDIUM").length;
  const totalLow  = issues.filter((i) => i.severity === "LOW").length;
  const tools = Array.from(new Set(issues.map((i) => i.tool)));

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface)" }}>
      {/* NAV */}
      <nav className="glass-nav" style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: "64px", gap: "16px",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span className="gradient-text" style={{ fontWeight: 700, fontSize: "16px", letterSpacing: "-0.02em" }}>
            AI Repository Analyzer
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "var(--on-surface-variant)" }}>
          <Link href="/" style={{ color: "var(--on-surface-variant)", textDecoration: "none" }}>Home</Link>
          <span>›</span>
          <Link href="/history" style={{ color: "var(--on-surface-variant)", textDecoration: "none" }}>History</Link>
          <span>›</span>
          <span style={{ color: "var(--on-surface)" }}>Scan #{scanId}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {isDemoMode && (
            <span style={{
              fontSize: "11px", fontWeight: 600, padding: "4px 10px",
              background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)",
              color: "#fbbf24", borderRadius: "999px", letterSpacing: "0.04em",
            }}>
              🎭 DEMO MODE
            </span>
          )}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)",
            borderRadius: "999px", padding: "6px 14px", fontSize: "12px", color: "#34d399", fontWeight: 600,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399", animation: "pulse-glow 2s infinite", display: "inline-block" }} />
            Analysis Complete
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>

        {/* SUMMARY HEADER */}
        <div className="glass-card animate-fade-in" style={{ padding: "40px", marginBottom: "32px", border: "1px solid rgba(138,76,252,0.15)" }}>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "1fr auto", 
            gap: "48px", 
            alignItems: "center",
            flexWrap: "wrap" 
          }}>
            {/* Left Column: Repository Info */}
            <div style={{ minWidth: "300px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ fontSize: "24px" }}>📦</span>
                <h1 style={{ 
                  fontSize: "32px", 
                  fontWeight: 800, 
                  letterSpacing: "-0.03em", 
                  margin: 0,
                  wordBreak: "break-all",
                  background: "linear-gradient(90deg, #fff, #bd9dff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent"
                }}>
                  {scan.repo?.name || `Repository #${scan.repo_id}`}
                </h1>
              </div>
              
              <a 
                href={scan.repo?.url} 
                target="_blank" 
                rel="noreferrer"
                style={{ 
                  color: "var(--on-surface-variant)", 
                  fontSize: "14px", 
                  fontFamily: "'JetBrains Mono', monospace",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  opacity: 0.7,
                  transition: "opacity 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = "1"}
                onMouseOut={(e) => e.currentTarget.style.opacity = "0.7"}
              >
                {scan.repo?.url} ↗
              </a>

              <div style={{ display: "flex", gap: "8px", marginTop: "20px", flexWrap: "wrap" }}>
                {tools.map((t) => (
                  <span key={t} className="tool-badge" style={{ 
                    background: "rgba(189,157,255,0.1)", 
                    border: "1px solid rgba(189,157,255,0.2)",
                    color: "var(--primary)",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 600
                  }}>
                    {t} ✓
                  </span>
                ))}
              </div>
            </div>

            {/* Right Column: Key Metrics */}
            <div style={{ 
              display: "flex", 
              gap: "48px", 
              alignItems: "center", 
              background: "rgba(71,71,84,0.15)",
              padding: "24px 32px",
              borderRadius: "20px",
              border: "1px solid rgba(255,255,255,0.05)"
            }}>
              <SeverityDonut high={totalHigh} medium={totalMed} low={totalLow} />
              
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(2, 1fr)", 
                gap: "24px 32px" 
              }}>
                <StatCard value={issues.length} label="Total Issues" color="var(--primary)" />
                <StatCard value={totalHigh}   label="High"          color="#ff6e84" />
                <StatCard value={totalMed}    label="Medium"        color="#fbbf24" />
                <StatCard value={totalLow}    label="Low"           color="#34d399" />
              </div>
            </div>
          </div>


          {/* Security Score Card */}
          {!isDemoMode && scan.score && (
            <div style={{ marginTop: "24px" }}>
              <SecurityScoreCard score={scan.score} />
            </div>
          )}

          {/* Action bar */}
          <div style={{
            marginTop: "20px", paddingTop: "20px",
            borderTop: "1px solid rgba(71,71,84,0.15)",
            display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center",
          }}>
            <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", alignSelf: "center", marginRight: "4px" }}>Export:</span>
            <button id="export-json-btn" onClick={() => exportResultsAsJson(scan, exportIssues)}
              style={{ background: "rgba(189,157,255,0.08)", border: "1px solid rgba(189,157,255,0.2)", color: "var(--primary)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              ⬇ JSON
            </button>
            <button id="export-md-btn" onClick={() => exportResultsAsMarkdown(scan, exportIssues)}
              style={{ background: "rgba(83,221,252,0.08)", border: "1px solid rgba(83,221,252,0.2)", color: "var(--secondary)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              ⬇ Markdown
            </button>
            <button id="export-pdf-btn" onClick={handleExportPdf}
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", color: "var(--on-surface)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              ⬇ PDF
            </button>
            {!isDemoMode && (
              <a href={`/api/scan/${scanId}/sarif`} download={`scan-${scanId}.sarif`}
                style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                ⬇ SARIF
              </a>
            )}
            <div style={{ flex: 1 }} />
            <button id="share-btn" onClick={handleShare}
              style={{ background: copied ? "rgba(52,211,153,0.12)" : "rgba(71,71,84,0.1)", border: `1px solid ${copied ? "rgba(52,211,153,0.3)" : "rgba(71,71,84,0.3)"}`, color: copied ? "#34d399" : "var(--on-surface-variant)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
              {copied ? "✓ Copied!" : "🔗 Share"}
            </button>
            {!isDemoMode && (
              <button id="rescan-btn" onClick={handleRescan} disabled={rescanning}
                style={{ background: "rgba(138,76,252,0.12)", border: "1px solid rgba(138,76,252,0.25)", color: "var(--primary)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: rescanning ? "not-allowed" : "pointer", opacity: rescanning ? 0.6 : 1 }}>
                {rescanning ? "⏳ Starting…" : "🔄 Rescan"}
              </button>
            )}
            <Link href="/" style={{ background: "transparent", border: "1px solid rgba(71,71,84,0.3)", color: "var(--on-surface-variant)", padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>
              + New Scan
            </Link>
          </div>

          {/* Real Stats Panel */}
          {!isDemoMode && scan.stats && (
            <div style={{
              marginTop: "16px", paddingTop: "16px",
              borderTop: "1px solid rgba(71,71,84,0.1)",
            }}>
              {/* Language tags */}
              {scan.stats.languages && scan.stats.languages.length > 0 && (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {scan.stats.languages.map((lang) => {
                    const LANG_META: Record<string, { color: string; emoji: string }> = {
                      Python:     { color: "#3572A5", emoji: "🐍" },
                      TypeScript: { color: "#3178c6", emoji: "🔷" },
                      JavaScript: { color: "#f7df1e", emoji: "🟡" },
                      Ruby:       { color: "#cc342d", emoji: "💎" },
                      PHP:        { color: "#777bb3", emoji: "🐘" },
                      Go:         { color: "#00acd7", emoji: "🔵" },
                      Java:       { color: "#ed8b00", emoji: "☕" },
                      Dockerfile: { color: "#2496ed", emoji: "🐳" },
                      Shell:      { color: "#89e051", emoji: "🖥" },
                      Config:     { color: "#6c6c6c", emoji: "⚙️" },
                    };
                    const key    = Object.keys(LANG_META).find((k) => lang.startsWith(k)) ?? "";
                    const meta   = LANG_META[key] ?? { color: "var(--primary)", emoji: "📄" };
                    return (
                      <span key={lang} style={{
                        fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px",
                        background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}44`,
                      }}>
                        {meta.emoji} {lang}
                      </span>
                    );
                  })}
                  {scan.stats.depFiles.length > 0 && (
                    <span style={{
                      fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px",
                      background: "rgba(93,228,252,0.1)", color: "var(--secondary)", border: "1px solid rgba(93,228,252,0.25)",
                    }}>📦 {scan.stats.depFiles.length} dep file{scan.stats.depFiles.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ 
                display: "flex", 
                gap: "48px", 
                flexWrap: "wrap", 
                alignItems: "center",
                background: "rgba(189,157,255,0.05)",
                padding: "20px 24px",
                borderRadius: "16px",
                border: "1px solid rgba(189,157,255,0.1)"
              }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--secondary)", letterSpacing: "-0.02em", lineHeight: 1 }}>{scan.stats.analyzedFiles}</div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--on-surface-variant)", marginTop: "6px", letterSpacing: "0.1em", opacity: 0.6 }}>FILES ANALYZED</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--secondary)", letterSpacing: "-0.02em", lineHeight: 1 }}>{scan.stats.totalLines.toLocaleString()}</div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--on-surface-variant)", marginTop: "6px", letterSpacing: "0.1em", opacity: 0.6 }}>LINES SCANNED</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--secondary)", letterSpacing: "-0.02em", lineHeight: 1 }}>{(scan.stats.analysisMs / 1000).toFixed(1)}s</div>
                  <div style={{ fontSize: "9px", fontWeight: 700, color: "var(--on-surface-variant)", marginTop: "6px", letterSpacing: "0.1em", opacity: 0.6 }}>ANALYSIS TIME</div>
                </div>
              </div>

                {scan.stats.fileList.length > 0 && (
                  <details style={{ flex: 1, minWidth: "200px" }}>
                    <summary style={{ cursor: "pointer", fontSize: "12px", color: "var(--on-surface-variant)", fontWeight: 500, userSelect: "none", listStyle: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>▸</span> Show analyzed files ({scan.stats.fileList.length})
                    </summary>
                    <div style={{
                      marginTop: "10px", display: "flex", flexDirection: "column", gap: "3px",
                      maxHeight: "160px", overflowY: "auto",
                      background: "var(--surface-low)", borderRadius: "8px", padding: "10px 14px",
                    }}>
                      {scan.stats.fileList.map((f, idx) => (
                        <code key={`${idx}-${f}`} style={{ fontSize: "11px", color: "var(--on-surface-variant)", fontFamily: "'JetBrains Mono', monospace" }}>
                          {f}
                        </code>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        {/* FILTER BAR */}
        <div className="glass-card" style={{
          padding: "16px 24px", marginBottom: "24px", position: "sticky", top: "64px", zIndex: 40,
          display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
        }}>
          <select
            id="filter-severity"
            className="aether-input"
            style={{ width: "auto", padding: "8px 14px", fontSize: "13px" }}
            value={filterSev}
            onChange={(e) => setFilterSev(e.target.value as "" | Severity)}
          >
            {SEV_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select
            id="filter-tool"
            className="aether-input"
            style={{ width: "auto", padding: "8px 14px", fontSize: "13px" }}
            value={filterTool}
            onChange={(e) => setFilterTool(e.target.value === "All Tools" ? "" : e.target.value)}
          >
            {TOOL_OPTIONS.map((t) => <option key={t}>{t}</option>)}
          </select>

          <input
            id="filter-file"
            className="aether-input"
            placeholder="Filter by file…"
            style={{ width: "220px", padding: "8px 14px", fontSize: "13px" }}
            value={filterFile}
            onChange={(e) => setFilterFile(e.target.value)}
          />

          {(filterSev || filterTool || filterFile) && (
            <button
              onClick={() => { setFilterSev(""); setFilterTool(""); setFilterFile(""); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--primary)", fontSize: "12px", fontWeight: 600,
              }}
            >
              × Clear filters
            </button>
          )}

          <span style={{ marginLeft: "auto", color: "var(--on-surface-variant)", fontSize: "13px", whiteSpace: "nowrap" }}>
            {loadingIssues ? "Loading…" : `Showing ${issues.length} issue${issues.length !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* ISSUES LIST */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {issues.length === 0 && !loadingIssues && (
            <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--on-surface-variant)" }}>
              <div style={{ fontSize: "52px", marginBottom: "16px" }}>🎉</div>
              <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px", color: "var(--on-surface)" }}>
                {filterSev || filterTool || filterFile
                  ? "No issues match your filters"
                  : "Clean code! No issues found in scanned files"}
              </h3>
              <p style={{ fontSize: "14px", lineHeight: 1.65, maxWidth: "400px", margin: "0 auto" }}>
                {filterSev || filterTool || filterFile
                  ? "Try clearing the filters to see all findings."
                  : "The analyzer scanned all fetched Python files and found nothing to flag. " +
                    "This is common for well-maintained projects or if the repo has very few Python files."}
              </p>
              {(filterSev || filterTool || filterFile) && (
                <button
                  onClick={() => { setFilterSev(""); setFilterTool(""); setFilterFile(""); }}
                  style={{
                    marginTop: "16px", background: "var(--primary)", border: "none", color: "#1a0055",
                    padding: "8px 20px", borderRadius: "8px", fontWeight: 600, cursor: "pointer", fontSize: "13px",
                  }}
                >Clear Filters</button>
              )}
            </div>
          )}

          {issues.map((issue, idx) => (
            <div key={issue.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(idx * 0.02, 0.5)}s`, opacity: 0 }}>
              {/* Issue row */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                onKeyDown={(e) => e.key === "Enter" && setExpandedId(expandedId === issue.id ? null : issue.id)}
                style={{
                  background: expandedId === issue.id ? "var(--surface-high)" : "var(--surface-container)",
                  borderRadius: expandedId === issue.id ? "12px 12px 0 0" : "12px",
                  padding: "16px 20px",
                  display: "flex", alignItems: "center", gap: "16px",
                  cursor: "pointer",
                  transition: "background 0.2s",
                  flexWrap: "wrap",
                }}
              >
                <SeverityBadge severity={issue.severity} />
                <CategoryIcon category={issue.category} />
                <span className="tool-badge">{issue.tool}</span>
                <code style={{
                  fontSize: "12px", color: "var(--secondary)",
                  fontFamily: "'JetBrains Mono', monospace",
                  background: "rgba(83,221,252,0.06)",
                  padding: "2px 8px", borderRadius: "4px",
                  maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {issue.file_path}{issue.line_number ? `:${issue.line_number}` : ""}
                </code>
                <p style={{ flex: 1, fontSize: "13px", color: "var(--on-surface-variant)", minWidth: "160px" }}>
                  {issue.message}
                </p>
                {issue.rule_id && (
                  <code style={{ fontSize: "11px", color: "var(--outline)", fontFamily: "monospace" }}>
                    {issue.rule_id}
                  </code>
                )}
                <span style={{
                  fontSize: "12px", color: "var(--primary)", fontWeight: 500, whiteSpace: "nowrap",
                  transition: "transform 0.2s",
                  transform: expandedId === issue.id ? "rotate(90deg)" : "none",
                }}>›</span>
              </div>

              {/* Expanded detail */}
              {expandedId === issue.id && (
                <div style={{ borderRadius: "0 0 12px 12px", overflow: "hidden" }}>
                  <IssueDetailPanel issue={issue} scanId={scan.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
