import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Brackets } from "../components/primitives";
import { StageFrame } from "../components/Stage";
import { lerp, tween, zoomMove } from "../motion";
import { useBeat, useShot } from "../shot";
import { shots, type ShotBox } from "../shots.generated";
import { alpha, sans } from "../theme";

export type ScreenPathStep = {
  src: string;
  at: string;
  /** Where the user clicks next: a box of shots.json (`ref`) or a measured `box` in image pixels. */
  ref?: string;
  box?: ShotBox;
  /** Image point to bring to the centre and scale (up to 2.2): [x, y, scale]. */
  zoom?: [number, number, number];
  /** Beat of the zoom; without it the zoom starts 0.4 s after the screen appears, so the whole screen is seen first. */
  zoomAt?: string;
  note?: { text: string; at: string };
};
export type ScreenPathProps = { steps: ScreenPathStep[] };

/** Seconds after a screen appears before its zoom starts, when it has no `zoomAt`. */
const ZOOM_AFTER_S = 0.4;

/**
 * The path through the application: several real screenshots in one shot,
 * one per beat (sign-in, the page after it, each navigation step, up to the
 * screen the work changes), each with brackets on where the user clicks
 * next and, when needed, a slow zoom: at full width a 12 px label cannot be
 * read. For what `Screenshot` cannot do: it shows one image, and a shot
 * lasts at least 5 s, while a navigation step lasts two or three. Every
 * image comes through shots.mjs (masks and review included).
 */
export const ScreenPath: React.FC = () => {
  const { shot, c, L } = useShot();
  const beat = useBeat();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = shot.props as ScreenPathProps;
  const boxW = L.narrow ? L.width - 2 * L.margin : 1500;

  const frameOf = (src: string) => {
    const [iw, ih] = shots[src]?.size ?? [1600, 900];
    const fit = Math.min(boxW / iw, (L.stageH - 30) / ih);
    const w = iw * fit;
    const h = ih * fit;
    return { fit, w, h, left: (L.width - w) / 2, top: L.stageTop + (L.stageH - h) / 2 };
  };

  return (
    <StageFrame>
      {p.steps.map((step, i) => {
        const a = beat(step.at);
        const enter = i === 0 ? 1 : tween(frame, a - 5, a + 3);
        if (enter <= 0) return null;
        const q = frameOf(step.src);
        const box = step.box ?? (step.ref ? shots[step.src]?.boxes[step.ref] : undefined);
        const nextAt = i + 1 < p.steps.length ? beat(p.steps[i + 1].at) - 5 : undefined;

        // Zoom: the chosen point goes to the centre, never uncovering the image's edges.
        let s = 1;
        let tx = 0;
        let ty = 0;
        if (step.zoom) {
          const z = step.zoomAt ? zoomMove(frame, beat(step.zoomAt), fps) : zoomMove(frame, (i === 0 ? 0 : a) + 3, fps, -ZOOM_AFTER_S);
          const scale = Math.min(2.2, Math.max(1, step.zoom[2]));
          const fx = step.zoom[0] * q.fit;
          const fy = step.zoom[1] * q.fit;
          const dx = Math.min(0, Math.max(q.w - q.w * scale, q.w / 2 - fx * scale));
          const dy = Math.min(0, Math.max(q.h - q.h * scale, q.h / 2 - fy * scale));
          s = lerp(1, scale, z);
          tx = lerp(0, dx, z);
          ty = lerp(0, dy, z);
        }

        return (
          <div
            key={i}
            style={{ position: "absolute", left: q.left, top: q.top, width: q.w, height: q.h, opacity: enter, boxShadow: `0 8px 30px ${alpha(c.shadow, 0.25)}`, borderRadius: 8 }}
          >
            <div style={{ position: "absolute", inset: 0, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: q.w, height: q.h, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
                <Img src={staticFile(step.src)} style={{ width: q.w, height: q.h, display: "block" }} />
                {box ? <Brackets box={{ x: box[0] * q.fit, y: box[1] * q.fit, w: box[2] * q.fit, h: box[3] * q.fit }} at={a + 3} until={nextAt} color={c.accent} /> : null}
              </div>
            </div>
            {step.note ? (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 18,
                  transform: "translateX(-50%)",
                  padding: "8px 20px",
                  borderRadius: 8,
                  background: c.accent,
                  color: c.card,
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 32,
                  whiteSpace: "nowrap",
                  opacity: tween(frame, beat(step.note.at) - 5, beat(step.note.at) + 3),
                }}
              >
                {step.note.text}
              </div>
            ) : null}
          </div>
        );
      })}
    </StageFrame>
  );
};
