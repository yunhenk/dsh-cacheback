/**
 * Share card: a single 1200×630 SVG with aggregates only.
 *
 * The card deliberately omits project names, session titles, and paths so it
 * can be posted publicly without leaking the workspace.
 * @module dsh-cacheback/render-svg
 */
import { cny, multiple, percent, tokens, usd } from './format.js'

/**
 * Render the share card.
 * @param {object} report - report from buildReport.
 * @param {{ repo?: string, version?: string }} [options] - footer facts.
 * @returns {string} a standalone SVG document.
 */
export function renderCard(report, options = {}) {
  const repo = options.repo ?? 'github.com/yunhenk/dsh-cacheback'
  const version = options.version ?? '0.1.1'
  const period = report.firstAt && report.lastAt
    ? `${beijing(report.firstAt)} — ${beijing(report.lastAt)}`
    : 'all time'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="DeepSeek cache saved ${escapeXml(cny(report.savedCny))}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#060b18"/>
    <stop offset=".55" stop-color="#070d1e"/>
    <stop offset="1" stop-color="#050914"/>
  </linearGradient>
  <linearGradient id="amount" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#e6ecff"/>
    <stop offset=".45" stop-color="#8fa4ff"/>
    <stop offset="1" stop-color="#4fe3c1"/>
  </linearGradient>
  <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#5b7cff"/>
    <stop offset="1" stop-color="#4fe3c1"/>
  </linearGradient>
  <radialGradient id="glow" cx=".18" cy=".12" r=".8">
    <stop offset="0" stop-color="#5b7cff" stop-opacity=".34"/>
    <stop offset="1" stop-color="#5b7cff" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="glow2" cx=".9" cy=".1" r=".6">
    <stop offset="0" stop-color="#4fe3c1" stop-opacity=".18"/>
    <stop offset="1" stop-color="#4fe3c1" stop-opacity="0"/>
  </radialGradient>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M40 0H0V40" fill="none" stroke="#94abd6" stroke-opacity=".055" stroke-width="1"/>
  </pattern>
</defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<rect width="1200" height="630" fill="url(#grid)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<rect width="1200" height="630" fill="url(#glow2)"/>

<g font-family="'SF Pro Display','PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <g transform="translate(72 66)">
    <rect x="0" y="0" width="38" height="38" rx="12" fill="none" stroke="url(#line)" stroke-width="2"/>
    <path d="M8 25c4.2 0 4.2-5 8.3-5s4.2 5 8.3 5 4.2-5 8.3-5" fill="none" stroke="url(#line)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="19" cy="14" r="2.6" fill="#8fa4ff"/>
    <text x="54" y="17" fill="#edf2fb" font-size="17" font-weight="800" letter-spacing="4.2">CACHEBACK</text>
    <text x="54" y="34" fill="#8fa0bd" font-size="10.5" letter-spacing="2.4">DSH CACHE RECEIPT · 缓存账单</text>
  </g>

  <text x="1128" y="80" text-anchor="end" fill="#5f6f8d" font-size="11" letter-spacing="2.2">LOCAL · NO UPLOAD</text>
  <text x="1128" y="99" text-anchor="end" fill="#8fa0bd" font-size="11" letter-spacing="1.4">${escapeXml(period)}</text>

  <text x="72" y="212" fill="#8fa0bd" font-size="15" letter-spacing="3.4">DEEPSEEK PREFIX CACHE SAVED ME</text>
  <text x="68" y="342" fill="url(#amount)" font-size="112" font-weight="800" letter-spacing="-5">${escapeXml(cny(report.savedCny))}</text>
  <text x="74" y="392" fill="#edf2fb" font-size="22" font-weight="600">${escapeXml(usd(report.savedUsd))} saved · ${escapeXml(percent(report.discount))} off</text>
  <text x="74" y="422" fill="#8fa0bd" font-size="15">Without cache ${escapeXml(usd(report.noCacheUsd))} → paid ${escapeXml(usd(report.costUsd))}</text>

  <g transform="translate(72 500)">
    <line x1="0" y1="0" x2="1056" y2="0" stroke="#94abd6" stroke-opacity=".14"/>
    <text x="0" y="42" fill="#edf2fb" font-size="30" font-weight="700" letter-spacing="-0.6">${escapeXml(percent(report.hitRate))}</text>
    <text x="0" y="63" fill="#8fa0bd" font-size="11" letter-spacing="1.6">CACHE HIT RATE</text>
    <text x="300" y="42" fill="#edf2fb" font-size="30" font-weight="700" letter-spacing="-0.6">${escapeXml(tokens(report.hit))}</text>
    <text x="300" y="63" fill="#8fa0bd" font-size="11" letter-spacing="1.6">CACHED TOKENS</text>
    <text x="560" y="42" fill="#edf2fb" font-size="30" font-weight="700" letter-spacing="-0.6">${escapeXml(multiple(report.multiple))}</text>
    <text x="560" y="63" fill="#8fa0bd" font-size="11" letter-spacing="1.6">CHEAPER</text>
    <text x="760" y="42" fill="#edf2fb" font-size="30" font-weight="700" letter-spacing="-0.6">${report.calls.toLocaleString('en-US')}</text>
    <text x="760" y="63" fill="#8fa0bd" font-size="11" letter-spacing="1.6">CALLS · ${report.sessions} SESSIONS</text>
  </g>

  <text x="72" y="600" fill="#5f6f8d" font-size="11.5" letter-spacing=".6">dsh-cacheback v${escapeXml(version)} · ${escapeXml(repo)}</text>
  <text x="1128" y="600" text-anchor="end" fill="#5f6f8d" font-size="11.5" letter-spacing=".6">DeepSeek's cache was always paying you back.</text>
</g>
</svg>
`
}

/** @param {number} ms @returns {string} Beijing date. */
function beijing(ms) {
  return new Date(ms + 8 * 3600e3).toISOString().slice(0, 10)
}

/**
 * Escape text for XML.
 * @param {unknown} value - raw value.
 * @returns {string} escaped text.
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
