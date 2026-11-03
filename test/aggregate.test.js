import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReport, cutoffFor, bucketDays } from '../lib/aggregate.js'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

/**
 * A synthetic session aggregate with sane defaults.
 * @param {object} [overrides] - fields to override.
 * @returns {object} session.
 */
function session(overrides = {}) {
  const byModel = {
    flash: {
      calls: 2, hit: 900, miss: 100, out: 50,
      costUsd: 0.01, hitCostUsd: 0.002, missCostUsd: 0.003, outputCostUsd: 0.005, savedUsd: 0.09,
    },
  }
  const byDay = {
    '2026-11-03': {
      calls: 2, hit: 900, miss: 100, out: 50,
      costUsd: 0.01, hitCostUsd: 0.002, missCostUsd: 0.003, outputCostUsd: 0.005, savedUsd: 0.09,
    },
  }
  return {
    id: 's1',
    cwd: '/work/alpha',
    project: 'alpha',
    title: 'Alpha',
    calls: 2,
    hit: 900,
    miss: 100,
    write: 0,
    out: 50,
    costUsd: 0.01,
    hitCostUsd: 0.002,
    missCostUsd: 0.003,
    outputCostUsd: 0.005,
    noCacheUsd: 0.1,
    savedUsd: 0.09,
    peakExtraUsd: 0.001,
    peakCalls: 1,
    coldCalls: 0,
    coldCostUsd: 0,
    firstCallAt: NOW - DAY,
    lastCallAt: NOW - 1000,
    byModel,
    byDay,
    delegationDepth: 0,
    partial: false,
    ...overrides,
  }
}

test('report totals, ratio, score, and multiple', () => {
  const report = buildReport([session()], { now: NOW })
  assert.equal(report.sessions, 1)
  assert.equal(report.calls, 2)
  assert.equal(report.hit, 900)
  assert.equal(report.miss, 100)
  assert.equal(report.savedUsd, 0.09)
  assert.equal(report.hitRate, 0.9)
  assert.equal(report.score, 90)
  assert.equal(report.grade, 'B')
  assert.equal(report.multiple, 10)
  assert.ok(Math.abs(report.discount - 0.9) < 1e-12)
  assert.equal(report.projects.length, 1)
  assert.equal(report.projects[0].name, 'alpha')
  assert.equal(report.projects[0].sessions, 1)
})

test('project and since filters', () => {
  const old = session({ id: 'old', project: 'beta', cwd: '/work/beta', lastCallAt: NOW - 40 * DAY })
  const current = session({ id: 'current' })
  assert.equal(buildReport([old, current], { now: NOW }).sessions, 2)
  assert.equal(buildReport([old, current], { now: NOW, project: 'bet' }).sessions, 1)
  assert.equal(buildReport([old, current], { now: NOW, since: '30d' }).sessions, 1)
  assert.equal(buildReport([old, current], { now: NOW, since: 'all' }).sessions, 2)
})

test('sessions without model calls are excluded', () => {
  const empty = session({ calls: 0, hit: 0, miss: 0, byModel: {}, byDay: {} })
  assert.equal(buildReport([empty], { now: NOW }).sessions, 0)
})

test('peak and output tips are ranked by impact; stable tools is always last', () => {
  const report = buildReport([session({ peakExtraUsd: 2, peakCalls: 12, outputCostUsd: 1.2, costUsd: 2 })], { now: NOW })
  assert.equal(report.tips[0].id, 'peak')
  assert.equal(report.tips.at(-1).id, 'stableTools')
  assert.ok(report.tips.some((tip) => tip.id === 'outputHeavy'))
})

test('cutoff parsing', () => {
  assert.equal(cutoffFor('all', NOW), undefined)
  assert.equal(cutoffFor('7d', NOW), NOW - 7 * DAY)
  assert.equal(cutoffFor('2026-10-01', NOW), Date.parse('2026-10-01'))
  assert.equal(cutoffFor('nonsense', NOW), undefined)
})

test('bucketDays collapses long series and keeps totals', () => {
  const days = Array.from({ length: 60 }, (_, index) => ({
    day: `2026-09-${String((index % 28) + 1).padStart(2, '0')}`,
    calls: 1, hit: 10, miss: 9, out: 1,
    costUsd: 0.01, hitCostUsd: 0.001, missCostUsd: 0.001, outputCostUsd: 0.001, savedUsd: 0.1,
  }))
  const buckets = bucketDays(days, 12)
  assert.ok(buckets.length <= 12)
  assert.equal(buckets.reduce((total, bucket) => total + bucket.calls, 0), 60)
})
