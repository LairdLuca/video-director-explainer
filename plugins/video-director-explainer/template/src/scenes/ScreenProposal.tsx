import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useAppear } from "../components/chart";
import { Brackets } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { tween } from "../motion";
import { useBeat, useShot } from "../shot";
import { shots } from "../shots.generated";
import { alpha, mono, sans } from "../theme";

export type ProposalPiece = {
  /**
   * panel: a white area with a dashed border; header: a coloured bar; tab: a
   * tab (`active` underlines it); field: a bordered box with faint text;
   * button: an outlined button; text: text only; veil: a dark layer over the
   * page that pulses (a page that waits), gone at the beat `until`.
   */
  kind: "panel" | "header" | "tab" | "field" | "button" | "text" | "veil";
  /** Image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  active?: boolean;
  /** Text size in frame pixels, never under 28. */
  size?: number;
  at?: string;
  delay?: number;
  until?: string;
};
export type ProposalPointer = { x: number; y: number; w: number; h: number; at: string };
export type ScreenProposalProps = {
  src: string;
  /** Drawn over the real screen: what the work will add, never shown as an existing screen. */
  pieces: ProposalPiece[];
  /** The label that says it is a proposal ("PROPOSAL", "proposta"); always on screen with the drawing. */
  label: string;
  labelAt?: string;
  /** Image pixels: where the label sits. */
  labelX: number;
  labelY: number;
  pointers?: ProposalPointer[];
};

/**
 * A real screenshot with the drawing of what does not exist yet on top of
 * it. The image comes through shots.mjs like any other (masks and review
 * included), and the drawing always carries a label on screen: it must
 * never look like a screen that exists.
 */
export const ScreenProposal: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = useAppear();
  const p = shot.props as ScreenProposalProps;
  const [iw, ih] = shots[p.src]?.size ?? [1600, 900];
  const boxW = L.narrow ? L.width - 2 * L.margin : 1500;
  const fit = Math.min(boxW / iw, (L.stageH - 30) / ih);
  const w = iw * fit;
  const h = ih * fit;
  const left = (L.width - w) / 2;
  const top = L.stageTop + (L.stageH - h) / 2;
  const accent = c.accent;
  // The screenshot is a light application screen whatever the stage theme:
  // the drawing uses light-screen colours, with the video's accent.
  const paper = "#FFFFFF";

  return (
    <StageFrame>
      <div style={{ position: "absolute", left, top, width: w, height: h, borderRadius: 8, overflow: "hidden", boxShadow: `0 8px 30px ${alpha(c.shadow, 0.25)}` }}>
        <Img src={staticFile(p.src)} style={{ width: w, height: h, display: "block" }} />
        {p.pieces.map((q, i) => {
          const base: React.CSSProperties = {
            position: "absolute",
            left: q.x * fit,
            top: q.y * fit,
            width: q.w * fit,
            height: q.h * fit,
            opacity: appear(q.at, q.delay),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontFamily: sans,
            fontSize: Math.max(28, q.size ?? 28),
            lineHeight: 1.08,
            boxSizing: "border-box",
          };
          switch (q.kind) {
            case "veil": {
              const out = q.until ? 1 - tween(frame, beat(q.until) - 5, beat(q.until) + 10) : 1;
              const pulse = 0.72 + 0.28 * Math.sin((frame / fps) * Math.PI * 1.6);
              return <div key={i} style={{ ...base, background: "rgba(0,0,0,0.6)", opacity: appear(q.at, q.delay) * out * pulse }} />;
            }
            case "panel":
              return <div key={i} style={{ ...base, background: paper, border: `4px dashed ${accent}` }} />;
            case "header":
              return (
                <div key={i} style={{ ...base, background: accent, color: paper, fontWeight: 600, justifyContent: "flex-start", paddingLeft: 16 }}>
                  {q.text}
                </div>
              );
            case "tab":
              return (
                <div key={i} style={{ ...base, color: q.active ? accent : "#555555", fontWeight: 600, borderBottom: q.active ? `4px solid ${accent}` : "4px solid #DDDDDD" }}>
                  {q.text}
                </div>
              );
            case "field":
              return (
                <div key={i} style={{ ...base, border: "2px solid #999999", borderRadius: 6, color: "#555555", justifyContent: "flex-start", paddingLeft: 12, textAlign: "left" }}>
                  {q.text}
                </div>
              );
            case "button":
              return (
                <div key={i} style={{ ...base, border: `3px solid ${accent}`, borderRadius: 6, color: accent, fontWeight: 600, background: paper }}>
                  {q.text}
                </div>
              );
            default:
              return (
                <div key={i} style={{ ...base, color: "#333333", justifyContent: "flex-start", textAlign: "left", padding: "0 12px" }}>
                  {q.text}
                </div>
              );
          }
        })}
        <div
          style={{
            position: "absolute",
            left: p.labelX * fit,
            top: p.labelY * fit,
            padding: "4px 18px",
            borderRadius: 8,
            background: accent,
            color: paper,
            fontFamily: mono,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: 1,
            whiteSpace: "nowrap",
            opacity: appear(p.labelAt),
          }}
        >
          {p.label}
        </div>
        {(p.pointers ?? []).map((q, i) => (
          <Brackets key={i} box={{ x: q.x * fit, y: q.y * fit, w: q.w * fit, h: q.h * fit }} at={beat(q.at)} color={accent} />
        ))}
      </div>
    </StageFrame>
  );
};
