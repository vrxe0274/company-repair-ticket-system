/**
 * build-turnover-pdfs.mjs
 *
 * Converts the handover Markdown docs in docs/ into well-designed,
 * branded PDFs — with zero npm dependencies and no network access.
 *
 *   md → HTML (small self-contained converter below)
 *      → branded HTML template (embedded CSS)
 *      → PDF (headless Chrome/Edge --print-to-pdf)
 *
 * Usage:  node scripts/build-turnover-pdfs.mjs
 * Output: docs/pdf/<n-folder>/<n-NAME>.pdf
 *
 * PDFs are grouped into numbered audience subfolders (see LAYOUT) and numbered
 * within each folder, e.g. docs/pdf/1-important/2-FINAL_AGREEMENT.pdf.
 * Cross-document links are rewritten to the correct relative PDF path.
 *
 * The Markdown subset supported is exactly what these docs use: headings,
 * tables, ordered/unordered (nested) lists, bold, inline code, fenced code,
 * links, blockquotes, and horizontal rules.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC_DIR = join(ROOT, 'docs')
const OUT_DIR = join(SRC_DIR, 'pdf')
const TMP_DIR = join(OUT_DIR, '.html')

// Files never rendered to PDF (e.g. confidential credentials — see .gitignore).
const SKIP = new Set(['CREDENTIALS_HANDOVER.md'])

// ── Per-document metadata (title + audience badge for the cover) ──────────────
const META = {
  'INDEX.md':                  { title: 'Handover Documentation', badge: 'Overview', sub: 'Turnover package index' },
  'FINAL_AGREEMENT.md':        { title: 'Final Terms & Conditions', badge: 'Agreement', sub: 'Handover & post-engagement agreement' },
  'CREDENTIALS_HANDOVER.md':   { title: 'Credentials Handover', badge: 'Confidential', sub: 'All accounts & passwords — secure delivery only', confidential: true },
  'USER_GUIDE.md':             { title: 'User Guide', badge: 'End Users', sub: 'How to use the app, per role' },
  'TROUBLESHOOTING_FAQ.md':    { title: 'Troubleshooting & FAQ', badge: 'End Users', sub: 'Common problems and answers' },
  'PROJECT_SUMMARY.md':        { title: 'Project Summary', badge: 'Client / Stakeholder', sub: 'What was built, limitations, next steps' },
  'OWNERSHIP_AND_SECURITY.md': { title: 'Ownership & Security', badge: 'Client / Ops', sub: 'Credentials, transfer checklist, security actions' },
  'LICENSES.md':               { title: 'License Inventory', badge: 'Client / Legal', sub: 'Third-party software licenses' },
  'ARCHITECTURE.md':           { title: 'Architecture Overview', badge: 'Developers / Ops', sub: 'Components, data flow, integrations' },
  'DEPLOYMENT_RUNBOOK.md':     { title: 'Deployment Runbook', badge: 'Developers / Ops', sub: 'Deploy, rollback, restart, monitor' },
  'KNOWN_ISSUES.md':           { title: 'Known Issues & Tech Debt', badge: 'Developers / Ops', sub: 'Follow-ups and recommendations' },
}

// ── Output layout: numbered audience subfolders + per-folder ordering ─────────
// folder = numbered subfolder under docs/pdf/; order = position within it.
const LAYOUT = {
  'INDEX.md':                  { folder: '1-important',  order: 1 },
  'FINAL_AGREEMENT.md':        { folder: '1-important',  order: 2 },
  'PROJECT_SUMMARY.md':        { folder: '1-important',  order: 3 },
  'OWNERSHIP_AND_SECURITY.md': { folder: '1-important',  order: 4 },
  'USER_GUIDE.md':             { folder: '1-important',  order: 5 },
  'TROUBLESHOOTING_FAQ.md':    { folder: '2-supporting', order: 1 },
  'LICENSES.md':               { folder: '2-supporting', order: 2 },
  'ARCHITECTURE.md':           { folder: '3-developers', order: 1 },
  'DEPLOYMENT_RUNBOOK.md':     { folder: '3-developers', order: 2 },
  'KNOWN_ISSUES.md':           { folder: '3-developers', order: 3 },
}

/** Output PDF basename for a source .md (numbered when it has a LAYOUT entry). */
function pdfNameFor(file) {
  const base = file.replace(/\.md$/, '')
  const l = LAYOUT[file]
  return l ? `${l.order}-${base}.pdf` : `${base}.pdf`
}

