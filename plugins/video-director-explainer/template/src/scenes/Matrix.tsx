import React from "react";
import { Legend, StageBox, stateColor, useAppear, useHighlight, useStart, type Highlight, type LegendItem, type State } from "../components/chart";
import { Mark } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { useShot } from "../shot";
import { alpha, sans } from "../theme";

export type MatrixCell = { text?: string; mark?: "yes" | "no"; state?: State };
export type MatrixRow = { id?: string; label: string; cells: MatrixCell[]; at?: string; delay?: number; state?: State };
export type MatrixColumn = { label: string; state?: State; at?: string };
export type MatrixProps = {
  /** Text over the column of the row labels; the columns below are the value columns only. */
  corner?: string;
  columns: MatrixColumn[];
  rows: MatrixRow[];
  labelWidth?: number;
  rowHeight?: number;
  highlights?: Highlight[];
  legend?: LegendItem[];
};

/**
 * A comparison as a grid: rows against columns (choices against effects,
 * actions against consequences, cases against results), each row entering
 * on its beat. A cell is a text, a mark (a tick or a dash) or both.
 */
export const Matrix: React.FC = () => {
  const { shot, c, L } = useShot();
  const appear = useAppear();
  const start = useStart();
  const p = shot.props as MatrixProps;
  const highlight = useHighlight(p.highlights);
  const W = L.width - 2 * L.margin;
  const lw = p.labelWidth ?? Math.round(W * 0.36);
  const colW = (W - lw) / p.columns.length;
  const hasLegend = !!p.legend?.length;
  const header = 76;
  const room = L.stageH - header - (hasLegend ? 50 : 0);
  const rowH = Math.min(p.rowHeight ?? 92, room / p.rows.length);

  return (
    <StageFrame>
      <StageBox>
        <div style={{ position: "absolute", left: 0, top: 0, width: lw - 16, height: header - 10, display: "flex", alignItems: "center", fontFamily: sans, fontWeight: 700, fontSize: 30, color: c.muted }}>
          {p.corner}
        </div>
        {p.columns.map((k, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: lw + colW * i + 6,
              top: 0,
              width: colW - 12,
              height: header - 10,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: sans,
              fontWeight: 700,
              fontSize: 30,
              lineHeight: 1.05,
              color: stateColor(c, k.state),
              border: `3px solid ${stateColor(c, k.state)}`,
              background: c.card,
              opacity: appear(k.at),
            }}
          >
            {k.label}
          </div>
        ))}
        {p.rows.map((r, i) => {
          const y = header + rowH * i;
          const hl = highlight(r.id);
          const op = appear(r.at, r.delay) * (1 - 0.68 * hl.down);
          const enters = start(r.at, r.delay);
          return (
            <div key={i} style={{ position: "absolute", left: 0, top: y, width: W, height: rowH - 6, opacity: op }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 10,
                  background: hl.up > 0 ? alpha(c.accent, 0.13 * hl.up) : alpha(c.card, 0.75),
                  border: `2px solid ${c.hairline}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  top: 0,
                  width: lw - 30,
                  height: rowH - 6,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 30,
                  lineHeight: 1.05,
                  color: stateColor(c, r.state),
                }}
              >
                {r.label}
              </div>
              {r.cells.map((k, j) => (
                <div
                  key={j}
                  style={{
                    position: "absolute",
                    left: lw + colW * j,
                    top: 0,
                    width: colW,
                    height: rowH - 6,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    textAlign: "center",
                    padding: "0 10px",
                    fontFamily: sans,
                    fontSize: 28,
                    lineHeight: 1.05,
                    color: stateColor(c, k.state),
                  }}
                >
                  {k.mark === "yes" ? <Mark kind="tick" at={enters} size={Math.min(46, rowH - 22)} color={stateColor(c, k.state)} /> : null}
                  {k.mark === "no" ? <span style={{ width: 30, height: 5, borderRadius: 3, background: stateColor(c, k.state) }} /> : null}
                  {k.text ? <span>{k.text}</span> : null}
                </div>
              ))}
            </div>
          );
        })}
        <Legend items={p.legend} y={L.stageH - 34} />
      </StageBox>
    </StageFrame>
  );
};
