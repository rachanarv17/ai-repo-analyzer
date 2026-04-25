"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { submitScan } from "@/lib/api";
import { MOCK_SCAN_ID, saveToHistory, MOCK_ISSUES, MOCK_SCAN } from "@/lib/mock";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAMPLE_REPOS = [
  { label: "psf/requests",   url: "https://github.com/psf/requests",   desc: "Python HTTP library" },
  { label: "pallets/flask",  url: "https://github.com/pallets/flask",  desc: "Python web framework" },
  { label: "expressjs/express", url: "https://github.com/expressjs/express", desc: "Node.js framework" },
  { label: "microsoft/TypeScript", url: "https://github.com/microsoft/TypeScript", desc: "TypeScript compiler" },
  { label: "gin-gonic/gin",  url: "https://github.com/gin-gonic/gin",  desc: "Go web framework" },
];

const FEATURES = [
  {
    icon: "🔒",
    title: "Security Analysis (Bandit · gosec · brakeman)",
    rules: ["Hardcoded secrets & API keys", "SQL injection (f-string / sprintf)", "eval() & unsafe exec", "pickle / yaml unsafe load (RCE)", "SSL verify=False / InsecureSkipVerify", "subprocess / shell injection", "Weak MD5/SHA1/SHA256 hash", "curl | bash remote execution"],
    color: "#ff6e84",
    glow: "rgba(255,110,132,0.12)",
    border: "rgba(255,110,132,0.2)",
  },
  {
    icon: "⚡",
    title: "Code Quality (Pylint · Flake8 · shellcheck)",
    rules: ["Missing module docstrings", "Bare except clauses", "Wildcard imports (*)", "Functions > 50 lines", "Missing set -e / set -u in shell", "TODO / FIXME in main branch", "Print() in library code", "Dockerfile runs as root (DL3002)"],
    color: "var(--primary)",
    glow: "rgba(196,167,255,0.12)",
    border: "rgba(196,167,255,0.2)",
  },
  {
    icon: "📦",
    title: "Universal File Support",
    rules: ["Python · JavaScript · TypeScript", "Ruby · PHP · Go · Java · Rust · C/C++", "Dockerfile (hadolint rules)", "Shell scripts (.sh, .bash, .zsh)", "YAML / TOML / .env / .ini configs", "Secret detection (AWS keys, tokens)", "Database URL credential leaks", "CORS wildcard & debug-mode checks"],
    color: "var(--secondary)",
    glow: "rgba(93,228,252,0.12)",
    border: "rgba(93,228,252,0.2)",
  },
];

const STATS = [
  { value: "35+",  label: "Security Rules" },
  { value: "15+",  label: "CVEs Detected" },
  { value: "12+",  label: "Languages" },
  { value: "~45s", label: "Time to Results" },
];

const HOW_IT_WORKS = [
  { step: "01", icon: "🔗", title: "Paste a GitHub URL", desc: "Enter any public GitHub repository. No sign-up, no API key — zero friction." },
  { step: "02", icon: "📡", title: "GitHub API Fetch", desc: "We fetch the repo tree and download up to 55 files across Python, JS/TS, Go, Ruby, PHP, Java, Rust, C/C++, Docker, shell, and config files." },
  { step: "03", icon: "🔬", title: "Multi-Engine Analysis", desc: "35+ security rules (bandit, gosec, brakeman-style), 10+ quality checks, 15+ CVE patterns, and universal secret detection run on every file." },
  { step: "04", icon: "🤖", title: "AI-Enriched Report", desc: "Each finding has a line-accurate code snippet, plain-English explanation, actionable fix, and before/after diff. Export as JSON or Markdown." },
];

// ─── Animated counter ─────────────────────────────────────────────────────────

function AnimCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      let start = 0;
      const step = target / 40;
      const timer = setInterval(() => {
        start += step;
        if (start >= target) { setCount(target); clearInterval(timer); }
        else setCount(Math.floor(start));
      }, 25);
    }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

// ─── Typing placeholder ───────────────────────────────────────────────────────

const PLACEHOLDERS = [
  "https://github.com/psf/requests",
  "https://github.com/pallets/flask",
  "https://github.com/django/django",
  "https://github.com/boto/boto3",
];

