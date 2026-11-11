"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import type { Agent } from "@/lib/engine";
import { hex3, type StyleCfg, type StyleId } from "@/lib/lab-config";

export interface GlassProps { cfg: StyleCfg; open: boolean; reduce: boolean; agents: Agent[]; flare: boolean; src: HTMLCanvasElement | null }
const n = (v: unknown) => Number(v);
const rgba = (hex: string, a: number) => { const [r, g, b] = hex3(hex); return `rgba(${r * 255},${g * 255},${b * 255},${a})`; };
const ease = "opacity .24s cubic-bezier(.2,0,0,1), background-color .24s cubic-bezier(.2,0,0,1), box-shadow .24s, backdrop-filter .24s";
const NOISE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;
/** A ring of `width` px hugging the rounded pill (mask-composite trick, no layout cost). */
const ring = (width: number): CSSProperties => ({ position: "absolute", inset: 0, borderRadius: 16, padding: width, overflow: "hidden",
  WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)" });
export const stateColor = (a: Agent) => ({ working: "#8fb4ff", needs: "#fbbf24", done: "#4ade80", error: "#f87171", idle: a.hue })[a.status];

function Frosted({ cfg, open }: GlassProps) {
  const k = open ? 1 : 0.55;
  return <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl border border-white/15" style={{ transition: ease,
    backdropFilter: `blur(${n(cfg.blur) * (open ? 1 : 0.6)}px) saturate(${cfg.saturation})`, WebkitBackdropFilter: `blur(${n(cfg.blur) * (open ? 1 : 0.6)}px) saturate(${cfg.saturation})`,
    backgroundColor: rgba(String(cfg.tint), n(cfg.tintOpacity) * k + 0.08), boxShadow: open ? "0 10px 30px rgba(0,0,0,.3)" : "none" }}>
    <div className="absolute inset-0 mix-blend-overlay" style={{ backgroundImage: NOISE, backgroundSize: `${cfg.noiseSize}px`, opacity: n(cfg.noise) }} />
    <div className="absolute inset-0" style={{ background: "rgba(10,10,14,.28)" }} />
  </div>;
}

function Dark({ cfg, open }: GlassProps) {
  const b = n(cfg.rimBrightness);
  return <div aria-hidden="true" className="absolute inset-0 rounded-2xl" style={{ transition: ease, backdropFilter: `blur(${open ? 16 : 8}px)`, WebkitBackdropFilter: `blur(${open ? 16 : 8}px)`,
    backgroundColor: `rgba(8,8,11,${n(cfg.darkness) * (open ? 1 : 0.8)})`,
    boxShadow: `inset 0 1px 14px rgba(255,255,255,${n(cfg.innerGlow) * 0.35}), inset 0 0 0 0.5px rgba(255,255,255,.04), 0 ${open ? 14 : 6}px ${open ? 36 : 18}px rgba(0,0,0,${n(cfg.shadow) * (open ? 0.7 : 0.4)})` }}>
    <div style={{ ...ring(n(cfg.rimWidth)), background: `linear-gradient(${cfg.rimAngle}deg, rgba(255,255,255,${b}), rgba(255,255,255,${b * 0.08}) 45%, rgba(255,255,255,${b * 0.05}) 60%, rgba(255,255,255,${b * 0.45}))` }} />
  </div>;
}

