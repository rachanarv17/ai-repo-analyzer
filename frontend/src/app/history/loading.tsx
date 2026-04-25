export default function Loading() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--surface)" }}>
      {/* Skeleton Nav */}
      <div style={{
        height: "64px", borderBottom: "1px solid rgba(78,76,100,0.18)",
        display: "flex", alignItems: "center", padding: "0 40px", gap: "16px",
        background: "var(--nav-bg)",
      }}>
        <div className="shimmer" style={{ width: 160, height: 20, borderRadius: 6 }} />
        <div style={{ flex: 1 }} />
        <div className="shimmer" style={{ width: 80, height: 32, borderRadius: 8 }} />
        <div className="shimmer" style={{ width: 80, height: 32, borderRadius: 8 }} />
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page title skeleton */}
        <div className="shimmer" style={{ width: 220, height: 32, borderRadius: 8, marginBottom: 12 }} />
        <div className="shimmer" style={{ width: 160, height: 16, borderRadius: 6, marginBottom: 36 }} />

        {/* Cards */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            borderRadius: 16, border: "1px solid rgba(78,76,100,0.18)",
            padding: "20px 24px", marginBottom: 10,
            display: "flex", alignItems: "center", gap: 20,
            background: "var(--surface-container)",
          }}>
            <div className="shimmer" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="shimmer" style={{ width: "40%", height: 16, borderRadius: 6, marginBottom: 8 }} />
              <div className="shimmer" style={{ width: "70%", height: 12, borderRadius: 6, marginBottom: 10 }} />
              <div className="shimmer" style={{ width: "100%", height: 4, borderRadius: 999 }} />
            </div>
            <div className="shimmer" style={{ width: 50, height: 40, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
