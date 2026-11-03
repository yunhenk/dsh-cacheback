/**
 * DeepSeek's published token prices and the peak/off-peak calendar.
 *
 * Every number here is USD per 1M tokens, copied from
 * https://api-docs.deepseek.com/quick_start/pricing on 2026-11-03.
 * Cache writes are billed as cache misses by DeepSeek, so callers must fold
 * `cacheWriteTokens` into the miss bucket before pricing.
 *
 * @module dsh-cacheback/pricing
 */

/** Date the prices were read from the official pricing page. */
export const PRICING_AS_OF = '2026-11-03'

/** Official pricing page, shown in receipts so the method is checkable. */
export const PRICING_SOURCE = 'https://api-docs.deepseek.com/quick_start/pricing'

/** Fallback conversion used only to display an approximate CNY figure. */
export const DEFAULT_USD_TO_CNY = 7.2

/**
 * Per-model price table. `hit` is the cached-input price, `miss` the uncached
 * input price (DeepSeek has no separate cache-write price), `out` the output
 * price. DeepSeek's off-peak rates are exactly half of the peak rates.
 */
export const PRICING = {
  flash: {
    label: 'DeepSeek V4.1 Flash',
    peak: { hit: 0.006, miss: 0.3, out: 1.2 },
    offPeak: { hit: 0.003, miss: 0.15, out: 0.6 },
  },
  pro: {
    label: 'DeepSeek V4 Pro',
    peak: { hit: 0.044, miss: 1.32, out: 3.96 },
    offPeak: { hit: 0.022, miss: 0.66, out: 1.98 },
  },
}

/**
 * Chinese public holidays in 2026, from the State Council notice
 * (国办发明电〔2025〕7号). DeepSeek's peak window is defined on Beijing
 * weekdays and excludes these dates, so they are stored as `YYYY-MM-DD`
 * Beijing calendar dates.
 */
export const CN_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
])

/** Beijing is UTC+8 all year; no DST, so a fixed offset is exact. */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * Map a provider model id to a price family.
 * Legacy DeepSeek ids are billed at the Flash price, matching the pricing page.
 * @param {string | undefined} model - model id from the session log.
 * @returns {'flash' | 'pro'} price family.
 */
export function modelFamily(model) {
  const id = String(model ?? '').toLowerCase()
  if (id.includes('pro')) return 'pro'
  return 'flash'
}

/**
 * Beijing calendar date (`YYYY-MM-DD`) of an instant.
 * @param {number} ms - epoch milliseconds.
 * @returns {string} Beijing date.
 */
export function beijingDay(ms) {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10)
}

/**
 * Whether one instant falls inside DeepSeek's standard peak window:
 * 09:00–12:00 and 14:00–18:00 Beijing time, Monday–Friday, excluding
 * Chinese public holidays.
 * @param {number} ms - epoch milliseconds.
 * @param {{ holidays?: Set<string> }} [options] - holiday overrides.
 * @returns {boolean} true when peak pricing applies.
 */
export function isPeakAt(ms, options = {}) {
  const holidays = options.holidays ?? CN_HOLIDAYS_2026
  const beijing = new Date(ms + BEIJING_OFFSET_MS)
  const weekday = beijing.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  const hour = beijing.getUTCHours()
  const inWindow = (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
  if (!inWindow) return false
  return !holidays.has(beijingDay(ms))
}

/**
 * Prices for one model family at one time.
 * @param {string | undefined} model - model id.
 * @param {number} ms - call time.
 * @param {{ holidays?: Set<string> }} [options] - holiday overrides.
 * @returns {{ family: 'flash' | 'pro', label: string, peak: boolean, hit: number, miss: number, out: number }}
 */
export function ratesFor(model, ms, options = {}) {
  const family = modelFamily(model)
  const peak = isPeakAt(ms, options)
  const table = PRICING[family]
  const rates = peak ? table.peak : table.offPeak
  return { family, label: table.label, peak, ...rates }
}

/**
 * Price one model call.
 *
 * `cacheWriteTokens` is charged at the miss price, and `inputTokens` is
 * DeepSeek's uncached-input count, so the miss bucket is their sum.
 *
 * @param {{ inputTokens?: number, outputTokens?: number, cacheReadTokens?: number, cacheWriteTokens?: number }} usage
 * @param {string | undefined} model - model id.
 * @param {number} ms - call time.
 * @param {{ holidays?: Set<string> }} [options] - holiday overrides.
 * @returns {{
 *   family: 'flash' | 'pro',
 *   peak: boolean,
 *   hitTokens: number,
 *   missTokens: number,
 *   outputTokens: number,
 *   costUsd: number,
 *   hitCostUsd: number,
 *   missCostUsd: number,
 *   outputCostUsd: number,
 *   noCacheUsd: number,
 *   savedUsd: number,
 *   peakExtraUsd: number,
 * }}
 */
export function priceCall(usage, model, ms, options = {}) {
  const rates = ratesFor(model, ms, options)
  const hitTokens = nonNegative(usage.cacheReadTokens)
  const missTokens = nonNegative(usage.inputTokens) + nonNegative(usage.cacheWriteTokens)
  const outputTokens = nonNegative(usage.outputTokens)

  const hitCostUsd = (hitTokens * rates.hit) / 1e6
  const missCostUsd = (missTokens * rates.miss) / 1e6
  const outputCostUsd = (outputTokens * rates.out) / 1e6
  const costUsd = hitCostUsd + missCostUsd + outputCostUsd

  // Counterfactual: the same prompt with no prefix cache, at the same time.
  const noCacheUsd = ((hitTokens + missTokens) * rates.miss + outputTokens * rates.out) / 1e6

  // What the peak window itself added, versus the off-peak rate for this call.
  const offPeak = PRICING[rates.family].offPeak
  const offPeakCost = (
    hitTokens * offPeak.hit
    + missTokens * offPeak.miss
    + outputTokens * offPeak.out
  ) / 1e6

  return {
    family: rates.family,
    peak: rates.peak,
    hitTokens,
    missTokens,
    outputTokens,
    costUsd,
    hitCostUsd,
    missCostUsd,
    outputCostUsd,
    noCacheUsd,
    savedUsd: noCacheUsd - costUsd,
    peakExtraUsd: costUsd - offPeakCost,
  }
}

/**
 * Coerce a possibly missing token count.
 * @param {unknown} value - raw count.
 * @returns {number} a finite, non-negative number.
 */
function nonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}
