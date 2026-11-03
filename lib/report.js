/**
 * One entry point for every Cacheback surface: scan, aggregate, render, write,
 * and optionally open. The tool, the slash command, and the landing-page demo
 * all go through here so the numbers cannot drift between them.
 * @module dsh-cacheback/report
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { buildReport } from './aggregate.js'
import { renderReceipt } from './render-html.js'
import { renderCard } from './render-svg.js'
import { renderSummary } from './render-text.js'
import { scanSessions } from './scan.js'
import { cachebackDir } from './store.js'

/**
 * Generate a report in the requested format.
 * @param {{
 *   format?: 'summary' | 'receipt' | 'card' | 'json',
 *   since?: string,
 *   project?: string,
 *   lang?: 'zh' | 'en',
 *   open?: boolean,
 *   refresh?: boolean,
 *   home?: string,
 *   usdToCny?: number,
 *   repo?: string,
 *   version?: string,
 *   now?: number,
 *   redact?: boolean,
 * }} [options] - generation options.
 * @returns {Promise<{
 *   text: string,
 *   path?: string,
 *   report: object,
 *   scan: object,
 * }>}
 */
export async function generate(options = {}) {
  const home = options.home
  const scan = await scanSessions({ home, refresh: options.refresh === true })
  const report = buildReport(scan.sessions, {
    since: options.since,
    project: options.project,
    now: options.now,
    usdToCny: options.usdToCny,
    redact: options.redact === true,
  })

  const format = options.format ?? 'summary'
  const lang = options.lang === 'en' ? 'en' : 'zh'
  const usdToCny = report.usdToCny
  const dir = options.outDir
    ?? cachebackDir(home ?? process.env.DSH_HOME ?? path.join(process.env.HOME ?? '.', '.dsh'))
  const stamp = filenameStamp(options.now ?? Date.now())

  if (format === 'summary') {
    return { text: renderSummary(report, { lang }), report, scan }
  }

  await mkdir(dir, { recursive: true })

  if (format === 'json') {
    const payload = { generatedAt: report.generatedAt, report, scan: publicScan(scan) }
    const json = JSON.stringify(payload, null, 2)
    const file = path.join(dir, `report-${stamp}.json`)
    const latest = path.join(dir, 'latest-report.json')
    await writeFile(file, `${json}\n`, 'utf8')
    await writeFile(latest, `${json}\n`, 'utf8')
    return {
      text: `${renderSummary(report, { lang })}\n\nJSON report: ${file}`,
      path: file,
      report,
      scan,
    }
  }

  if (format === 'card') {
    const svg = renderCard(report, { repo: options.repo, version: options.version })
    const file = path.join(dir, `card-${stamp}.svg`)
    const latest = path.join(dir, 'latest-card.svg')
    await writeFile(file, svg, 'utf8')
    await writeFile(latest, svg, 'utf8')
    if (options.open === true) openFile(file)
    return {
      text: `${renderSummary(report, { lang })}\n\nShare card: ${file}\n(No project names or session titles are included.)`,
      path: file,
      report,
      scan,
    }
  }

  const html = renderReceipt(report, {
    repo: options.repo,
    version: options.version,
    generatedAt: report.generatedAt,
  })
  const file = path.join(dir, `receipt-${stamp}.html`)
  const latest = path.join(dir, 'latest-receipt.html')
  await writeFile(file, html, 'utf8')
  await writeFile(latest, html, 'utf8')
  if (options.open === true) openFile(file)
  return {
    text: `${renderSummary(report, { lang })}\n\nHTML receipt: ${file}${options.open === true ? '' : `\nOpen it with: open "${file}"`}`,
    path: file,
    report,
    scan,
  }
}

/**
 * Scan only, for callers that want to render themselves.
 * @param {{ home?: string, refresh?: boolean }} [options] - scan options.
 * @returns {Promise<object>} parsed sessions and stats.
 */
export async function scanOnly(options = {}) {
  return scanSessions(options)
}

/**
 * Open a local file with the platform's default handler.
 * @param {string} file - absolute path.
 * @returns {void}
 */
export function openFile(file) {
  const command = process.platform === 'darwin'
    ? ['open', [file]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', file]]
      : ['xdg-open', [file]]
  try {
    const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {
    // Opening is a convenience; the path is still returned to the caller.
  }
}

/**
 * Timestamp suitable for a filename, in local time.
 * @param {number} ms - epoch milliseconds.
 * @returns {string} `20261103-215700`.
 */
function filenameStamp(ms) {
  const date = new Date(ms)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * Strip full file paths before a scan summary is printed or returned.
 * @param {object} scan - scan result.
 * @returns {object} public counters.
 */
function publicScan(scan) {
  return {
    files: scan.files,
    parsed: scan.parsed,
    reused: scan.reused,
    failed: scan.failed,
    partial: scan.partial,
  }
}
