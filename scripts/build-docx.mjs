/**
 * build-docx.mjs
 *
 * Converts a handover Markdown doc into an editable Word .docx — using the
 * already-installed `jszip` (a .docx is a ZIP of Office Open XML parts). No new
 * dependencies, no network.
 *
 * Default target is the confidential credentials file so passwords can be typed
 * directly into real Word table cells.
 *
 *   node scripts/build-docx.mjs                       → CREDENTIALS_HANDOVER.docx
 *   node scripts/build-docx.mjs FINAL_AGREEMENT.md    → that doc instead
 *
 * Output: docs/<NAME>.docx
 * Supports: headings, paragraphs, **bold**, `code`, links, tables, blockquotes,
 * lists, and horizontal rules — the subset these docs use.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = join(__dirname, '..', 'docs')
const target = process.argv.find(a => a.endsWith('.md')) || 'CREDENTIALS_HANDOVER.md'
// Credentials handover is laid out one category (## section) per page; other
// docs flow normally.
const PAGE_PER_SECTION = target === 'CREDENTIALS_HANDOVER.md'

// ── XML helpers ───────────────────────────────────────────────────────────────
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const stripInline = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/\*\*/g, '').replace(/`/g, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/** One run with optional formatting. rPr children must follow schema order. */
function run(text, o = {}) {
  let s = ''
  if (o.code) s += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>'
  if (o.bold) s += '<w:b/>'
  if (o.italic) s += '<w:i/>'
  const color = o.color || (o.link ? '7317E8' : null)
  if (color) s += `<w:color w:val="${color}"/>`
  if (o.link || o.underline) s += '<w:u w:val="single"/>'
  if (o.code) s += '<w:shd w:val="clear" w:color="auto" w:fill="F1F0F7"/>'
  const rPr = s ? `<w:rPr>${s}</w:rPr>` : ''
  return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`
}

/** Inline markdown → runs, with <br> as a hard line break inside a cell/para. */
function runs(text, base = {}) {
  return String(text).split(/<br\s*\/?>/i)
    .map(seg => inlineRuns(seg, base))
    .join('<w:r><w:br/></w:r>')
}

/** Inline markdown → runs. (Single-underscore italics intentionally ignored so
 *  fill-in blanks like ____ stay literal.) */
function inlineRuns(text, base = {}) {
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g
  let out = '', last = 0, m
  while ((m = re.exec(text))) {
    if (m.index > last) out += run(text.slice(last, m.index), base)
    if (m[1]) out += run(m[2], { ...base, bold: true })
    else if (m[3]) out += run(m[4], { ...base, code: true })
    else if (m[5]) out += run(m[6], { ...base, link: true })
    last = re.lastIndex
  }
  if (last < text.length) out += run(text.slice(last), base)
  return out || run('', base)
}

const para = (text, { shade, style } = {}) => {
  let ppr = ''
  if (style) ppr += `<w:pStyle w:val="${style}"/>`
  if (shade) ppr += '<w:shd w:val="clear" w:color="auto" w:fill="FDECEF"/>'
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs(text)}</w:p>`
}
const heading = (level, text) => {
  const brk = PAGE_PER_SECTION && level === 2 ? '<w:pageBreakBefore/>' : ''
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/>${brk}</w:pPr>${runs(text)}</w:p>`
}
const hr = () => '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>'

