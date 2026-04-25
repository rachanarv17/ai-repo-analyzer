"use client";

import { useEffect, useState } from "react";

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  { category: "Navigation",  keys: ["j", "↓"], description: "Next issue" },
  { category: "Navigation",  keys: ["k", "↑"], description: "Previous issue" },
  { category: "Navigation",  keys: ["Esc"],     description: "Close expanded issue / modal" },
  { category: "Actions",     keys: ["r"],        description: "Rescan repository" },
  { category: "Actions",     keys: ["/"],        description: "Focus search / filter" },
  { category: "Export",      keys: ["Ctrl", "Shift", "J"], description: "Export as JSON" },
  { category: "Export",      keys: ["Ctrl", "Shift", "M"], description: "Export as Markdown" },
  { category: "Navigation",  keys: ["H"],        description: "Go to History" },
  { category: "Navigation",  keys: ["?"],        description: "Toggle this shortcuts panel" },
];

export function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category))];

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        className="glass-card animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "480px", width: "100%", padding: "32px",
          boxShadow: "0 40px 100px rgba(0,0,0,0.5)",
          border: "1px solid rgba(196,167,255,0.2)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "4px" }}>Keyboard Shortcuts</h2>
            <p style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>Press <Kbd>?</Kbd> to toggle · <Kbd>Esc</Kbd> to close</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "var(--outline)", cursor: "pointer", fontSize: "20px", padding: "4px 8px" }}
          >✕</button>
        </div>

        {/* Shortcuts grouped by category */}
        {categories.map((cat) => (
          <div key={cat} style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--primary)", letterSpacing: "0.1em", marginBottom: "10px" }}>
              {cat.toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {SHORTCUTS.filter((s) => s.category === cat).map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", color: "var(--on-surface-variant)" }}>{s.description}</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid rgba(78,76,100,0.2)", textAlign: "center" }}>
          <span style={{ fontSize: "11px", color: "var(--outline)" }}>Click anywhere outside or press Esc to close</span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
      background: "var(--surface-highest)", border: "1px solid rgba(78,76,100,0.5)",
      color: "var(--on-surface)", fontFamily: "'JetBrains Mono', monospace",
      minWidth: "24px", boxShadow: "0 2px 0 rgba(0,0,0,0.3)",
    }}>
      {children}
    </kbd>
  );
}
