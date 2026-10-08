"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

const ToastContext = React.createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const push = React.useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4500);
  }, []);
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert };
  const tones = {
    success: "border-l-ok",
    error: "border-l-bad",
    info: "border-l-brand-600",
    warning: "border-l-saffron",
  };
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              className={cn("pointer-events-auto flex gap-3 rounded-md border border-line border-l-4 bg-white px-3.5 py-3 shadow-lg", tones[t.tone])}
              role="status"
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "error" ? "text-bad" : t.tone === "success" ? "text-ok" : t.tone === "warning" ? "text-warn" : "text-brand-600")} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{t.title}</p>
                {t.message && <p className="mt-0.5 text-[12.5px] text-muted">{t.message}</p>}
              </div>
              <button
                className="text-subtle hover:text-ink"
                onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return {
    success: (title: string, message?: string) => ctx.push({ tone: "success", title, message }),
    error: (title: string, message?: string) => ctx.push({ tone: "error", title, message }),
    info: (title: string, message?: string) => ctx.push({ tone: "info", title, message }),
    warning: (title: string, message?: string) => ctx.push({ tone: "warning", title, message }),
  };
}
