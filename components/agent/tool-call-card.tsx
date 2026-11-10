"use client";
import * as Collapsible from "@radix-ui/react-collapsible";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import clsx from "clsx";
import { Circle, Loader2, CheckCircle2, XCircle, Ban, ChevronRight, ShieldAlert, type LucideIcon } from "lucide-react";

export type ToolStatus = "pending" | "running" | "awaiting" | "success" | "error" | "cancelled";

export interface ToolCallCardProps {
  verb: string;            // e.g. "Read", "Search", "Edit"
  target: string;          // e.g. "src/app/page.tsx"
  status: ToolStatus;
  input?: string;
  output?: string;
  error?: string;
  durationMs?: number;
  defaultOpen?: boolean;
}

const meta: Record<ToolStatus, { word: string; tone: string; icon: LucideIcon }> = {
  pending:   { word: "Pending",   tone: "text-fg-3", icon: Circle },
  running:   { word: "Running",   tone: "text-brand", icon: Loader2 },
  awaiting:  { word: "Awaiting approval", tone: "text-warn", icon: ShieldAlert },
  success:   { word: "Done",      tone: "text-ok",   icon: CheckCircle2 },
  error:     { word: "Failed",    tone: "text-err",  icon: XCircle },
  cancelled: { word: "Cancelled", tone: "text-warn", icon: Ban },
};

/** Tool call collapsed to one line — verb · target · status — with an accessible disclosure for details. */
export function ToolCallCard({ verb, target, status, input, output, error, durationMs, defaultOpen = false }: ToolCallCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();
  const id = useId();
  const m = meta[status];
  const Icon = m.icon;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}
      className={clsx("rounded-lg border bg-surface", status === "error" ? "border-[var(--color-border-error_subtle)]" : "border-line")}>
      <Collapsible.Trigger
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
        <motion.span aria-hidden="true" className={clsx("inline-flex size-4 items-center justify-center", m.tone)}
          animate={status === "running" && !reduce ? { rotate: 360 } : { rotate: 0 }}
          transition={status === "running" ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0 }}><Icon className="size-4" strokeWidth={2} /></motion.span>
        <span className="font-semibold text-fg">{verb}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2">{target}</code>
        <span className={clsx("text-xs font-medium", m.tone)}>{m.word}{durationMs && status === "success" ? ` · ${(durationMs / 1000).toFixed(1)}s` : ""}</span>
        <motion.span aria-hidden="true" className="inline-flex text-fg-3" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: reduce ? 0 : 0.15 }}><ChevronRight className="size-4" /></motion.span>
      </Collapsible.Trigger>
      <span className="sr-only" role="status" id={`${id}-s`}>{`${verb} ${target}: ${m.word}`}</span>
      <AnimatePresence initial={false}>
        {open && (
          <Collapsible.Content forceMount asChild>
            <motion.div
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
              className="overflow-hidden">
              <div className="space-y-2 border-t border-line px-3 py-2 text-xs">
                {input && <Detail label="Input" body={input} />}
                {status === "error" && <Detail label="Error" body={error ?? "Unknown error"} tone="text-err" />}
                {status === "success" && output && <Detail label="Output" body={output} />}
                {status === "cancelled" && <p className="text-fg-3">Cancelled before it finished. Nothing was changed.</p>}
                {status === "awaiting" && <p className="text-fg-3">Paused — waiting for you to approve or decline.</p>}
                {(status === "pending" || status === "running") && <p className="text-fg-3">{status === "pending" ? "Queued — waiting for the previous step." : "Working…"}</p>}
              </div>
            </motion.div>
          </Collapsible.Content>
        )}
      </AnimatePresence>
    </Collapsible.Root>
  );
}

function Detail({ label, body, tone }: { label: string; body: string; tone?: string }) {
  return (
    <div>
      <div className="mb-1 font-medium text-fg-3">{label}</div>
      <pre className={clsx("overflow-x-auto rounded-md bg-surface-2 p-2 font-mono", tone ?? "text-fg-2")}>{body}</pre>
    </div>
  );
}
