# The HTML page (contract D: `page.json`)

When the `page` choice is on, every video gets one HTML file next to it:
`out/<slug>.html`, built by `scripts/page.mjs` from `<videoDir>/page.json`.
Claude writes `page.json` from the same `facts.md` and `script.json` as the
video; the script only renders it. Nothing on the page may be invented: every
statement comes from `facts.md`, and every command shows its source.

Where this comes from: a video is quick to watch but slow to copy from, so
the commands and values go on a page next to it (a design decision of this
plugin); the "facts only, with a source" rule was seen in test runs, where the
clearest results cited a facts file for every value.

## What the page is

- One file. Inline CSS, no CDN, no web font, no network, and no script
  unless the decisions are a form (below). It works when opened from
  `file://` and when the folder is copied elsewhere.
- The video is linked with a relative path (`<video src="<slug>.mp4" controls>`),
  not embedded, so the page stays small. Keep the page and the MP4 in the
  same folder.
- Light and dark theme follow the reader's system setting, with the video's
  palette. Readable at phone width: one column, code blocks scroll sideways.
- Written in the video's language (`language`). The page's own labels
  (Description, Transcript...) exist for `it` and `en`; other languages fall
  back to English labels.

## Sections, in order

1. Title and a one-paragraph short explanation (`title`, `summary`).
2. The video.
3. Description: one section per chapter, each with a short text and the
   commands and values shown in the video, each with its source.
4. Decisions to take: only when the facts contain open decisions. Each one
   with who decides and, when the facts give them, its options and the
   trade-off of each. A decision with one proposal waiting for a yes is
   written with that one option; a decision the facts name without any
   option is written with none ("The sources give no options"). Never add
   an option to make a pair. When the facts hold no open decision, leave
   `decisions` out: the section is then omitted, never filled with invented
   choices. With `decisionForm` the section is a form (below).
5. The transcript, collapsed.

## The decision form

Only when the user asks to answer the decisions in the page: a reader who
answered in a page and was then asked the same questions again in chat
(seen in use) answered twice. With `"decisionForm": true`:

- each decision shows its options as choices, with the trade-off of each
  and the proposed one marked, plus "Another answer" and a text field. A
  decision with no option has only the text field. Text written next to a
  picked option is a note; text written with no option picked, or with
  "Another answer", is the answer. An option picked before and renamed or
  removed when the page was built again counts as no answer;
- the answers stay in the browser's local storage while they are written,
  so a reload loses nothing. They are kept by question text: a page built
  again with the same questions keeps them, a question that changed starts
  empty;
- a bar at the bottom counts the answers and has three buttons:
  **Proposal where there is no answer** (picks the proposed option only
  where nothing is answered), **Copy answers** (one block of text to paste
  in the chat) and **Save answers** (downloads `<slug>-answers.md` with the
  same text). Both name the questions still without an answer;
- the block reads `<title>: answers`, then for each decision
  `## <question>`, `Answer: <option or text>` and, when there is one,
  `Note: <text>`; a decision with no answer says `Answer: (none)`. The
  words follow the page's language;
- the page gets one small inline script, which reaches no network. The
  form needs no server, and nothing leaves the machine unless the reader
  pastes or sends it.

It changes the page, not the video: the video still shows the choice and
does not take it.

## Schema

