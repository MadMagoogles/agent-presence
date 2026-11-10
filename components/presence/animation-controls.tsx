"use client";
import { useState } from "react";
import { ChevronRight, RotateCcw, Copy, Check } from "lucide-react";
import { animFields, type AnimConfig, type AnimKey } from "@/lib/anim-config";

export function AnimationControls({ cfg, update, reset }: { cfg: AnimConfig; update: (id: AnimKey, patch: Record<string, number | boolean>) => void; reset: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-white/65 uppercase">Animation tuning</h2>
        <div className="flex gap-1">
          <button onClick={copy} aria-label="Copy settings as JSON" title="Copy settings as JSON" className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white">
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          </button>
          <button onClick={reset} aria-label="Reset to defaults" title="Reset to defaults" className="rounded-md p-1 text-white/70 hover:bg-white/10 hover:text-white"><RotateCcw className="size-3.5" aria-hidden /></button>
        </div>
      </div>
      {animFields.map(({ id, title, fields }) => {
        const section = cfg[id] as unknown as Record<string, number | boolean>;
        return (
          <details key={id} className="group border-b border-white/10 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1.5 text-xs font-semibold text-white [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 text-white/60 transition-transform group-open:rotate-90" aria-hidden />
              <span className="flex-1">{title}</span>
              <span className={section.enabled ? "font-medium text-[#4ade80]" : "font-medium text-white/60"}>{section.enabled ? "On" : "Off"}</span>
            </summary>
            <div className="space-y-2 pb-2.5 pl-5">
              <label className="flex items-center gap-2 text-xs text-white/75">
                <input type="checkbox" checked={!!section.enabled} onChange={e => update(id, { enabled: e.target.checked })} /> Enabled
              </label>
              {fields.map(f => {
                const v = section[f.key] as number;
                return (
                  <label key={f.key} className="block text-xs text-white/75">
                    <span className="flex justify-between"><span>{f.label}</span><span className="tabular-nums text-white">{f.zero && v === 0 ? f.zero : `${v}${f.unit}`}</span></span>
                    <input type="range" min={f.min} max={f.max} step={f.step} value={v} disabled={!section.enabled}
                      onChange={e => update(id, { [f.key]: Number(e.target.value) })} className="w-full accent-[#8fb4ff] disabled:opacity-40" />
                  </label>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
