# Scene catalogue

Fifteen scene types plus a `Custom` escape hatch. A shot picks one with
`"scene"` and gives it data in `"props"`; timing never goes in props, it comes
from **beats** (named anchors on spoken words, see [storyboard.md](storyboard.md)).
A prop such as `"at": "crash"` names a beat of the same shot.

The props below are the ones the template reads (`template/src/scenes/*.tsx`)
and the lint checks (`scripts/lint-storyboard.mjs`). Every scene draws inside
the stage band, inside the shot's camera (still unless the shot asks for a
push), on the shot's `theme`.

Where the catalogue comes from: the scene types of the clearest of the
earlier test videos, restated as data-driven components; the lint
limits come from the layout of the template in each format.

**Formats.** Every scene is laid out for 16:9, 9:16 and 1:1 (style rule 1)
from the same props; the storyboard does not change with the format, only
what fits does. On 9:16 and 1:1 (a 1080 px wide frame) side-by-side layouts
are stacked and lines are shorter; each scene below says how. The lint
checks the limits of the video's format.

Icons are [Lucide](https://lucide.dev/icons/) names in file form (`server`,
`file-text`, `shopping-cart`); PascalCase is converted. Only the icons used by
the storyboard are bundled (`src/icons.generated.ts`, refreshed by the lint).

## HookStatus: the symptom or the result in one frame

```json
"props": {
  "flow": { "nodes": [{ "icon": "rocket", "label": "deploy 2.4.0" },
                      { "icon": "shopping-cart", "label": "checkout" }],
            "broken": true },
  "slab": { "value": "503", "caption": "checkout", "side": "right", "tone": "accent" }
}
```

| Prop | Required | Notes |
|---|---|---|
| `slab.value` | yes | the hero number or word: 192 px mono up to 4 characters beside a flow, smaller beyond so it fits (see below) |
| `slab.caption` | no | a short line under the value; wraps inside the slab |
| `slab.side` | no | `right` (default) or `left`, the flow takes the other half; `center` only without a flow (the lint fails otherwise: it covers node A) |
| `slab.tone` | no | `accent` (default), `negative`, `positive`; use red only if the colour is the point; in a mirror, see the pair rule below |
| `flow.nodes` | no | exactly 2, each `{ icon, label }`, label at most 3 words |
| `flow.broken` | no | a cross on node B (`true`) or a tick (`false`) |

On 9:16 and 1:1 the flow is above the slab (`side: "left"` puts the slab
above), the nodes 220 px on 9:16 and 160 on 1:1, and the
slab gets the text width, so a value of up to 6 characters keeps the hero
size; on 1:1 the value is at most 140 px, so the stack fits the shorter
stage.

Beats: `slab` (required); `flowIn` (required with `flow`: node A draws in);
optional `target` (node B lands, default 0.7 s after A) and `cross` (the mark,
default 0.3 s after the slab). Without `flow` only the slab is shown, centred,
and the shot needs only the `slab` beat (the lint asks 1-6 beats there, 3-6
everywhere else).

**Long values.** Beside a flow the slab has a 620 px slot: 4 characters fit
at 192 px, a five-digit task number at about 164 px, an 11-letter word at
about 74 px. The value shrinks to fit instead of running out of the card (a
five-digit number did, in a test video), and the lint warns when it would be
under 120 px. For a long value, use the slab without the flow: alone, it
gets the whole stage.
Use it twice: the symptom in the first shot, the resolution near the end,
same component (style rule 35). **Tones go in pairs**: both slabs `accent`
(the default; the value carries the change, 503 then 200), or `negative` for
the symptom and `positive` for the resolution. Never one of each kind: an
`accent` 503 and a `positive` 200 read as two unrelated cards, not as the
same thing resolved (a final review flagged it on a test video).

## Terminal: a command and its evidence

