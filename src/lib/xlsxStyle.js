/**
 * @file xlsxStyle.js
 * @description Sheet-layout helpers shared by the .xlsx exports
 * (attendanceExport.js, commissionExport.js). Only mechanics live here —
 * each report keeps its own palette and column definitions so a tweak to one
 * sheet can't silently restyle the other.
 */

/**
 * Set every column's width from its widest content, clamped to sane bounds.
 *
 * @param {import('exceljs').Worksheet} sheet
 * @param {object}  [options]
 * @param {Set<number>} [options.skipRows]  rows to ignore — merged title rows
 *        span every column, so their long text would otherwise inflate column A
 * @param {number}  [options.min]
 * @param {number}  [options.max]
 * @param {boolean} [options.wrapped]  when the sheet sets wrapText, measure the
 *        longest LINE rather than the whole string: headers wrap on spaces and
 *        block headers wrap on newlines, so the full string overstates the
 *        width they actually need
 * @param {number}  [options.headerRow]  which row `wrapped` should measure with
 *        the space rule. Taken from the caller rather than assumed, so a sheet
 *        that puts its header somewhere other than row 2 doesn't get its body
 *        text measured as a header (and vice versa)
 */
export function autoSize(
  sheet,
  { skipRows = new Set([1]), min = 6, max = 30, wrapped = false, headerRow = 2 } = {},
) {
  sheet.columns.forEach(col => {
    let longest = 0
    col.eachCell({ includeEmpty: true }, (cell, rowNum) => {
      if (skipRows.has(rowNum)) return
      const raw = cell.value
      let v = ''
      if (raw != null) {
        if (typeof raw === 'object') v = raw.richText ? '' : String(raw.result ?? '') // formula cell → measure its cached result
        else if (typeof raw === 'number') v = String(Math.round(raw * 100) / 100)     // time serial ≈ rendered "hh:mm AM" width
        else v = String(raw)
      }
      // Header cells wrap on spaces; body cells (block headers) on newlines.
      const parts = wrapped ? v.split(rowNum === headerRow ? ' ' : '\n') : [v]
      const measured = Math.max(...parts.map(p => p.length))
      if (measured > longest) longest = measured
    })
    col.width = Math.min(Math.max(longest + 2, min), max)
  })
}

/**
 * Scale every column proportionally so the sheet fills a 1080p screen
 * (~1920 px). Excel renders a column at roughly width × 7 + 5 px, so the
 * width units to distribute are (1920 − cols × 5) / 7.
 */
export function fitToScreenWidth(sheet, screenPx = 1920) {
  const cols = sheet.columns
  const target = (screenPx - cols.length * 5) / 7
  const current = cols.reduce((s, c) => s + (c.width ?? 9), 0)
  if (current <= 0) return
  const factor = target / current
  cols.forEach(c => { c.width = Math.round((c.width ?? 9) * factor * 100) / 100 })
}