```json
{
  "title": "acme-shop: checkout in CrashLoopBackOff after the 2.4.0 deploy",
  "language": "en",
  "summary": "One paragraph: what happened, why, what fixed it.",
  "video": "acme-shop-crashloop.mp4",
  "sections": [
    {
      "chapter": "diagnosis",
      "heading": "The pod does not stay up",
      "body": ["Paragraph one.", "Paragraph two, with `inline code`."],
      "commands": [
        { "text": "$ kubectl get pods -n shop", "source": "facts.md:14" }
      ],
      "values": [
        { "label": "Restarts", "text": "6 in 8 minutes", "source": "facts.md:15" }
      ]
    }
  ],
  "decisions": [
    {
      "question": "Keep the old variables as a fallback?",
      "options": [
        { "label": "Yes", "tradeoff": "safer rollback, two code paths to test" },
        { "label": "No", "tradeoff": "one code path, the manifest must be right first" }
      ],
      "owner": "the checkout team",
      "source": "facts.md:80"
    }
  ],
  "decisionForm": false,
  "transcript": [
    { "chapter": "problem", "text": "The shown text of sentence one." }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Page title and `<h1>`. |
| `language` | yes | `it`, `en`, ... (sets `lang` and the page's labels). |
| `summary` | yes | One paragraph; a blank line starts another paragraph. Backticks make `code`. |
| `video` | yes | Relative path from the page to the MP4, normally `<slug>.mp4`. |
| `sections[]` | yes, at least one | One per chapter, in the video's order. |
| `sections[].chapter` | no | Chapter id from `script.json` (shown as its label) or a label. |
| `sections[].heading` | yes | A short heading. |
| `sections[].body` | yes | A string (blank lines split paragraphs) or a list of paragraphs. |
| `sections[].commands[]` | no | `text` (exact, as in `facts.md`; multi-line allowed) and `source` (`facts.md:14`, `facts.md:48-53`, a commit, a file). Shown as code: only for commands, output and code. |
| `sections[].source` | no | The source of a section of prose only (a lesson, a summary of what follows), e.g. `facts.md:74-75`, shown under its text. Seen in a review: a lesson section had no source to show. A section with commands or values cites them there instead. |
| `sections[].values[]` | no | Values that are not commands: codes, names, paths, counts, dates. `text` (as in `facts.md`), `source`, optional `label`. Shown as a list of label and value, not as code. Before this field, a video without a terminal had its codes on the page as code blocks. |
| `decisions[]` | no | Omit when there are none. Each needs `question`, `owner`, `source`; `options` is a list of `{ label, tradeoff }`: two or more (each with its `tradeoff`), one (a proposal to confirm; `tradeoff` optional) or none (`[]` or left out). Optional `note`, one line from the facts. |
| `decisions[].options[].proposed` | no | `true` on the option the facts propose, at most one per decision; shown as "proposal", and the one the form's proposal button picks. |
| `decisions[].group` | no | A short heading shown above the decision when it differs from the previous decision's, to split many decisions into groups. Every decision or none: a decision with no group after a grouped one would read as part of that group. |
| `decisionForm` | no | `true` makes the decisions a form (above); only when the user asks for it. Needs `decisions`, with no two questions alike and no two options of one decision with the same label. |
| `transcript` | yes | A string, a list of strings, or a list of `{ chapter, text }`. Use the *shown* text of each sentence (exact spelling), not the respelling for the voice. |

## Build

```
node "<plugin>/scripts/page.mjs" <videoDir> [--out <file.html>]
```

(`<plugin>` is the plugin folder shown in the skill's `SKILL.md`; the plugin
variables are not filled in in reference files or in the shell.)

It validates `page.json` first and lists every problem (exit code 1), then
checks the page against `facts.md` and prints warnings for: a `facts.md:N`
source past the end of the file or on a blank line, a command line or a
value not found in `facts.md`, a number of 3 or more digits that
`facts.md` never writes, and a number of 3 or more digits that `facts.md`
has but the section shows without a source (no value, command or section
`source` with it: seen in a review, 503 and 200 in a section's text with
no source on the page). Then it writes the page. It warns when the MP4 is
not yet next to the page. Run it after `render.mjs`, or before it: the link
works as soon as the video lands.

The check is mechanical: a statement in the prose that is not in the facts
still needs the final review. It exists because a final review found four
page statements with no fact behind them, and no script had seen them.

## Common mistakes

- A command on the page that is not the one in `facts.md` (retyped, shortened
  with a different flag). Copy it from `facts.md` and cite the line.
- A `decisions` section made up to fill the page. It exists only for open
  decisions that are in the facts.
- An absolute path or a URL in `video`: the page must keep working when the
  folder is moved or sent.
- The respelled text of the voice in the transcript instead of the shown text.
- Codes and names put in `commands` because there is no terminal: use
  `values`.
- A second option invented so a decision has two: write the one the facts
  give, or none.
- A number in a section's text with no source: put it in `values` with its
  source, or give a prose-only section its `source`.
- `decisionForm` turned on without the user asking: the page gets a script
  and buttons nobody wanted. It is for a reader who answers in the page.
- The proposal written only in an option's label ("Yes (proposed)"): mark
  it with `proposed`, so the form's proposal button can pick it.

## Not yet proven

- Right-to-left languages and languages other than Italian and English for
  the page's own labels.
- Very long transcripts (over 10 minutes of narration): the page has no table
  of contents.
- Rendering in old mobile browsers: checked as text, not opened in a browser
  during development.
- `values` and decisions with 0 or 1 option: built on test data and read as
  HTML text, not yet used by a video.
- `sections[].source`: built and checked on a test video's page, read as
  HTML text.
- The decision form: tried in a headless browser on a test page (choices,
  text, reload, proposal button, copy, save, dark theme, 390 px wide), not
  yet answered by a person at a real decision point, and tried in one
  browser only. Copying from a page opened as a local file worked there;
  Save answers is the way back when it does not.
