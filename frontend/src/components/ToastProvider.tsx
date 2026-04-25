"use client";

/**
 * Global Toast Notification System
 * Usage: import { useToast } from "@/components/ToastProvider"
 *        const { toast } = useToast();
 *        toast.success("Scan started!");
 *        toast.error("Something went wrong");
 *        toast.info("Copied to clipboard");
 */
import React, { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: {
    success: (msg: string) => void;
    error:   (msg: string) => void;
    info:    (msg: string) => void;
    warning: (msg: string) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: "rgba(52,211,153,0.12)",  border: "rgba(52,211,153,0.35)",  color: "#34d399", icon: "✓" },
  error:   { bg: "rgba(255,110,132,0.12)", border: "rgba(255,110,132,0.35)", color: "#ff6e84", icon: "✕" },
  info:    { bg: "rgba(93,228,252,0.10)",  border: "rgba(93,228,252,0.30)",  color: "#5de4fc", icon: "ℹ" },
  warning: { bg: "rgba(251,191,36,0.10)",  border: "rgba(251,191,36,0.30)",  color: "#fbbf24", icon: "⚠" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timers.current[id];
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toast = {
    success: (msg: string) => addToast("success", msg),
    error:   (msg: string) => addToast("error", msg),
    info:    (msg: string) => addToast("info", msg),
    warning: (msg: string) => addToast("warning", msg),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div style={{
        position: "fixed", bottom: "24px", right: "24px",
        zIndex: 9999, display: "flex", flexDirection: "column", gap: "10px",
        pointerEvents: "none",
      }}>
        {toasts.map((t) => {
          const s = STYLES[t.type];
          return (
            <div
              key={t.id}
              className="animate-slide-up"
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "14px 18px", borderRadius: "14px",
                background: s.bg, border: `1px solid ${s.border}`,
                backdropFilter: "blur(20px)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                minWidth: "280px", maxWidth: "420px",
                pointerEvents: "auto",
                cursor: "pointer",
              }}
              onClick={() => removeToast(t.id)}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: `${s.color}20`, border: `1px solid ${s.color}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: s.color, fontWeight: 700, fontSize: "14px", flexShrink: 0,
              }}>
                {s.icon}
              </div>
              <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--on-surface)", flex: 1, lineHeight: 1.4 }}>
                {t.message}
              </span>
              <span style={{ fontSize: "12px", color: "var(--outline)", flexShrink: 0 }}>✕</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
