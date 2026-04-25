"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadHistory, clearHistory, type HistoryEntry } from "@/lib/mock";

// ─── Helper to delete a single entry ──────────────────────────────────────────
function deleteEntry(scanId: number) {
  try {
    const raw = localStorage.getItem("ai-repo-analyzer:history");
    const entries: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    const updated = entries.filter((e) => e.scanId !== scanId);
    localStorage.setItem("ai-repo-analyzer:history", JSON.stringify(updated));
  } catch { /* ignore */ }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBar({ high, total }: { high: number; total: number }) {
  const pct = total > 0 ? (high / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ flex: 1, height: "4px", borderRadius: "999px", background: "var(--surface-high)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: "999px",
          background: high > 0 ? "var(--error)" : "#34d399",
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ fontSize: "11px", color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
        {high} critical
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; border: string; label: string }> = {
    completed: { bg: "rgba(52,211,153,0.08)",  color: "#34d399",         border: "rgba(52,211,153,0.25)",  label: "Completed" },
    running:   { bg: "rgba(189,157,255,0.08)", color: "var(--primary)",  border: "rgba(189,157,255,0.25)", label: "Running"   },
    pending:   { bg: "rgba(251,191,36,0.08)",  color: "#fbbf24",         border: "rgba(251,191,36,0.25)",  label: "Pending"   },
    failed:    { bg: "rgba(255,110,132,0.08)", color: "var(--error)",    border: "rgba(255,110,132,0.25)", label: "Failed"    },
  };
  const s = styles[status] || styles.completed;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: "999px", padding: "3px 10px", fontSize: "11px", fontWeight: 600,
    }}>
      {s.label}
    </span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const label =
    mins < 1   ? "just now"
    : mins < 60 ? `${mins}m ago`
    : hrs  < 24 ? `${hrs}h ago`
    : days < 7  ? `${days}d ago`
    : new Date(iso).toLocaleDateString();
  return <span>{label}</span>;
}

function EmptyState() {
  return (
    <div style={{
      textAlign: "center", padding: "80px 24px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
    }}>
      <div style={{ fontSize: "56px" }}>📭</div>
      <h2 style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em" }}>No scan history yet</h2>
      <p style={{ color: "var(--on-surface-variant)", maxWidth: "380px", lineHeight: 1.65, fontSize: "14px" }}>
        Your past scans will appear here after you analyze a repository.
        Scan history is stored locally in your browser.
      </p>
      <Link href="/" className="gradient-btn" style={{
        padding: "12px 28px", borderRadius: "10px", fontSize: "14px",
        display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none",
        marginTop: "8px",
      }}>
        ← Analyze a repository
      </Link>
    </div>
  );
}

