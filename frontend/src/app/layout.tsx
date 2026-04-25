import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import { AuthNav } from "@/components/AuthNav";
import { ToastProvider } from "@/components/ToastProvider";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";

export const metadata: Metadata = {
  title: {
    default: "AI Repository Analyzer — Universal Security & Code Quality Scanner",
    template: "%s | AI Repository Analyzer",
  },
  description:
    "Analyze any public GitHub repository for security vulnerabilities, code quality issues, and dependency CVEs across Python, Go, TypeScript, Ruby, PHP, Java, Docker, and shell scripts — with AI-powered explanations.",
  keywords: [
    "code analysis", "security scanner", "GitHub", "static analysis",
    "Python", "Go", "TypeScript", "Docker", "shell", "bandit", "pylint",
    "flake8", "hadolint", "shellcheck", "CVE", "AI", "code review",
    "vulnerability", "open source", "static analysis platform",
  ],
  authors: [{ name: "AI Repository Analyzer" }],
  openGraph: {
    title: "AI Repository Analyzer",
    description: "Universal security & code quality scanner across 10+ languages — paste a GitHub URL, get instant AI-powered results.",
    type: "website",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080810",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Anti-flash: apply saved theme before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`,
          }}
        />
      </head>
      <body>
        <ToastProvider>
          <SessionProvider>
            <AuthNav />
            <KeyboardShortcutsModal />
            {children}
          </SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