/** Reference iridescent stroke (spinning conic ring). Left unchanged; Shimmer and Foil use their own strokes. */
function Iridescent({ cfg, open, reduce, flare }: GlassProps) {
  const only = !!cfg.onlyComplete, speed = n(cfg.speed);
  const op = only ? (flare ? 1 : 0) : Math.min(1, n(cfg.intensity) * (flare ? 1.35 : open ? 1 : 0.75));
  return <div aria-hidden="true" className="absolute inset-0 rounded-2xl" style={{ transition: ease, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", backgroundColor: `rgba(12,12,16,${open ? 0.55 : 0.4})`, boxShadow: open ? "0 10px 30px rgba(0,0,0,.35)" : "none" }}>
    <div style={{ ...ring(n(cfg.edge) * (flare ? 1.6 : 1)), opacity: only && flare ? Math.max(0.6, n(cfg.intensity)) : op, transition: flare ? "opacity .2s ease-out" : "opacity 1.2s ease-in" }}>
      <div className="absolute top-1/2 left-1/2 aspect-square w-[180%] will-change-transform" style={{ translate: "-50% -50%", filter: `saturate(${cfg.saturation})`,
        background: "conic-gradient(#ff6b6b, #ffd93d, #6bff95, #4dd9ff, #8b7bff, #ff6bd5, #ff6b6b)",
        animation: reduce || speed === 0 ? "none" : `lab-spin ${1 / speed}s linear infinite` }} />
    </div>
  </div>;
}

/** Perceptual compensation: inverse linear-light luminance, warm-hue attenuation,
 * a small cool-hue lift, and an explicit lowest-presence cap for luminous neutrals. */
export function auroraOpacityWeight(hex: string): number {
  const rgb = hex3(hex); // normalized sRGB
  const linear = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const Y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const hi = Math.max(...rgb), lo = Math.min(...rgb), chroma = hi - lo;
  const saturation = hi ? chroma / hi : 0;
  if (saturation < 0.10 && Y > 0.5) return 0.40; // white is deliberately least visible
  let hue = 0;
  if (chroma) hue = ((hi === rgb[0] ? (rgb[1] - rgb[2]) / chroma : hi === rgb[1] ? (rgb[2] - rgb[0]) / chroma + 2 : (rgb[0] - rgb[1]) / chroma + 4) * 60 + 360) % 360;
  const warm = hue < 80 || hue > 330;
  const cool = hue >= 190 && hue <= 310;
  const inverseY = Math.sqrt(0.20 / (Y + 0.05));
  return Math.max(cool ? 1 : 0.48, Math.min(1.12, inverseY * (warm ? 1 - 0.22 * saturation : cool ? 1.15 : 1)));
}

function Aurora({ cfg, open, reduce, agents }: GlassProps) {
  const count = n(cfg.blobs), speed = n(cfg.speed);
  const active = [...agents].filter(a => a.status !== "idle").sort((a, b) => b.since - a.since)[0] ?? agents[0];
  // Clipped to the pill: overflow + matching radius + clip-path, so it follows hover width and drag.
  // Sits in the glass layer, which renders before the mascot row, so it stays behind the bots.
  return (
    <div aria-hidden="true" data-aurora className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-white/10"
      style={{ clipPath: "inset(0 round 16px)", transition: ease, backgroundColor: `rgba(10,10,14,${open ? 0.5 : 0.38})`, backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
      <div className="absolute inset-0" style={{ opacity: n(cfg.intensity) * (open ? 1 : 0.8), transition: "opacity .3s" }}>
        {Array.from({ length: count }, (_, i) => {
          const a = cfg.tintByActive ? active : agents[i % agents.length];
          const color = stateColor(a), weight = auroraOpacityWeight(color);
          return <div key={i} data-aurora-blob data-color={color} data-weight={weight.toFixed(4)} className="absolute top-1/2 aspect-square w-20 rounded-full will-change-transform" style={{ left: `${(i + 0.5) / count * 100}%`, translate: "-50% -50%",
            background: color, opacity: weight, filter: `blur(${cfg.blur}px)`, transition: "background-color .6s, opacity .6s",
            animation: reduce || speed === 0 ? "none" : `lab-drift-${i % 3} ${(7 + i * 1.7) / speed}s ease-in-out ${-i * 1.3}s infinite alternate` }} />;
        })}
      </div>
    </div>
  );
}

// ---------- WebGL glass ----------
const PRELUDE = `precision highp float;
uniform sampler2D u_tex; uniform vec4 u_rect; uniform vec2 u_view, u_res; uniform float u_time, u_open;
vec2 localPx(){ vec2 p = gl_FragCoord.xy / u_res; p.y = 1.0 - p.y; return p * u_rect.zw; }
vec3 sampleAt(vec2 px){ return texture2D(u_tex, clamp((u_rect.xy + px) / u_view, 0.0, 1.0)).rgb; }
`;
const PIXEL = PRELUDE + `uniform float u_px, u_contrast, u_pattern, u_levels, u_tintAmt; uniform vec3 u_tint;
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main(){
  vec2 px = localPx(); vec2 cell = floor(px / u_px);
  vec3 c = sampleAt((cell + 0.5) * u_px);
  c = (c - 0.5) * u_contrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, l * u_tint * 1.8, u_tintAmt);
  float lv = u_levels - 1.0;
  if (u_pattern < 0.5) { c = floor(c * lv + bayer4(cell)) / lv; }
  else if (u_pattern < 1.5) { vec2 f = fract(px / u_px) - 0.5; float r = 0.15 + sqrt(clamp(l, 0.0, 1.0)) * 0.5; c = mix(c * 0.12, c * 1.1, smoothstep(r, r - 0.12, length(f))); }
  c = clamp(c, 0.0, 1.0) * mix(0.5, 0.62, u_open);
  gl_FragColor = vec4(c, 1.0);
}`;
const REFRACT = PRELUDE + `uniform float u_strength, u_chroma, u_edge, u_dim;
float sdR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 px = localPx(); vec2 h = u_rect.zw * 0.5; vec2 p = px - h; float r = min(16.0, h.y);
  float d = -sdR(p, h, r);
  vec2 e = vec2(1.0, 0.0);
  vec2 nrm = normalize(vec2(sdR(p + e.xy, h, r) - sdR(p - e.xy, h, r), sdR(p + e.yx, h, r) - sdR(p - e.yx, h, r)) + 1e-5);
  float k = clamp(1.0 - d / u_edge, 0.0, 1.0); k = k * k;
  vec2 base = px - nrm * k * u_strength * u_edge * 1.6 - p * 0.06 * u_strength;
  vec2 ca = nrm * u_chroma * (2.0 + 6.0 * k);
  vec3 c = vec3(sampleAt(base + ca).r, sampleAt(base).g, sampleAt(base - ca).b);
  c += pow(k, 3.0) * 0.35 * (0.6 - 0.4 * nrm.y);
  c = mix(c, vec3(0.04, 0.04, 0.06), u_dim * mix(0.85, 1.1, u_open));
  gl_FragColor = vec4(c, 1.0);
}`;

type U = Record<string, number | number[]>;
function ShaderGlass({ frag, uniforms, src, open }: { frag: string; uniforms: U; src: HTMLCanvasElement | null; open: boolean }) {
  const cv = useRef<HTMLCanvasElement>(null); const u = useRef(uniforms); u.current = uniforms;
  const o = useRef(open ? 1 : 0); const target = useRef(open ? 1 : 0); target.current = open ? 1 : 0;
  useEffect(() => {
    const c = cv.current; const gl = c?.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!c || !gl || !src) return;
    const sh = (t: number, s: string) => { const x = gl.createShader(t)!; gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(x)); return x; };
    const pr = gl.createProgram()!; gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
    const locs = new Map<string, WebGLUniformLocation | null>(); const loc = (k: string) => { if (!locs.has(k)) locs.set(k, gl.getUniformLocation(pr, k)); return locs.get(k)!; };
    let raf = 0; const t0 = performance.now(); let last = "";
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const r = c.getBoundingClientRect(); if (!r.width) return;
      o.current += (target.current - o.current) * 0.18;
      const key = [r.left, r.top, r.width, r.height, o.current.toFixed(3), JSON.stringify(u.current)].join();
      if (key === last) return; last = key; // idle frames cost nothing
      const dpr = Math.min(2, devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      gl.viewport(0, 0, W, H);
      gl.uniform4f(loc("u_rect"), r.left, r.top, r.width, r.height); gl.uniform2f(loc("u_view"), innerWidth, innerHeight); gl.uniform2f(loc("u_res"), W, H);
      gl.uniform1f(loc("u_time"), (performance.now() - t0) / 1000); gl.uniform1f(loc("u_open"), o.current);
      for (const [k, v] of Object.entries(u.current)) { const l = loc(k); if (typeof v === "number") gl.uniform1f(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else gl.uniform2fv(l, v); }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    draw();
    return () => { cancelAnimationFrame(raf); gl.deleteTexture(tex); gl.deleteProgram(pr); gl.deleteBuffer(buf); };
  }, [frag, src]);
  return <canvas ref={cv} aria-hidden="true" className="absolute inset-0 size-full" />;
}

function Pixel({ cfg, open, src }: GlassProps) {
  return <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl border border-white/15" style={{ boxShadow: open ? "0 10px 30px rgba(0,0,0,.35)" : "none", transition: ease }}>
    <ShaderGlass frag={PIXEL} src={src} open={open} uniforms={{ u_px: n(cfg.pixelSize), u_contrast: n(cfg.contrast), u_levels: n(cfg.levels), u_tintAmt: n(cfg.tintAmount), u_tint: hex3(String(cfg.tint)),
      u_pattern: ({ bayer: 0, halftone: 1, none: 2 } as Record<string, number>)[String(cfg.pattern)] ?? 0 }} />
  </div>;
}
function Refraction({ cfg, open, src }: GlassProps) {
  return <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl" style={{ boxShadow: open ? "0 12px 32px rgba(0,0,0,.4)" : "0 4px 14px rgba(0,0,0,.25)", transition: ease }}>
    <ShaderGlass frag={REFRACT} src={src} open={open} uniforms={{ u_strength: n(cfg.strength), u_chroma: n(cfg.chroma), u_edge: n(cfg.edge), u_dim: n(cfg.dim) }} />
  </div>;
}


const DRIFT = "lab-irid-drift 16s ease-in-out infinite alternate";
const BEAM_PULSE = "lab-irid-beam-pulse 16s linear infinite alternate";
const GLOW_PULSE = "lab-irid-glow-pulse 16s linear infinite alternate";
const GLOW_BLUR = "lab-irid-glow-blur 16s linear infinite alternate";
const SHIMMER_FILL = "linear-gradient(105deg, transparent 18%, rgba(77,217,255,0.00) 28%, rgba(77,217,255,0.34) 38%, rgba(139,123,255,0.32) 46%, rgba(255,107,213,0.28) 52%, rgba(255,217,61,0.22) 60%, transparent 72%)";
const STROKE_EDGE = "conic-gradient(#ff6b6b, #ffd93d, #6bff95, #4dd9ff, #8b7bff, #ff6bd5, #ff6b6b)";
const STROKE_BEAM = "linear-gradient(105deg, transparent 22%, rgba(77,217,255,0) 30%, rgba(77,217,255,0.68) 38%, rgba(139,123,255,0.70) 46%, rgba(255,107,213,0.66) 52%, rgba(255,217,61,0.60) 60%, transparent 72%)";

/** B — Drift shimmer fill, thin travelling beam, and 300ms corner swells from mockups/iridescent-pulse.html. */
export function IridescentShimmer({ open, reduce }: GlassProps) {
  const motion = reduce ? "none" : DRIFT;
  const delay = reduce ? undefined : "-4s";
  return <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-2xl" style={{ transition: ease, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", backgroundColor: `rgba(12,12,16,${open ? 0.55 : 0.4})`, boxShadow: open ? "0 10px 30px rgba(0,0,0,.35)" : "none" }}>
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      <div style={{ position: "absolute", inset: "-20% -80%", background: SHIMMER_FILL, mixBlendMode: "screen", opacity: 0.95, animation: motion, animationDelay: delay }} />
    </div>
    <div style={{ ...ring(1), opacity: 0.4 }}>
      <div className="absolute inset-[-50%]" style={{ background: STROKE_EDGE, filter: "saturate(1.4)" }} />
    </div>
    {!reduce && <>
      <div style={{ ...ring(1), opacity: 0.7, animation: BEAM_PULSE, animationDelay: delay }}>
        <div style={{ position: "absolute", inset: "-20% -80%", background: STROKE_BEAM, filter: "saturate(1.45)", animation: motion, animationDelay: delay }} />
      </div>
      <div style={{ ...ring(2.25), opacity: 0.26, animation: GLOW_PULSE, animationDelay: delay }}>
        <div style={{ position: "absolute", inset: "-20% -80%", background: STROKE_BEAM, animation: `${motion}, ${GLOW_BLUR}`, animationDelay: "-4s, -4s" }} />
      </div>
    </>}
  </div>;
}

export const glassFor: Record<StyleId, (p: GlassProps) => React.ReactNode> = { frosted: Frosted, dark: Dark, iridescent: Iridescent, aurora: Aurora, pixel: Pixel, refraction: Refraction };