/** Subfolder (relative to docs/pdf/) a source .md renders into; '' = root. */
function folderFor(file) {
  return LAYOUT[file]?.folder ?? ''
}

// Source folder of the doc currently being rendered — used to resolve the
// relative path of cross-document links. Set before each page() call.
let CURRENT_FOLDER = ''

/** Relative href from CURRENT_FOLDER to a target md doc's numbered PDF (+anchor). */
function resolveDocLink(targetFile, anchor) {
  const targetFolder = folderFor(targetFile)
  const name = pdfNameFor(targetFile)
  let prefix = ''
  if (CURRENT_FOLDER !== targetFolder) {
    if (CURRENT_FOLDER) prefix += '../'              // climb out of current subfolder
    if (targetFolder)   prefix += `${targetFolder}/` // descend into target subfolder
  }
  return `${prefix}${name}${anchor || ''}`
}

// ── Inline formatting ─────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
/** Rewrite a markdown link href to the right relative target in the PDF tree. */
function resolveHref(href) {
  const m = href.match(/^([^#]*)(#.*)?$/)
  const path = m[1], anchor = m[2] || ''
  const base = path.split('/').pop()
  // A doc we render → numbered PDF at the correct relative depth.
  if (base.endsWith('.md') && LAYOUT[base]) return resolveDocLink(base, anchor)
  // Anything else (external .md, ../README.md, ../sql/…): best-effort. Swap
  // .md→.pdf and add one '../' when the current doc sits in a subfolder
  // (PDFs are one level deeper than the source markdown).
  let out = path.replace(/\.md$/, '.pdf')
  if (CURRENT_FOLDER && out.startsWith('../')) out = '../' + out
  return out + anchor
}

function inline(text) {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, href) =>
    `<a href="${resolveHref(href)}">${t}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>') // italics (after bold so ** is consumed)
  return s
}

// ── Nested list builder ───────────────────────────────────────────────────────
function renderList(items, start, baseIndent) {
  const type = items[start].ordered ? 'ol' : 'ul'
  let out = `<${type}>`
  let i = start
  while (i < items.length && items[i].indent >= baseIndent) {
    if (items[i].indent > baseIndent) break
    let li = inline(items[i].text)
    i++
    if (i < items.length && items[i].indent > baseIndent) {
      const [child, next] = renderList(items, i, items[i].indent)
      li += child
      i = next
    }
    out += `<li>${li}</li>`
  }
  return [out + `</${type}>`, i]
}

// ── Block parser ──────────────────────────────────────────────────────────────
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/

  while (i < lines.length) {
    const line = lines[i]

    if (/^```/.test(line)) {                                   // fenced code
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { out.push('<hr>'); i++; continue }

    if (/^\s*>/.test(line)) {                                  // blockquote
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      const warn = /⚠️|\*\*Warning|\*\*Note/.test(buf.join(' '))
      out.push(`<blockquote class="${warn ? 'callout' : ''}">${inline(buf.join(' '))}</blockquote>`)
      continue
    }

    // table: header row with | followed by a separator row of dashes/colons
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const splitRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
      const headers = splitRow(line)
      const aligns = splitRow(lines[i + 1]).map(c =>
        /^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : /^:-+/.test(c) ? 'left' : 'left')
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') { rows.push(splitRow(lines[i++])) }
      let t = '<table><thead><tr>'
      headers.forEach((hc, c) => { t += `<th style="text-align:${aligns[c] || 'left'}">${inline(hc)}</th>` })
      t += '</tr></thead><tbody>'
      rows.forEach(r => {
        t += '<tr>'
        headers.forEach((_, c) => { t += `<td style="text-align:${aligns[c] || 'left'}">${inline(r[c] || '')}</td>` })
        t += '</tr>'
      })
      out.push(t + '</tbody></table>')
      continue
    }

    if (listRe.test(line)) {                                   // list (nested)
      const items = []
      while (i < lines.length && listRe.test(lines[i])) {
        const m = lines[i].match(listRe)
        items.push({ indent: m[1].length, ordered: /\d+\./.test(m[2]), text: m[3] })
        i++
      }
      out.push(renderList(items, 0, 0)[0])
      continue
    }

    if (line.trim() === '') { i++; continue }                  // blank

    const para = [line]                                        // paragraph
    i++
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,6}\s|```|\s*>|\s*(---+|\*\*\*+)\s*$)/.test(lines[i]) &&
           !listRe.test(lines[i]) &&
           !(lines[i].includes('|') && i + 1 < lines.length)) {
      para.push(lines[i++])
    }
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}

// ── Branded HTML template ─────────────────────────────────────────────────────
function page(meta, bodyHtml) {
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
:root{ --brand:#7317e8; --accent:#d4007f; --ink:#1b1f2a; --muted:#6b7280;
       --line:#e6e6ef; --soft:#f7f7fb; --code:#f1f0f7; }
*{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
@page{ size:A4; margin:18mm 15mm; }
html,body{ margin:0; padding:0; }
body{ font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;
      color:var(--ink); font-size:10.5pt; line-height:1.55; }
a{ color:var(--brand); text-decoration:none; }
code{ font-family:'Cascadia Code',Consolas,'Courier New',monospace; font-size:9pt;
      background:var(--code); color:#3b2a6b; padding:1px 5px; border-radius:4px; }
pre{ background:#14172a; color:#e7e7f5; padding:14px 16px; border-radius:8px;
     overflow:auto; font-size:8.6pt; line-height:1.45; }
pre code{ background:none; color:inherit; padding:0; }

/* Cover */
.cover{ position:relative; height:247mm; border-radius:10px; overflow:hidden;
        background:linear-gradient(150deg,#2a0e54 0%,var(--brand) 55%,var(--accent) 130%);
        color:#fff; padding:24mm 20mm; display:flex; flex-direction:column;
        page-break-after:always; }
.cover.confidential{ background:linear-gradient(150deg,#1c1c22 0%,#7a1020 55%,#c2122e 130%); }
.cover .ribbon{ position:absolute; top:26px; right:-52px; transform:rotate(45deg);
        background:#c2122e; color:#fff; font-size:9pt; font-weight:700; letter-spacing:2px;
        padding:6px 60px; box-shadow:0 2px 6px rgba(0,0,0,.3); }
.cover .brandmark{ font-weight:800; letter-spacing:3px; font-size:13pt; }
.cover .sysname{ margin-top:6px; opacity:.85; font-size:10pt; letter-spacing:1px; }
.cover .badge{ align-self:flex-start; margin-top:46mm; background:rgba(255,255,255,.16);
        border:1px solid rgba(255,255,255,.35); padding:6px 14px; border-radius:999px;
        font-size:9pt; letter-spacing:1.5px; text-transform:uppercase; }
.cover h1{ font-size:34pt; line-height:1.08; margin:14px 0 8px; font-weight:800; }
.cover .sub{ font-size:13pt; opacity:.9; font-weight:400; max-width:140mm; }
.cover .foot{ margin-top:auto; display:flex; justify-content:space-between;
        align-items:flex-end; font-size:9pt; opacity:.85; }
.cover .rule{ width:60mm; height:4px; background:#fff; border-radius:2px; margin:18px 0 0; opacity:.9; }

/* Body */
.content h1{ font-size:19pt; margin:0 0 4px; }
.content h2{ font-size:14pt; margin:22px 0 8px; padding-bottom:6px;
        border-bottom:2px solid var(--line); position:relative; }
.content h2::before{ content:""; position:absolute; left:-10px; top:3px; width:5px; height:15px;
        background:linear-gradient(var(--brand),var(--accent)); border-radius:3px; }
.content h3{ font-size:11.5pt; margin:16px 0 6px; color:#33285c; }
.content h2,.content h3{ page-break-after:avoid; }
p{ margin:7px 0; }
ul,ol{ margin:7px 0; padding-left:20px; }
li{ margin:3px 0; }
li>ul,li>ol{ margin:3px 0; }
blockquote{ margin:12px 0; padding:10px 14px; background:var(--soft);
        border-left:4px solid var(--brand); border-radius:0 6px 6px 0; color:#39354a; }
blockquote.callout{ background:#fff5fb; border-left-color:var(--accent); }
hr{ border:none; border-top:1px solid var(--line); margin:18px 0; }

table{ width:100%; border-collapse:collapse; margin:12px 0; font-size:9.3pt;
        page-break-inside:avoid; }
thead th{ background:linear-gradient(135deg,var(--brand),#8b2fe0); color:#fff;
        text-align:left; padding:8px 10px; font-weight:600; }
thead th:first-child{ border-top-left-radius:7px; }
thead th:last-child{ border-top-right-radius:7px; }
tbody td{ padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
tbody tr:nth-child(even){ background:#faf9fe; }
tbody tr:last-child td{ border-bottom:none; }
</style></head><body>
<section class="cover${meta.confidential ? ' confidential' : ''}">
  ${meta.confidential ? '<div class="ribbon">CONFIDENTIAL</div>' : ''}
  <div>
    <div class="brandmark">VRXE</div>
    <div class="sysname">REPAIR TICKET SYSTEM</div>
  </div>
  <span class="badge">${meta.badge}</span>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="sub">${escapeHtml(meta.sub)}</div>
  <div class="rule"></div>
  <div class="foot">
    <div>Handover documentation</div>
    <div>${date}</div>
  </div>
</section>
<main class="content">${bodyHtml}</main>
</body></html>`
}

