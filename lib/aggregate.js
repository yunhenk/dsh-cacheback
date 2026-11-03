/**
 * Turn per-session aggregates into one report: totals, project and model
 * breakdowns, a cache score, and the few tips that are worth acting on.
 *
 * @module dsh-cacheback/aggregate
 */
import { PRICING, beijingDay } from './pricing.js'

/**
 * Build one report from parsed sessions.
 * @param {object[]} sessions - aggregates from {@link scanSessions}.
 * @param {{
 *   since?: string,
 *   project?: string,
 *   now?: number,
 *   usdToCny?: number,
 * }} [options] - report options.
 * @returns {object} report consumed by the text, HTML, and SVG renderers.
 */
export function buildReport(sessions, options = {}) {
  const now = options.now ?? Date.now()
  const cutoff = cutoffFor(options.since, now)
  const projectFilter = options.project?.trim().toLowerCase() ?? ''

  const selected = sessions.filter((session) => {
    if (session.calls === 0) return false
    if (cutoff !== undefined && session.lastCallAt < cutoff) return false
    if (projectFilter !== '') {
      const haystack = `${session.project} ${session.cwd}`.toLowerCase()
      if (!haystack.includes(projectFilter)) return false
    }
    return true
  })

  const totals = emptyTotals()
  const byProject = new Map()
  const byModel = new Map()
  const byDay = new Map()

  for (const session of selected) {
    addTotals(totals, session)
    const project = byProject.get(session.project) ?? {
      name: session.project,
      cwd: session.cwd,
      sessions: 0,
      ...emptyTotals(),
    }
    project.sessions += 1
    addTotals(project, session)
    byProject.set(session.project, project)

    for (const [family, bucket] of Object.entries(session.byModel ?? {})) {
      const model = byModel.get(family) ?? { family, ...emptyTotals() }
      addTotals(model, bucket)
      byModel.set(family, model)
    }
    for (const [day, bucket] of Object.entries(session.byDay ?? {})) {
      const entry = byDay.get(day) ?? { day, ...emptyTotals() }
      addTotals(entry, bucket)
      byDay.set(day, entry)
    }
  }

  const hitRate = ratio(totals.hit, totals.hit + totals.miss)
  const costUsd = totals.costUsd
  const savedUsd = totals.savedUsd
  const multiple = costUsd > 0 ? totals.noCacheUsd / costUsd : 0
  const discount = totals.noCacheUsd > 0 ? savedUsd / totals.noCacheUsd : 0
  const score = Number((hitRate * 100).toFixed(1))
  const grade = gradeFor(score)
  const usdToCny = options.usdToCny ?? 7.2

  let projects = [...byProject.values()]
    .sort((left, right) => right.savedUsd - left.savedUsd)
  const models = [...byModel.values()]
    .sort((left, right) => right.costUsd - left.costUsd)
    .map((model) => ({ ...model, label: PRICING[model.family]?.label ?? model.family }))
  const days = [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))

  let topSessions = [...selected]
    .sort((left, right) => right.savedUsd - left.savedUsd)
    .slice(0, 8)
    .map((session) => ({
      id: session.id,
      title: session.title,
      project: session.project,
      calls: session.calls,
      savedUsd: session.savedUsd,
      costUsd: session.costUsd,
      hitRate: ratio(session.hit, session.hit + session.miss),
      lastCallAt: session.lastCallAt,
      missCostUsd: session.missCostUsd,
      miss: session.miss,
    }))

  const leakSource = [...selected].sort((left, right) => (right.missCostUsd ?? 0) - (left.missCostUsd ?? 0))[0]
  const biggestLeak = leakSource === undefined ? undefined : {
    title: leakSource.title,
    project: leakSource.project,
    missCostUsd: leakSource.missCostUsd ?? 0,
    miss: leakSource.miss ?? 0,
    hitRate: ratio(leakSource.hit, leakSource.hit + leakSource.miss),
  }

  const tips = buildTips({
    totals,
    hitRate,
    sessions: selected.length,
    projects: projects.length,
    peakExtraUsd: totals.peakExtraUsd,
    peakCalls: totals.peakCalls,
    coldCalls: totals.coldCalls,
    coldCostUsd: totals.coldCostUsd,
    outputShare: costUsd > 0 ? totals.outputCostUsd / costUsd : 0,
    toolPrefixChanges: totals.toolPrefixChanges,
    sessionsWithPrefixChanges: selected.filter((session) => (session.toolPrefixChanges ?? 0) > 0).length,
  })

  const peakExtraUsd = Math.abs(totals.peakExtraUsd) < 1e-9 ? 0 : totals.peakExtraUsd

  if (options.redact === true) {
    projects = projects.map((project, index) => ({
      ...project,
      name: projectLabel(index),
      cwd: '',
    }))
    topSessions = topSessions.map((session, index) => ({
      ...session,
      title: `Session ${index + 1}`,
      project: '',
    }))
    if (biggestLeak !== undefined) {
      biggestLeak.title = 'A session'
      biggestLeak.project = ''
    }
  }

  return {
    generatedAt: now,
    since: options.since ?? 'all',
    redacted: options.redact === true,
    projectFilter,
    sessions: selected.length,
    calls: totals.calls,
    hit: totals.hit,
    miss: totals.miss,
    write: totals.write,
    out: totals.out,
    hitCostUsd: totals.hitCostUsd,
    missCostUsd: totals.missCostUsd,
    outputCostUsd: totals.outputCostUsd,
    costUsd,
    noCacheUsd: totals.noCacheUsd,
    savedUsd,
    savedCny: savedUsd * usdToCny,
    costCny: costUsd * usdToCny,
    noCacheCny: totals.noCacheUsd * usdToCny,
    peakExtraUsd,
    peakExtraCny: peakExtraUsd * usdToCny,
    coldCalls: totals.coldCalls,
    coldCostUsd: totals.coldCostUsd,
    coldCostCny: totals.coldCostUsd * usdToCny,
    skippedCalls: totals.skippedCalls,
    toolPrefixChanges: totals.toolPrefixChanges,
    sessionsWithPrefixChanges: selected.filter((session) => (session.toolPrefixChanges ?? 0) > 0).length,
    peakCalls: totals.peakCalls,
    hitRate,
    score,
    grade,
    multiple,
    discount,
    usdToCny,
    perCallUsd: totals.calls > 0 ? costUsd / totals.calls : 0,
    firstAt: minDate(selected.map((session) => session.firstCallAt)),
    lastAt: maxDate(selected.map((session) => session.lastCallAt)),
    projects,
    models,
    days,
    topSessions,
    biggestLeak,
    tips,
    subagentSessions: selected.filter((session) => session.delegationDepth > 0).length,
    partialSessions: selected.filter((session) => session.partial).length,
  }
}

