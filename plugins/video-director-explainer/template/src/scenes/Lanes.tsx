import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { dashed, Legend, StageBox, stateColor, useAppear, useStart, type LegendItem, type State } from "../components/chart";
import { StageFrame } from "../components/Stage";
import { tween } from "../motion";
import { useShot } from "../shot";
import { alpha, sans } from "../theme";

export type LaneColumn = { id: string; label: string; state?: State; at?: string };
export type LaneMessage = { from: string; to: string; row: number; label?: string; at?: string; delay?: number; state?: State; dashed?: boolean };
export type LaneNote = { col: string; row: number; label: string; at?: string; delay?: number; state?: State; side?: "right" | "left" };
export type LaneWait = { col: string; fromRow: number; toRow: number; label?: string; at?: string; delay?: number; state?: State; side?: "right" | "left"; durationS?: number };
export type LaneTime = { row: number; label: string; at?: string; delay?: number };
export type LanesProps = {
  columns: LaneColumn[];
  /** How many rows of time: the space under the headers is shared among them. */
  rows: number;
  messages?: LaneMessage[];
  notes?: LaneNote[];
  waits?: LaneWait[];
  times?: LaneTime[];
  /** Width of the band on the left with the times; 0 or left out when there are none. */
  timeBand?: number;
  legend?: LegendItem[];
};

const HEADER_H = 74;

/**
 * A sequence in time: the actors in columns, time going down. Messages
 * between columns, notes on a column, waits as bars that grow, times on the
 * left. `row` may have decimals. An element without `at` is there from the
 * first frame, so the sequence can go on in the next shot.
 */
