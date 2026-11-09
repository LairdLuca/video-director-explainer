import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { arrive, ease, tween } from "../motion";
import { useBeat, useShot } from "../shot";
import { alpha, sans } from "../theme";

// Pieces shared by the diagram and chart scenes (Diagram, Lanes, Matrix,
// BarChart): colours by state, entrance on a word, one highlight at a time
// with the rest dimmed, the legend, the stage box. No text lives here:
// everything comes from the scene's props.

/**
 * What an element is, always drawn the same way in the whole video:
 * existing grey (it is already there), added the accent (the work adds it),
 * missing red and dashed (it is not there today), good green, bad red,
 * neutral ink.
 */
export type State = "existing" | "added" | "missing" | "neutral" | "good" | "bad";

export const stateColor = (c: ReturnType<typeof useShot>["c"], s?: State): string => {
  switch (s) {
    case "added":
      return c.accent;
    case "missing":
    case "bad":
      return c.negative;
    case "good":
      return c.positive;
    case "existing":
      return c.muted;
    default:
      return c.ink;
  }
};

export const dashed = (s?: State) => s === "missing";

/**
 * Opacity of an entrance: without `at` the element is there from the first
 * frame (so a map can come back in a later shot with other highlights);
 * with `at` it does not exist before its word. `delay` (seconds) moves it
 * after the beat, so several pieces can enter one after the other on one
 * beat (a shot has at most 6 beats).
 */
export const useAppear = () => {
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (at?: string, delay = 0): number => {
    if (!at) return 1;
    return arrive(frame, beat(at) + Math.round(delay * fps), fps, 0.35);
  };
};

/** Frame where an element with `at` and `delay` starts; far before the shot without `at`. */
export const useStart = () => {
  const beat = useBeat();
  const { fps } = useVideoConfig();
  return (at?: string, delay = 0): number => (at ? beat(at) + Math.round(delay * fps) : -1000);
};

export type Highlight = { at: string; ids: string[]; until?: string };

/**
 * One highlight at a time: from its beat to the next one (or to `until`).
 * For an id it gives how lit it is (`up`) and how dimmed (`down`), 0 to 1.
 */
export const useHighlight = (highlights: Highlight[] = []) => {
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const d = Math.round(0.3 * fps);
  const active = highlights.map((e, i) => {
    const a = beat(e.at);
    const next = e.until ? beat(e.until) : i + 1 < highlights.length ? beat(highlights[i + 1].at) : undefined;
    const into = tween(frame, a, a + d, ease.out);
    const out = next === undefined ? 0 : tween(frame, next, next + d, ease.out);
    return { ids: e.ids, p: into * (1 - out) };
  });
  const any = Math.max(0, ...active.map((a) => a.p));
  return (id?: string) => {
    const up = id ? Math.max(0, ...active.filter((a) => a.ids.includes(id)).map((a) => a.p)) : 0;
    return { up, down: any * (1 - up) };
  };
};

export type LegendItem = { state: State; label: string; at?: string };

/** The legend on screen: one sample per state, with its word. */
export const Legend: React.FC<{ items?: LegendItem[]; x?: number; y: number }> = ({ items, x = 0, y }) => {
  const { c } = useShot();
  const appear = useAppear();
  if (!items?.length) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", gap: 40, alignItems: "center" }}>
      {items.map((v, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, opacity: appear(v.at), fontFamily: sans, fontSize: 28, color: c.ink, whiteSpace: "nowrap" }}>
          <span
            style={{
              width: 34,
              height: 22,
              borderRadius: 6,
              border: `3px ${dashed(v.state) ? "dashed" : "solid"} ${stateColor(c, v.state)}`,
              background: alpha(stateColor(c, v.state), 0.12),
            }}
          />
          {v.label}
        </div>
      ))}
    </div>
  );
};

/** The box of a diagram's coordinates: 0,0 is the top left corner of the stage, as wide as the stage less its margins. */
export const StageBox: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { L } = useShot();
  return <div style={{ position: "absolute", left: L.margin, top: L.stageTop, width: L.width - 2 * L.margin, height: L.stageH }}>{children}</div>;
};

/** An optional title of a diagram, at the top left of the stage. */
export const ChartTitle: React.FC<{ text?: string; at?: string }> = ({ text, at }) => {
  const { c } = useShot();
  const appear = useAppear();
  if (!text) return null;
  return <div style={{ position: "absolute", left: 0, top: -6, fontFamily: sans, fontWeight: 700, fontSize: 36, color: c.ink, opacity: appear(at) }}>{text}</div>;
};