```json
"props": {
  "size": "tile",
  "lines": [
    { "kind": "cmd", "text": "kubectl get pods -n shop", "at": "cmd" },
    { "kind": "out", "text": "NAME                        READY   STATUS             RESTARTS   AGE" },
    { "kind": "err", "text": "checkout-7d9f8c6b5-x2kqp    0/1     CrashLoopBackOff   6          8m" }
  ],
  "focus": [{ "line": 3, "style": "brackets", "at": "crash" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `lines[]` | yes | `kind`: `cmd` (typed, `$ ` prefix added), `out`, `err` (red), `ok` (green); `text` exactly as in `facts.md` |
| `lines[].at` | no | beat where the line starts; a `cmd` without it gets a lint warning |
| `focus[]` | no | `line` (1-based), `style`: `brackets`, `band` (other lines dim to 30%), `tint`; `at` |
| `size` | no | `tile` (default: dark tile on a light stage, 1500 px) or `full` (fills the frame; use a dark theme) |
| `title` | no | the tile's title bar: a folder or a file name, only when `facts.md` gives it (the lint warns otherwise); without it the bar stays empty. Never guess a folder |
| `typeCps`, `outCps` | no | typing and output speed, default 25 and 70 characters per second |

Behaviour: commands type from their beat; output without a beat follows in
chunks of up to 3 lines; a line that a focus points at is on screen by then.
The font fits the longest line between 28 and 32 px (34 for `full`); on
9:16 and 1:1 it may go down to 24 px. Over 10 lines (16 on 9:16) the content
scrolls one line at a time.

| Format | `tile` | `full` |
|---|---|---|
| 16:9 | 1500 px wide, 85 characters a line | 1728 px, 99 characters, from the top of the stage |
| 9:16, 1:1 | the width less 64 px each side, 61 characters (at 24 px) | less 40 px each side, 65 characters, centred |

Lint: every line must equal a line of `facts.md` (whitespace normalized; a
command also matches `$ command` or `# command`); at most the characters in
the table for the video's format (the `$ ` counts); a warning for more than
one red or one green line; a warning when `title` is not found in
`facts.md`. A line too long for a narrow frame is not shortened by hand:
the video is 16:9, or the facts give a shorter output (style rule 1,
"Choosing the format").

## CodeWalk: a close-up on a file or a long output