/**
 * Anonymous project label for redacted receipts: Project A, B, ... Z.
 * @param {number} index - position in the saved ranking.
 * @returns {string} label.
 */
function projectLabel(index) {
  const letter = String.fromCharCode(65 + (index % 26))
  return `Project ${letter}`
}

/** An empty accumulator with every field the report reads. */
function emptyTotals() {
  return {
    sessions: 0,
    calls: 0,
    hit: 0,
    miss: 0,
    write: 0,
    out: 0,
    costUsd: 0,
    hitCostUsd: 0,
    missCostUsd: 0,
    outputCostUsd: 0,
    noCacheUsd: 0,
    savedUsd: 0,
    peakExtraUsd: 0,
    peakCalls: 0,
    coldCalls: 0,
    coldCostUsd: 0,
    skippedCalls: 0,
    toolPrefixChanges: 0,
  }
}

/**
 * Add one session-shaped object's figures into a totals object.
 * @param {Record<string, number>} target - accumulator.
 * @param {Record<string, any>} source - session or bucket.
 * @returns {void}
 */
function addTotals(target, source) {
  for (const field of [
    'calls', 'hit', 'miss', 'write', 'out',
    'costUsd', 'hitCostUsd', 'missCostUsd', 'outputCostUsd', 'noCacheUsd',
    'savedUsd', 'peakExtraUsd', 'peakCalls', 'coldCalls', 'coldCostUsd', 'skippedCalls', 'toolPrefixChanges',
  ]) {
    target[field] = (target[field] ?? 0) + (Number(source[field]) || 0)
  }
}