function useTypingPlaceholder() {
  const [idx, setIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const full = PLACEHOLDERS[idx];
    if (!deleting && displayed.length < full.length) {
      const t = setTimeout(() => setDisplayed(full.slice(0, displayed.length + 1)), 50);
      return () => clearTimeout(t);
    }
    if (!deleting && displayed.length === full.length) {
      const t = setTimeout(() => setDeleting(true), 2000);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length > 0) {
      const t = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 25);
      return () => clearTimeout(t);
    }
    if (deleting && displayed.length === 0) {
      setDeleting(false);
      setIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }
  }, [displayed, deleting, idx]);

  return displayed || "https://github.com/owner/repository";
}

// ─── Live issues ticker ───────────────────────────────────────────────────────

const SAMPLE_FINDINGS = [
  { sev: "HIGH",   file: "auth.py:156",           msg: "Weak cryptographic hash: SHA1" },
  { sev: "HIGH",   file: "config.py:23",           msg: "Possible hardcoded SECRET_KEY" },
  { sev: "HIGH",   file: "views.py:88",            msg: "SQL query built via f-string" },
  { sev: "HIGH",   file: "utils.py:441",           msg: "subprocess call with shell=True" },
  { sev: "MEDIUM", file: "app.py:1601",            msg: "Bare 'except:' catches all exceptions" },
  { sev: "MEDIUM", file: "cli.py:120",             msg: "Function 'run_server' is 80 lines" },
  { sev: "MEDIUM", file: "serializers.py:38",      msg: "Wildcard import 'from models import *'" },
  { sev: "LOW",    file: "requirements.txt:4",     msg: "requests==2.18.0 — CVE-2023-32681 SSRF" },
  { sev: "LOW",    file: "helpers.py:77",          msg: "print() in library code" },
];

