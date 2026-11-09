#!/usr/bin/env node
// lint-storyboard: check storyboard.json against voiceover.json and facts.md before any still or render.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { effectSound, loadUserSounds, musicTransients, narrationTrack, planCues, SFX_KINDS, SR, speechRanges, unreadableNotes, userSounds } from "./lib/audio.mjs";
import { configMismatches, loadVideo, parseArgs, printHelp, readJson, resolveVideoDir, slash, which, writeJson } from "./lib/common.mjs";
import { EFFECT_SECONDS, seedOf } from "./lib/music.mjs";
import { writeFontModule } from "./lib/fonts.mjs";
import { iconFile, writeIconModule } from "./lib/icons.mjs";
import { loadShots, sha256, shotOfSrc, writeShotModule } from "./lib/shots.mjs";

const HELP = `
Usage: node lint-storyboard.mjs <videoDir> [--quiet]

Checks the storyboard of a video project in seconds, without rendering:
  - every beat's anchor word is found in the narration, and its frame is
    within 0.1 s of the word;
  - 3 to 6 beats per shot (1 to 6 for a slab without flow), no beat in
    the last 0.5 s of a shot;
  - every shot lasts 5 to 15 s (the last one 4 to 15 s: its 0.6 s tail
    holds the closing frame); every sentence is in exactly one shot;
  - every beat a scene refers to exists; scene props are complete;
  - the format (16:9, 9:16 or 1:1), the palettes and the captions agree
    with video.config.json, and the palette names exist;
  - layout limits of the video's format that keep content inside its band
    (terminal and code line length, the chapter bar labels on one row or
    grouped into parts, node, row, item and line counts, label lengths,
    text drawn under 28 px, terminal and code under 24 px on 9:16 and 1:1)
    and icon names;
  - every command, output line and code line on screen is in facts.md
    (a terminal title, slab and row values not found there are warnings);
  - voice files exist; transitions and light/dark switches stay few;
  - sound effects (shot "sfx": [{ kind, at }]): known kinds on beats of
    the shot; each one, and the chapter-change effect, finds a pause of the
    narration near its word (an effect never plays over speech; one that
    finds none is left out, a warning); few of them;
  - the length is inside storyboard.targetSeconds (the length the user
    asked for) or, without it, 60 s to 5 minutes (warnings).
Values are looked up in facts.md without backticks, bold or case.
Writes qa/lint.json and refreshes src/icons.generated.ts (the icons the
storyboard uses, the only ones the template bundles) and the text font
(src/fonts.generated.ts, public/fonts/text/, from video.config.json).
Exit code 0 if there are no errors, 1 otherwise
(warnings do not fail), 2 on bad arguments.
`;

const norm = (s) => String(s).replace(/\s+/g, " ").trim();

