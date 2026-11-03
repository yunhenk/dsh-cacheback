/**
 * Plain-text receipt for the chat surface: compact enough to read in one
 * screen, detailed enough to be worth running.
 * @module dsh-cacheback/render-text
 */
import { cny, multiple, percent, range, tokens, usd } from './format.js'
import { tipCopy } from './tips.js'

/**
 * Render the summary that `/cache` and the `cache_receipt` tool return.
 * @param {object} report - report from buildReport.
 * @param {{ lang?: 'zh' | 'en' }} [options] - output language.
 * @returns {string} plain text with line breaks.
 */
export function renderSummary(report, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'zh'
  return lang === 'zh' ? zh(report) : en(report)
}

/** @param {object} report @returns {string} Chinese summary. */
function zh(report) {
  if (report.sessions === 0) {
    return [
      'Cacheback · 还没有可计费的会话',
      '',
      '先在 DSH 里跑一个会话，再执行 /cache。',
      'Cacheback 会扫描本机 ~/.dsh/sessions 里的会话日志，逐笔按 DeepSeek 官方峰谷价计费。',
    ].join('\n')
  }

  const lines = [
    'Cacheback · DeepSeek 缓存账单',
    `${range(report.firstAt, report.lastAt)} · ${report.sessions} 个会话 · ${report.projects.length} 个项目 · ${report.calls.toLocaleString('en-US')} 次调用`,
    '',
    `DeepSeek 前缀缓存为你省下 ≈${cny(report.savedCny)}（${usd(report.savedUsd)}）`,
    `没有缓存 ${usd(report.noCacheUsd)} → 实际 ${usd(report.costUsd)} · 便宜 ${multiple(report.multiple)} · 命中率 ${percent(report.hitRate)}`,
    '',
    `花费构成：缓存读取 ${usd(report.hitCostUsd)} · 未命中 ${usd(report.missCostUsd)} · 输出 ${usd(report.outputCostUsd)}`,
    `Tokens：命中 ${tokens(report.hit)} · 未命中 ${tokens(report.miss)} · 输出 ${tokens(report.out)}`,
    '',
    '项目',
    ...projectLines(report, 'zh'),
    '',
    '可优化',
    ...report.tips.map((tip) => { const copy = tipCopy('zh', tip, report.usdToCny); return `  · ${copy.title}：${copy.body}` }),
    '',
    `缓存评分 ${report.score} · ${report.grade}`,
    `说明：逐笔回放本地会话日志，按 DeepSeek 官方峰谷价计费；人民币按 ${report.usdToCny} 估算。数据未离开本机。`,
    '生成 HTML 账单：/cache receipt · 分享卡：/cache card',
  ]
  return lines.join('\n')
}

/** @param {object} report @returns {string} English summary. */
function en(report) {
  if (report.sessions === 0) {
    return [
      'Cacheback · no billable sessions yet',
      '',
      'Run a session in DSH, then /cache.',
      'Cacheback reads ~/.dsh/sessions and prices every call at DeepSeek\'s published peak/off-peak rates.',
    ].join('\n')
  }

  const lines = [
    'Cacheback · DeepSeek cache receipt',
    `${range(report.firstAt, report.lastAt)} · ${report.sessions} sessions · ${report.projects.length} projects · ${report.calls.toLocaleString('en-US')} calls`,
    '',
    `DeepSeek prefix caching saved you ≈${cny(report.savedCny)} (${usd(report.savedUsd)}).`,
    `Without cache ${usd(report.noCacheUsd)} → you paid ${usd(report.costUsd)} · ${multiple(report.multiple)} cheaper · ${percent(report.hitRate)} hit rate`,
    '',
    `Spend: cache read ${usd(report.hitCostUsd)} · cache miss ${usd(report.missCostUsd)} · output ${usd(report.outputCostUsd)}`,
    `Tokens: ${tokens(report.hit)} hit · ${tokens(report.miss)} miss · ${tokens(report.out)} out`,
    '',
    'Projects',
    ...projectLines(report, 'en'),
    '',
    'What to improve',
    ...report.tips.map((tip) => { const copy = tipCopy('en', tip, report.usdToCny); return `  · ${copy.title}: ${copy.body}` }),
    '',
    `Cache score ${report.score} · ${report.grade}`,
    `Method: every call replayed from local logs, priced at DeepSeek's published peak/off-peak rates; CNY at ${report.usdToCny}. Nothing leaves this machine.`,
    'HTML receipt: /cache receipt · Share card: /cache card',
  ]
  return lines.join('\n')
}

/**
 * Top project rows, aligned without assuming monospace width.
 * @param {object} report - report.
 * @param {'zh' | 'en'} lang - language.
 * @returns {string[]} lines.
 */
function projectLines(report, lang) {
  const rows = report.projects.slice(0, 5).map((project) => {
    const name = truncate(project.name, 18)
    return `  ${name.padEnd(18)} ${usd(project.savedUsd).padStart(8)}  ·  ${project.calls.toLocaleString('en-US').padStart(5)} ${lang === 'zh' ? '次' : 'calls'}  ·  ${percent(ratio(project.hit, project.hit + project.miss))}`
  })
  if (report.projects.length > 5) {
    rows.push(`  … ${report.projects.length - 5} ${lang === 'zh' ? '个更多项目' : 'more projects'}`)
  }
  return rows
}

/** @param {number} top @param {number} bottom @returns {number} ratio. */
function ratio(top, bottom) {
  return bottom > 0 ? top / bottom : 0
}

/** @param {string} value @param {number} length @returns {string} truncated value. */
function truncate(value, length) {
  const text = String(value)
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`
}