function table(headers, aligns, rows) {
  const totalW = 9360
  // Proportional column widths from content length (capped so one very long
  // value — e.g. a JWT anon key — widens its own column instead of forcing all
  // columns equal and overflowing). Fixed layout makes Word honour the grid and
  // wrap long values inside their cell.
  const len = (s) => stripInline(String(s)).length
  const weights = headers.map((h, c) =>
    Math.min(rows.reduce((m, r) => Math.max(m, len(r[c] || '')), len(h)), 90) + 8)
  const wsum = weights.reduce((a, b) => a + b, 0)
  const colW = weights.map(w => Math.max(1100, Math.round(totalW * w / wsum)))
  colW[colW.indexOf(Math.max(...colW))] += totalW - colW.reduce((a, b) => a + b, 0) // absorb rounding drift
  const grid = colW.map(w => `<w:gridCol w:w="${w}"/>`).join('')
  const borders = '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/>`).join('') +
    '</w:tblBorders>'
  const cell = (content, c, header) => {
    const al = aligns[c] && aligns[c] !== 'left' ? `<w:jc w:val="${aligns[c] === 'right' ? 'right' : 'center'}"/>` : ''
    const tcPr = `<w:tcPr><w:tcW w:w="${colW[c]}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="7317E8"/>' : ''}</w:tcPr>`
    const body = header
      ? `<w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr><w:t xml:space="preserve">${xmlEsc(stripInline(content))}</w:t></w:r>`
      : runs(content)
    return `<w:tc>${tcPr}<w:p>${al ? `<w:pPr>${al}</w:pPr>` : ''}${body}</w:p></w:tc>`
  }
  let xml = `<w:tbl><w:tblPr><w:tblW w:w="${totalW}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>`
  xml += `<w:tr>${headers.map((h, c) => cell(h, c, true)).join('')}</w:tr>`
  for (const r of rows) xml += `<w:tr>${headers.map((_, c) => cell(r[c] || '', c, false)).join('')}</w:tr>`
  return xml + '</w:tbl><w:p/>'
}

const isTableSep = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-')
const listRe = /^(\s*)([-*]|\d+\.)\s+(.*)$/

function parseBlocks(lines) {
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push(hr()); i++; continue }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { out.push(heading(Math.min(h[1].length, 3), h[2])); i++; continue }

    if (/^\s*>/.test(line)) {                                   // blockquote
      const buf = []
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''))
      const hasTable = buf.some((l, k) => l.includes('|') && buf[k + 1] && isTableSep(buf[k + 1]))
      if (hasTable) out.push(...parseBlocks(buf))
      else out.push(`<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FDECEF"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="C2122E"/></w:pBdr></w:pPr>${buf.map(l => runs(l)).join('<w:r><w:br/></w:r>')}</w:p>`)
      continue
    }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {  // table
      const split = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
      const headers = split(line)
      const aligns = split(lines[i + 1]).map(c => /-+:$/.test(c) ? 'right' : /^:-+:$/.test(c) ? 'center' : 'left')
      i += 2
      const rows = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') rows.push(split(lines[i++]))
      out.push(table(headers, aligns, rows))
      continue
    }

    if (listRe.test(line)) {                                    // list
      let n = 1
      while (i < lines.length && listRe.test(lines[i])) {
        const m = lines[i].match(listRe)
        const lvl = Math.floor(m[1].length / 2)
        const ordered = /\d+\./.test(m[2])
        const prefix = ordered ? `${n++}. ` : '• '
        const ind = 360 + lvl * 360
        out.push(`<w:p><w:pPr><w:ind w:left="${ind}" w:hanging="360"/></w:pPr>${run(prefix)}${runs(m[3])}</w:p>`)
        i++
      }
      continue
    }

    if (line.trim() === '') { i++; continue }                   // blank

    const buf = [line]; i++                                     // paragraph
    while (i < lines.length && lines[i].trim() !== '' &&
           !/^(#{1,6}\s|\s*>|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i]) &&
           !listRe.test(lines[i]) &&
           !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++])
    }
    out.push(para(buf.join(' ')))
  }
  return out
}

// ── OOXML parts ───────────────────────────────────────────────────────────────
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="2A0E54"/><w:sz w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="7317E8"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/></w:pPr><w:rPr><w:b/><w:color w:val="33285C"/><w:sz w:val="24"/></w:rPr></w:style>
</w:styles>`

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

// ── Build ─────────────────────────────────────────────────────────────────────
const md = readFileSync(join(SRC_DIR, target), 'utf8').replace(/\r\n/g, '\n')
const body = parseBlocks(md.split('\n')).join('\n')
const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>'
const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body}${sectPr}</w:body></w:document>`

const zip = new JSZip()
zip.file('[Content_Types].xml', contentTypes)
zip.file('_rels/.rels', rootRels)
zip.file('word/document.xml', documentXml)
zip.file('word/styles.xml', styles)
zip.file('word/_rels/document.xml.rels', docRels)

const outPath = join(SRC_DIR, target.replace(/\.md$/, '.docx'))
const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
writeFileSync(outPath, buf)
console.log(`✓ ${target} → ${outPath.replace(join(__dirname, '..'), '.')}  (${(buf.length / 1024).toFixed(1)} KB)`)