export const Lanes: React.FC = () => {
  const { shot, c, L } = useShot();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = useAppear();
  const start = useStart();
  const p = shot.props as LanesProps;
  const W = L.width - 2 * L.margin;
  const band = p.timeBand ?? 0;
  const colW = (W - band) / p.columns.length;
  const xOf = new Map(p.columns.map((k, i) => [k.id, band + colW * (i + 0.5)]));
  const hasLegend = !!p.legend?.length;
  const bottom = L.stageH - (hasLegend ? 46 : 6);
  const rowH = (bottom - HEADER_H - 10) / p.rows;
  const yOf = (r: number) => HEADER_H + 10 + rowH * (r + 0.5);

  return (
    <StageFrame>
      <StageBox>
        <svg width={W} height={L.stageH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {p.columns.map((k) => (
            <line
              key={k.id}
              x1={xOf.get(k.id)}
              x2={xOf.get(k.id)}
              y1={HEADER_H}
              y2={bottom}
              stroke={alpha(stateColor(c, k.state), 0.5)}
              strokeWidth={3}
              strokeDasharray={dashed(k.state) ? "10 9" : undefined}
              opacity={appear(k.at)}
            />
          ))}
          {(p.waits ?? []).map((a, i) => {
            const x = xOf.get(a.col);
            if (x === undefined) return null;
            const s0 = start(a.at, a.delay);
            const t = a.at ? tween(frame, s0 - 6, s0 + Math.round((a.durationS ?? 1.2) * fps)) : 1;
            if (t <= 0) return null;
            const y0 = yOf(a.fromRow);
            const y1 = yOf(a.toRow);
            return <rect key={i} x={x - 9} y={y0} width={18} height={(y1 - y0) * t} rx={6} fill={alpha(stateColor(c, a.state), 0.75)} />;
          })}
          {(p.messages ?? []).map((m, i) => {
            const x0 = xOf.get(m.from);
            const x1 = xOf.get(m.to);
            if (x0 === undefined || x1 === undefined) return null;
            const y = yOf(m.row);
            const s0 = start(m.at, m.delay);
            const t = m.at ? tween(frame, s0 - 8, s0 + 6) : 1;
            if (t <= 0) return null;
            const col = stateColor(c, m.state);
            const dir = x1 >= x0 ? 1 : -1;
            const xf = x1 - dir * 12;
            const xt = x0 + dir * 12 + (xf - (x0 + dir * 12)) * t;
            const dash = m.dashed || dashed(m.state);
            return (
              <g key={i}>
                <line x1={x0 + dir * 12} y1={y} x2={xt} y2={y} stroke={col} strokeWidth={4} strokeDasharray={dash ? "10 9" : undefined} />
                <polygon opacity={t > 0.9 ? 1 : 0} fill={col} points={`${xf + dir * 2},${y} ${xf - dir * 16},${y - 9} ${xf - dir * 16},${y + 9}`} />
              </g>
            );
          })}
        </svg>

        {p.columns.map((k) => (
          <div
            key={k.id}
            style={{
              position: "absolute",
              left: (xOf.get(k.id) ?? 0) - colW / 2 + 8,
              top: 0,
              width: colW - 16,
              height: HEADER_H - 8,
              borderRadius: 12,
              border: `3px ${dashed(k.state) ? "dashed" : "solid"} ${stateColor(c, k.state)}`,
              background: dashed(k.state) ? alpha(stateColor(c, k.state), 0.07) : c.card,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: sans,
              fontWeight: 600,
              fontSize: 30,
              lineHeight: 1.05,
              textAlign: "center",
              color: c.ink,
              opacity: appear(k.at),
            }}
          >
            {k.label}
          </div>
        ))}

        {(p.messages ?? []).map((m, i) => {
          const x0 = xOf.get(m.from);
          const x1 = xOf.get(m.to);
          if (!m.label || x0 === undefined || x1 === undefined) return null;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: (x0 + x1) / 2,
                top: yOf(m.row) - 22,
                transform: "translate(-50%, -50%)",
                padding: "0 8px",
                borderRadius: 6,
                background: alpha(c.bg, 0.9),
                fontFamily: sans,
                fontSize: 28,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                color: stateColor(c, m.state),
                opacity: appear(m.at, (m.delay ?? 0) + 0.15),
              }}
            >
              {m.label}
            </div>
          );
        })}

        {(p.notes ?? []).map((n, i) => {
          const x = xOf.get(n.col);
          if (x === undefined) return null;
          const left = n.side === "left";
          const col = stateColor(c, n.state);
          return (
            <div key={i} style={{ position: "absolute", top: yOf(n.row), left: x, opacity: appear(n.at, n.delay) }}>
              <span style={{ position: "absolute", left: -11, top: -11, width: 22, height: 22, borderRadius: 11, background: col }} />
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translate(${left ? "-100%" : "0"}, -50%)`,
                  left: left ? -22 : 22,
                  padding: "0 8px",
                  borderRadius: 6,
                  background: alpha(c.bg, 0.9),
                  whiteSpace: "nowrap",
                  fontFamily: sans,
                  fontSize: 28,
                  lineHeight: 1.1,
                  color: col,
                }}
              >
                {n.label}
              </span>
            </div>
          );
        })}

        {(p.waits ?? []).map((a, i) => {
          const x = xOf.get(a.col);
          if (!a.label || x === undefined) return null;
          const left = a.side === "left";
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: (yOf(a.fromRow) + yOf(a.toRow)) / 2,
                left: left ? x - 22 : x + 22,
                transform: `translate(${left ? "-100%" : "0"}, -50%)`,
                padding: "0 8px",
                borderRadius: 6,
                background: alpha(c.bg, 0.9),
                whiteSpace: "pre",
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1.1,
                color: stateColor(c, a.state),
                opacity: appear(a.at, (a.delay ?? 0) + 0.2),
              }}
            >
              {a.label}
            </div>
          );
        })}

        {(p.times ?? []).map((t, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: yOf(t.row),
              width: band - 6,
              transform: "translateY(-50%)",
              fontFamily: sans,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.05,
              color: c.accent,
              opacity: appear(t.at, t.delay),
            }}
          >
            {t.label}
          </div>
        ))}

        <Legend items={p.legend} y={L.stageH - 34} />
      </StageBox>
    </StageFrame>
  );
};
