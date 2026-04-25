export default function Loading() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--surface)" }}>
      {/* Nav skeleton */}
      <div style={{
        height: "64px", borderBottom: "1px solid rgba(78,76,100,0.18)",
        display: "flex", alignItems: "center", padding: "0 40px", gap: "16px",
        background: "var(--nav-bg)",
      }}>
        <div className="shimmer" style={{ width: 180, height: 20, borderRadius: 6 }} />
        <div style={{ flex: 1 }} />
        <div className="shimmer" style={{ width: 100, height: 20, borderRadius: 6 }} />
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
        {/* Summary header skeleton */}
        <div style={{
          borderRadius: 18, border: "1px solid rgba(78,76,100,0.18)",
          padding: "40px", marginBottom: 24,
          background: "var(--surface-container)",
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 40,
        }}>
          <div style={{ flex: 1 }}>
            <div className="shimmer" style={{ width: "50%", height: 36, borderRadius: 8, marginBottom: 12 }} />
            <div className="shimmer" style={{ width: "80%", height: 16, borderRadius: 6, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {[80, 70, 60, 60].map((w, i) => (
                <div key={i} className="shimmer" style={{ width: w, height: 28, borderRadius: 6 }} />
              ))}
            </div>
          </div>
          <div className="shimmer" style={{ width: 200, height: 120, borderRadius: 16 }} />
        </div>

        {/* Filter bar skeleton */}
        <div style={{
          borderRadius: 16, border: "1px solid rgba(78,76,100,0.18)",
          padding: "16px 24px", marginBottom: 24,
          background: "var(--surface-container)",
          display: "flex", gap: 16,
        }}>
          {[140, 140, 200].map((w, i) => (
            <div key={i} className="shimmer" style={{ width: w, height: 36, borderRadius: 8 }} />
          ))}
        </div>

        {/* Issue rows skeleton */}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{
            borderRadius: 12, border: "1px solid rgba(78,76,100,0.12)",
            padding: "16px 20px", marginBottom: 8,
            background: "var(--surface-container)",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <div className="shimmer" style={{ width: 52, height: 22, borderRadius: 999 }} />
            <div className="shimmer" style={{ width: 68, height: 22, borderRadius: 999 }} />
            <div className="shimmer" style={{ width: 60, height: 22, borderRadius: 999 }} />
            <div className="shimmer" style={{ width: 120, height: 18, borderRadius: 6 }} />
            <div className="shimmer" style={{ flex: 1, height: 18, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    </main>
  );
}
