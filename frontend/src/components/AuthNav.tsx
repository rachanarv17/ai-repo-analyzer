"use client";

/**
 * Floating auth bar — shown on all pages.
 * Hidden on /login and /register so they have a clean full-screen layout.
 */
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        display: "flex", alignItems: "center", gap: "6px",
        background: isDark ? "rgba(196,167,255,0.08)" : "rgba(124,58,237,0.1)",
        border: isDark ? "1px solid rgba(196,167,255,0.2)" : "1px solid rgba(124,58,237,0.25)",
        borderRadius: "10px", padding: "5px 12px", cursor: "pointer",
        color: "var(--on-surface)", fontSize: "13px", fontWeight: 500,
        transition: "all 0.2s ease",
      }}
    >
      <span style={{ fontSize: "16px", lineHeight: 1 }}>{isDark ? "☀️" : "🌙"}</span>
      <span style={{ color: "var(--on-surface-variant)", fontSize: "12px" }}>
        {isDark ? "Light" : "Dark"}
      </span>
    </button>
  );
}

export function AuthNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Don't show on auth pages
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
      height: "56px", display: "flex", alignItems: "center",
      padding: "0 24px", justifyContent: "space-between",
      background: "var(--nav-bg, rgba(13,13,26,0.8))", backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(196,167,255,0.1)",
      transition: "background 0.3s ease",
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <span style={{ fontSize: "20px" }}>🔬</span>
        <span style={{
          fontWeight: 700, fontSize: "15px", letterSpacing: "-0.01em",
          background: "var(--grad-primary, linear-gradient(135deg, #c4a7ff 0%, #5de4fc 100%))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          AI Repo Analyzer
        </span>
      </Link>

      {/* Center links */}
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        {[
          { href: "/", label: "Analyze" },
          { href: "/history", label: "History" },
          { href: "/scan/9999", label: "Demo" },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{
            padding: "6px 14px", borderRadius: "8px", textDecoration: "none",
            fontSize: "13px", fontWeight: 500,
            color: pathname === href ? "var(--primary)" : "var(--on-surface-variant)",
            background: pathname === href ? "rgba(196,167,255,0.1)" : "transparent",
            transition: "all 0.15s",
          }}>
            {label}
          </Link>
        ))}
      </div>

      {/* Right section: Theme toggle + Auth */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Theme Toggle */}
        <ThemeToggle />

        {status === "loading" ? (
          <div style={{ width: "80px", height: "28px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s infinite" }} />
        ) : session ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: "rgba(196,167,255,0.1)", border: "1px solid rgba(196,167,255,0.2)",
                borderRadius: "10px", padding: "5px 12px 5px 6px", cursor: "pointer",
              }}
            >
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: "var(--grad-primary, linear-gradient(135deg, #c4a7ff 0%, #5de4fc 100%))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 700, color: "#12121f", flexShrink: 0,
              }}>
                {session.user?.name?.[0]?.toUpperCase() ?? session.user?.email?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--on-surface)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.user?.name ?? session.user?.email}
              </span>
              <span style={{ fontSize: "10px", color: "var(--outline)" }}>▾</span>
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)",
                background: "var(--surface-container)", borderRadius: "12px",
                border: "1px solid rgba(196,167,255,0.15)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                minWidth: "180px", overflow: "hidden", zIndex: 100,
              }}>
                <Link href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", textDecoration: "none", color: "var(--on-surface)", fontSize: "13px", borderBottom: "1px solid rgba(196,167,255,0.08)" }}>
                  👤 My Dashboard
                </Link>
                <Link href="/history"
                  onClick={() => setMenuOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", textDecoration: "none", color: "var(--on-surface)", fontSize: "13px", borderBottom: "1px solid rgba(196,167,255,0.08)" }}>
                  📋 Scan History
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/login" }); }}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#ff6b6b", fontSize: "13px" }}>
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link href="/login" style={{
              padding: "7px 16px", borderRadius: "9px", textDecoration: "none",
              fontSize: "13px", fontWeight: 600, color: "var(--on-surface-variant)",
              border: "1px solid rgba(196,167,255,0.15)",
            }}>
              Sign In
            </Link>
            <Link href="/register" style={{
              padding: "7px 16px", borderRadius: "9px", textDecoration: "none",
              fontSize: "13px", fontWeight: 600,
              background: "var(--grad-primary, linear-gradient(135deg, #c4a7ff 0%, #5de4fc 100%))",
              color: "#12121f",
            }}>
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