const main = async () => {
  const args = parseArgs(process.argv.slice(2), { flags: ["quiet"] });
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const { storyboard, voiceover, timeline, layoutLib: LY, palettesLib: PAL } = await loadVideo(videoDir);
  const errors = [...timeline.errors];
  const warnings = [...timeline.warnings];
  const fps = timeline.fps;
  const err = (shot, msg) => errors.push(shot ? `shot ${shot.id}: ${msg}` : msg);
  const warn = (shot, msg) => warnings.push(shot ? `shot ${shot.id}: ${msg}` : msg);
  if (!LY || !PAL) {
    for (const e of errors) console.log(`ERROR: ${e}`);
    process.exit(1);
  }

  // Format: three frame sizes, all 1080 px on the short side.
  const format = LY.formatOf(timeline.width, timeline.height);
  if (!format) err(null, `${timeline.width}x${timeline.height}: width and height must be 1920x1080 (16:9), 1080x1920 (9:16) or 1080x1080 (1:1)`);
  const L = LY.layoutFor(timeline.width, timeline.height, timeline.parts.length ? 2 : 1);
  const fmt = format ?? `${timeline.width}x${timeline.height}`;

  // Palettes: names from the template's list (an unknown name used to fall
  // back to the default without a word).
  if (storyboard.palette !== undefined) err(null, '"palette" is replaced by "paletteLight" and "paletteDark" (copy them from video.config.json)');
  for (const [key, set] of [["paletteLight", PAL.LIGHT], ["paletteDark", PAL.DARK]]) {
    if (storyboard[key] !== undefined && !(typeof storyboard[key] === "string" && Object.hasOwn(set, storyboard[key]))) err(null, `${key} "${storyboard[key]}" is not a palette (${Object.keys(set).join(", ")})`);
  }

  // Chapter bar: every chapter on screen, no scrolling (style rule 6). Labels
  // that do not fit one row need parts: two rows, the chapters of the
  // current part above the parts.
  const rowWidth = L.bar.width;
  const tooWide = (labels) => LY.labelsTooWide(labels, rowWidth);
  const perRow = Math.max(1, Math.floor((rowWidth + LY.BAR.gap) / (LY.barLabelWidth("X".repeat(14)) + 12 + LY.BAR.gap)));
  if (!timeline.parts.length) {
    const wide = tooWide(timeline.chapters.map((c) => c.label));
    if (wide.length) {
      err(null, `the ${timeline.chapters.length} chapter labels do not fit one row of the chapter bar of a ${fmt} video (${wide.map((l) => `"${l}"`).join(", ")} too long); group the chapters into parts (storyboard "parts"; about ${perRow} labels of 14 characters fit a row) or shorten the labels`);
    }
  } else {
    for (const part of timeline.parts) {
      const wide = tooWide(part.chapters.map((i) => timeline.chapters[i].label));
      if (wide.length) err(null, `part ${part.id}: its ${part.chapters.length} chapter labels do not fit one row of a ${fmt} video (${wide.map((l) => `"${l}"`).join(", ")} too long); split the part or shorten the labels`);
    }
    const wide = tooWide(timeline.parts.map((p) => p.label));
    if (wide.length) err(null, `the ${timeline.parts.length} part labels do not fit one row of a ${fmt} video (${wide.map((l) => `"${l}"`).join(", ")} too long); fewer parts or shorter labels`);
  }

  // facts.md, normalised line by line.
  const factsFile = path.join(videoDir, "facts.md");
  const factLines = existsSync(factsFile)
    ? readFileSync(factsFile, "utf8").split(/\r?\n/).map(norm).filter(Boolean)
    : null;
  if (!factLines) err(null, "facts.md not found: every command and value on screen must come from it");
  const inFacts = (text, kind) => {
    if (!factLines) return true;
    const t = norm(text);
    return factLines.some((f) => f === t || (kind === "cmd" && (f === `$ ${t}` || f === `# ${t}`)));
  };
  // A value on screen is plain text; in facts.md it may sit in backticks or
  // bold, and start a sentence. "container checkout" must find container
  // `checkout`, and "manca" must find "Manca" (two test videos).
  const plain = (s) => norm(String(s).replace(/`|\*\*|__/g, "")).toLowerCase();
  const factPlain = factLines ? factLines.map(plain) : null;
  const factsMention = (text) => !factPlain || factPlain.some((f) => f.includes(plain(text)));

  // Icons: one file per icon in the video's own lucide-react (the template loads them one by one).
  const iconsDir = path.join(videoDir, "node_modules", "lucide-react", "dist", "esm", "icons");
  const haveIcons = existsSync(iconsDir);
  if (!haveIcons) warn(null, "lucide-react not installed in the video project: icon names not checked");
  const checkIcon = (shot, name) => {
    if (!name) return err(shot, "an icon name is missing");
    if (haveIcons && !existsSync(path.join(iconsDir, `${iconFile(name)}.mjs`))) {
      err(shot, `unknown icon "${name}" (Lucide icon file names, e.g. "server", "file-text")`);
    }
  };

  // The template bundles only the icons listed in src/icons.generated.ts.
  writeIconModule(videoDir, storyboard);
  // The Screenshot scene reads sizes and boxes from src/shots.generated.ts.
  const shotData = loadShots(videoDir);
  writeShotModule(videoDir, shotData);

  // Voice files.
  for (const s of timeline.sentences) {
    if (!s.file) err(null, `sentence ${s.id}: no audio file`);
    else if (!existsSync(path.join(videoDir, "public", s.file))) err(null, `sentence ${s.id}: public/${s.file} not found`);
    if (s.timing === "estimated") warn(null, `sentence ${s.id}: word times are estimated; anchor beats to the first or last word of a clause`);
  }

  const words = (s) => norm(s).split(" ").filter(Boolean).length;

  // An image shown by a screen scene must come through shots.mjs: its size
  // and boxes are measured there, and its masks were looked at before the video.
  const checkImage = (shot, src, what) => {
    const pre = what ? `${what}: ` : "";
    const known = src ? shotOfSrc(shotData, src) : null;
    if (!src) err(shot, `${pre}src is required`);
    else if (!existsSync(path.join(videoDir, "public", src))) err(shot, `${pre}public/${src} not found`);
    else if (!known) err(shot, `${pre}${src} is not in shots.json: import or capture it with shots.mjs`);
    else {
      if (!known.reviewed) err(shot, `${pre}${src} is not reviewed: look at it, cover what must not be seen (shots.mjs mask), then shots.mjs review`);
      if (sha256(path.join(videoDir, "public", src)) !== known.sha256) err(shot, `${pre}public/${src} changed after shots.mjs wrote it: import or capture it again`);
    }
    return known;
  };
  // A slow move of the view (lib/layout.mjs ZOOM_S) needs its whole length
  // and a hold after it inside the shot: cut in the middle, the viewer never
  // reads what it went to. An error: the shot gets longer, it is not sped up
  // (the user of this plugin: lengthen the scene, describe more of what the
  // user does). Beat frames count from the shot's start. Returns the frame
  // (shot-relative) where the move and its hold end.
  const ZOOM_HOLD_S = LY.ZOOM_HOLD_S ?? 0.5;
  const SCREEN_MIN_S = LY.SCREEN_MIN_S ?? 1.5;
  const LENGTHEN = "lengthen the shot: describe in the narration, from the facts, more of what the user does and sees on this screen, or give the shot the next sentence; anchoring the move to an earlier word also works. Never speed the move up";
  const zoomEnds = (shot, at, leadS, what) => {
    const b = shot.beats[at];
    if (b === undefined || !Number.isFinite(LY.ZOOM_S)) return undefined;
    const end = b + Math.round((LY.ZOOM_S - leadS + ZOOM_HOLD_S) * fps);
    const late = shot.from + end - shot.visibleTo;
    if (late > 0) err(shot, `${what} on "${at}" needs ${(late / fps).toFixed(1)} s more than the shot has (${LY.ZOOM_S} s of move and ${ZOOM_HOLD_S} s to read): ${LENGTHEN}`);
    return end;
  };
  const STATES = ["existing", "added", "missing", "neutral", "good", "bad"];
  const checkLegend = (shot, items, need) => {
    for (const v of items ?? []) {
      if (!STATES.includes(v.state)) err(shot, `legend state "${v.state}" (${STATES.join(", ")})`);
      if (v.at) need(v.at, `legend "${v.label}"`);
    }
  };
  const checkHighlights = (shot, items, ids, need) => {
    for (const h of items ?? []) {
      need(h.at, "a highlight");
      if (h.until) need(h.until, "a highlight's end");
      for (const id of h.ids ?? []) if (!ids.has(id)) err(shot, `highlight on "${id}", which is not an id of the scene`);
    }
  };
  // Stage pixels: nothing drawn outside the stage band.
  const checkChartBox = (shot, items) => {
    const W = L.width - 2 * L.margin;
    for (const q of items) {
      if (q.x < 0 || q.y < 0 || q.x + q.w > W + 1 || q.y + q.h > L.stageH + 1) {
        err(shot, `"${q.id ?? q.label ?? ""}" at ${JSON.stringify([q.x, q.y, q.w, q.h])} is outside the stage (${Math.round(W)}x${Math.round(L.stageH)} in a ${fmt} video${timeline.parts.length ? " with parts" : ""})`);
      }
    }
  };

  for (const shot of timeline.shots) {
    const p = shot.props ?? {};
    const beats = shot.beats;
    const used = new Set();
    const need = (name, what) => {
      if (name === undefined || name === null || name === "") return err(shot, `${what}: missing beat name`);
      used.add(name);
      if (!Object.hasOwn(beats, name)) err(shot, `${what} refers to beat "${name}", which is not defined (or did not resolve)`);
    };
    // A beat may carry only a sound effect (shot "sfx", style rule 32)
    const sfx = storyboard.shots?.[shot.index]?.sfx;
    for (const fx of Array.isArray(sfx) ? sfx : []) used.add(fx?.at);
    const optional = (name) => {
      if (Object.hasOwn(beats, name)) used.add(name);
    };

    // Shot length and beats. The last shot ends on the 0.6 s tail, a held
    // closing frame without speech, so 4 s is enough there (short videos).
    const last = shot.index === timeline.shots.length - 1;
    const minS = last ? 4 : 5;
    if (shot.durationS < minS - 1e-6 || shot.durationS > 15) {
      err(shot, `lasts ${shot.durationS.toFixed(1)} s (must be ${minS}-15 s${last ? " for the last shot, tail included" : ""})`);
    }
    // A slab alone has one thing to land (two with its cross): asking it for 3
    // beats made a test video add beats no scene used.
    const n = shot.beatInfo.length;
    const minBeats = shot.scene === "HookStatus" && !p.flow ? 1 : 3;
    if (n < minBeats || n > 6) err(shot, `${n} beats (must be ${minBeats}-6 for ${shot.scene}${minBeats === 1 ? " without flow" : ""})`);
    for (const b of shot.beatInfo) {
      if (b.errorMs > 100) err(shot, `beat "${b.name}" is ${b.errorMs} ms from its word (max 100)`);
      if (b.globalFrame > shot.visibleTo - Math.round(0.5 * fps)) err(shot, `beat "${b.name}" falls in the last 0.5 s of the shot`);
      if (b.globalFrame < shot.visibleFrom) warn(shot, `beat "${b.name}" falls before the shot is fully visible`);
    }

    // Scene-specific props, beat references and layout limits.
    switch (shot.scene) {
      case "HookStatus": {
        if (!p.slab?.value) err(shot, "props.slab.value is required");
        need("slab", "the slab");
        if (p.flow) {
          need("flowIn", "the flow");
          optional("target");
          if (!Array.isArray(p.flow.nodes) || p.flow.nodes.length !== 2) err(shot, "props.flow.nodes must have 2 nodes");
          for (const node of p.flow.nodes ?? []) {
            checkIcon(shot, node.icon);
            if (words(node.label ?? "") > 3) warn(shot, `node label "${node.label}" is over 3 words`);
          }
        }
        optional("cross");
        // Stacked on a 1080 px wide frame: the node labels wrap in boxes kept
        // inside the text margin (lib/layout.mjs hookStackedFlow).
        if (p.flow && L.narrow) {
          const chars = LY.labelLineChars(LY.hookStackedFlow(L).labelWidth);
          for (const node of p.flow.nodes ?? []) {
            if (String(node.label ?? "").length > 2 * chars) warn(shot, `node label "${node.label}" needs more than two lines of about ${chars} characters in a ${fmt} video; shorten it`);
          }
        }
        if (p.slab?.value && !factsMention(p.slab.value)) warn(shot, `slab value "${p.slab.value}" not found in facts.md`);
        // Same arithmetic as the template (lib/layout.mjs): the value shrinks
        // to fit its slot (620 px beside a flow on 16:9, the text width
        // otherwise, at most 140 px under a flow on 1:1).
        if (p.slab?.value) {
          if (p.flow && p.slab.side === "center") err(shot, 'slab side "center" covers the flow: use "left" or "right", or drop the flow');
          const slot = LY.hookSlab(L, Boolean(p.flow));
          const px = LY.slabFontSize(String(p.slab.value), slot.width, slot.maxFont);
          if (px < Math.round(slot.maxFont * 0.625)) {
            warn(shot, `slab value "${p.slab.value}" (${String(p.slab.value).length} characters) is drawn at ${px} px to fit${p.flow ? " beside the flow" : ""}; a hero value reads best at 4 characters or fewer${p.flow ? " (or drop the flow: the slab alone gets the whole stage)" : ""}`);
          }
        }
        break;
      }
      case "Terminal": {
        const lines = p.lines ?? [];
        if (!lines.length) err(shot, "props.lines is empty");
        const maxChars = LY.terminalMaxChars(L, p.size);
        lines.forEach((l, i) => {
          if (!["cmd", "out", "err", "ok"].includes(l.kind)) err(shot, `line ${i + 1}: kind must be cmd, out, err or ok`);
          if (l.at) need(l.at, `line ${i + 1}`);
          else if (l.kind === "cmd") warn(shot, `line ${i + 1}: a command should start typing on the word that names it (set "at")`);
          const len = l.text.length + (l.kind === "cmd" ? 2 : 0);
          if (len > maxChars) {
            // The message says what to do (a test run met it with no remedy given)
            const full = LY.terminalMaxChars(L, "full");
            const fixes = [
              ...(p.size !== "full" && len <= full ? [`size "full" fits ${full}`] : []),
              ...(L.narrow ? ["make the video 16:9"] : []),
              "show the values of a wide table in a StatusCard (the full table in the page's values)",
              'leave a line not needed for the point out of the video (in STORYBOARD.md "Unfinished")',
            ];
            err(shot, `line ${i + 1} has ${len} characters; at the ${LY.terminalMinFont(L)} px minimum the ${p.size ?? "tile"} of a ${fmt} video fits ${maxChars}. Never shorten it; instead: ${fixes.join("; or ")}`);
          }
          if (!inFacts(l.text, l.kind)) err(shot, `line ${i + 1} is not in facts.md: "${l.text}"`);
        });
        // The title bar is on screen too: a folder nobody gave is an invented fact
        if (p.title && !factsMention(p.title)) warn(shot, `terminal title "${p.title}" not found in facts.md (leave it out unless the facts give the folder or file)`);
        const rows = LY.terminalMaxRows(L);
        if (lines.length > rows) warn(shot, `${lines.length} lines: the terminal scrolls after ${rows}`);
        const reds = lines.filter((l) => l.kind === "err").length;
        const greens = lines.filter((l) => l.kind === "ok").length;
        if (reds > 1 || greens > 1) warn(shot, "more than one red or one green line (keep one of each at most)");
        for (const f of p.focus ?? []) {
          need(f.at, `focus on line ${f.line}`);
          if (!(f.line >= 1 && f.line <= lines.length)) err(shot, `focus line ${f.line} does not exist`);
          if (!["brackets", "band", "tint"].includes(f.style)) err(shot, `focus style "${f.style}" (brackets, band, tint)`);
        }
        // Output before its command is typed: an output line's own beat, or a
        // focus on it (the template shows the line 0.3 s before the focus),
        // before the command above has finished typing at typeCps. Seen in
        // two test videos: "restarted" on screen while the command was still
        // being written.
        const typeCps = p.typeCps ?? 25;
        const typedEnd = new Map();
        let cmd = -1;
        lines.forEach((l, i) => {
          if (l.kind === "cmd") {
            cmd = Object.hasOwn(beats, l.at ?? "") ? i : -1;
            if (cmd >= 0) typedEnd.set(i, beats[l.at] + Math.max(1, Math.round((l.text.length / typeCps) * fps)));
          } else if (cmd >= 0) typedEnd.set(i, typedEnd.get(cmd));
        });
        const early = (i, frame, what) => {
          const end = lines[i]?.kind === "cmd" ? undefined : typedEnd.get(i);
          if (end === undefined || frame >= end) return;
          warn(shot, `${what} (line ${i + 1}) comes ${((end - frame) / fps).toFixed(1)} s before the command above has finished typing at ${typeCps} characters a second: anchor it to a later word, or set a higher typeCps`);
        };
        lines.forEach((l, i) => {
          if (l.kind !== "cmd" && Object.hasOwn(beats, l.at ?? "")) early(i, beats[l.at], "an output line");
        });
        for (const f of p.focus ?? []) {
          if (Object.hasOwn(beats, f.at ?? "")) early(f.line - 1, beats[f.at] - Math.round(0.3 * fps), "a focus on an output line");
        }
        break;
      }
      case "CodeWalk": {
        const code = String(p.code ?? "").replace(/\n$/, "").split("\n");
        if (!p.file) err(shot, "props.file is required");
        else if (!factsMention(p.file)) warn(shot, `file "${p.file}" not found in facts.md`);
        if (code.length < 6 || code.length > 12) warn(shot, `${code.length} code lines (the close-up is made for 6-12)`);
        // Line numbers only with startLine: they claim a place in the file
        if (p.startLine !== undefined && !(Number.isInteger(p.startLine) && p.startLine >= 1)) err(shot, "startLine must be a whole number from 1 (the snippet's first line in the file)");
        if (p.startLine !== undefined && !factsMention(String(p.startLine))) warn(shot, `startLine ${p.startLine} not found in facts.md (leave it out unless the facts give the line)`);
        const numberChars = p.startLine ? Math.max(2, String(p.startLine + code.length - 1).length) + 1 : 0;
        const maxChars = LY.codeMaxChars(L, numberChars);
        code.forEach((l, i) => {
          if (l.length > maxChars) err(shot, `code line ${i + 1} has ${l.length} characters (at the ${LY.codeMinFont(L)} px minimum a ${fmt} video fits ${maxChars}). Never shorten it; instead: ${L.narrow ? "make the video 16:9; or " : ""}${p.startLine ? "drop startLine (its numbers take room); or " : ""}leave the line out of the snippet when the point does not need it`);
          if (norm(l) && !inFacts(l, "out")) err(shot, `code line ${i + 1} is not in facts.md: "${l.trim()}"`);
        });
        if (!(p.walk ?? []).length) err(shot, "props.walk is empty");
        for (const w of p.walk ?? []) {
          need(w.at, `walk to line ${w.line}`);
          if (!(w.line >= 1 && w.line <= code.length)) err(shot, `walk line ${w.line} does not exist`);
        }
        break;
      }
      case "FlowDiagram": {
        const nodes = p.nodes ?? [];
        if (nodes.length < 2 || nodes.length > 4) err(shot, `${nodes.length} nodes (2-4; more becomes two shots)`);
        const ids = new Set(nodes.map((x) => x.id));
        for (const node of nodes) {
          need(node.at, `node ${node.id}`);
          checkIcon(shot, node.icon);
          if (words(node.label ?? "") > 3) warn(shot, `node label "${node.label}" is over 3 words`);
        }
        for (const e of p.edges ?? []) {
          need(e.at, `edge ${e.from}->${e.to}`);
          if (!ids.has(e.from) || !ids.has(e.to)) err(shot, `edge ${e.from}->${e.to} refers to a missing node`);
        }
        for (const m of p.marks ?? []) {
          need(m.at, `mark on ${m.node}`);
          if (!ids.has(m.node)) err(shot, `mark on missing node ${m.node}`);
        }
        if (p.layout && !["row", "column", "fork"].includes(p.layout)) err(shot, `layout "${p.layout}" (row, column, fork)`);
        // The same places and scale as the template: labels must stay readable.
        if (nodes.length >= 2 && nodes.length <= 4) {
          const place = LY.placeNodes(L, nodes.length, p.layout ?? "row");
          const { k } = LY.fitDrawing(LY.drawingBox(nodes, p.edges ?? [], p.marks ?? [], place), L);
          const px = Math.round(k * LY.LABEL);
          if (px < LY.MIN_TEXT) warn(shot, `the diagram is scaled to fit and its labels are drawn at ${px} px (under ${LY.MIN_TEXT}) in a ${fmt} video; shorten the labels, drop the subs or split the diagram`);
        }
        break;
      }
      case "StrikeReplace": {
        if (!p.before || !p.after) err(shot, "props.before and props.after are required");
        need(p.atStrike, "the strike");
        need(p.atAfter, "the replacement");
        if (p.atNote) need(p.atNote, "the note");
        if (p.atBefore) need(p.atBefore, "the statement");
        // Until atBefore the stage is empty paper: the freeze check fails on
        // it (seen in a test video: 0.00% change at 25% of the shot)
        if (p.atBefore && Object.hasOwn(beats, p.atBefore)) {
          const empty = beats[p.atBefore] / fps - 0.2;
          if (empty > 0.8) warn(shot, `the stage is empty for ${empty.toFixed(1)} s before the statement appears (atBefore "${p.atBefore}"): anchor atBefore to an earlier word, or start the shot on a later sentence`);
        }
        if (Object.hasOwn(beats, p.atStrike) && Object.hasOwn(beats, p.atAfter) && beats[p.atStrike] > beats[p.atAfter]) {
          warn(shot, "the strike (atStrike) comes after the replacement (atAfter): the old value is struck once the new one is already in its slot");
        }
        // The replacement stays on one line and shrinks to fit (lib/layout.mjs strikeAfterSize).
        if (p.after) {
          const px = LY.strikeAfterSize(L, p.after, LY.looksLikeCode(p.after));
          if (px < LY.MIN_TEXT) err(shot, `after "${p.after}" (${p.after.length} characters) would be drawn at ${px} px to fit one line of a ${fmt} video (under ${LY.MIN_TEXT}); shorten it`);
          else if (px < LY.statementSize(L) * 0.75) warn(shot, `after "${p.after}" is drawn at ${px} px (the statement is ${LY.statementSize(L)}) to fit one line of a ${fmt} video`);
        }
        const line = `${p.prefix ?? ""} ${p.before ?? ""}`.trim();
        const chars = LY.statementChars(L);
        // 16:9 wants one line; a 1080 px wide frame may wrap to two.
        const lines = L.narrow ? 2 : 1;
        if (line.length > chars * lines) warn(shot, `statement "${line}" is long for ${lines === 1 ? "one line" : "two lines"} of a ${fmt} video (about ${chars} characters a line)`);
        break;
      }
      case "StatusCard": {
        const rows = p.rows ?? [];
        if (!rows.length || rows.length > 5) err(shot, `${rows.length} rows (1-5)`);
        for (const r of rows) {
          need(r.at, `row ${r.label}`);
          if (!factsMention(r.value)) warn(shot, `row value "${r.value}" not found in facts.md`);
          if (r.ok !== undefined && typeof r.ok !== "boolean") err(shot, `row ${r.label}: ok must be true, false or left out (no mark)`);
        }
        // Card and slab stacked on a 1080 px wide frame: the same sizes as the template (lib/layout.mjs statusCard).
        const sc = LY.statusCard(L, rows.length, p.slab);
        if (sc.overflow > 0) warn(shot, `${rows.length} rows and a slab make a ${sc.blockH} px block for a ${L.stageH} px stage in a ${fmt} video${timeline.parts.length ? " with parts" : ""}: it runs ${sc.overflow} px under the stage; drop a row or the slab caption`);
        else if (sc.stacked && sc.slabFont < sc.fullFont) warn(shot, `the slab value is drawn at ${sc.slabFont} px (instead of ${sc.fullFont}) to fit ${rows.length} rows and the slab${p.slab?.caption ? " caption" : ""} in a ${fmt} video${timeline.parts.length ? " with parts" : ""}`);
        if (rows.filter((r) => r.ok === false).length > 1) {
          warn(shot, "more than one row with ok: false (red crosses); leave ok out for a state or an option that is not a failed check");
        }
        if (p.slab) {
          need(p.slab.at ?? "slab", "the slab");
          if (!factsMention(p.slab.value)) warn(shot, `slab value "${p.slab.value}" not found in facts.md`);
        }
        break;
      }
      case "StepList": {
        const items = p.items ?? [];
        if (!items.length || items.length > 5) err(shot, `${items.length} items (1-5)`);
        for (const it of items) {
          need(it.at, `item "${it.text}"`);
          if (it.icon) checkIcon(shot, it.icon);
        }
        // Same estimate as the template: the text shrinks so the longest item
        // stays on one line; warn only when that makes it small.
        const longest = items.reduce((a, it) => (norm(it.text).length > norm(a.text ?? "").length ? it : a), {});
        const px = LY.stepList(L, items.map((it) => ({ ...it, text: norm(it.text ?? "") }))).textSize;
        const sl = LY.stepList(L, items.map((it) => ({ ...it, text: norm(it.text ?? "") })));
        if (longest.text && norm(longest.text).length > 2 * sl.lineChars) err(shot, `item "${longest.text}" does not fit two lines of about ${sl.lineChars} characters at ${LY.MIN_TEXT} px in a ${fmt} video; shorten it`);
        else if (longest.text && sl.wrap) warn(shot, `item "${longest.text}" wraps to two lines at ${LY.MIN_TEXT} px in a ${fmt} video (about ${sl.lineChars} characters a line); shorten it to keep one line`);
        else if (longest.text && px < 36) warn(shot, `item "${longest.text}" makes the list ${px} px to stay on one line in a ${fmt} video; shorten it`);
        break;
      }
      case "Lesson": {
        const lines = p.lines ?? [];
        if (lines.length < 1 || lines.length > 3) err(shot, `${lines.length} lines (2-3)`);
        lines.forEach((l, i) => {
          const text = typeof l === "string" ? l : l.text;
          const at = typeof l === "string" ? undefined : l.at;
          if (at) need(at, `line ${i + 1}`);
          else optional(`line${i + 1}`);
          if (words(text) > 6) warn(shot, `line "${text}" is over 6 words`);
        });
        for (const r of p.reminders ?? []) {
          need(r.at, `reminder "${r.text}"`);
          checkIcon(shot, r.icon);
        }
        if (p.keyword && !lines.some((l) => (typeof l === "string" ? l : l.text).toLowerCase().includes(p.keyword.toLowerCase()))) {
          warn(shot, `keyword "${p.keyword}" is not in any line`);
        }
        break;
      }
      case "Screenshot": {
        const known = checkImage(shot, p.src);
        const size = p.size ?? known?.size;
        if (!Array.isArray(size) || size.length !== 2) err(shot, "the size of the image is unknown (shots.json or props.size)");
        else if (known && p.size && (p.size[0] !== known.size[0] || p.size[1] !== known.size[1])) err(shot, `props.size ${p.size.join("x")} is not the image's ${known.size.join("x")}: leave it out`);
        const byEye = new Set();
        for (const r of p.regions ?? []) {
          need(r.at, "a region");
          if ((r.box === undefined) === (r.ref === undefined)) {
            err(shot, 'a region takes "ref" (a box of shots.json) or "box", one of them');
            continue;
          }
          const named = r.ref !== undefined ? known?.boxes?.[r.ref] : null;
          if (r.ref !== undefined && !named) {
            err(shot, `region ref "${r.ref}" is not a box of ${p.src} (${Object.keys(known?.boxes ?? {}).join(", ") || "none"})`);
            continue;
          }
          if (named?.source === "measured") byEye.add(r.ref);
          if (r.box !== undefined) warn(shot, `region ${JSON.stringify(r.box)} has no source: prefer a box of shots.json ("ref")`);
          const [x, y, w, h] = named?.box ?? r.box ?? [];
          if (size && (x < 0 || y < 0 || x + w > size[0] || y + h > size[1])) err(shot, `region ${JSON.stringify([x, y, w, h])} is outside the image`);
          if (r.kind === "callout" && !r.label) warn(shot, "a callout without a label");
        }
        if (byEye.size) warn(shot, `boxes measured by eye, not on the page: ${[...byEye].join(", ")} (check them on the contact sheet)`);
        for (const q of p.pan ?? []) {
          need(q.at, "a pan");
          if (q.to?.[2] > 2) warn(shot, "pan scale over 2 (drawn at 2)");
          zoomEnds(shot, q.at, LY.ZOOM_LEAD_S, "the pan");
        }
        break;
      }
      case "ScreenPath": {
        const steps = p.steps ?? [];
        if (steps.length < 1 || steps.length > 6) err(shot, `${steps.length} steps (1-6, one beat each)`);
        steps.forEach((st, i) => {
          const what = `step ${i + 1}`;
          need(st.at, what);
          const known = checkImage(shot, st.src, what);
          if (st.ref !== undefined && st.box !== undefined) err(shot, `${what}: "ref" or "box", not both`);
          if (st.ref !== undefined && known && !known.boxes?.[st.ref]) err(shot, `${what}: ref "${st.ref}" is not a box of ${st.src} (${Object.keys(known.boxes ?? {}).join(", ") || "none"})`);
          if (st.box !== undefined) warn(shot, `${what}: box ${JSON.stringify(st.box)} has no source: prefer a box of shots.json ("ref")`);
          if (st.zoom !== undefined) {
            if (!Array.isArray(st.zoom) || st.zoom.length !== 3) err(shot, `${what}: zoom is [x, y, scale]`);
            else if (st.zoom[2] > 2.2) warn(shot, `${what}: zoom scale over 2.2 (drawn at 2.2)`);
            if (st.zoomAt) need(st.zoomAt, `${what}'s zoom`);
            const end = zoomEnds(shot, st.zoomAt ?? st.at, st.zoomAt ? LY.ZOOM_LEAD_S : -0.4, `${what}'s zoom`);
            // The next screen fades in from 5 frames before its beat.
            const next = steps[i + 1] ? beats[steps[i + 1].at] : undefined;
            if (end !== undefined && next !== undefined && next - 5 < end) {
              err(shot, `${what}: the next screen arrives ${((end - next + 5) / fps).toFixed(1)} s before this screen's zoom has ended and been read: ${LENGTHEN}`);
            }
          }
          if (st.note) {
            need(st.note.at, `${what}'s note`);
            if (!st.note.text) err(shot, `${what}: a note without text`);
          }
        });
        // A screen shown for less than SCREEN_MIN_S cannot be read.
        for (let i = 1; i < steps.length; i++) {
          const [a, b] = [beats[steps[i - 1].at], beats[steps[i].at]];
          if (a !== undefined && b !== undefined && (b - a) / fps < SCREEN_MIN_S) err(shot, `step ${i} is on screen for ${((b - a) / fps).toFixed(1)} s before step ${i + 1} (under ${SCREEN_MIN_S} s): ${LENGTHEN}`);
        }
        const lastStep = steps[steps.length - 1];
        if (lastStep && beats[lastStep.at] !== undefined && !lastStep.zoom && shot.from + beats[lastStep.at] + Math.round(SCREEN_MIN_S * fps) > shot.visibleTo) {
          err(shot, `step ${steps.length} is on screen for less than ${SCREEN_MIN_S} s before the shot ends: ${LENGTHEN}`);
        }
        break;
      }
      case "ScreenProposal": {
        const known = checkImage(shot, p.src);
        // The drawing must never pass for a screen that exists.
        if (!p.label) err(shot, "props.label is required: the drawing is always labelled as a proposal on screen");
        if (p.labelAt) need(p.labelAt, "the label");
        if (!(p.pieces ?? []).length) err(shot, "props.pieces is empty");
        const size = known?.size;
        for (const q of p.pieces ?? []) {
          if (!["panel", "header", "tab", "field", "button", "text", "veil"].includes(q.kind)) err(shot, `piece kind "${q.kind}" (panel, header, tab, field, button, text, veil)`);
          if (q.at) need(q.at, `piece ${q.kind}`);
          if (q.until) need(q.until, `piece ${q.kind}'s end`);
          if (size && (q.x < 0 || q.y < 0 || q.x + q.w > size[0] || q.y + q.h > size[1])) err(shot, `piece ${JSON.stringify([q.x, q.y, q.w, q.h])} is outside the image`);
          if (q.size !== undefined && q.size < LY.MIN_TEXT) warn(shot, `piece size ${q.size} is drawn at ${LY.MIN_TEXT}`);
          const early = p.labelAt && (!q.at || (beats[q.at] !== undefined && beats[p.labelAt] !== undefined && beats[q.at] < beats[p.labelAt]));
          if (early) err(shot, `piece ${q.kind} is on screen before the proposal label (labelAt "${p.labelAt}"): label the drawing from its first frame`);
        }
        for (const q of p.pointers ?? []) need(q.at, "a pointer");
        if (shot.theme === "dark") warn(shot, "a proposal on a dark shot: its label and pieces use the dark palette's light accent on a light screen; use a light shot");
        break;
      }
      case "Diagram": {
        const nodes = p.nodes ?? [];
        if (!nodes.length) err(shot, "props.nodes is empty");
        const ids = new Set(nodes.map((x) => x.id));
        if (ids.size !== nodes.length) err(shot, "two nodes with the same id");
        for (const node of nodes) {
          if (node.at) need(node.at, `node ${node.id}`);
          if (node.icon) checkIcon(shot, node.icon);
          if (node.shape && !["box", "diamond", "pill", "file"].includes(node.shape)) err(shot, `node ${node.id}: shape "${node.shape}" (box, diamond, pill, file)`);
          if (node.size !== undefined && node.size < LY.MIN_TEXT) warn(shot, `node ${node.id}: size ${node.size} is drawn at ${LY.MIN_TEXT}`);
        }
        for (const e of p.edges ?? []) {
          if (e.at) need(e.at, `edge ${e.from}->${e.to}`);
          if (!ids.has(e.from) || !ids.has(e.to)) err(shot, `edge ${e.from}->${e.to} refers to a missing node`);
        }
        for (const z of p.zones ?? []) if (z.at) need(z.at, `zone ${z.label ?? ""}`.trim());
        for (const l of p.lines ?? []) if (l.at) need(l.at, "a line");
        if (p.titleAt) need(p.titleAt, "the title");
        const named = [...ids, ...(p.zones ?? []).map((z) => z.id), ...(p.edges ?? []).map((e) => e.id)].filter(Boolean);
        checkHighlights(shot, p.highlights, new Set(named), need);
        checkLegend(shot, p.legend, need);
        checkChartBox(shot, [...nodes, ...(p.zones ?? [])]);
        break;
      }
      case "Lanes": {
        const cols = p.columns ?? [];
        if (cols.length < 2) err(shot, `${cols.length} columns (at least 2)`);
        if (!(p.rows >= 1)) err(shot, "props.rows must be 1 or more");
        const ids = new Set(cols.map((k) => k.id));
        for (const k of cols) if (k.at) need(k.at, `column ${k.id}`);
        const inRows = (r, what) => {
          if (typeof r !== "number" || r < 0 || r > p.rows - 1) err(shot, `${what}: row ${r} is outside 0-${p.rows - 1}`);
        };
        for (const m of p.messages ?? []) {
          if (m.at) need(m.at, `message ${m.from}->${m.to}`);
          if (!ids.has(m.from) || !ids.has(m.to)) err(shot, `message ${m.from}->${m.to} refers to a missing column`);
          inRows(m.row, `message ${m.from}->${m.to}`);
        }
        for (const n of p.notes ?? []) {
          if (n.at) need(n.at, `note "${n.label}"`);
          if (!ids.has(n.col)) err(shot, `note "${n.label}" is on a missing column ${n.col}`);
          inRows(n.row, `note "${n.label}"`);
        }
        for (const a of p.waits ?? []) {
          if (a.at) need(a.at, `wait on ${a.col}`);
          if (!ids.has(a.col)) err(shot, `wait on a missing column ${a.col}`);
          inRows(a.fromRow, `wait on ${a.col}`);
          inRows(a.toRow, `wait on ${a.col}`);
        }
        for (const t of p.times ?? []) {
          if (t.at) need(t.at, `time "${t.label}"`);
          inRows(t.row, `time "${t.label}"`);
        }
        if ((p.times ?? []).length && !(p.timeBand > 0)) err(shot, "times need a timeBand (the width of the band on the left)");
        checkLegend(shot, p.legend, need);
        break;
      }
      case "Matrix": {
        const cols = p.columns ?? [];
        const rows = p.rows ?? [];
        if (!cols.length) err(shot, "props.columns is empty");
        if (!rows.length) err(shot, "props.rows is empty");
        for (const k of cols) if (k.at) need(k.at, `column "${k.label}"`);
        for (const r of rows) {
          if (r.at) need(r.at, `row "${r.label}"`);
          if ((r.cells ?? []).length !== cols.length) err(shot, `row "${r.label}" has ${(r.cells ?? []).length} cells for ${cols.length} columns`);
          for (const k of r.cells ?? []) if (k.mark !== undefined && !["yes", "no"].includes(k.mark)) err(shot, `row "${r.label}": mark "${k.mark}" (yes, no)`);
        }
        checkHighlights(shot, p.highlights, new Set(rows.map((r) => r.id).filter(Boolean)), need);
        checkLegend(shot, p.legend, need);
        const room = L.stageH - 76 - (p.legend?.length ? 50 : 0);
        if (rows.length && room / rows.length < 50) err(shot, `${rows.length} rows leave ${Math.floor(room / rows.length)} px a row in a ${fmt} video: split the matrix`);
        break;
      }
      case "BarChart": {
        const bars = p.bars ?? [];
        if (!bars.length) err(shot, "props.bars is empty");
        if (!(p.scale?.max > 0)) err(shot, "props.scale.max must be a number over 0");
        for (const b of bars) {
          if (b.at) need(b.at, `bar "${b.label}"`);
          if (!(b.segments ?? []).length) err(shot, `bar "${b.label}" has no segments`);
          for (const sg of b.segments ?? []) {
            if (!(sg.from >= 0 && sg.to >= sg.from)) err(shot, `bar "${b.label}": a segment from ${sg.from} to ${sg.to}`);
            if (p.scale?.max > 0 && sg.to > p.scale.max) err(shot, `bar "${b.label}": ${sg.to} is over the scale's max ${p.scale.max}`);
          }
          // The numbers of a chart come from the sources like any value on screen.
          if (b.value && !factsMention(b.value)) warn(shot, `bar value "${b.value}" not found in facts.md`);
        }
        checkLegend(shot, p.legend, need);
        break;
      }
      case "Custom": {
        const base = String(shot.component ?? "").replace(/^.*[\\/]/, "").replace(/\.tsx$/, "");
        if (!existsSync(path.join(videoDir, "src", "custom", `${base}.tsx`))) err(shot, `src/custom/${base}.tsx not found`);
        for (const name of Object.keys(beats)) used.add(name);
        break;
      }
      default:
        break;
    }
    for (const name of Object.keys(beats)) {
      if (!used.has(name)) warn(shot, `beat "${name}" is not used by the scene`);
    }
  }

  // Film-level rules.
  // The mirror (style rule 35): the first and the last slab pair their tones.
  const slabs = timeline.shots.filter((s) => s.props?.slab?.value);
  if (slabs.length >= 2) {
    const [a, b] = [slabs[0], slabs[slabs.length - 1]];
    const [ta, tb] = [a.props.slab.tone ?? "accent", b.props.slab.tone ?? "accent"];
    if (ta !== tb && !(ta === "negative" && tb === "positive")) {
      warn(null, `slab tones ${ta} (shot ${a.id}) and ${tb} (shot ${b.id}) do not pair: use the same tone, or negative then positive`);
    }
  }
  // The crossfade between a light and a dark shot stands in for a push: not a type of its own.
  const types = new Set(timeline.shots.map((s) => s.transitionAsked).filter(Boolean));
  if (types.size > 3) warn(null, `${types.size} transition types (two, at most three)`);
  for (const s of timeline.shots) {
    if (s.transitionAsked === "fade-dark" && s.scene !== "Lesson") warn(null, `shot ${s.id}: fade-dark is meant only for the lesson card`);
  }
  let switches = 0;
  for (let i = 1; i < timeline.shots.length; i++) {
    if (timeline.shots[i - 1].theme === "light" && timeline.shots[i].theme === "dark") switches++;
  }
  const minutes = timeline.durationInFrames / fps / 60;
  if (switches > Math.max(3, 3 * minutes)) warn(null, `${switches} light-to-dark switches in ${minutes.toFixed(1)} min (at most 3 per minute)`);
  const lengthS = timeline.durationInFrames / fps;
  // storyboard.targetSeconds [min, max] is the length the user asked for;
  // without it 60 s to 5 minutes. The fixed "a how-to is 60-90 s" fired on
  // every video a user asked to be 90-150 s (three test videos), and a task
  // video with its screens and diagrams takes 2-5 minutes.
  const target = storyboard.targetSeconds;
  const asked = Array.isArray(target) && target.length === 2 && target.every((x) => Number.isFinite(x)) && target[0] < target[1];
  if (target !== undefined && !asked) err(null, "targetSeconds must be [min, max] in seconds, e.g. [90, 150]");
  if (asked) {
    if (lengthS < target[0] || lengthS > target[1]) warn(null, `the video lasts ${lengthS.toFixed(1)} s, outside the ${target[0]}-${target[1]} s asked for (targetSeconds)`);
  } else if (lengthS < 45) {
    warn(null, `the video lasts ${lengthS.toFixed(1)} s: a short video (see "Short video" in the make skill); if the user asked for this length, set targetSeconds in storyboard.json`);
  } else if (lengthS < 60 || lengthS > 300) {
    warn(null, `the video lasts ${lengthS.toFixed(1)} s, outside the default 60-300 s; if the user asked for another length, set targetSeconds in storyboard.json, otherwise propose a split`);
  }
  if (storyboard.fps && storyboard.fps !== 30) warn(null, "fps is not 30");

  // Sound effects (style rule 32): the chapter changes and the shots' "sfx",
  // each moved into a pause of the narration; the same plan render.mjs uses.
  const vcfgFile = path.join(videoDir, "video.config.json");
  const vcfg = existsSync(vcfgFile) ? readJson(vcfgFile) : {};
  let track = null;
  try {
    track = narrationTrack(videoDir, timeline);
  } catch (e) {
    warn(null, `narration WAVs not readable (${e.message}): effects placed on word times only`);
  }
  // The user's sounds (audioDir): each file is decoded now, so one ffmpeg
  // cannot read shows here and not after a render, and the effects are
  // planned with their real lengths, as the render plans them.
  const lengths = { ...EFFECT_SECONDS };
  const wantKinds = [...(vcfg.music !== false ? ["music"] : []), ...(vcfg.sfx !== false ? ["chapter", ...SFX_KINDS] : [])];
  const found = userSounds(vcfg.audioDir);
  if (wantKinds.some((k) => found[k].length)) {
    const ffmpeg = which("ffmpeg");
    if (!ffmpeg) warn(null, `audioDir ${vcfg.audioDir}: ffmpeg is not on PATH, its files were not checked`);
    else {
      const loaded = loadUserSounds(ffmpeg, vcfg.audioDir, wantKinds);
      for (const note of unreadableNotes(loaded)) warn(null, `audioDir: ${note}; replace the file, or keep the generated sound`);
      const seed = seedOf(path.basename(videoDir));
      // The user's music: notes that start sharply stand out in the pauses
      const music = loaded.sounds.music[seed % Math.max(1, loaded.sounds.music.length)];
      if (music) {
        const t = musicTransients(music);
        if (t.over) warn(null, `audioDir: ${path.basename(music.file)} has ${t.over} note(s) that start sharply (a rise of up to ${t.maxDb} dB, the limit is ${t.limitDb} dB): they will stand out in the pauses like sound effects; use a smoother music file, or the generated music`);
      }
      for (const kind of ["chapter", ...SFX_KINDS]) {
        if (loaded.sounds[kind].length) lengths[kind] = effectSound(kind, loaded.sounds, { seed }).L.length / SR;
      }
    }
  }
  const plan = planCues(timeline, storyboard, { speech: speechRanges(timeline, track), lengths });
  for (const e of plan.errors) err(null, e);
  if (vcfg.sfx !== false) {
    for (const d of plan.dropped) {
      warn(null, `${d.kind} effect (${d.from}): ${d.reason ?? "no pause near the chapter cut"}; it is left out${d.kind === "chapter" ? "" : " (anchor it to the last word of its sentence, or to the first word after a pause, or drop it)"}`);
    }
    const keyFx = plan.cues.filter((c) => SFX_KINDS.includes(c.kind)).length;
    if (keyFx > Math.max(3, Math.round(2 * minutes))) warn(null, `${keyFx} error and success effects: keep them for the key moments (about 1-3 per video)`);
  }
  // A long code word in the captions shrinks to stay in the caption box
  // (lib/layout.mjs captionCodeSize); under 28 px it is hard to read.
  if (timeline.captions) {
    const seen = new Set();
    for (const ph of timeline.phrases) {
      const size = LY.captionSize(L, ph.text);
      for (const w of ph.words.filter((x) => x.code && !seen.has(x.text))) {
        const px = LY.captionCodeSize(L, size, w.text.length);
        if (px >= LY.MIN_TEXT) continue;
        seen.add(w.text);
        warn(null, `code word "${w.text}" (${w.text.length} characters) is drawn at ${px} px in the captions of a ${fmt} video to fit the caption box; show it on screen and say less of it`);
      }
    }
  }
  // Errors, not warnings: a "no captions" or "vertical" wish must not reach the render unseen.
  for (const m of configMismatches(videoDir, storyboard, { paletteLight: PAL.DEFAULT_LIGHT, paletteDark: PAL.DEFAULT_DARK })) err(null, m);
  const font = writeFontModule(videoDir);
  for (const f of font.missing) err(null, `font file ${f} not found (video.config.json fontFiles): run config.mjs video again`);
  if (voiceover.sentences?.length && !voiceover.sentences.every((s) => s.words?.length)) warn(null, "some sentences have no word timings");

  const report = {
    ok: errors.length === 0,
    videoDir: slash(videoDir),
    durationS: Number(lengthS.toFixed(2)),
    fps,
    format: fmt,
    palettes: { light: storyboard.paletteLight ?? PAL.DEFAULT_LIGHT, dark: storyboard.paletteDark ?? PAL.DEFAULT_DARK },
    font: font.name,
    chapterBar: timeline.parts.length ? `two rows, ${timeline.parts.length} parts` : "one row",
    effects: vcfg.sfx === false ? "off" : plan.cues.map((c) => ({ kind: c.kind, from: c.from, startMs: c.startMs, endMs: c.endMs })),
    shots: timeline.shots.map((s) => ({
      id: s.id,
      scene: s.scene,
      theme: s.theme,
      transitionIn: s.transitionIn,
      ...(s.transitionIn !== s.transitionAsked ? { transitionAsked: s.transitionAsked } : {}),
      durationS: Number(s.durationS.toFixed(2)),
      beats: s.beatInfo.map((b) => ({ name: b.name, word: b.word, sentence: b.sentence, frame: b.frame, errorMs: b.errorMs })),
    })),
    errors,
    warnings,
  };
  writeJson(path.join(videoDir, "qa", "lint.json"), report);

  if (!args.quiet) {
    console.log(`video ${lengthS.toFixed(1)} s, ${fmt}, ${timeline.shots.length} shots, ${timeline.sentences.length} sentences, palettes ${report.palettes.light}/${report.palettes.dark}, font ${font.name}`);
    for (const s of report.shots) {
      console.log(`  ${s.id.padEnd(6)} ${s.scene.padEnd(13)} ${s.theme.padEnd(5)} ${String(s.durationS).padStart(5)} s  ${s.beats.length} beats`);
    }
  }
  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  console.log(errors.length ? `lint failed: ${errors.length} error(s)` : `lint passed (${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
};

main();
