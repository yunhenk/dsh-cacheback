/**
 * Small formatting helpers shared by the text, HTML, and SVG renderers.
 * @module dsh-cacheback/format
 */

/**
 * Format a USD amount with enough precision to stay useful for tiny amounts.
 * @param {number} value - USD.
 * @returns {string} `$327.32`, `$0.014`.
 */
export function usd(value) {
  const amount = Number(value) || 0
  const digits = Math.abs(amount) >= 0.1 ? 2 : Math.abs(amount) >= 0.01 ? 3 : 4
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/**
 * Format a CNY amount.
 * @param {number} value - CNY.
 * @returns {string} `¥2,356.74`.
 */
export function cny(value) {
  const amount = Number(value) || 0
  const digits = Math.abs(amount) >= 1 ? 2 : 4
  return `¥${amount.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

/**
 * Compact token count: `1.54B`, `5.24M`, `4.1K`.
 * @param {number} value - token count.
 * @returns {string} compact label.
 */
export function tokens(value) {
  const amount = Number(value) || 0
  if (amount >= 1e9) return `${trim(amount / 1e9)}B`
  if (amount >= 1e6) return `${trim(amount / 1e6)}M`
  if (amount >= 1e3) return `${trim(amount / 1e3)}K`
  return String(Math.round(amount))
}

/**
 * Percentage with two decimals below 100, one at 100.
 * @param {number} ratio - 0..1.
 * @returns {string} `99.66%`.
 */
export function percent(ratio) {
  const value = (Number(ratio) || 0) * 100
  const digits = value >= 99.9 || value < 10 ? 1 : 2
  return `${value.toFixed(digits)}%`
}

/**
 * A multiplier such as `30.1×`.
 * @param {number} value - multiplier.
 * @returns {string} formatted multiplier.
 */
export function multiple(value) {
  const amount = Number(value) || 0
  if (!Number.isFinite(amount)) return '—'
  if (amount >= 100) return `${Math.round(amount)}×`
  return `${trim(amount)}×`
}

/**
 * ISO-ish date in Beijing time.
 * @param {number | undefined} ms - epoch milliseconds.
 * @returns {string} `2026-11-03`, or `—` when missing.
 */
export function date(ms) {
  if (!ms) return '—'
  return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10)
}

/**
 * A date range.
 * @param {number | undefined} first - epoch milliseconds.
 * @param {number | undefined} last - epoch milliseconds.
 * @returns {string} `2026-06-12 → 2026-11-03`.
 */
export function range(first, last) {
  if (!first && !last) return '—'
  return `${date(first)} → ${date(last)}`
}

/**
 * Trim trailing zeros from a fixed-precision number.
 * @param {number} value - number.
 * @returns {string} compact decimal.
 */
function trim(value) {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')
}
