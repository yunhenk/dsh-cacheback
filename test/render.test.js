import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReport } from '../lib/aggregate.js'
import { renderReceipt } from '../lib/render-html.js'
import { renderCard } from '../lib/render-svg.js'
import { renderSummary } from '../lib/render-text.js'

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

/** One synthetic session with a hostile project name. */
function report() {
  return buildReport([
    {
      id: 's1',
      cwd: '</script><script>alert(1)</script>',
      project: '<script>alert(1)</script>',
      title: '<img src=x onerror=alert(1)>',
      calls: 10,
      hit: 9_000_000,
      miss: 1_000_000,
      write: 0,
      out: 500_000,
      costUsd: 1,
      hitCostUsd: 0.1,
      missCostUsd: 0.2,
      outputCostUsd: 0.7,
      noCacheUsd: 10,
      savedUsd: 9,
      peakExtraUsd: 0.5,
      peakCalls: 5,
      coldCalls: 1,
      coldCostUsd: 0.2,
      firstCallAt: NOW - 86_400_000,
      lastCallAt: NOW,
      byModel: {
        flash: {
          calls: 10, hit: 9_000_000, miss: 1_000_000, out: 500_000,
          costUsd: 1, hitCostUsd: 0.1, missCostUsd: 0.2, outputCostUsd: 0.7, savedUsd: 9,
        },
      },
      byDay: {
        '2026-11-03': {
          calls: 10, hit: 9_000_000, miss: 1_000_000, out: 500_000,
          costUsd: 1, hitCostUsd: 0.1, missCostUsd: 0.2, outputCostUsd: 0.7, savedUsd: 9,
        },
      },
      delegationDepth: 0,
      partial: false,
    },
  ], { now: NOW })
}

test('summary contains the headline and the command hints', () => {
  const text = renderSummary(report(), { lang: 'zh' })
  assert.match(text, /DeepSeek 前缀缓存为你省下/)
  assert.match(text, /¥/)
  assert.match(text, /\/cache receipt/)
})

test('english summary switches copy without breaking numbers', () => {
  const text = renderSummary(report(), { lang: 'en' })
  assert.match(text, /DeepSeek prefix caching saved you/)
  assert.match(text, /Cache score/)
})

test('receipt is a complete HTML document with escaped user text', () => {
  const html = renderReceipt(report(), { repo: 'github.com/yunhenk/dsh-cacheback' })
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /CACHEBACK/)
  assert.match(html, /class="amount"/)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(!html.includes('onerror=alert(1)>'))
  assert.match(html, /dsh-cacheback v0\.1\.1/)
})

test('card is a standalone SVG that omits project names and titles', () => {
  const svg = renderCard(report())
  assert.match(svg, /^<svg /)
  assert.match(svg, /width="1200"/)
  assert.match(svg, /height="630"/)
  assert.ok(!svg.includes('alert(1)'))
  assert.ok(!svg.includes('Cache receipt'))
})
