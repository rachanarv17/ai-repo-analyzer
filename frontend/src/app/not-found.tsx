import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — Page Not Found | AI Repository Analyzer",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--surface)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background glows */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "var(--grad-glow-tl), var(--grad-glow-tr)", zIndex: 0 }} />

      <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: "520px" }}>
        {/* 404 number */}
        <div style={{
          fontSize: "clamp(80px, 20vw, 160px)",
          fontWeight: 900,
          letterSpacing: "-0.06em",
          lineHeight: 0.9,
          background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "8px",
          userSelect: "none",
        }}>
          404
        </div>

        <div style={{ fontSize: "32px", marginBottom: "16px" }}>🔍</div>

        <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "12px", letterSpacing: "-0.02em" }}>
          Page Not Found
        </h1>

        <p style={{
          color: "var(--on-surface-variant)", fontSize: "15px",
          lineHeight: 1.7, marginBottom: "36px",
        }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Maybe the scan ID is wrong, or the server restarted.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "12px 28px", borderRadius: "12px", fontWeight: 700, fontSize: "14px",
            background: "linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)",
            color: "#14003d", textDecoration: "none",
          }}>
            ← Back to Home
          </Link>
          <Link href="/history" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "12px 28px", borderRadius: "12px", fontWeight: 600, fontSize: "14px",
            background: "var(--surface-container)",
            border: "1px solid rgba(196,167,255,0.2)",
            color: "var(--on-surface-variant)", textDecoration: "none",
          }}>
            View History
          </Link>
          <Link href="/scan/9999" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "12px 28px", borderRadius: "12px", fontWeight: 600, fontSize: "14px",
            background: "var(--surface-container)",
            border: "1px solid rgba(93,228,252,0.2)",
            color: "var(--secondary)", textDecoration: "none",
          }}>
            🎭 Try Demo
          </Link>
        </div>
      </div>
    </main>
  );
}
