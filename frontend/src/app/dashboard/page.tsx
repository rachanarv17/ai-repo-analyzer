"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface ScanSummary {
  id: number;
  repoUrl: string;
  status: string;
  issuesCount: number;
  score?: string;
  createdAt: string;
}

// ─── Simple SVG Sparkline Chart ───────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const width = 160;
  const height = 40;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
      />
    </svg>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [history, setHistory] = useState<ScanSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/login";
    }
    if (status === "authenticated") {
      fetch("/api/user/scans")
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setHistory(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [status]);

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all scan history? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/user/scans", { method: "DELETE" });
      if (res.ok) {
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to clear history", err);
    }
  };

  const totalScans   = history.length;
  const totalIssues  = history.reduce((s, h) => s + (h.issuesCount || 0), 0);
  const successScans = history.filter((h) => h.status === "completed").length;
  
  // Trend data: last 10 scans issues
  const issueTrend = history.slice(0, 10).reverse().map(h => h.issuesCount || 0);

  return (
    <main style={{
      minHeight: "100vh", background: "var(--surface)",
      position: "relative", overflow: "hidden",
    }}>
      {/* Background layer */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "var(--grad-glow-tl), var(--grad-glow-tr)" }} />

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "80px 24px 60px", position: "relative", zIndex: 1 }}>

        {/* ── Profile Header ─────────────────────────────── */}
        <div className="glass-card animate-fade-in" style={{ padding: "40px", marginBottom: "32px", display: "flex", gap: "32px", alignItems: "center" }}>
          {/* Avatar */}
          <div style={{
            width: "80px", height: "80px", borderRadius: "24px", flexShrink: 0,
            background: "var(--grad-primary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "32px", fontWeight: 700, color: "#12121f",
            boxShadow: "0 20px 40px rgba(138,58,237,0.25)",
          }}>
            {session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)", letterSpacing: "0.1em", marginBottom: "6px" }}>
              DEVELOPER ACCOUNT
            </div>
            <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "4px" }}>
              {session?.user?.name ?? "Developer"}
            </h1>
            <p style={{ fontSize: "14px", color: "var(--on-surface-variant)" }}>
              {session?.user?.email}
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px", flexShrink: 0 }}>
            <Link href="/" className="gradient-btn" style={{ padding: "10px 24px", borderRadius: "10px", fontSize: "14px", textDecoration: "none" }}>
              + New Scan
            </Link>
            <button onClick={() => signOut({ callbackUrl: "/login" })} style={{ ...pillBtn, background: "rgba(255,110,132,0.08)", color: "#ff6e84", border: "1px solid rgba(255,110,132,0.2)" }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Dashboard Content Grid ──────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              {[
                { value: totalScans,   label: "Total Scans",  color: "var(--primary)" },
                { value: totalIssues,  label: "Issues Found", color: "#fbbf24" },
                { value: successScans, label: "Completed",    color: "#34d399" },
              ].map(({ value, label, color }) => (
                <div key={label} className="glass-card" style={{ padding: "24px", textAlign: "left" }}>
                  <div style={{ fontSize: "10px", color: "var(--on-surface-variant)", letterSpacing: "0.08em", fontWeight: 700, marginBottom: "8px" }}>
                    {label.toUpperCase()}
                  </div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color, letterSpacing: "-0.02em" }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Scans Table-like list */}
            <div className="glass-card" style={{ padding: "32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em" }}>
                  Recent Scan History
                </h2>
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  {history.length > 0 && (
                    <button 
                      onClick={handleClearHistory}
                      style={{ background: "none", border: "none", color: "#ff6e84", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: "4px 8px", borderRadius: "6px" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,110,132,0.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                    >
                      🗑️ Clear All
                    </button>
                  )}
                  <Link href="/history" style={{ fontSize: "13px", color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
                    View Full History →
                  </Link>
                </div>
              </div>

              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔬</div>
                  <p style={{ color: "var(--on-surface-variant)", fontSize: "14px", marginBottom: "20px" }}>
                    No scans yet. Analyze your first repository!
                  </p>
                  <Link href="/" className="gradient-btn" style={{ padding: "12px 24px", borderRadius: "10px", fontSize: "14px", textDecoration: "none" }}>
                    Start First Scan
                  </Link>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {history.slice(0, 8).map((h) => (
                    <Link key={h.id} href={`/scan/${h.id}`} style={{
                      display: "flex", alignItems: "center", gap: "16px",
                      padding: "16px 20px", borderRadius: "12px",
                      background: "rgba(255,255,255,0.02)", textDecoration: "none",
                      border: "1px solid rgba(196,167,255,0.06)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(196,167,255,0.04)"; e.currentTarget.style.borderColor = "rgba(196,167,255,0.2)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(196,167,255,0.06)"; }}
                    >
                      <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: h.status === "completed" ? "rgba(52,211,153,0.1)" : "rgba(255,110,132,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
                        {h.status === "completed" ? "✅" : "❌"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--on-surface)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {h.repoUrl.replace("https://github.com/", "")}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--outline)" }}>
                          {new Date(h.createdAt).toLocaleDateString()} · {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                        {h.score && (
                          <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "rgba(196,167,255,0.12)", color: "var(--primary)" }}>
                            GRADE {h.score}
                          </span>
                        )}
                        <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", background: "rgba(255,255,255,0.05)", color: "var(--on-surface-variant)" }}>
                          {h.issuesCount} issues
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Analytics & Insights */}
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Issue Trend Chart */}
            <div className="glass-card" style={{ padding: "28px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--primary)", letterSpacing: "0.1em", marginBottom: "16px" }}>
                ISSUE TREND
              </div>
              <div style={{ height: "60px", display: "flex", alignItems: "flex-end", paddingBottom: "10px" }}>
                <Sparkline data={issueTrend} color="var(--primary)" />
              </div>
              <p style={{ fontSize: "12px", color: "var(--on-surface-variant)", lineHeight: 1.5, marginTop: "12px" }}>
                Vulnerability count across your last {issueTrend.length} scans. 
                Keep this line trending down!
              </p>
            </div>

            {/* Quick Actions */}
            <div className="glass-card" style={{ padding: "28px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--secondary)", letterSpacing: "0.1em", marginBottom: "16px" }}>
                QUICK ACTIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Link href="/history" style={actionItem}>
                  <span>📜</span> View Full History
                </Link>
                <Link href="/scan/9999" style={actionItem}>
                  <span>🎭</span> View Demo Report
                </Link>
                <a href="https://github.com" target="_blank" rel="noreferrer" style={actionItem}>
                  <span>🌐</span> Browse GitHub
                </a>
              </div>
            </div>

            {/* Pro Tip */}
            <div style={{
              padding: "24px", borderRadius: "20px",
              background: "linear-gradient(135deg, rgba(138,58,237,0.1) 0%, rgba(93,228,252,0.1) 100%)",
              border: "1px solid rgba(196,167,255,0.15)",
            }}>
              <div style={{ fontSize: "20px", marginBottom: "12px" }}>💡</div>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--on-surface)", marginBottom: "6px" }}>Pro Tip</div>
              <p style={{ fontSize: "12px", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                You can press <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: "4px" }}>?</kbd> anywhere 
                to see all keyboard shortcuts.
              </p>
            </div>

          </div>

        </div>
      </div>
    </main>
  );
}

const pillBtn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: "10px", border: "none",
  fontWeight: 600, fontSize: "13px", cursor: "pointer", textDecoration: "none",
  display: "inline-flex", alignItems: "center", gap: "6px",
};

const actionItem: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "12px",
  padding: "12px 16px", borderRadius: "12px",
  background: "rgba(255,255,255,0.03)", color: "var(--on-surface-variant)",
  fontSize: "13px", fontWeight: 500, textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.04)", transition: "all 0.15s",
};
