import assert from 'node:assert/strict'
import test from 'node:test'

import { isPeakAt, priceCall, ratesFor } from '../lib/pricing.js'

/** Beijing 10:00 on Tuesday 2026-11-03, in UTC. */
const PEAK = Date.UTC(2026, 10, 3, 2, 0, 0)
/** Beijing 12:30 on the same day, between the two peak windows. */
const LUNCH = Date.UTC(2026, 10, 3, 4, 30, 0)

test('peak windows are Beijing 09-12 and 14-18 on weekdays', () => {
  assert.equal(isPeakAt(PEAK), true)
  assert.equal(isPeakAt(LUNCH), false)
  assert.equal(isPeakAt(Date.UTC(2026, 10, 3, 7, 0, 0)), true) // 15:00 Beijing
  assert.equal(isPeakAt(Date.UTC(2026, 10, 3, 0, 30, 0)), false) // 08:30 Beijing
})

test('weekends and Chinese public holidays are off-peak', () => {
  assert.equal(isPeakAt(Date.UTC(2026, 10, 7, 2, 0, 0)), false) // Saturday
  assert.equal(isPeakAt(Date.UTC(2026, 9, 1, 2, 0, 0)), false) // National Day
  assert.equal(isPeakAt(Date.UTC(2026, 9, 1, 2, 0, 0), { holidays: new Set() }), true)
})

test('off-peak rates are exactly half of peak rates', () => {
  const peak = ratesFor('deepseek-flash', PEAK)
  const offPeak = ratesFor('deepseek-flash', LUNCH)
  assert.equal(peak.peak, true)
  assert.equal(offPeak.peak, false)
  assert.equal(peak.hit, offPeak.hit * 2)
  assert.equal(peak.miss, offPeak.miss * 2)
  assert.equal(peak.out, offPeak.out * 2)
})

test('legacy flash ids and vision ids price as flash; pro prices as pro', () => {
  assert.equal(ratesFor('deepseek-v4-flash', PEAK).family, 'flash')
  assert.equal(ratesFor('deepseek-v4-flash-vision-exp', PEAK).family, 'flash')
  assert.equal(ratesFor('deepseek-v4-pro', PEAK).family, 'pro')
})

test('cache writes are billed at the miss price', () => {
  const priced = priceCall(
    { inputTokens: 0, cacheWriteTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 },
    'deepseek-flash',
    LUNCH,
  )
  assert.equal(priced.missTokens, 1_000_000)
  assert.equal(priced.missCostUsd, 0.15)
  assert.equal(priced.costUsd, 0.15)
})

test('saving is the difference between no-cache and cached cost', () => {
  const priced = priceCall(
    { inputTokens: 1_000_000, cacheReadTokens: 9_000_000, outputTokens: 0 },
    'deepseek-flash',
    LUNCH,
  )
  assert.equal(priced.noCacheUsd, 1.5)
  assert.equal(priced.costUsd, 0.15 + 0.027)
  assert.ok(Math.abs(priced.savedUsd - (1.5 - 0.177)) < 1e-9)
})

test('peak extra is what the peak window added over off-peak', () => {
  const usage = { inputTokens: 0, cacheReadTokens: 10_000_000, outputTokens: 0 }
  const peak = priceCall(usage, 'deepseek-flash', PEAK)
  const offPeak = priceCall(usage, 'deepseek-flash', LUNCH)
  assert.ok(Math.abs(peak.peakExtraUsd - (peak.costUsd - offPeak.costUsd)) < 1e-9)
})
