#!/usr/bin/env node
// page: build the self-contained HTML page that goes next to the video, from page.json.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { die, parseArgs, printHelp, readJson, resolveVideoDir, slash, slugOf } from "./lib/common.mjs";

const HELP = `
Usage: node page.mjs <videoDir> [--out <file.html>]

Builds out/<slug>.html from <videoDir>/page.json (contract D, see
skills/make/references/page.md): title and short explanation, the video
(linked with a relative path, not embedded), one section per chapter with
the commands and values shown in the video and their sources, the
decisions to take (only if page.json has any) and the transcript in a
collapsed block. With "decisionForm": true the decisions become a form the
reader answers in the page: a choice per decision, a text field, the
answers kept in the browser, and Copy answers and Save answers at the bottom.

Before writing, every "facts.md:N" source is checked against facts.md (the
line must exist and not be blank), and commands, values and numbers of 3 or
more digits on the page are looked up in facts.md; misses are warnings. A
number of a section's text that facts.md has, but that no command, value
or "source" of the section backs, is a warning too.

The page is one file: inline CSS, no CDN, no web font, no network, and no
script except the small inline one of the decision form; light and dark
theme with the video palette; readable at phone width; works from file://.
Exit code 0 on success, 1 if page.json is invalid, 2 on bad arguments.
`;

