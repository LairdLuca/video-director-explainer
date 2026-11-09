import React from "react";
import { useCurrentFrame } from "remotion";
import { ChartTitle, dashed, Legend, StageBox, stateColor, useAppear, useHighlight, useStart, type Highlight, type LegendItem, type State } from "../components/chart";
import { Icon } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { tween } from "../motion";
import { useShot } from "../shot";
import { alpha, mono, sans } from "../theme";

export type DiagramZone = { id?: string; label?: string; x: number; y: number; w: number; h: number; at?: string; delay?: number; state?: State };
export type DiagramNode = {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  state?: State;
  at?: string;
  delay?: number;
  shape?: "box" | "diamond" | "pill" | "file";
  /** Label size in px, never under 28. */
  size?: number;
  /** For shape "file": the label in the text font instead of the code font. */
  plain?: boolean;
};
export type DiagramEdge = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  labelDx?: number;
  labelDy?: number;
  at?: string;
  delay?: number;
  state?: State;
  dashed?: boolean;
  /** Points in between, for an elbow edge. */
  via?: Array<[number, number]>;
};
export type DiagramLine = { x1: number; y1: number; x2: number; y2: number; label?: string; labelX?: number; labelY?: number; at?: string; state?: State };
export type DiagramProps = {
  title?: string;
  titleAt?: string;
  zones?: DiagramZone[];
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
  lines?: DiagramLine[];
  highlights?: Highlight[];
  legend?: LegendItem[];
  legendX?: number;
  legendY?: number;
};

/** Point on the outline of `n` along the line towards (tx, ty). */
const outline = (n: DiagramNode, tx: number, ty: number): [number, number] => {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const k =
    n.shape === "diamond"
      ? 1 / (Math.abs(dx) / (n.w / 2) + Math.abs(dy) / (n.h / 2))
      : Math.min(n.w / 2 / Math.abs(dx || 1e-6), n.h / 2 / Math.abs(dy || 1e-6));
  return [cx + dx * k, cy + dy * k];
};

/**
 * The general diagram: zones, nodes, edges, boundary lines, highlights and a
 * legend, at coordinates in stage pixels (0,0 is the top left of the stage).
 * For overview maps (who talks to whom, what exists, what the work adds,
 * what is missing), decision branches and states, files or data grouped by
 * layer. It builds in front of the viewer: each element enters on the word
 * that names it. An element without `at` is there from the first frame, so
 * the same map can come back in the next shot with other highlights.
 */