// ── Find a headless browser ───────────────────────────────────────────────────
function findBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('No Chrome/Edge found for PDF rendering.')
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Wipe the output tree so renames/renumbering don't leave stale PDFs behind.
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })
mkdirSync(TMP_DIR, { recursive: true })
const browser = findBrowser()
console.log('Renderer:', browser)

// By default, confidential files in SKIP are NOT rendered. Pass --all (or
// --include-confidential) to deliberately render them. Their PDFs are gitignored.
const includeConfidential = process.argv.includes('--all') || process.argv.includes('--include-confidential')
// Build in per-folder order so the console output reads top-to-bottom.
const docs = readdirSync(SRC_DIR)
  .filter(f => f.endsWith('.md') && (includeConfidential || !SKIP.has(f)))
  .sort((a, b) => {
    const fa = folderFor(a), fb = folderFor(b)
    if (fa !== fb) return fa.localeCompare(fb)
    return (LAYOUT[a]?.order ?? 99) - (LAYOUT[b]?.order ?? 99)
  })

for (const file of docs) {
  const md = readFileSync(join(SRC_DIR, file), 'utf8')
  const meta = META[file] || { title: file.replace('.md', ''), badge: 'Document', sub: '' }
  const folder = folderFor(file)
  CURRENT_FOLDER = folder // drives cross-link relative paths in inline()
  const outDir = folder ? join(OUT_DIR, folder) : OUT_DIR
  mkdirSync(outDir, { recursive: true })

  const html = page(meta, mdToHtml(md))
  const htmlPath = join(TMP_DIR, file.replace('.md', '.html'))
  const pdfName = pdfNameFor(file)
  const pdfPath = join(outDir, pdfName)
  writeFileSync(htmlPath, html, 'utf8')
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore' })
  console.log('✓', folder ? `${folder}/${pdfName}` : pdfName)
}
rmSync(TMP_DIR, { recursive: true, force: true }) // drop intermediate HTML
console.log(`\nDone — ${docs.length} PDFs in docs/pdf/`)