/**
 * Convert a `since` selector into an epoch cutoff.
 * @param {string | undefined} since - `all`, `7d`, `30d`, `90d`, or an ISO date.
 * @param {number} now - current epoch milliseconds.
 * @returns {number | undefined} cutoff, or undefined for all time.
 */
export function cutoffFor(since, now) {
  if (since === undefined || since === '' || since === 'all') return undefined
  const relative = /^(\d{1,3})d$/.exec(since)
  if (relative !== null) return now - Number(relative[1]) * 86400000
  const date = Date.parse(since)
  if (Number.isFinite(date)) return date
  return undefined
}

/**
 * Ratio helper that never divides by zero.
 * @param {number} numerator - top.
 * @param {number} denominator - bottom.
 * @returns {number} ratio in 0..1.
 */
function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0
}

/**
 * Letter grade for a cache score.
 * @param {number} score - 0..100 cache hit rate.
 * @returns {'S' | 'A+' | 'A' | 'B' | 'C' | 'D'} grade.
 */
function gradeFor(score) {
  if (score >= 99.5) return 'S'
  if (score >= 98) return 'A+'
  if (score >= 95) return 'A'
  if (score >= 90) return 'B'
  if (score >= 80) return 'C'
  return 'D'
}

/**
 * Rank the tips that apply, keeping at most four.
 * @param {object} input - measured figures.
 * @returns {object[]} tip descriptors, already ordered.
 */
function buildTips(input) {
  const tips = []
  if (input.hitRate < 0.8 && input.totals.calls > 0) {
    tips.push({ id: 'coldCache', impactUsd: input.totals.savedUsd, hitRate: input.hitRate })
  }
  if (input.peakExtraUsd > 0.2) {
    tips.push({ id: 'peak', impactUsd: input.peakExtraUsd, calls: input.peakCalls })
  }
  if (input.coldCalls > 0) {
    tips.push({ id: 'cold', impactUsd: input.coldCostUsd, calls: input.coldCalls })
  }
  if (input.sessions >= 20 && input.projects >= 5) {
    tips.push({ id: 'manySessions', sessions: input.sessions, projects: input.projects, impactUsd: 0 })
  }
  if (input.outputShare >= 0.2) {
    tips.push({ id: 'outputHeavy', share: input.outputShare, impactUsd: 0 })
  }
  tips.sort((left, right) => right.impactUsd - left.impactUsd)
  const selected = tips.slice(0, 3)
  selected.push(input.toolPrefixChanges > 0
    ? { id: 'toolChurn', changes: input.toolPrefixChanges, sessions: input.sessionsWithPrefixChanges, impactUsd: 0 }
    : { id: 'stableTools', impactUsd: 0 })
  return selected
}

/** @param {number[]} values @returns {number | undefined} smallest defined value. */
function minDate(values) {
  const defined = values.filter((value) => Number.isFinite(value) && value > 0)
  return defined.length === 0 ? undefined : Math.min(...defined)
}

/** @param {number[]} values @returns {number | undefined} largest defined value. */
function maxDate(values) {
  const defined = values.filter((value) => Number.isFinite(value) && value > 0)
  return defined.length === 0 ? undefined : Math.max(...defined)
}

/**
 * Group sparse daily rows into at most `limit` buckets, for charts.
 * @param {object[]} days - daily rows in date order.
 * @param {number} [limit] - maximum buckets.
 * @returns {object[]} buckets, each with a label and summed figures.
 */
export function bucketDays(days, limit = 24) {
  if (days.length <= limit) return days.map((day) => ({ ...day }))
  const size = Math.ceil(days.length / limit)
  const buckets = []
  for (let index = 0; index < days.length; index += size) {
    const slice = days.slice(index, index + size)
    const bucket = { day: slice[0].day, endDay: slice[slice.length - 1].day, ...emptyTotals() }
    for (const day of slice) addTotals(bucket, day)
    buckets.push(bucket)
  }
  return buckets
}

/**
 * Day labels used by the receipt's axis.
 * @param {number} ms - epoch milliseconds.
 * @returns {string} Beijing `YYYY-MM-DD`.
 */
export function dayLabel(ms) {
  return beijingDay(ms)
}
