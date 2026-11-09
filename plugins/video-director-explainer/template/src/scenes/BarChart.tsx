import React from "react";
import { useCurrentFrame } from "remotion";
import { Legend, StageBox, stateColor, useAppear, useStart, type LegendItem, type State } from "../components/chart";
import { StageFrame } from "../components/Stage";
import { tween } from "../motion";
import { useShot } from "../shot";
import { alpha, sans } from "../theme";

export type BarSegment = { from: number; to: number; state?: State; text?: string; range?: boolean };
export type Bar = { label: string; sub?: string; segments: BarSegment[]; value?: string; at?: string; delay?: number };
export type BarChartProps = {
  title?: string;
  bars: Bar[];
  scale: { max: number; ticks?: number[]; unit?: string };
  labelWidth?: number;
  barHeight?: number;
  legend?: LegendItem[];
};

/**
 * A horizontal bar chart with the real numbers, on one scale. A segment goes
 * from `from` to `to`; with `range` it is a minimum and a maximum: solid up
 * to the minimum, faint up to the maximum. Several segments in one bar make
 * a stacked bar. Each bar grows on its beat.
 */
export const BarChart: React.FC = () => {
  const { shot, c, L } = useShot();
  const frame = useCurrentFrame();
  const appear = useAppear();
  const start = useStart();
  const p = shot.props as BarChartProps;
  const W = L.width - 2 * L.margin;
  const lw = p.labelWidth ?? Math.round(W * 0.32);
  const valueRoom = 260;
  const area = W - lw - valueRoom;
  const x = (v: number) => lw + (v / p.scale.max) * area;
  const hasLegend = !!p.legend?.length;
  const top = p.title ? 70 : 10;
  const axisY = L.stageH - (hasLegend ? 110 : 60);
  const step = Math.min(p.barHeight ?? 150, (axisY - top) / p.bars.length);
  const h = Math.min(84, step - 34);
  const ticks = p.scale.ticks ?? [];

  return (
    <StageFrame>
      <StageBox>
        {p.title ? <div style={{ position: "absolute", left: 0, top: 0, fontFamily: sans, fontWeight: 700, fontSize: 36, color: c.ink }}>{p.title}</div> : null}
        <div style={{ position: "absolute", left: lw, top, width: 3, height: axisY - top, background: c.muted }} />
        <div style={{ position: "absolute", left: lw, top: axisY, width: area, height: 3, background: c.muted }} />
        {ticks.map((t, i) => (
          <div key={i} style={{ position: "absolute", left: x(t), top: axisY + 8, transform: "translateX(-50%)", fontFamily: sans, fontSize: 28, color: c.muted, whiteSpace: "nowrap" }}>
            {t}
            {i === ticks.length - 1 && p.scale.unit ? ` ${p.scale.unit}` : ""}
          </div>
        ))}
        {p.bars.map((b, i) => {
          const y = top + step * i + (step - h) / 2;
          const s0 = start(b.at, b.delay);
          const t = b.at ? tween(frame, s0 - 6, s0 + 18) : 1;
          const op = appear(b.at, b.delay);
          const end = Math.max(...b.segments.map((s) => s.to));
          return (
            <div key={i}>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: y,
                  width: lw - 22,
                  height: h,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  textAlign: "right",
                  fontFamily: sans,
                  opacity: op,
                }}
              >
                <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.05, color: c.ink }}>{b.label}</div>
                {b.sub ? <div style={{ fontSize: 28, lineHeight: 1.05, color: c.muted }}>{b.sub}</div> : null}
              </div>
              {b.segments.map((s, j) => {
                const col = stateColor(c, s.state);
                const x0 = x(s.from * t);
                const x1 = x(s.to * t);
                return s.range ? (
                  <React.Fragment key={j}>
                    <div style={{ position: "absolute", left: x(0), top: y, width: Math.max(0, x0 - x(0)), height: h, borderRadius: "0 6px 6px 0", background: col, opacity: op }} />
                    <div style={{ position: "absolute", left: x0, top: y, width: Math.max(0, x1 - x0), height: h, borderRadius: "0 6px 6px 0", background: alpha(col, 0.35), opacity: op }} />
                  </React.Fragment>
                ) : (
                  <div
                    key={j}
                    style={{
                      position: "absolute",
                      left: x0,
                      top: y,
                      width: Math.max(0, x1 - x0),
                      height: h,
                      background: col,
                      opacity: op,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      fontFamily: sans,
                      fontWeight: 600,
                      fontSize: 28,
                      color: c.card,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.text}
                  </div>
                );
              })}
              {b.value ? (
                <div
                  style={{
                    position: "absolute",
                    left: x(end) + 16,
                    top: y,
                    height: h,
                    display: "flex",
                    alignItems: "center",
                    fontFamily: sans,
                    fontWeight: 700,
                    fontSize: 36,
                    color: c.ink,
                    whiteSpace: "nowrap",
                    opacity: appear(b.at, (b.delay ?? 0) + 0.5),
                  }}
                >
                  {b.value}
                </div>
              ) : null}
            </div>
          );
        })}
        <Legend items={p.legend} y={L.stageH - 34} />
      </StageBox>
    </StageFrame>
  );
};