```json
"props": {
  "file": "container checkout", "language": "yaml",
  "code": "env:\n  - name: DATABASE_URL\n    valueFrom:\n      secretKeyRef:\n        name: checkout-db\n        key: url\n",
  "walk": [{ "line": 5, "at": "secretName" }, { "line": 2, "at": "var" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `file` | yes | the title bar. A file name only when `facts.md` says the snippet is in that file; otherwise a short title from the facts that is not a file name ("container checkout"). The lint warns when it is not in `facts.md` |
| `code` | yes | 6-12 lines (warning outside), at most 79 characters per line on 16:9 (at 30 px) and 61 on 9:16 and 1:1 (at 24 px; 3-4 fewer with line numbers), each non-empty line in `facts.md` |
| `walk[]` | yes | `line` (1-based, counted in the snippet) and `at`: the band moves to that line on its beat |
| `startLine` | no | the snippet's first line number in the file, **only when `facts.md` gives it**: then line numbers are drawn from it. Without it no numbers are drawn |
| `language` | no | `yaml`, `json`, `shell` or `text` (default): subdued colouring, keys in the accent |
| `zoom` | no | default 1.6, at most 2 |

Why no numbers by default: a file name over lines numbered 1-6 says "the
first six lines of this file", a position no fact gave. A final review rated
it P0 on a test video whose facts had the snippet but not its place.

Behaviour: the camera pushes in just before the first walk beat, the band
walks from line to line (other lines at 30%), and pulls back in the last
second. The push stops where the longest line still fits between the text
margins (at least 1, at most `zoom`), so no line runs out of the frame; on
9:16 and 1:1 the tile is the width less the margins and zooms less. Use a dark theme, and `"transitionIn": "wipe"` when it continues the
terminal of the previous shot.

## FlowDiagram: a mechanism with 2 to 4 nodes

```json
"props": {
  "layout": "row",
  "nodes": [{ "id": "manifest", "icon": "file-text", "label": "manifest", "at": "manifest" },
            { "id": "container", "icon": "box", "label": "container checkout", "at": "container" }],
  "edges": [{ "from": "manifest", "to": "container", "at": "edge", "broken": true }],
  "marks": [{ "node": "container", "kind": "slot-missing", "label": "DATABASE_URL", "at": "missing" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `nodes[]` | yes | 2-4; `id`, `icon`, `label` (at most 3 words), optional `sub` (a second line), `at` |
| `edges[]` | no | `from`, `to`, `at`, optional `label`, `broken` (dashed, the target does not light) |
| `marks[]` | no | `node`, `kind`: `cross`, `tick`, `slot-missing` (a dashed box with `label`: "should be here and is not"), `at` |
| `layout` | no | `row` (default), `column`, `fork` (one source, the rest on the right) |

An edge draws in 0.4 s from its beat; its target lights when it arrives. More
than 4 nodes: split into two shots.

| Format | `row` | `column` | `fork` |
|---|---|---|---|
| 16:9 | as written | as written | as written |
| 1:1 | 2-3 nodes closer together, labels under them; 4 nodes become a column | as written | the targets closer to the source |
| 9:16 | becomes a column (labels on the right, edges downward) | as written | the targets closer to the source |

An edge label sits above a horizontal edge and on the right of a vertical
one. The lint warns when the drawing has to shrink so much that its labels
fall under 28 px: shorten the labels, drop the subs, or split the diagram.

The whole drawing (nodes, labels, edge labels, slot boxes) is centred in the
stage and scaled to fill it, up to 1.4 times: two nodes are drawn at about
280 px, four in a row stay near 200 px. Nodes keep their final places while
they arrive, so the first node of a three-node row appears on the left, not
in the middle.

## StrikeReplace: "not A, but B"

```json
"props": { "before": "DB_HOST + DB_PORT", "after": "DATABASE_URL",
           "atStrike": "strike", "atAfter": "after", "note": "dalla 2.4.0: connessione al database", "atNote": "note" }
```

| Prop | Required | Notes |
|---|---|---|
| `before`, `after` | yes | code-looking tokens are drawn in mono |
| `atStrike`, `atAfter` | yes | beat names: the strike line, then `after` rising into the slot |
| `prefix` | no | text before the slot; prefix + before at most about 40 characters on 16:9, about 25 a line and two lines on 9:16 and 1:1 (warning). It is read with `before` until the strike, so it must be true of the old value too: a neutral label ("connessione:"), never the new version ("2.4.0:" in front of the old value states the opposite of the fact) |
| `atBefore` | no | beat where the statement (prefix and `before`) appears; default: the start of the shot. Set it when the narration names the old value after the shot starts (style rule 27). Until then the stage is empty paper: more than 0.8 s of it is a lint warning, and the freeze check fails on it (seen in a test video: 0.00% change at 25% of the shot). Anchor it to an earlier word, or end the shot before on a later sentence |
| `note`, `atNote` | no | a muted line below; default 0.8 s after `atAfter` |

Beat order: the statement, then the strike, then `after`; the lint warns
when `atStrike` comes after `atAfter` (the old value would be struck after
the new one is in its slot). When the sentence names the new value first
("the new one, no longer the old one"), anchor both to the words that name
the old value, the strike first, `after` about 0.5 s later.

## StatusCard: the verification

```json
"props": {
  "title": "checkout-6b8d9f7c4-m4vtr",
  "rows": [{ "label": "STATUS", "value": "Running", "ok": true, "at": "running" },
           { "label": "RESTARTS", "value": "0", "ok": true, "at": "restarts" }],
  "slab": { "value": "200", "side": "right", "tone": "accent", "at": "slab" }
}
```

| Prop | Required | Notes |
|---|---|---|
| `title` | yes | mono, e.g. the pod name |
| `rows[]` | yes | 1-5; `label`, `value`, `at`, optional `ok`: `true` a tick, `false` a cross, 0.1 s after the row; left out, no mark |
| `slab` | no | as in HookStatus, plus `at` (default beat `slab`): the mirrored status |

Leave `ok` out for a state, an option or a value that is not a check
("open", "option A"): in a test video, rows without `ok` were drawn with a red
cross, and two options read as two failures. The lint warns when a row value
or the slab value is not found in `facts.md`, and when more than one row has
`ok: false`.

The card is on screen from the first frame (the transition shows it, not an
empty stage) and the rows arrive on their beats. With 1-3 rows the card is
wider and its type larger; a long value shrinks to stay on one line.
On 9:16 and 1:1 the card takes the width less the margins and the slab is
under it (`side: "left"`: above); on 1:1 with a slab the rows are compact
and the value at most 120 px, and the lint warns over 3 rows there (they
do not fit the stage).

## StepList: numbered steps or a checklist

```json
"props": { "title": "Prima del deploy", "ordered": true,
           "items": [{ "text": "Leggi le note di rilascio", "icon": "list-checks", "at": "notes", "done": true }] }
```

| Prop | Required | Notes |
|---|---|---|
| `items[]` | yes | 1-5; `text` (one line; a long item makes the whole list smaller), optional `icon`, `at`, `done` (a tick) |
| `ordered` | no | default `true`: numbers and a rail; the current item gets an accent ring |
| `title` | no | a heading above the list, on screen from the first frame |

Good for "what we checked", a recap, the steps of a task, the decisions of a
report. Space the item beats at least 0.4 s apart.

Layout: the title and the list are one block, centred in the stage, with
larger type for 1-3 items (up to 66 px) than for 4-5 (up to 54 px); on 9:16
and 1:1, 56 and 48. Items not yet reached
keep their place, so the block does not move as the list builds. The text
shrinks so the longest item stays on one line; the lint warns when that
takes it under 36 px.

## Lesson: the takeaway

```json
"props": {
  "lines": [{ "text": "Nuove variabili richieste?", "at": "line1" },
            { "text": "Manifest nello stesso rilascio", "at": "line2" }],
  "keyword": "stesso rilascio",
  "reminders": [{ "icon": "list-checks", "text": "note di rilascio", "at": "notes" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `lines` | yes | 1-3 (2-3 is best), at most 6 words each; strings use beats `line1`, `line2`... if defined, else they follow each other 0.15 s apart; or `{ text, at }` |
| `keyword` | no | a phrase drawn in the accent; must appear in a line (warning) |
| `reminders[]` | no | `icon`, `text`, `at`; each gets a tick |

Use `"theme": "dark"`, `"transitionIn": "fade-dark"` and `"chapterBar": false`.
The block is centred in the stage; lines are 72 px on 16:9 and 60 px on 9:16
and 1:1, where a line of 6 words may wrap.

## Screenshot: a still of a UI or a page

```json
"props": { "src": "shots/orders.png",
           "regions": [{ "ref": "failed", "kind": "callout", "label": "payment failed", "at": "failed" }],
           "pan": [{ "to": [1430, 313, 1.4], "at": "failed" }] }
```

| Prop | Required | Notes |
|---|---|---|
| `src` | yes | an image `shots.mjs` imported or captured (`shots/<name>.png`); the lint refuses any other, and one not reviewed |
| `size` | no | read from `shots.json`; give it only to check it |
| `regions[]` | no | `ref`: a box of the image in `shots.json`, measured on the page, by a test suite or on the grid; or `box` `[x, y, w, h]` in image pixels (a warning: no source). `kind`: `brackets`, `band`, `callout` (with `label`); `at` |
| `pan[]` | no | `to` `[x, y, scale]` in image pixels, scale at most 2 (a tall image needs more than a wide one); `at`. For a box, aim at its centre |

How the images get there, with their boxes and their masks, is in
[screens.md](screens.md). Never draw a fake browser frame around an image.
A tall image (a page longer than the screen) is drawn small: pan to the part
the sentence names. A pan moves the focus to the centre of the frame, so a
region far from it goes out of view: highlight it before the pan.

A pan is a slow move: it starts 0.5 s before its beat and lasts 1.6 s,
eased in and out, and the view then holds at least 0.5 s. The user of this
plugin found the first moves (0.8 s, ending on the beat) too fast to follow
on application screens. The lint fails when the move and its hold do not
fit before the end of the shot: the shot gets longer (more words on what
the user does there, or the next sentence), the move is never sped up.

## ScreenPath: the way through the application

```json
"props": { "steps": [
  { "src": "shots/login.png", "at": "login", "ref": "submit" },
  { "src": "shots/home.png", "at": "home", "ref": "orders-menu" },
  { "src": "shots/orders.png", "at": "orders", "ref": "failed", "zoom": [1430, 313, 1.8],
    "note": { "text": "Status: payment failed", "at": "failed" } }
] }
```

| Prop | Required | Notes |
|---|---|---|
| `steps[]` | yes | 1-6, one beat each; every `src` an image of `shots.mjs`, reviewed (the same rule as `Screenshot`) |
| `steps[].ref` or `.box` | no | where the user clicks next: brackets on a box of `shots.json` (`ref`), or `box` in image pixels (a warning: no source); they go when the next screen arrives |
| `steps[].zoom` | no | `[x, y, scale]` in image pixels, scale at most 2.2: the point goes to the centre without uncovering the image's edges |
| `steps[].zoomAt` | no | the zoom's beat; without it the zoom starts 0.4 s after the screen appears, so the whole screen is seen first |
| `steps[].note` | no | `{ text, at }`: a label in the accent at the bottom of the screen ("where we are", the field's name) |

The path from sign-in to the screen the work changes, screen after screen,
in one shot: a navigation step lasts two or three seconds, shorter than a
shot. Each new screen fades in over the previous one on its beat; a zoom is
the same slow move as a `Screenshot` pan (1.6 s, then 0.5 s to read). The
lint fails when a screen stays less than 1.5 s, when the next screen
arrives before a zoom has ended and been read, and when a zoom does not fit
before the end of the shot. Plan about 3 s of narration for a screen with a
zoom, 1.5 s without: the narration says what the user does on each screen.
A long path is two shots.

## ScreenProposal: a screen that does not exist yet

```json
"props": { "src": "shots/order-1042.png",
           "label": "PROPOSAL", "labelAt": "panel", "labelX": 1180, "labelY": 24,
           "pieces": [{ "kind": "panel", "x": 980, "y": 380, "w": 560, "h": 420, "at": "panel" },
                      { "kind": "header", "x": 980, "y": 380, "w": 560, "h": 64, "text": "Gift card", "at": "panel" },
                      { "kind": "field", "x": 1010, "y": 480, "w": 500, "h": 70, "text": "Card number", "at": "field" },
                      { "kind": "button", "x": 1010, "y": 600, "w": 240, "h": 80, "text": "Apply", "at": "apply" }],
           "pointers": [{ "x": 1010, "y": 600, "w": 240, "h": 80, "at": "apply" }] }
```

| Prop | Required | Notes |
|---|---|---|
| `src` | yes | the real screen the work changes, through `shots.mjs` |
| `pieces[]` | yes | `kind`: `panel` (white, dashed border in the accent), `header`, `tab` (`active`), `field`, `button`, `text`, `veil` (a dark layer that pulses: a page that waits; gone at `until`); `x, y, w, h` in image pixels; `text`, `size` (at least 28), `at`, `delay` |
| `label` | yes | the word that says it is a proposal, in the video's language ("PROPOSAL", "PROPOSTA") |
| `labelAt`, `labelX`, `labelY` | `labelX`, `labelY` yes | where and when the label appears (image pixels) |
| `pointers[]` | no | brackets on a part of the drawing: `x, y, w, h`, `at` |

What a task will add, drawn on the real screen it changes, from the
facts (the story, the design notes): never presented as a screen that
exists. The label is on screen as soon as the drawing is: the lint fails
when a piece appears before it. Use a light shot (the drawing uses the
accent on a light screen; a dark shot gets a warning).

## Diagrams and charts

Four scenes for the drawings that explain a mechanism: an overview
(`Diagram`), a sequence in time (`Lanes`), a comparison (`Matrix`), numbers
(`BarChart`). They share these rules:

- **Coordinates in stage pixels**: 0,0 is the top left corner of the stage,
  under the chapter bar. The stage is 1728 x 720 on 16:9 without parts;
  `useShot().L` and the lint's error give it for the other formats (the
  lint fails when a `Diagram` node or zone is outside it). A diagram is
  laid out for one format: the coordinates do not adapt.
- **It builds in front of the viewer**: an element with `at` does not exist
  before its beat; `delay` (seconds) moves it after the beat, so several
  pieces enter one after the other on one beat (a shot has at most 6
  beats). An element without `at` is there from the first frame: a long
  diagram goes on in the next shot with the same elements and other
  highlights (a shot lasts at most 15 s).
- **`state` has one meaning in the whole video**: `existing` grey (it is
  already there), `added` the accent (the work adds it), `missing` red and
  dashed (it is not there today), `good` green, `bad` red, `neutral` ink
  (default). Put the legend on screen: `legend: [{ state, label, at }]`.
- **`highlights: [{ at, ids, until }]`** (`Diagram`, `Matrix`): from its
  beat to the next highlight, or to `until`, the named elements are lit and
  the rest dims.
- Every element has its line in `facts.md`: a diagram shows nothing the
  sources do not say. No text under 28 px: the scenes draw labels at 28-36.

### Diagram: zones, nodes and edges

```json
"props": {
  "zones": [{ "id": "shop", "label": "ACME-SHOP", "x": 0, "y": 0, "w": 1180, "h": 640, "at": "shop" }],
  "nodes": [{ "id": "web", "label": "checkout page", "icon": "app-window", "x": 60, "y": 200, "w": 360, "h": 110, "state": "existing", "at": "page" },
            { "id": "pay", "label": "payment service", "icon": "server", "x": 700, "y": 200, "w": 400, "h": 110, "state": "existing", "at": "pay" },
            { "id": "gift", "label": "gift cards", "x": 1300, "y": 420, "w": 380, "h": 110, "state": "added", "at": "gift" }],
  "edges": [{ "id": "e1", "from": "web", "to": "pay", "label": "POST /pay", "labelDy": -34, "at": "pay", "delay": 0.3 },
            { "from": "pay", "to": "gift", "state": "added", "at": "gift", "via": [[900, 475]] }],
  "highlights": [{ "at": "gift", "ids": ["gift", "pay"] }],
  "legend": [{ "state": "existing", "label": "exists" }, { "state": "added", "label": "the task adds" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `nodes[]` | yes | `id`, `label`, `x, y, w, h`; optional `sub`, `icon`, `state`, `at`, `delay`, `shape` (`box` default, `diamond` for a decision, `pill` for a state, `file` for a file name in mono, `plain: true` for the text font), `size` (at least 28) |
| `edges[]` | no | `from`, `to`, optional `id`, `label` (`labelDx`, `labelDy` move it from the middle), `state`, `dashed`, `via` (elbow points), `at`, `delay`; it draws from its beat |
| `zones[]` | no | areas behind the nodes: `label`, `x, y, w, h`, `state`, `at`, optional `id` for highlights |
| `lines[]` | no | dashed boundaries: `x1, y1, x2, y2`, `label`, `labelX`, `labelY`, `state`, `at` |
| `title`, `titleAt` | no | a title at the top left |
| `highlights`, `legend`, `legendX`, `legendY` | no | as above; the legend sits at the bottom left by default |

For: the overview map (who talks to whom, what exists, what the work adds,
what is missing: zones and more than six nodes), decision branches and
states (`diamond`, `pill`), files or data grouped by layer (`file` nodes in
zones).

### Lanes: a sequence in time

```json
"props": {
  "columns": [{ "id": "user", "label": "customer" }, { "id": "web", "label": "checkout", "at": "web" },
              { "id": "pay", "label": "payment service", "at": "pay" }],
  "rows": 4, "timeBand": 140,
  "messages": [{ "from": "user", "to": "web", "row": 0, "label": "Pay", "at": "web" },
               { "from": "web", "to": "pay", "row": 1, "label": "POST /pay", "at": "pay" }],
  "waits": [{ "col": "pay", "fromRow": 1, "toRow": 3, "label": "up to 30 s", "state": "bad", "at": "wait" }],
  "notes": [{ "col": "web", "row": 3, "label": "timeout", "state": "bad", "side": "left", "at": "timeout" }],
  "times": [{ "row": 3, "label": "30 s", "at": "timeout" }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `columns[]` | yes | at least 2: `id`, `label`, `state`, `at` |
| `rows` | yes | how many rows of time; the space under the headers is shared among them |
| `messages[]` | no | `from`, `to`, `row` (decimals allowed), `label`, `state`, `dashed`, `at`, `delay`: an arrow that draws across |
| `notes[]` | no | a dot on a column with a label: `col`, `row`, `label`, `side` (`right` default, `left`), `state`, `at` |
| `waits[]` | no | a bar that grows down a column: `col`, `fromRow`, `toRow`, `label`, `side`, `state`, `durationS` (default 1.2), `at` |
| `times[]`, `timeBand` | no | labels in a band on the left (`timeBand` px wide, needed with `times`) |
| `legend` | no | as above |

For: what happens in which order between actors (the user, the page, a
service, a queue), and where it waits.

### Matrix: rows against columns

```json
"props": {
  "corner": "option",
  "columns": [{ "label": "cost" }, { "label": "risk" }],
  "rows": [{ "id": "a", "label": "keep the queue", "cells": [{ "text": "none" }, { "mark": "no", "state": "bad" }], "at": "a" },
           { "id": "b", "label": "retry in the page", "cells": [{ "text": "2 days" }, { "mark": "yes", "state": "good" }], "at": "b" }],
  "highlights": [{ "at": "proposal", "ids": ["b"] }]
}
```

| Prop | Required | Notes |
|---|---|---|
| `columns[]` | yes | `label`, `state`, `at` |
| `rows[]` | yes | `label`, `cells` (one per column: `text`, `mark` `yes` a tick or `no` a dash, `state`), optional `id`, `state`, `at`, `delay` |
| `corner` | no | the text over the row labels |
| `labelWidth`, `rowHeight` | no | default 36% of the width and 92 px; rows shrink to fit, and the lint fails under 50 px a row (split the matrix) |
| `highlights`, `legend` | no | as above |

For: choices against effects, actions against consequences, test cases
against results.

### BarChart: the real numbers

```json
"props": {
  "title": "Checkout errors per day",
  "bars": [{ "label": "before 2.4.0", "segments": [{ "from": 0, "to": 3, "state": "existing" }], "value": "3", "at": "before" },
           { "label": "after 2.4.0", "segments": [{ "from": 0, "to": 412, "state": "bad" }], "value": "412", "at": "after" }],
  "scale": { "max": 450, "ticks": [0, 150, 300, 450], "unit": "errors" }
}
```

| Prop | Required | Notes |
|---|---|---|
| `bars[]` | yes | `label`, `segments` (`from`, `to`, `state`, `text` inside the segment, `range: true` for a minimum and a maximum: solid to the minimum, faint to the maximum; several segments stack), optional `sub`, `value` (printed after the bar), `at`, `delay` |
| `scale` | yes | `max` (no segment above it), `ticks`, `unit` (after the last tick) |
| `title`, `labelWidth`, `barHeight`, `legend` | no | the labels take 32% of the width by default |

Each bar grows on its beat. Only numbers the sources give: the lint warns
when a `value` is not found in `facts.md`.

## Custom: the escape hatch

```json
{ "scene": "Custom", "component": "src/custom/RetryTimeline.tsx", "props": { "attempts": 3 } }
```

Only when no catalogue type fits: the four diagram and chart scenes cover
maps, sequences, comparisons and numbers. Write `<videoDir>/src/custom/<Name>.tsx`,
export the component as default or under its file name, and import what it
needs from `../kit`: `useShot()` (props, theme colours `c`), `useBeat()`
(`beat("name")` gives the frame), `useShotStart()`, `StageFrame` (paper,
camera and background, always wrap the scene in it), `tween`, `arrive`, `follow`, `ease`,
`Icon`, `Mark`, `Brackets`, `Slab`, `Paper`, `TYPE`, `BAND`, `mono`, `sans`.
`useShot().L` gives the frame of the video's format (`width`, `height`,
`stageTop`, `stageBottom`, `margin`, `textMargin`); `BAND` is the 16:9 frame
only. Follow the style guide by hand: the lint checks the beats, not the
layout. No new npm package.

## Shot settings shared by every scene

| Field | Default | Notes |
|---|---|---|
| `theme` | `light` | `dark` for close-ups and the lesson (style rule 9) |
| `transitionIn` | `push` | `wipe`, `fade-dark`; ignored on the first shot. A push between a light and a dark shot is drawn as a crossfade (style rule 29) |
| `chapterBar` | `true` | `false` hides the bar (fades with the transition) |
| `camera` | still (`{ "from": 1, "to": 1 }`) | a slow push only when asked: `{ "to": 1.04 }`. It starts again at every cut, so never on a diagram that goes on over several shots |

## Common mistakes

- Typing a command into `lines` that is not in `facts.md` (shortened, other
  flags): the lint fails. Add it to the facts with its source, or show the
  real one.
- Beat names in props that the `beats` list does not define: the lint fails
  with the shot id.
- A `Terminal` with a 120-character line: split the output across lines as
  the facts show it, or add the shortened output to `facts.md`, with its
  source, and show that (the lint fails on any line not in the facts).
- Guessing `Screenshot` region boxes: use a box of `shots.json` (`ref`),
  measured on the page or on the grid ([screens.md](screens.md)).
- A `callout` on a box near the left or right edge of the image: its label
  (500 px wide, centred under the box) is cut by the frame. Use `brackets`
  or `band` there, and say it in the narration.
- In a form whose labels sit under their fields, a box around the label and
  the field below it: that field is the next one. Look at the grid before
  writing the box (a test video measured the wrong field once).
- A `Custom` scene that does not wrap itself in `StageFrame`: no paper, no
  background.
- A camera push on a diagram split over two shots: the zoom starts again at
  the cut and reads as a jump. The user of this plugin asked to remove it;
  the camera is still by default.
- A `ScreenPath` step whose screen stays under 1.5 s, or a zoom anchored to
  the last word of the shot: the screen cannot be read, the zoom is cut, and
  the lint fails. Lengthen the shot with words on what the user does there.
- A `ScreenProposal` without its label from the first frame, or drawn on a
  dark shot: it passes for a real screen, or its label is unreadable.
- A `Diagram` laid out for 16:9 in a 9:16 video: the coordinates do not
  adapt; the lint fails on what falls outside the stage.
- A `state` used with two meanings in one video (red for "missing" in one
  shot and "error" in the next without a legend): keep one meaning and a
  legend on screen.
- A long value (a task number, a word) in a `HookStatus` slab beside a flow:
  it shrinks to fit; for a hero-size value, drop the flow.
- `ok: false` on `StatusCard` rows that are options or states, not failed
  checks: leave `ok` out.
- A `CodeWalk` titled with a file name and numbered from 1 when the facts do
  not say where the snippet sits in the file.
- Shortening a command or an output line to fit 9:16: the line is no longer
  the one in the facts. Pick 16:9 when the video must show the long lines;
  a wide table's values fit a `StatusCard`, and a line not needed for the
  point can stay out of the video.
- A `StrikeReplace` prefix that names the new state ("2.4.0:") in front of
  the old value: until the strike the screen states a false fact. A test
  review classed it P1. Use a neutral label, or put the version in the
  note.
- A `Terminal` output line, or a focus on it, anchored before its command
  has finished typing (25 characters a second): the output is on screen
  while the command is still being written. The lint warns; anchor it to a
  later word, or raise `typeCps`.

## Not yet proven

- `Custom` (tested only with a trivial component).
- `Diagram`, `Lanes`, `Matrix`, `BarChart`, `ScreenPath` and
  `ScreenProposal`: written first as custom scenes for two task videos of
  about 5 minutes each (16:9), then brought into the catalogue and checked on
  stills, the freeze probe and the lint of one lab video. Not drawn on 9:16
  or 1:1.
- `Screenshot` on 9:16 and 1:1, and with images other than full-width
  screens of web applications.
- The 9:16 and 1:1 layouts: checked on stills of every scene of the example
  (with terminal lines shortened in a lab copy) and on a 3 s clip each; 9:16
  also in one full test video, 1:1 not in a full video. `fork`, `column` with edge labels, `Screenshot` and a
  4-node row were not drawn on a narrow frame.
- The lint's layout limits are estimates from character widths and counts,
  not a measured layout; the contact sheet is the real check. The same
  estimates size the slab value, the list text and the diagram's scale.
- `StrikeReplace` with `atBefore`, and `CodeWalk` with `startLine`: checked
  with the lint, not yet in a rendered video.