const LABELS = {
  it: {
    video: "Video", description: "Descrizione", decisions: "Decisioni da prendere", transcript: "Trascrizione", source: "fonte", owner: "decide", options: "Opzioni", proposal: "Proposta, da confermare", noOptions: "Le fonti non danno opzioni.", noVideo: "Il tuo browser non riproduce questo video:",
    proposed: "proposta", formIntro: "Scegli un'opzione per ogni decisione, oppure scrivi la tua risposta nel campo sotto. La proposta è segnata. Quello che scegli e scrivi resta in questo browser anche se ricarichi la pagina. Alla fine premi Copia risposte e incolla il testo in chat, oppure Salva risposte.",
    other: "Un'altra risposta: la scrivo qui sotto", notePlaceholder: "Nota facoltativa, oppure la tua risposta se scegli \"Un'altra risposta\"", freePlaceholder: "La tua risposta",
    fill: "Proposta dove manca la risposta", copy: "Copia risposte", save: "Salva risposte", answered: "con risposta", of: "di",
    filled: "Proposta impostata dove mancava la risposta: {n}. Le scelte già fatte restano.", copied: "Copiate: incollale in chat.", copyFailed: "Copia non riuscita: usa Salva risposte.", saved: "Salvate nella cartella dei download.", missing: "Senza risposta:",
    answers: "risposte", answer: "Risposta", note: "Nota", none: "(nessuna)",
  },
  en: {
    video: "Video", description: "Description", decisions: "Decisions to take", transcript: "Transcript", source: "source", owner: "decides", options: "Options", proposal: "Proposal, to be confirmed", noOptions: "The sources give no options.", noVideo: "Your browser cannot play this video:",
    proposed: "proposal", formIntro: "Pick an option for each decision, or write your own answer in the field below it. The proposal is marked. What you pick and write stays in this browser, even after a reload. When done, press Copy answers and paste the text in the chat, or Save answers.",
    other: "Another answer: I write it below", notePlaceholder: "Optional note, or your answer if you pick \"Another answer\"", freePlaceholder: "Your answer",
    fill: "Proposal where there is no answer", copy: "Copy answers", save: "Save answers", answered: "answered", of: "of",
    filled: "Proposal set where there was no answer: {n}. The choices already made stay.", copied: "Copied: paste them in the chat.", copyFailed: "Copy failed: use Save answers.", saved: "Saved in the downloads folder.", missing: "No answer yet:",
    answers: "answers", answer: "Answer", note: "Note", none: "(none)",
  },
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Escaped text where `code` spans become <code>. */
const inline = (s) =>
  esc(s).replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

const paragraphs = (body) => (Array.isArray(body) ? body : String(body ?? "").split(/\n{2,}/)).filter((p) => String(p).trim());

/** Check contract D; returns a list of problems. */
export const validatePage = (page) => {
  const errors = [];
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  if (!str(page.title)) errors.push("title is required");
  if (!str(page.language)) errors.push("language is required (e.g. it, en)");
  if (!str(page.summary)) errors.push("summary is required (one paragraph)");
  if (!str(page.video)) errors.push("video is required (relative path, e.g. my-video.mp4)");
  else if (/^[a-z]+:\/\//i.test(page.video) || /^[a-z]:/i.test(page.video) || /^[\\/]/.test(page.video)) {
    errors.push("video must be a relative path (no URL, no drive letter, no leading slash)");
  }
  if (!Array.isArray(page.sections) || !page.sections.length) errors.push("sections must list the chapters");
  (page.sections ?? []).forEach((s, i) => {
    if (!str(s.heading)) errors.push(`sections[${i}].heading is required`);
    if (!paragraphs(s.body).length) errors.push(`sections[${i}].body is required`);
    (s.commands ?? []).forEach((c, k) => {
      if (!str(c.text)) errors.push(`sections[${i}].commands[${k}].text is required`);
      if (!str(c.source)) errors.push(`sections[${i}].commands[${k}].source is required (e.g. facts.md:14)`);
    });
    if (s.source !== undefined && !str(s.source)) errors.push(`sections[${i}].source must be text (e.g. facts.md:74-75), or left out`);
    if (s.values !== undefined && !Array.isArray(s.values)) errors.push(`sections[${i}].values must be a list`);
    (Array.isArray(s.values) ? s.values : []).forEach((v, k) => {
      if (!str(v.text)) errors.push(`sections[${i}].values[${k}].text is required`);
      if (!str(v.source)) errors.push(`sections[${i}].values[${k}].source is required (e.g. facts.md:14)`);
    });
  });
  if (page.decisions !== undefined) {
    if (!Array.isArray(page.decisions)) errors.push("decisions must be a list (omit it when there are none)");
    (page.decisions ?? []).forEach((d, i) => {
      if (!str(d.question)) errors.push(`decisions[${i}].question is required`);
      // 0 options: the sources name the decision but no choices; 1: a
      // proposal waiting for confirmation. Asking for 2 pushed test runs to
      // invent an alternative or to move the decision into prose.
      if (d.options !== undefined && !Array.isArray(d.options)) errors.push(`decisions[${i}].options must be a list (empty when the sources give none)`);
      const opts = Array.isArray(d.options) ? d.options : [];
      opts.forEach((o, k) => {
        if (!str(o.label)) errors.push(`decisions[${i}].options[${k}].label is required`);
        if (opts.length > 1 && !str(o.tradeoff)) errors.push(`decisions[${i}].options[${k}].tradeoff is required when there are 2 or more options`);
        if (o.proposed !== undefined && typeof o.proposed !== "boolean") errors.push(`decisions[${i}].options[${k}].proposed must be true or false`);
      });
      if (opts.filter((o) => o.proposed === true).length > 1) errors.push(`decisions[${i}]: at most one option is proposed`);
      if (d.group !== undefined && !str(d.group)) errors.push(`decisions[${i}].group must be text, or left out`);
      if (!str(d.owner)) errors.push(`decisions[${i}].owner is required (who decides)`);
      if (!str(d.source)) errors.push(`decisions[${i}].source is required`);
    });
  }
  if (page.decisionForm !== undefined) {
    if (typeof page.decisionForm !== "boolean") errors.push("decisionForm must be true or false");
    else if (page.decisionForm && !(Array.isArray(page.decisions) && page.decisions.length)) {
      errors.push("decisionForm needs decisions: leave it out when there are none");
    } else if (page.decisionForm) {
      // The form keeps and copies the answers by question, and the choice
      // by its label: two equal questions or labels would share one answer
      const seen = new Set();
      page.decisions.forEach((d, i) => {
        const q = String(d.question ?? "").trim();
        if (q && seen.has(q)) errors.push(`decisions[${i}].question repeats an earlier one (the form keeps the answers by question)`);
        seen.add(q);
        const labels = (Array.isArray(d.options) ? d.options : []).map((o) => String(o.label ?? "").trim());
        if (new Set(labels).size !== labels.length) errors.push(`decisions[${i}]: two options with the same label (the form keeps the choice by label)`);
      });
    }
  }
  // A decision with no group after a grouped one would read as part of it
  if (Array.isArray(page.decisions)) {
    const grouped = page.decisions.filter((d) => d.group !== undefined).length;
    if (grouped && grouped !== page.decisions.length) errors.push("decisions: give every decision a group, or none");
  }
  const t = page.transcript;
  const tOk = str(t) || (Array.isArray(t) && t.length && t.every((x) => str(x) || (x && str(x.text))));
  if (!tOk) errors.push("transcript is required (string, list of strings, or list of { chapter, text })");
  return errors;
};

const CSS = `
:root{--bg:#F6F7F9;--bg-alt:#ECEEF2;--card:#FFFFFF;--ink:#151821;--muted:#5F6675;--hairline:#DADDE3;--accent:#2563EB;--positive:#15803D;--warning:#B45309;--code-bg:#14161C;--code-ink:#E6E8EE;--code-dim:#8B93A3}
@media (prefers-color-scheme: dark){:root{--bg:#0B1120;--bg-alt:#131A2E;--card:#131A2E;--ink:#EEF1F6;--muted:#9AA3B2;--hairline:#2A3247;--accent:#60A5FA;--positive:#4ADE80;--warning:#FBBF24}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-variant-numeric:tabular-nums}
main{max-width:860px;margin:0 auto;padding:32px 16px 64px}
h1{font-size:clamp(1.6rem,4.5vw,2.3rem);line-height:1.2;margin:0 0 12px}
h2{font-size:1.35rem;margin:48px 0 12px}
h3{font-size:1.1rem;margin:28px 0 6px}
p{margin:0 0 12px}
.summary{font-size:1.1rem;color:var(--ink)}
.eyebrow{display:block;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:28px}
.eyebrow+h3{margin-top:2px}
video{display:block;width:auto;max-width:100%;max-height:80vh;height:auto;border-radius:12px;background:#000;margin:20px auto 4px}
code{font-family:ui-monospace,"Cascadia Mono",Consolas,"JetBrains Mono",Menlo,monospace;font-size:.92em;background:var(--bg-alt);padding:.1em .35em;border-radius:5px}
pre{margin:10px 0 2px;padding:14px 16px;background:var(--code-bg);color:var(--code-ink);border-radius:10px;overflow-x:auto;line-height:1.5}
pre code{background:none;padding:0;color:inherit;font-size:.9rem;white-space:pre}
.src{font-size:.8rem;color:var(--muted);margin:2px 0 12px}
.decision{background:var(--card);border:1px solid var(--hairline);border-radius:12px;padding:16px 18px;margin:14px 0}
.decision h3{margin-top:0}
.decision ul{margin:8px 0;padding-left:20px}
.decision li{margin:6px 0}
.meta{font-size:.85rem;color:var(--muted)}
dl.values{margin:10px 0 12px;display:grid;grid-template-columns:max-content 1fr;gap:4px 14px}
dl.values dt{font-weight:700}
dl.values dd{margin:0}
dl.values .src{margin:0 0 0 6px}
main.with-form{padding-bottom:240px}
.group{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:28px 0 6px}
.tag{font-size:.75rem;font-weight:700;color:var(--accent);margin-left:6px;white-space:nowrap}
.decision label.opt{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--hairline);border-radius:8px;padding:9px 11px;margin:6px 0;cursor:pointer}
.decision label.opt:has(input:checked){border-color:var(--accent);background:var(--bg-alt)}
.decision label.opt input{margin-top:.35em;flex:none}
.decision textarea{display:block;width:100%;min-height:56px;margin:8px 0;padding:8px 10px;border:1px solid var(--hairline);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit;resize:vertical}
.decision.missing{border-color:var(--warning)}
.answer-bar{position:fixed;left:0;right:0;bottom:0;z-index:10;max-height:40vh;overflow:auto;background:var(--card);border-top:1px solid var(--hairline);padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center}
.answer-bar button{font:inherit;font-size:.95rem;border:1px solid var(--accent);border-radius:8px;padding:8px 14px;cursor:pointer;background:var(--card);color:var(--accent)}
.answer-bar button.main{background:var(--accent);color:var(--card)}
.answer-bar .meta{margin:0}
.answer-bar .msg{width:100%;text-align:center;min-height:1.2em;max-height:4.5em;overflow:auto}
details{background:var(--card);border:1px solid var(--hairline);border-radius:12px;padding:12px 16px;margin-top:48px}
summary{cursor:pointer;font-weight:700}
details p{margin:10px 0}
a{color:var(--accent)}
`;

/** Id of a question in the form, from its text: a rebuilt page whose
 * decisions moved or were added keeps the answers already given. */
const questionId = (q) => {
  let h = 0x811c9dc5;
  for (const ch of String(q ?? "").trim()) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(36);
};

// The decision form, in the page: keeps the answers in the browser by
// question, copies them as one block of text and saves them as a file.
// No network. Written for a gate where the answers, written in a page,
// were asked for again in chat.
const FORM_JS = `
(()=>{
const D=JSON.parse(document.getElementById("decision-data").textContent),L=D.labels;
let st={};
try{st=JSON.parse(localStorage.getItem(D.key)||"{}")||{}}catch(e){st={}}
const keep=()=>{try{localStorage.setItem(D.key,JSON.stringify(st))}catch(e){}};
const box=id=>document.getElementById("q-"+id),msg=document.getElementById("answer-msg");
const answer=q=>{
 const a=st[q.id]||{},n=(a.n||"").trim();
 if(!a.x&&typeof a.o==="string"){
  // An option renamed or removed since: no answer, not the note as one
  return q.options.includes(a.o)?{r:a.o,n}:null;
 }
 // A text written with no option picked, or with Another answer, is the answer
 return n?{r:n,n:""}:null;
};
const missing=()=>D.q.filter(q=>!answer(q));
const count=()=>{
 const m=missing();
 D.q.forEach(q=>box(q.id).classList.remove("missing"));
 document.getElementById("answer-count").textContent=(D.q.length-m.length)+" "+L.of+" "+D.q.length+" "+L.answered;
};
const tell=t=>{
 const m=missing();
 m.forEach(q=>box(q.id).classList.add("missing"));
 msg.textContent=t+(m.length?" "+L.missing+" "+m.map(q=>q.question).join("; "):"");
};
const text=()=>{
 const out=[D.title+": "+L.answers];
 D.q.forEach(q=>{
  const a=answer(q);
  out.push("","## "+q.question,L.answer+": "+(a?a.r:L.none));
  if(a&&a.n)out.push(L.note+": "+a.n);
 });
 return out.join("\\n")+"\\n";
};
D.q.forEach(q=>{
 const s=box(q.id),ta=s.querySelector("textarea"),a=st[q.id]||{};
 s.querySelectorAll("input[type=radio]").forEach(r=>{
  const k=r.value==="other"?-1:Number(r.value);
  if(k<0?a.x:a.o===q.options[k])r.checked=true;
  r.addEventListener("change",()=>{
   st[q.id]=Object.assign(st[q.id]||{},k<0?{x:true,o:null}:{x:false,o:q.options[k]});
   keep();count();if(k<0)ta.focus();
  });
 });
 ta.value=a.n||"";
 ta.addEventListener("input",()=>{st[q.id]=Object.assign(st[q.id]||{},{n:ta.value});keep();count()});
});
document.getElementById("answer-fill").onclick=()=>{
 let k=0;
 D.q.forEach(q=>{
  if(answer(q)||q.proposed<0)return;
  st[q.id]=Object.assign(st[q.id]||{},{x:false,o:q.options[q.proposed]});k++;
  box(q.id).querySelectorAll("input[type=radio]").forEach(r=>{r.checked=r.value===String(q.proposed)});
 });
 keep();count();tell(L.filled.replace("{n}",k));
};
document.getElementById("answer-copy").onclick=async()=>{
 const t=text();
 try{await navigator.clipboard.writeText(t);tell(L.copied)}
 catch(e){
  const ta=document.createElement("textarea");ta.value=t;ta.style.cssText="position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta);ta.focus({preventScroll:true});ta.select();
  let ok=false;try{ok=document.execCommand("copy")}catch(_){}
  ta.remove();if(ok)tell(L.copied);else msg.textContent=L.copyFailed;
 }
};
document.getElementById("answer-save").onclick=()=>{
 const a=document.createElement("a");
 a.href=URL.createObjectURL(new Blob([text()],{type:"text/markdown;charset=utf-8"}));
 a.download=D.file;document.body.appendChild(a);a.click();a.remove();
 tell(L.saved+" "+D.file);
};
count();
})();
`;

/** The bar of the form and its data, after the last decision. */
const formTail = (page, L) => {
  const slug = path.basename(String(page.video)).replace(/\.[^.]+$/, "");
  const pick = ["of", "answered", "missing", "answers", "answer", "note", "none", "filled", "copied", "copyFailed", "saved"];
  const data = {
    key: `video-director-explainer:answers:${slug}`,
    file: `${slug}-answers.md`,
    title: page.title,
    labels: Object.fromEntries(pick.map((k) => [k, L[k]])),
    q: page.decisions.map((d) => {
      const opts = Array.isArray(d.options) ? d.options : [];
      // One line per question in the answers block
      return { id: questionId(d.question), question: String(d.question).replace(/\s+/g, " ").trim(), options: opts.map((o) => o.label), proposed: opts.findIndex((o) => o.proposed === true) };
    }),
  };
  return [
    '<div class="answer-bar">',
    '<span class="meta" id="answer-count"></span>',
    `<button type="button" id="answer-fill">${esc(L.fill)}</button>`,
    `<button type="button" class="main" id="answer-copy">${esc(L.copy)}</button>`,
    `<button type="button" class="main" id="answer-save">${esc(L.save)}</button>`,
    '<p class="meta msg" id="answer-msg" role="status"></p>',
    "</div>",
    // The data cannot close its own script tag
    `<script type="application/json" id="decision-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`,
    `<script>${FORM_JS.trim()}</script>`,
  ];
};

export const renderPage =(page, { chapterLabels = new Map() } = {}) => {
  const L = LABELS[String(page.language).slice(0, 2)] ?? LABELS.en;
  const form = page.decisionForm === true && Array.isArray(page.decisions) && page.decisions.length > 0;
  const out = [];
  out.push("<!doctype html>", `<html lang="${esc(page.language)}">`, "<head>", '<meta charset="utf-8">');
  out.push('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="color-scheme" content="light dark">');
  out.push(`<title>${esc(page.title)}</title>`, `<style>${CSS.trim()}</style>`, "</head>", "<body>", form ? '<main class="with-form">' : "<main>");
  out.push(`<h1>${esc(page.title)}</h1>`);
  for (const p of paragraphs(page.summary)) out.push(`<p class="summary">${inline(p)}</p>`);
  out.push(
    `<video src="${esc(page.video)}" controls preload="metadata" playsinline>${esc(L.noVideo)} <a href="${esc(page.video)}">${esc(page.video)}</a></video>`,
  );
  out.push(`<h2>${esc(L.description)}</h2>`);
  for (const s of page.sections) {
    if (s.chapter) out.push(`<span class="eyebrow">${esc(chapterLabels.get(s.chapter) ?? s.chapter)}</span>`);
    out.push(`<h3>${esc(s.heading)}</h3>`);
    for (const p of paragraphs(s.body)) out.push(`<p>${inline(p)}</p>`);
    // A section of prose only (a lesson) has its own source line
    if (typeof s.source === "string" && s.source.trim()) out.push(`<p class="src">${esc(L.source)}: ${esc(s.source)}</p>`);
    for (const c of s.commands ?? []) {
      out.push(`<pre><code>${esc(c.text)}</code></pre>`, `<p class="src">${esc(L.source)}: ${esc(c.source)}</p>`);
    }
    if (Array.isArray(s.values) && s.values.length) {
      out.push('<dl class="values">');
      for (const v of s.values) {
        out.push(`<dt>${v.label ? inline(v.label) : ""}</dt>`, `<dd>${inline(v.text)} <span class="src">${esc(L.source)}: ${esc(v.source)}</span></dd>`);
      }
      out.push("</dl>");
    }
  }
  if (Array.isArray(page.decisions) && page.decisions.length) {
    out.push(`<h2>${esc(L.decisions)}</h2>`);
    if (form) out.push(`<p class="meta">${esc(L.formIntro)}</p>`);
    let group;
    for (const d of page.decisions) {
      if (d.group && d.group !== group) out.push(`<p class="group">${esc(d.group)}</p>`);
      group = d.group;
      const opts = Array.isArray(d.options) ? d.options : [];
      const optionText = (o) =>
        `<strong>${inline(o.label)}</strong>${o.tradeoff ? `: ${inline(o.tradeoff)}` : ""}${o.proposed ? `<span class="tag">${esc(L.proposed)}</span>` : ""}`;
      const owner = `<p class="meta">${esc(L.owner)}: ${esc(d.owner)} · ${esc(L.source)}: ${esc(d.source)}</p>`;
      if (form) {
        const id = questionId(d.question);
        out.push(`<div class="decision" id="q-${id}">`, `<h3>${inline(d.question)}</h3>`);
        if (d.note) out.push(`<p>${inline(d.note)}</p>`);
        opts.forEach((o, k) => out.push(`<label class="opt"><input type="radio" name="q-${id}" value="${k}"><span>${optionText(o)}</span></label>`));
        if (opts.length) out.push(`<label class="opt"><input type="radio" name="q-${id}" value="other"><span>${esc(L.other)}</span></label>`);
        const hint = opts.length ? L.notePlaceholder : L.freePlaceholder;
        out.push(`<textarea aria-label="${esc(hint)}" placeholder="${esc(hint)}"></textarea>`, owner, "</div>");
        continue;
      }
      out.push('<div class="decision">', `<h3>${inline(d.question)}</h3>`);
      if (!opts.length) out.push(`<p class="meta">${esc(L.noOptions)}</p>`);
      else {
        out.push(`<p class="meta">${esc(opts.length === 1 ? L.proposal : L.options)}</p>`, "<ul>");
        for (const o of opts) out.push(`<li>${optionText(o)}</li>`);
        out.push("</ul>");
      }
      if (d.note) out.push(`<p>${inline(d.note)}</p>`);
      out.push(owner, "</div>");
    }
    if (form) out.push(...formTail(page, L));
  }
  out.push("<details>", `<summary>${esc(L.transcript)}</summary>`);
  const t = typeof page.transcript === "string" ? paragraphs(page.transcript) : page.transcript;
  for (const x of t) out.push(typeof x === "string" ? `<p>${esc(x)}</p>` : `<p>${x.chapter ? `<strong>${esc(chapterLabels.get(x.chapter) ?? x.chapter)}</strong> ` : ""}${esc(x.text)}</p>`);
  out.push("</details>", "</main>", "</body>", "</html>", "");
  return out.join("\n");
};

/**
 * Page text against facts.md, as warnings: "facts.md:N" sources that point
 * at no line or a blank one, commands and values not found in facts.md, and
 * numbers of 3 or more digits that facts.md never writes. A final review
 * found four page statements with no fact behind them that no check saw.
 */
export const checkAgainstFacts = (page, videoDir) => {
  const file = path.join(videoDir, "facts.md");
  if (!existsSync(file)) return ["facts.md not found: sources and values not checked"];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const flat = (s) => String(s ?? "").replace(/`|\*\*|__/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const all = flat(lines.join("\n"));
  const allDigits = all.replace(/[.,]/g, "");
  const out = [];
  const sources = [];
  const texts = [page.title, ...paragraphs(page.summary)];
  for (const s of page.sections ?? []) {
    texts.push(s.heading, ...paragraphs(s.body));
    if (typeof s.source === "string") sources.push(s.source);
    // A number the section states with no source of its own: facts.md has
    // it, but the reader cannot see where from (seen in a review: 503 and
    // 200 in a section body, with no values)
    if (typeof s.source !== "string" || !s.source.trim()) {
      // Backed: in a command or value of the section, or on a facts.md line
      // one of them cites
      const items = [...(s.commands ?? []), ...(Array.isArray(s.values) ? s.values : [])];
      const cited = items.flatMap((x) => [...String(x.source ?? "").matchAll(/facts\.md:(\d+)(?:-(\d+))?/g)])
        .flatMap((m) => lines.slice(Number(m[1]) - 1, Number(m[2] ?? m[1])));
      const backed = flat([...items.map((x) => x.text), ...cited].join(" "));
      for (const t of [s.heading, ...paragraphs(s.body)]) {
        for (const m of String(t ?? "").matchAll(/\d(?:[\d.,]*\d)?/g)) {
          const num = m[0];
          if (num.replace(/\D/g, "").length >= 3 && all.includes(num.toLowerCase()) && !backed.includes(num.toLowerCase())) {
            out.push(`number ${num} in section "${s.heading}" has no source there: add it to the section's values with its source, or give the section a source`);
          }
        }
      }
    }
    for (const c of s.commands ?? []) {
      sources.push(c.source);
      const shown = String(c.text ?? "").split(/\r?\n/).map((l) => l.replace(/^\$\s+/, "")).filter((l) => l.trim());
      for (const l of shown) if (!all.includes(flat(l))) out.push(`command line not in facts.md: "${l.trim()}"`);
    }
    for (const v of Array.isArray(s.values) ? s.values : []) {
      sources.push(v.source);
      if (!all.includes(flat(v.text))) out.push(`value not in facts.md: "${v.text}"`);
    }
  }
  for (const d of page.decisions ?? []) {
    sources.push(d.source);
    texts.push(d.group, d.question, d.note, ...(Array.isArray(d.options) ? d.options : []).flatMap((o) => [o.label, o.tradeoff]));
  }
  for (const src of sources) {
    for (const m of String(src ?? "").matchAll(/facts\.md:(\d+)(?:-(\d+))?/g)) {
      const [a, b] = [Number(m[1]), Number(m[2] ?? m[1])];
      if (a < 1 || b > lines.length) out.push(`source ${m[0]}: facts.md has ${lines.length} lines`);
      else if (a === b && !lines[a - 1].trim()) out.push(`source ${m[0]}: that line of facts.md is blank`);
    }
  }
  for (const t of texts.filter(Boolean)) {
    for (const m of String(t).matchAll(/\d(?:[\d.,]*\d)?/g)) {
      const num = m[0];
      if (num.replace(/\D/g, "").length >= 3 && !all.includes(num.toLowerCase()) && !allDigits.includes(num.replace(/[.,]/g, ""))) {
        out.push(`number ${num} is not in facts.md`);
      }
    }
  }
  return [...new Set(out)];
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printHelp(HELP);
  const videoDir = resolveVideoDir(args._[0]);
  const file = path.join(videoDir, "page.json");
  if (!existsSync(file)) die(`${slash(file)} not found`, 1);
  const page = readJson(file);
  const errors = validatePage(page);
  if (errors.length) {
    for (const e of errors) console.log(`ERROR: page.json: ${e}`);
    process.exit(1);
  }
  for (const w of checkAgainstFacts(page, videoDir)) console.log(`warning: page.json: ${w}`);
  const labels = new Map();
  const scriptFile = path.join(videoDir, "script.json");
  if (existsSync(scriptFile)) {
    try {
      for (const c of JSON.parse(readFileSync(scriptFile, "utf8")).chapters ?? []) labels.set(c.id, c.label);
    } catch {
      /* labels are optional */
    }
  }
  const out = path.resolve(args.out ?? path.join(videoDir, "out", `${slugOf(videoDir)}.html`));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, renderPage(page, { chapterLabels: labels }), "utf8");
  if (!existsSync(path.join(path.dirname(out), page.video))) console.log(`warning: ${page.video} is not next to the page yet`);
  console.log(`page: ${slash(out)}`);
};

// Run only as a script, so validatePage and renderPage can be imported.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