export const Diagram: React.FC = () => {
  const { shot, c, L } = useShot();
  const frame = useCurrentFrame();
  const appear = useAppear();
  const start = useStart();
  const p = shot.props as DiagramProps;
  const highlight = useHighlight(p.highlights);
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  const W = L.width - 2 * L.margin;

  return (
    <StageFrame>
      <StageBox>
        <ChartTitle text={p.title} at={p.titleAt} />
        {(p.zones ?? []).map((z, i) => {
          const col = z.state ? stateColor(c, z.state) : c.muted;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: z.x,
                top: z.y,
                width: z.w,
                height: z.h,
                borderRadius: 18,
                border: `3px ${dashed(z.state) ? "dashed" : "solid"} ${alpha(col, 0.55)}`,
                background: alpha(col, 0.06),
                opacity: appear(z.at, z.delay) * (1 - 0.6 * highlight(z.id).down),
              }}
            >
              {z.label ? (
                <div style={{ position: "absolute", left: 18, top: 8, fontFamily: sans, fontWeight: 700, fontSize: 28, letterSpacing: 0.5, color: col }}>{z.label}</div>
              ) : null}
            </div>
          );
        })}

        <svg width={W} height={L.stageH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {(p.lines ?? []).map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={stateColor(c, l.state)} strokeWidth={4} strokeDasharray="14 10" opacity={appear(l.at)} />
          ))}
          {(p.edges ?? []).map((e, i) => {
            const a = nodes.get(e.from);
            const b = nodes.get(e.to);
            if (!a || !b) return null;
            const via = e.via ?? [];
            const first = via[0] ?? [b.x + b.w / 2, b.y + b.h / 2];
            const last = via[via.length - 1] ?? [a.x + a.w / 2, a.y + a.h / 2];
            const pts: Array<[number, number]> = [outline(a, first[0], first[1]), ...via, outline(b, last[0], last[1])];
            const d = pts.map((q, k) => `${k ? "L" : "M"}${q[0]} ${q[1]}`).join(" ");
            const s0 = start(e.at, e.delay);
            const t = e.at ? tween(frame, s0 - 6, s0 + 6) : 1;
            if (t <= 0) return null;
            const col = stateColor(c, e.state);
            const [x0, y0] = pts[pts.length - 2];
            const [x1, y1] = pts[pts.length - 1];
            const ang = Math.atan2(y1 - y0, x1 - x0);
            const tip = 17;
            const dash = e.dashed || dashed(e.state);
            return (
              <g key={i} opacity={1 - 0.7 * highlight(e.id).down}>
                {dash ? (
                  <path d={d} fill="none" stroke={col} strokeWidth={3.5} strokeDasharray="10 9" opacity={t} />
                ) : (
                  <path d={d} fill="none" stroke={col} strokeWidth={3.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />
                )}
                <polygon
                  opacity={t > 0.85 ? 1 : 0}
                  fill={col}
                  points={`${x1},${y1} ${x1 - tip * Math.cos(ang - 0.45)},${y1 - tip * Math.sin(ang - 0.45)} ${x1 - tip * Math.cos(ang + 0.45)},${y1 - tip * Math.sin(ang + 0.45)}`}
                />
              </g>
            );
          })}
        </svg>

        {(p.lines ?? []).map((l, i) =>
          l.label ? (
            <div
              key={i}
              style={{ position: "absolute", left: l.labelX ?? l.x1 + 10, top: l.labelY ?? l.y1, fontFamily: sans, fontWeight: 700, fontSize: 28, color: stateColor(c, l.state), opacity: appear(l.at) }}
            >
              {l.label}
            </div>
          ) : null,
        )}

        {(p.edges ?? []).map((e, i) => {
          const a = nodes.get(e.from);
          const b = nodes.get(e.to);
          if (!a || !b || !e.label) return null;
          const via = e.via ?? [];
          const mid = via.length ? via[Math.floor(via.length / 2)] : [(a.x + a.w / 2 + b.x + b.w / 2) / 2, (a.y + a.h / 2 + b.y + b.h / 2) / 2];
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: mid[0] + (e.labelDx ?? 0),
                top: mid[1] + (e.labelDy ?? 0),
                transform: "translate(-50%, -50%)",
                padding: "0 8px",
                borderRadius: 6,
                background: alpha(c.bg, 0.88),
                fontFamily: sans,
                fontSize: 28,
                whiteSpace: "nowrap",
                color: stateColor(c, e.state),
                opacity: appear(e.at, (e.delay ?? 0) + 0.2) * (1 - 0.7 * highlight(e.id).down),
              }}
            >
              {e.label}
            </div>
          );
        })}

        {p.nodes.map((n) => {
          const col = stateColor(c, n.state);
          const hl = highlight(n.id);
          const op = appear(n.at, n.delay) * (1 - 0.55 * hl.down);
          const size = Math.max(28, n.size ?? 32);
          if (n.shape === "file") {
            return (
              <div
                key={n.id}
                style={{
                  position: "absolute",
                  left: n.x,
                  top: n.y,
                  width: n.w,
                  height: n.h,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  opacity: op,
                  fontFamily: n.plain ? sans : mono,
                  fontSize: Math.max(28, n.size ?? 28),
                  fontWeight: n.state === "added" || hl.up > 0.5 ? 700 : 400,
                  color: hl.up > 0.5 ? c.accent : col,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ flex: "none", width: 10, height: n.h - 12, borderRadius: 4, background: hl.up > 0.5 ? c.accent : col }} />
                {n.label}
              </div>
            );
          }
          const diamond = n.shape === "diamond";
          return (
            <div key={n.id} style={{ position: "absolute", left: n.x, top: n.y, width: n.w, height: n.h, opacity: op }}>
              {diamond ? (
                <svg width={n.w} height={n.h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                  <polygon points={`${n.w / 2},0 ${n.w},${n.h / 2} ${n.w / 2},${n.h} 0,${n.h / 2}`} fill={c.card} stroke={col} strokeWidth={3.5 + hl.up * 2} />
                </svg>
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: n.shape === "pill" ? n.h / 2 : 14,
                    border: `${3 + hl.up * 2}px ${dashed(n.state) ? "dashed" : "solid"} ${col}`,
                    backgroundColor: c.card,
                    backgroundImage: dashed(n.state) ? `linear-gradient(${alpha(col, 0.09)}, ${alpha(col, 0.09)})` : undefined,
                    boxShadow: hl.up > 0 ? `0 0 0 ${6 * hl.up}px ${alpha(col, 0.22)}` : `0 4px 10px ${alpha(c.shadow, 0.08)}`,
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  padding: diamond ? "0 16%" : "0 14px",
                  textAlign: "center",
                  fontFamily: sans,
                }}
              >
                {n.icon ? (
                  <span style={{ flex: "none", display: "flex" }}>
                    <Icon name={n.icon} size={44} color={col} />
                  </span>
                ) : null}
                <div>
                  <div style={{ fontSize: size, fontWeight: 600, lineHeight: 1.15, color: c.ink }}>{n.label}</div>
                  {n.sub ? <div style={{ fontSize: 28, lineHeight: 1.15, marginTop: 4, color: c.muted }}>{n.sub}</div> : null}
                </div>
              </div>
            </div>
          );
        })}

        <Legend items={p.legend} x={p.legendX ?? 0} y={p.legendY ?? L.stageH - 34} />
      </StageBox>
    </StageFrame>
  );
};