function IssueTicker() {
  const [visible, setVisible] = useState<typeof SAMPLE_FINDINGS>([]);

  useEffect(() => {
    let i = 0;
    const add = () => {
      setVisible((v) => [SAMPLE_FINDINGS[i % SAMPLE_FINDINGS.length], ...v].slice(0, 4));
      i++;
    };
    add();
    const t = setInterval(add, 1800);
    return () => clearInterval(t);
  }, []);

  const COLOR: Record<string, string> = { HIGH: "#ff6e84", MEDIUM: "#fbbf24", LOW: "#34d399" };

  return (
    <div style={{
      background: "var(--surface-container)",
      borderRadius: "16px",
      border: "1px solid rgba(78,76,100,0.3)",
      padding: "16px",
      overflow: "hidden",
      minHeight: "180px",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--on-surface-variant)", letterSpacing: "0.06em", marginBottom: "12px" }}>
        🔴 LIVE FINDINGS PREVIEW
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {visible.map((f, i) => (
          <div
            key={`${f.file}-${i}`}
            className="animate-fade-in"
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 12px", borderRadius: "8px",
              background: i === 0 ? "rgba(196,167,255,0.06)" : "transparent",
              transition: "opacity 0.3s",
            }}
          >
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px",
              background: `${COLOR[f.sev]}18`, color: COLOR[f.sev],
              border: `1px solid ${COLOR[f.sev]}44`, flexShrink: 0,
            }}>{f.sev}</span>
            <code style={{ fontSize: "11px", color: "var(--secondary)", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
              {f.file}
            </code>
            <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {f.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main HomePage ────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const placeholder = useTypingPlaceholder();
  const [url, setUrl]         = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: session } = useSession();

  // Recent scans from the server (persisted across restarts)
  const [recentScans, setRecentScans] = useState<Array<{
    id: number; repo: { name: string; url: string }; status: string;
    score?: { grade: string; score: number; color: string } | null;
    stats?: { analyzedFiles: number; totalLines: number } | null;
    created_at: string;
  }>>([]);

  useEffect(() => {
    fetch("/api/scan")
      .then((r) => r.json())
      .then((data: unknown[]) => {
        const completed = (data as typeof recentScans)
          .filter((s) => s.status === "completed" && s.repo)
          .slice(0, 5);
        setRecentScans(completed);
      })
      .catch(() => {}); // silent fail — no scans yet
  }, []);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = url.trim();

    if (!trimmed) {
      setError("Please enter a GitHub repository URL.");
      inputRef.current?.focus();
      return;
    }
    if (!trimmed.startsWith("https://github.com/")) {
      setError("Only public GitHub URLs are supported (https://github.com/owner/repo)");
      return;
    }
    const parts = trimmed.replace("https://github.com/", "").split("/").filter(Boolean);
    if (parts.length < 2) {
      setError("URL must include both owner and repository (e.g. https://github.com/psf/requests)");
      return;
    }

    setLoading(true);
    try {
      const scan = await submitScan(trimmed);
      router.push(`/scan/${scan.id}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: unknown } }; message?: string };
      const msg = axiosErr?.response?.data?.detail || axiosErr?.message || "Failed to start scan.";
      setError(Array.isArray(msg) ? (msg[0] as { msg?: string })?.msg || String(msg) : String(msg));
      setLoading(false);
    }
  }

  function handleDemo() {
    saveToHistory({
      scanId: MOCK_SCAN_ID,
      repoUrl: MOCK_SCAN.repo!.url,
      repoName: MOCK_SCAN.repo!.name,
      status: "completed",
      issueCount: MOCK_ISSUES.length,
      highCount: MOCK_ISSUES.filter((i) => i.severity === "HIGH").length,
      scannedAt: MOCK_SCAN.created_at,
      isMock: true,
    });
    router.push(`/scan/${MOCK_SCAN_ID}`);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface)", position: "relative", overflowX: "hidden" }}>

      {/* Multi-layer background */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "var(--grad-glow-tl), var(--grad-glow-tr), var(--grad-glow-br)" }} />

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <nav className="glass-nav" style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: "64px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: 28, height: 28, borderRadius: "8px", background: "var(--grad-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
            🔬
          </div>
          <span className="gradient-text" style={{ fontWeight: 800, fontSize: "17px", letterSpacing: "-0.03em" }}>
            AI Repository Analyzer
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px", fontSize: "11px",
            fontWeight: 600, color: "var(--success)", marginRight: "8px",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", display: "inline-block" }}
              className="animate-pulse-glow" />
            Live Analysis
          </div>

          <Link href="/history" style={{
            color: "var(--on-surface-variant)", textDecoration: "none",
            fontSize: "13px", fontWeight: 500, padding: "6px 12px",
            borderRadius: "8px", transition: "color 0.2s, background 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.background = "rgba(196,167,255,0.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--on-surface-variant)"; e.currentTarget.style.background = "transparent"; }}
          >
            History
          </Link>

          <button onClick={handleDemo} style={{
            background: "rgba(196,167,255,0.08)", border: "1px solid rgba(196,167,255,0.22)",
            color: "var(--primary)", padding: "7px 16px", borderRadius: "9px",
            fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,167,255,0.14)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,167,255,0.08)"; }}
          >
            View Demo
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section style={{
        position: "relative", zIndex: 1,
        maxWidth: "1200px", margin: "0 auto",
        padding: "80px 32px 64px",
        display: "grid",
        gridTemplateColumns: "1fr 420px",
        gap: "64px",
        alignItems: "center",
      }}>
        {/* Left: headline + form */}
        <div className="animate-slide-up">
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            background: "rgba(196,167,255,0.08)", border: "1px solid rgba(196,167,255,0.22)",
            borderRadius: "999px", padding: "6px 16px 6px 10px",
            fontSize: "12px", color: "var(--primary)", fontWeight: 600,
            marginBottom: "28px", letterSpacing: "0.03em",
          }}>
            <span style={{
              background: "var(--grad-primary)", borderRadius: "999px",
              padding: "2px 8px", fontSize: "10px", color: "#14003d", fontWeight: 700,
            }}>PRO</span>
            Persistent Scans · Unlimited History · Free Dashboard
          </div>

          <h1 style={{
            fontSize: "clamp(40px, 5.5vw, 72px)",
            fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.03,
            marginBottom: "24px",
          }}>
            <span className="gradient-text">AI-Powered</span>
            <br />
            <span style={{ color: "var(--on-surface)" }}>Code Security</span>
            <br />
            <span style={{ color: "var(--on-surface)" }}>Analyzer</span>
          </h1>

          <p style={{
            fontSize: "18px", color: "var(--on-surface-variant)",
            lineHeight: 1.7, marginBottom: "40px", maxWidth: "520px",
          }}>
            Paste any public GitHub repository URL — Python, TypeScript, JavaScript,
            Go, Ruby, PHP, Java, Rust, C/C++, Dockerfile, shell scripts, or config files.
            Get instant security vulnerabilities, quality issues, and CVE checks —
            each with line-accurate code and AI-powered explanations.
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "600px" }}>
            <div style={{ position: "relative" }}>
              {/* GitHub icon */}
              <svg style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)", opacity: 0.4, zIndex: 1 }}
                width="20" height="20" viewBox="0 0 24 24" fill="var(--on-surface)">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <input
                id="repo-url-input"
                ref={inputRef}
                className="aether-input"
                type="url"
                placeholder={placeholder}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(""); }}
                style={{ paddingLeft: "48px", fontSize: "15px", height: "52px" }}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: "8px",
                background: "rgba(255,110,132,0.08)", border: "1px solid rgba(255,110,132,0.25)",
                borderRadius: "10px", padding: "12px 16px", color: "var(--error)", fontSize: "13px", lineHeight: 1.5,
              }}>
                <span style={{ flexShrink: 0 }}>⚠</span> {error}
              </div>
            )}

            <button
              id="analyze-btn"
              type="submit"
              className="gradient-btn"
              style={{ padding: "15px 36px", borderRadius: "12px", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", height: "52px" }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ borderColor: "rgba(20,0,61,0.2)", borderTopColor: "#14003d", width: 20, height: 20 }} />
                  Starting analysis…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  Analyze Repository
                </>
              )}
            </button>

            {/* Auth CTA beneath Analyze Button */}
            {!session && (
              <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
                <Link href="/register" style={{
                  padding: "10px 24px", borderRadius: "10px", fontWeight: 600, fontSize: "14px",
                  background: "rgba(196,167,255,0.1)", color: "var(--primary)", border: "1px solid rgba(196,167,255,0.2)",
                  textDecoration: "none", transition: "all 0.2s"
                }}>
                  Create Free Account
                </Link>
                <Link href="/login" style={{
                  fontSize: "14px", color: "var(--on-surface-variant)", textDecoration: "underline", textUnderlineOffset: "4px"
                }}>
                  Sign In to save scans
                </Link>
              </div>
            )}
            {session && (
              <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
                <Link href="/dashboard" style={{
                  padding: "10px 24px", borderRadius: "10px", fontWeight: 600, fontSize: "14px",
                  background: "rgba(93,228,252,0.1)", color: "var(--secondary)", border: "1px solid rgba(93,228,252,0.2)",
                  textDecoration: "none", transition: "all 0.2s"
                }}>
                  Go to Dashboard →
                </Link>
                <span style={{ fontSize: "13px", color: "var(--on-surface-variant)" }}>
                  Signed in as <strong>{session.user?.name || session.user?.email}</strong>
                </span>
              </div>
            )}

            {/* Example repos */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--outline)", flexShrink: 0 }}>Try:</span>
              {EXAMPLE_REPOS.map((r) => (
                <button
                  key={r.url}
                  type="button"
                  onClick={() => { setUrl(r.url); setError(""); inputRef.current?.focus(); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--secondary)", fontSize: "12px", fontWeight: 500,
                    padding: "0", textDecoration: "underline",
                    textDecorationStyle: "dotted", textUnderlineOffset: "3px",
                    transition: "color 0.15s",
                  }}
                  title={r.desc}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Recent Scans */}
            {recentScans.length > 0 && (
              <div className="animate-fade-in" style={{ marginTop: "24px" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--on-surface-variant)", letterSpacing: "0.04em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--on-surface-variant)" }} />
                  RECENT SCANS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {recentScans.map((scan) => (
                    <Link key={scan.id} href={`/scan/${scan.id}`} style={{
                      textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px",
                      background: "rgba(196,167,255,0.06)", border: "1px solid rgba(196,167,255,0.15)",
                      padding: "6px 12px", borderRadius: "8px", transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,167,255,0.12)"; e.currentTarget.style.borderColor = "var(--primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(196,167,255,0.06)"; e.currentTarget.style.borderColor = "rgba(196,167,255,0.15)"; }}
                    >
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                        background: scan.score ? `${scan.score.color}22` : "rgba(71,71,84,0.3)",
                        color: scan.score ? scan.score.color : "var(--on-surface-variant)"
                      }}>
                        {scan.score ? scan.score.grade : "-"}
                      </span>
                      <span style={{ fontSize: "13px", color: "var(--on-surface-variant)", fontWeight: 500 }}>
                        {scan.repo.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}


            <p style={{ fontSize: "12px", color: "var(--outline-variant)", lineHeight: 1.5 }}>
              🐍 <strong style={{ color: "var(--outline)" }}>Python</strong> &nbsp;·&nbsp;
              🔷 <strong style={{ color: "var(--outline)" }}>TypeScript</strong> &nbsp;·&nbsp;
              🟡 <strong style={{ color: "var(--outline)" }}>JavaScript</strong> &nbsp;·&nbsp;
              🔵 <strong style={{ color: "var(--outline)" }}>Go</strong> &nbsp;·&nbsp;
              🐳 <strong style={{ color: "var(--outline)" }}>Docker</strong> &nbsp;·&nbsp;
              🖥 <strong style={{ color: "var(--outline)" }}>Shell</strong> &nbsp;·&nbsp;
              <strong style={{ color: "var(--outline)" }}>Ruby, PHP, Java</strong> — public GitHub repos only.
              Fetches up to 55 source + config files. Typical scan: 30–90 seconds.{" "}
              <button onClick={handleDemo} style={{ background: "none", border: "none", color: "var(--secondary)", cursor: "pointer", fontSize: "12px", textDecoration: "underline", padding: 0 }}>View demo report</button>.
            </p>
          </form>
        </div>

        {/* Right: live ticker */}
        <div className="animate-fade-in hide-mobile" style={{ animationDelay: "0.3s", opacity: 0 }}>
          <div style={{
            background: "var(--surface-low)", borderRadius: "20px",
            border: "1px solid rgba(78,76,100,0.35)", padding: "24px",
            boxShadow: "0 40px 80px rgba(138,58,237,0.08)",
          }}>
            {/* Fake terminal header */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                {["#ff5f57","#ffbd2e","#28c840"].map((c) => (
                  <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c, opacity: 0.7 }} />
                ))}
              </div>
              <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", fontFamily: "'JetBrains Mono', monospace", marginLeft: "8px" }}>
                analysis-engine.ts
              </span>
            </div>

            {/* Donut preview */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="48" fill="none" stroke="var(--surface-container)" strokeWidth="14" />
                <circle cx="60" cy="60" r="48" fill="none" stroke="#ff6e84" strokeWidth="14"
                  strokeDasharray="50 252" strokeDashoffset="0" transform="rotate(-90 60 60)" />
                <circle cx="60" cy="60" r="48" fill="none" stroke="#fbbf24" strokeWidth="14"
                  strokeDasharray="60 252" strokeDashoffset="-50" transform="rotate(-90 60 60)" />
                <circle cx="60" cy="60" r="48" fill="none" stroke="#34d399" strokeWidth="14"
                  strokeDasharray="142 252" strokeDashoffset="-110" transform="rotate(-90 60 60)" />
                <text x="60" y="57" textAnchor="middle" fill="var(--on-surface)" fontSize="16" fontWeight="700">80</text>
                <text x="60" y="72" textAnchor="middle" fill="var(--on-surface-variant)" fontSize="10">issues</text>
              </svg>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "8px", marginLeft: "16px" }}>
                {[["#ff6e84","HIGH","12"],["#fbbf24","MEDIUM","19"],["#34d399","LOW","49"]].map(([c,l,n]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "2px", background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "var(--on-surface-variant)", minWidth: "50px" }}>{l}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: c }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <IssueTicker />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ───────────────────────────────────────────────────── */}
      <section style={{ position: "relative", zIndex: 1, borderTop: "1px solid rgba(78,76,100,0.15)", borderBottom: "1px solid rgba(78,76,100,0.15)", padding: "28px 24px", background: "rgba(16,16,30,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "64px", flexWrap: "wrap", maxWidth: "800px", margin: "0 auto" }}>
          {STATS.map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div className="gradient-text" style={{ fontSize: "30px", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: "11px", color: "var(--on-surface-variant)", marginTop: "6px", letterSpacing: "0.06em", fontWeight: 500 }}>
                {s.label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "80px 32px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, marginBottom: "12px" }}>
            How it <span className="gradient-text">works</span>
          </h2>
          <p style={{ color: "var(--on-surface-variant)", fontSize: "16px" }}>
            Zero install. Zero config. Just paste a URL and go.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0" }}>
          {HOW_IT_WORKS.map((step, i) => (
            <div key={step.step} style={{ position: "relative" }}>
              {/* Connector line */}
              {i < HOW_IT_WORKS.length - 1 && (
                <div style={{
                  position: "absolute", top: "32px", right: "0", left: "50%",
                  height: "1px",
                  background: "linear-gradient(90deg, rgba(196,167,255,0.4) 0%, rgba(93,228,252,0.1) 100%)",
                  zIndex: 0,
                }} />
              )}
              <div className="animate-fade-in" style={{ animationDelay: `${i * 0.12}s`, opacity: 0, padding: "0 24px 0 0", position: "relative", zIndex: 1 }}>
                {/* Step circle */}
                <div style={{
                  width: 56, height: 56, borderRadius: "50%",
                  background: "var(--surface-container)",
                  border: "2px solid rgba(196,167,255,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "22px", marginBottom: "20px",
                  boxShadow: "0 0 0 4px rgba(196,167,255,0.05)",
                }}>
                  {step.icon}
                </div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)", letterSpacing: "0.08em", marginBottom: "6px" }}>
                  STEP {step.step}
                </div>
                <h3 style={{ fontSize: "15px", fontWeight: 700, marginBottom: "8px", letterSpacing: "-0.01em" }}>
                  {step.title}
                </h3>
                <p style={{ color: "var(--on-surface-variant)", fontSize: "13px", lineHeight: 1.65 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURE CARDS ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 32px 80px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 800, marginBottom: "12px" }}>
            What we <span className="gradient-text">detect</span>
          </h2>
          <p style={{ color: "var(--on-surface-variant)", fontSize: "16px" }}>
            Comprehensive analysis across security, quality, and dependencies
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="glass-card animate-fade-in"
              style={{
                padding: "32px", animationDelay: `${i * 0.12}s`, opacity: 0,
                border: `1px solid ${f.border}`,
                transition: "transform 0.25s, box-shadow 0.25s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = `0 20px 60px ${f.glow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: "14px",
                background: f.glow, border: `1px solid ${f.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "26px", marginBottom: "20px",
              }}>
                {f.icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: "17px", marginBottom: "20px", letterSpacing: "-0.01em" }}>{f.title}</h3>
              <ul style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {f.rules.map((rule) => (
                  <li key={rule} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--on-surface-variant)" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA SECTION ──────────────────────────────────────────────────── */}
      <section style={{ maxWidth: "780px", margin: "0 auto", padding: "0 32px 100px", position: "relative", zIndex: 1 }}>
        <div className="glass-card" style={{ padding: "56px 48px", textAlign: "center", border: "1px solid rgba(196,167,255,0.18)", background: "linear-gradient(145deg, rgba(28,24,48,0.95) 0%, rgba(16,14,32,0.95) 100%)" }}>
          {/* Glow orb */}
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "400px", height: "200px", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(138,58,237,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />

          <div style={{ fontSize: "48px", marginBottom: "20px" }} className="animate-float">🔬</div>
          <h2 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "14px" }}>
            Ready to analyze your code?
          </h2>
          <p style={{ color: "var(--on-surface-variant)", lineHeight: 1.7, marginBottom: "32px", fontSize: "16px", maxWidth: "480px", margin: "0 auto 32px" }}>
            Completely free, no sign-up, no installation. Works on any public GitHub repository —
            Python, JavaScript, Go, Docker, shell scripts, and more — in under a minute.
          </p>
          <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => inputRef.current?.focus(), 600); }}
              className="gradient-btn"
              style={{ padding: "14px 32px", borderRadius: "12px", fontSize: "15px", fontWeight: 700 }}
            >
              Start Scanning →
            </button>
            <button
              onClick={handleDemo}
              style={{
                padding: "14px 32px", borderRadius: "12px", fontSize: "15px", fontWeight: 600,
                background: "var(--surface-container)", border: "1px solid rgba(78,76,100,0.4)",
                color: "var(--on-surface)", cursor: "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(196,167,255,0.35)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(78,76,100,0.4)"; }}
            >
              View Example Report
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{
        position: "relative", zIndex: 1,
        borderTop: "1px solid rgba(78,76,100,0.18)",
        padding: "24px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "12px",
      }}>
        <span className="gradient-text" style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "-0.02em" }}>
          AI Repository Analyzer
        </span>
        <div style={{ display: "flex", gap: "24px", fontSize: "12px", color: "var(--outline)" }}>
          <span>Python · JS · TS · Go · Ruby · PHP · Java · Docker · Shell · Public GitHub only · No data stored</span>
          <Link href="/history" style={{ color: "var(--outline)", textDecoration: "none" }}>History</Link>
          <Link href="/scan/9999" style={{ color: "var(--outline)", textDecoration: "none" }}>Demo</Link>
        </div>
      </footer>
    </main>
  );
}