// ─── Clear All Confirmation Modal ─────────────────────────────────────────────
function ClearAllModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div className="glass-card animate-fade-in" style={{
        maxWidth: "400px", width: "100%", padding: "36px 32px", textAlign: "center",
        boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
        border: "1px solid rgba(255,110,132,0.3)",
      }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🗑️</div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "12px", color: "var(--error)" }}>
          Clear All History?
        </h2>
        <p style={{ color: "var(--on-surface-variant)", fontSize: "14px", lineHeight: 1.65, marginBottom: "28px" }}>
          This will permanently delete all scan history stored in your browser.
          This action <strong style={{ color: "var(--on-surface)" }}>cannot be undone</strong>.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 24px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
              background: "var(--surface-container)", border: "1px solid rgba(71,71,84,0.4)",
              color: "var(--on-surface-variant)", cursor: "pointer", transition: "all 0.2s",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "10px 24px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
              background: "rgba(255,110,132,0.15)", border: "1px solid rgba(255,110,132,0.4)",
              color: "var(--error)", cursor: "pointer", transition: "all 0.2s",
            }}
          >
            🗑 Yes, Clear All
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const [entries, setEntries]       = useState<HistoryEntry[]>([]);
  const [showModal, setShowModal]   = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cleared, setCleared]       = useState(false);

  useEffect(() => { setEntries(loadHistory()); }, []);

  function handleClearAll() {
    clearHistory();
    setEntries([]);
    setShowModal(false);
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  }

  function handleDeleteOne(scanId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    deleteEntry(scanId);
    setEntries((prev) => prev.filter((en) => en.scanId !== scanId));
  }

  const filtered = entries.filter((e) =>
    e.repoName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.repoUrl.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--surface)", position: "relative" }}>
      {/* Background glow */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "var(--grad-glow-tl)", zIndex: 0 }} />

      {/* NAV */}
      <nav className="glass-nav" style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: "64px",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <span className="gradient-text" style={{ fontWeight: 700, fontSize: "18px", letterSpacing: "-0.02em" }}>
            AI Repository Analyzer
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px" }}>
          <Link href="/" style={{ color: "var(--on-surface-variant)", textDecoration: "none" }}>Home</Link>
          <span style={{ color: "var(--outline)" }}>›</span>
          <span style={{ color: "var(--on-surface)", fontWeight: 500 }}>Scan History</span>
        </div>
      </nav>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 24px", position: "relative", zIndex: 1 }}>

        {/* Page header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: "32px", gap: "16px", flexWrap: "wrap",
        }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "6px" }}>
              Scan History
            </h1>
            <p style={{ color: "var(--on-surface-variant)", fontSize: "14px" }}>
              {entries.length} scan{entries.length !== 1 ? "s" : ""} stored locally in this browser
            </p>
          </div>

          {entries.length > 0 && (
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {/* Search */}
              <input
                className="aether-input"
                placeholder="Search repos…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: "200px", padding: "8px 14px", fontSize: "13px" }}
              />
              {/* Clear All button */}
              <button
                onClick={() => setShowModal(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "rgba(255,110,132,0.08)",
                  border: "1px solid rgba(255,110,132,0.3)",
                  color: "var(--error)",
                  padding: "8px 16px", borderRadius: "10px", fontSize: "13px",
                  fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,110,132,0.15)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,110,132,0.5)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,110,132,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,110,132,0.3)";
                }}
              >
                🗑️ Clear History
              </button>
            </div>
          )}
        </div>

        {/* Success toast */}
        {cleared && (
          <div className="animate-fade-in" style={{
            marginBottom: "20px", padding: "14px 20px",
            background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)",
            borderRadius: "12px", color: "#34d399", fontSize: "14px", fontWeight: 500,
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            ✓ History cleared successfully.
          </div>
        )}

        {/* Content */}
        {entries.length === 0 ? (
          <div className="glass-card"><EmptyState /></div>
        ) : filtered.length === 0 ? (
          <div className="glass-card" style={{ padding: "60px", textAlign: "center" }}>
            <p style={{ color: "var(--on-surface-variant)" }}>No scans match &ldquo;{searchTerm}&rdquo;</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map((entry, i) => (
              <div key={entry.scanId} style={{ position: "relative" }}>
                <Link href={`/scan/${entry.scanId}`} style={{ textDecoration: "none" }}>
                  <div
                    className="glass-card animate-fade-in"
                    style={{
                      padding: "20px 24px",
                      animationDelay: `${i * 0.04}s`, opacity: 0,
                      display: "flex", alignItems: "center", gap: "20px",
                      cursor: "pointer", transition: "border-color 0.2s, transform 0.15s",
                      flexWrap: "wrap",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(189,157,255,0.3)";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateX(4px)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor = "";
                      (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
                    }}
                  >
                    {/* Repo icon */}
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
                      background: "rgba(189,157,255,0.08)", border: "1px solid rgba(189,157,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                    }}>
                      {entry.isMock ? "🎭" : "📁"}
                    </div>

                    {/* Repo info */}
                    <div style={{ flex: 1, minWidth: "200px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{entry.repoName}</span>
                        <StatusBadge status={entry.status} />
                        {entry.isMock && (
                          <span style={{
                            fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                            background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)",
                            color: "#fbbf24", borderRadius: "999px", letterSpacing: "0.04em",
                          }}>DEMO</span>
                        )}
                      </div>
                      <code style={{ fontSize: "11px", color: "var(--outline)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {entry.repoUrl}
                      </code>
                      <div style={{ marginTop: "10px" }}>
                        <SeverityBar high={entry.highCount} total={entry.issueCount} />
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: "flex", gap: "24px", flexShrink: 0, flexWrap: "wrap" }}>
                      <div style={{ textAlign: "center", minWidth: "50px" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--primary)" }}>{entry.issueCount}</div>
                        <div style={{ fontSize: "10px", color: "var(--on-surface-variant)", letterSpacing: "0.04em" }}>ISSUES</div>
                      </div>
                      <div style={{ textAlign: "center", minWidth: "50px" }}>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--error)" }}>{entry.highCount}</div>
                        <div style={{ fontSize: "10px", color: "var(--on-surface-variant)", letterSpacing: "0.04em" }}>HIGH</div>
                      </div>
                    </div>

                    {/* Time */}
                    <div style={{ fontSize: "12px", color: "var(--outline)", flexShrink: 0 }}>
                      <RelativeTime iso={entry.scannedAt} />
                    </div>

                    {/* Arrow */}
                    <span style={{ color: "var(--primary)", fontSize: "18px", flexShrink: 0 }}>›</span>
                  </div>
                </Link>

                {/* Per-row delete button — overlaps top-right corner */}
                <button
                  onClick={(e) => handleDeleteOne(entry.scanId, e)}
                  title="Remove this entry"
                  aria-label={`Remove ${entry.repoName} from history`}
                  style={{
                    position: "absolute", top: "10px", right: "10px",
                    background: "rgba(255,110,132,0.0)", border: "1px solid transparent",
                    borderRadius: "6px", color: "var(--outline)",
                    width: "24px", height: "24px", fontSize: "13px",
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    zIndex: 2,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,110,132,0.15)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,110,132,0.4)";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--error)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,110,132,0.0)";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color = "var(--outline)";
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        {entries.length > 0 && (
          <p style={{ textAlign: "center", marginTop: "32px", fontSize: "12px", color: "var(--outline)" }}>
            Scan history is stored in your browser&apos;s localStorage. It is not synced across devices.
          </p>
        )}
      </div>

      {/* Clear All Modal */}
      {showModal && (
        <ClearAllModal
          onConfirm={handleClearAll}
          onCancel={() => setShowModal(false)}
        />
      )}
    </main>
  );
}
