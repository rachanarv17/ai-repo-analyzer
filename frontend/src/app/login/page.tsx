"use client"
import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false
    })

    if (res?.error) {
      setError("Invalid email or password")
      setLoading(false)
    } else {
      router.push("/dashboard")
      router.refresh()
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ 
        width: "100%", maxWidth: "400px", 
        background: "rgba(30,30,42,0.6)", backdropFilter: "blur(20px)",
        border: "1px solid rgba(196,167,255,0.15)", borderRadius: "24px",
        padding: "40px 32px"
      }}>
        <h1 style={{ fontSize: "28px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>Sign In</h1>
        <p style={{ color: "var(--on-surface-variant)", textAlign: "center", marginBottom: "32px", fontSize: "15px" }}>Welcome back to AI Analyzer</p>
        
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <input 
              type="email" 
              placeholder="Email address" 
              className="aether-input" 
              value={email} onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="Password" 
              className="aether-input" 
              value={password} onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          {error && <div style={{ color: "var(--error)", fontSize: "14px", padding: "8px", background: "rgba(255,110,132,0.1)", borderRadius: "8px", textAlign: "center" }}>{error}</div>}
          
          <button type="submit" className="gradient-btn" disabled={loading} style={{ padding: "14px", borderRadius: "12px", marginTop: "8px", fontSize: "16px", fontWeight: 600 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ margin: "20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <hr style={{ width: "40%", border: "0", borderTop: "1px solid rgba(196,167,255,0.15)" }} />
          <span style={{ fontSize: "12px", color: "var(--on-surface-variant)" }}>OR</span>
          <hr style={{ width: "40%", border: "0", borderTop: "1px solid rgba(196,167,255,0.15)" }} />
        </div>

        <button 
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          style={{
            width: "100%", padding: "14px", borderRadius: "12px", fontSize: "15px", fontWeight: 600,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--on-surface)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", transition: "all 0.2s"
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
          Continue with GitHub
        </button>

        <p style={{ textAlign: "center", marginTop: "24px", fontSize: "14px", color: "var(--on-surface-variant)" }}>
          Don't have an account? <Link href="/register" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}>Create one</Link>
        </p>
      </div>
    </div>
  )
}
