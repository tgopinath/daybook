"use client";
import { create } from "./store";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useEffect } from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string; action?: { label: string; onClick: () => void }; duration: number };

const store = create<{ toasts: Toast[] }>({ toasts: [] });
let seq = 0;

function push(kind: Toast["kind"], message: string, opts: { action?: Toast["action"]; duration?: number } = {}) {
  const t: Toast = { id: ++seq, kind, message, action: opts.action, duration: opts.duration ?? (opts.action ? 6000 : 3500) };
  store.set((s) => ({ toasts: [...s.toasts.slice(-3), t] }));
  return t.id;
}

export const toast = {
  success: (m: string, o?: { action?: Toast["action"]; duration?: number }) => push("success", m, o),
  error: (m: string, o?: { duration?: number }) => push("error", m, o),
  info: (m: string, o?: { action?: Toast["action"]; duration?: number }) => push("info", m, o),
  /** Success toast with an Undo button. */
  undo: (m: string, onUndo: () => void) => push("success", m, { action: { label: "Undo", onClick: onUndo } }),
  dismiss: (id: number) => store.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
};

/** Show the error of a failed request as a toast. */
export function toastError(err: unknown) {
  toast.error(err instanceof Error ? err.message : "Something went wrong");
}

function ToastItem({ t }: { t: Toast }) {
  useEffect(() => {
    const h = setTimeout(() => toast.dismiss(t.id), t.duration);
    return () => clearTimeout(h);
  }, [t.id, t.duration]);
  const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "error" ? AlertCircle : Info;
  const color = t.kind === "success" ? "text-success" : t.kind === "error" ? "text-danger" : "text-primary";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      role={t.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto flex min-w-[280px] max-w-[420px] items-center gap-2.5 rounded-xl border border-line bg-surface py-2.5 pr-2 pl-3 text-[13px] shadow-pop"
    >
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <span className="flex-1">{t.message}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action!.onClick();
            toast.dismiss(t.id);
          }}
          className="rounded-md px-2 py-1 text-[13px] font-semibold text-primary hover:bg-primary-soft"
        >
          {t.action.label}
        </button>
      )}
      <button onClick={() => toast.dismiss(t.id)} className="rounded-md p-1 text-fg-3 hover:bg-surface-2" aria-label="Dismiss">
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function Toaster() {
  const { toasts } = store.use();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
