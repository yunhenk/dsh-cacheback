/**
 * Self-contained HTML receipt. No scripts, no external assets, no network:
 * the file can be opened offline, printed to PDF, or archived as-is.
 * @module dsh-cacheback/render-html
 */
import { bucketDays } from './aggregate.js'
import { cny, date, multiple, percent, range, tokens, usd } from './format.js'
import { tipCopy } from './tips.js'

/**
 * Render the full receipt.
 * @param {object} report - report from buildReport.
 * @param {{
 *   version?: string,
 *   repo?: string,
 *   generatedAt?: number,
 *   lang?: 'zh' | 'en',
 * }} [options] - footer facts and tip language.
 * @returns {string} a complete HTML document.
 */
export function renderReceipt(report, options = {}) {
  const version = options.version ?? '0.1.1'
  const repo = options.repo ?? 'github.com/yunhenk/dsh-cacheback'
  const generatedAt = options.generatedAt ?? Date.now()
  const tipLang = options.lang === 'en' ? 'en' : 'zh'
  const spend = [
    { key: 'hit', label: 'Cache read', zh: '缓存读取', value: report.hitCostUsd, color: 'var(--blue)' },
    { key: 'miss', label: 'Cache miss', zh: '未命中', value: report.missCostUsd, color: 'var(--amber)' },
    { key: 'out', label: 'Output', zh: '输出', value: report.outputCostUsd, color: 'var(--cyan)' },
  ]
  const spendTotal = Math.max(report.costUsd, 1e-9)
  const actualWidth = clamp((report.costUsd / Math.max(report.noCacheUsd, 1e-9)) * 100, 1.2, 100)
  const chart = bucketDays(report.days, 22)
  const chartMax = Math.max(...chart.map((day) => day.savedUsd), 1e-9)
  const projectMax = Math.max(...report.projects.map((project) => project.savedUsd), 1e-9)
  const circumference = 2 * Math.PI * 46
  const ringOffset = circumference * (1 - clamp(report.score, 0, 100) / 100)

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Cacheback · DeepSeek cache receipt ${escapeHtml(date(report.lastAt))}</title>
<style>
:root {
  --ink: #050914;
  --ink-2: #070d1c;
  --panel: #0a1222;
  --panel-2: #0d172b;
  --line: rgba(148, 171, 214, .14);
  --line-strong: rgba(148, 171, 214, .26);
  --text: #edf2fb;
  --muted: #8fa0bd;
  --faint: #5f6f8d;
  --blue: #5b7cff;
  --blue-2: #8fa4ff;
  --cyan: #4fe3c1;
  --amber: #f4b860;
  --red: #ff7a8a;
  --radius: 18px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  color: var(--text);
  background:
    radial-gradient(900px 520px at 12% -8%, rgba(91, 124, 255, .22), transparent 60%),
    radial-gradient(760px 460px at 92% 4%, rgba(79, 227, 193, .12), transparent 58%),
    linear-gradient(180deg, #050914 0%, #060b18 55%, #050914 100%);
  font-family: "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-feature-settings: "tnum" 1, "ss01" 1;
  -webkit-font-smoothing: antialiased;
}
.sheet { width: min(1040px, calc(100% - 40px)); margin: 0 auto; padding: 34px 0 56px; }
.masthead { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 22px; border-bottom: 1px solid var(--line); }
.wordmark { display: flex; align-items: center; gap: 11px; font-weight: 800; letter-spacing: .18em; font-size: 14px; }
.wordmark svg { width: 30px; height: 30px; display: block; }
.issue { text-align: right; color: var(--muted); font-size: 10px; letter-spacing: .16em; line-height: 1.7; text-transform: uppercase; }
.issue b { color: var(--text); font-weight: 600; }
.hero { padding: 46px 0 30px; }
.kicker { display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--muted); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.kicker .period { letter-spacing: .08em; color: var(--faint); }
.amount {
  margin: 12px 0 4px;
  font-size: clamp(58px, 11vw, 118px);
  line-height: .94;
  font-weight: 800;
  letter-spacing: -.045em;
  background: linear-gradient(92deg, #dbe4ff 0%, var(--blue-2) 38%, var(--cyan) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.amount-sub { color: var(--muted); font-size: 15px; letter-spacing: .01em; }
.amount-sub b { color: var(--text); font-weight: 600; }
.compare { margin-top: 30px; display: grid; grid-template-columns: 132px 1fr 88px; gap: 10px 14px; align-items: center; }
.compare-label { color: var(--muted); font-size: 12px; }
.compare-label small { display: block; color: var(--faint); font-size: 10px; letter-spacing: .08em; }
.track { height: 12px; border-radius: 99px; background: rgba(255,255,255,.04); overflow: hidden; border: 1px solid var(--line); }
.fill { height: 100%; border-radius: 99px; }
.fill.ghost { background: repeating-linear-gradient(135deg, rgba(143,160,189,.34) 0 8px, rgba(143,160,189,.14) 8px 16px); }
.fill.actual { background: linear-gradient(90deg, var(--blue), var(--cyan)); box-shadow: 0 0 18px rgba(79,227,193,.35); }
.compare-value { text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; color: var(--text); }
.metrics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 1px; margin: 26px 0 30px; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.metric { background: linear-gradient(180deg, rgba(13,23,43,.94), rgba(9,16,31,.94)); padding: 17px 16px 15px; }
.metric b { display: block; font-size: 22px; font-weight: 700; letter-spacing: -.02em; }
.metric span { display: block; margin-top: 5px; color: var(--muted); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.metric em { display: block; margin-top: 2px; color: var(--faint); font-size: 10px; font-style: normal; }
.two-col { display: grid; grid-template-columns: 1.25fr .75fr; gap: 16px; }
.panel { background: linear-gradient(180deg, rgba(13,23,43,.78), rgba(8,14,28,.82)); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px; margin-bottom: 16px; }
.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.panel-head h2 { margin: 0; font-size: 15px; letter-spacing: .01em; }
.panel-head span { color: var(--faint); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }
.stack { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: rgba(255,255,255,.04); border: 1px solid var(--line); }
.stack i { display: block; height: 100%; min-width: 2px; }
.legend { display: grid; gap: 9px; margin-top: 16px; }
.legend-row { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 12px; }
.legend-row i { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.legend-row b { margin-left: auto; color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
.legend-row small { color: var(--faint); font-size: 10px; margin-left: 4px; }
.ring-wrap { display: flex; align-items: center; gap: 18px; }
.ring { width: 118px; height: 118px; flex: none; }
.ring text { font-family: inherit; }
.ring .num { fill: var(--text); font-size: 27px; font-weight: 800; letter-spacing: -.03em; }
.ring .grade { fill: var(--cyan); font-size: 10px; letter-spacing: .18em; font-weight: 700; }
.ring-copy { color: var(--muted); font-size: 12px; line-height: 1.6; }
.ring-copy b { color: var(--text); }
.ring-copy .hint { color: var(--faint); font-size: 11px; }
.project { display: grid; grid-template-columns: minmax(110px, 1.1fr) 2.4fr 82px; gap: 14px; align-items: center; padding: 9px 0; border-top: 1px solid rgba(148,171,214,.08); }
.project:first-of-type { border-top: 0; }
.project-name { font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project-name small { display: block; color: var(--faint); font-size: 10px; margin-top: 2px; }
.project-bar { height: 7px; border-radius: 99px; background: rgba(255,255,255,.05); overflow: hidden; }
.project-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, rgba(91,124,255,.75), rgba(79,227,193,.9)); }
.project-value { text-align: right; font-size: 12px; color: var(--text); font-variant-numeric: tabular-nums; }
.project-value small { display: block; color: var(--faint); font-size: 10px; }
.chart { display: flex; align-items: flex-end; gap: 4px; height: 104px; padding-top: 8px; }
.chart .bar { flex: 1; min-width: 2px; height: 100%; display: flex; align-items: flex-end; }
.chart .bar i { display: block; width: 100%; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, rgba(79,227,193,.9), rgba(91,124,255,.55)); min-height: 2px; }
.chart-axis { display: flex; justify-content: space-between; margin-top: 7px; color: var(--faint); font-size: 10px; letter-spacing: .06em; }
.tips { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.tip { border: 1px solid var(--line); border-radius: 14px; padding: 15px 16px; background: rgba(9,16,31,.55); }
.tip-top { display: flex; align-items: center; gap: 9px; margin-bottom: 7px; }
.tip-index { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: var(--ink); background: linear-gradient(135deg, var(--cyan), var(--blue-2)); }
.tip h3 { margin: 0; font-size: 12.5px; font-weight: 650; }
.tip .impact { margin-left: auto; color: var(--muted); font-size: 10px; white-space: nowrap; }
.tip p { margin: 0; color: var(--muted); font-size: 11.5px; line-height: 1.65; }
.peak { display: flex; align-items: center; gap: 18px; padding: 16px 20px; border: 1px solid rgba(244,184,96,.22); background: linear-gradient(90deg, rgba(244,184,96,.08), rgba(244,184,96,.02)); border-radius: 14px; margin-bottom: 16px; }
.peak b { font-size: 20px; color: var(--amber); font-variant-numeric: tabular-nums; }
.peak span { color: var(--muted); font-size: 11.5px; line-height: 1.55; }
.peak strong { color: var(--text); font-weight: 600; }
.footer { margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--faint); font-size: 10.5px; line-height: 1.8; }
.footer b { color: var(--muted); font-weight: 600; }
.footer .install { margin-top: 10px; display: inline-block; color: var(--muted); background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; }
@media (max-width: 820px) {
  .metrics { grid-template-columns: repeat(3, 1fr); }
  .two-col { grid-template-columns: 1fr; }
  .compare { grid-template-columns: 100px 1fr 74px; }
  .tips { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .sheet { width: calc(100% - 24px); padding-top: 22px; }
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .kicker { align-items: flex-start; flex-direction: column; gap: 6px; }
  .project { grid-template-columns: 1fr 70px; }
  .project-bar { grid-column: 1 / -1; }
}
@media print {
  body { background: #fff; color: #111; }
  .panel, .metric { background: #fff; border-color: #ddd; }
  .amount { color: #1c3ee0; -webkit-text-fill-color: #1c3ee0; }
  .muted, .amount-sub, .project-name small { color: #555; }
}
</style>
</head>
<body>
<main class="sheet">
  <header class="masthead">
    <div class="wordmark">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <defs><linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fa4ff"/><stop offset="1" stop-color="#4fe3c1"/></linearGradient></defs>
        <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="none" stroke="url(#mark)" stroke-width="2"/>
        <path d="M7 20c3.2 0 3.2-4 6.4-4s3.2 4 6.4 4 3.2-4 6.4-4" fill="none" stroke="url(#mark)" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="16" cy="11.5" r="2.1" fill="#8fa4ff"/>
      </svg>
      <span>CACHEBACK</span>
    </div>
    <div class="issue"><b>DSH CACHE RECEIPT</b><br>LOCAL · 本机账单 · ${escapeHtml(date(generatedAt))}</div>
  </header>

  <section class="hero">
    <div class="kicker">
      <span>Saved by DeepSeek prefix caching · 前缀缓存省下</span>
      <span class="period">${escapeHtml(range(report.firstAt, report.lastAt))}</span>
    </div>
    <div class="amount">${escapeHtml(cny(report.savedCny))}</div>
    <div class="amount-sub"><b>${escapeHtml(usd(report.savedUsd))}</b> saved · <b>${escapeHtml(percent(report.discount))}</b> off the no-cache price · 人民币按 ${escapeHtml(String(report.usdToCny))} 估算</div>
    <div class="compare">
      <div class="compare-label">Without cache<small>没有缓存</small></div>
      <div class="track"><div class="fill ghost" style="width:100%"></div></div>
      <div class="compare-value">${escapeHtml(usd(report.noCacheUsd))}</div>
      <div class="compare-label">You paid<small>实际花费</small></div>
      <div class="track"><div class="fill actual" style="width:${actualWidth.toFixed(2)}%"></div></div>
      <div class="compare-value">${escapeHtml(usd(report.costUsd))}</div>
    </div>
  </section>

  <section class="metrics">
    ${metric(percent(report.hitRate), 'Cache hit rate', '缓存命中率')}
    ${metric(tokens(report.hit), 'Cached tokens', '命中 tokens')}
    ${metric(multiple(report.multiple), 'Cheaper', '便宜倍数')}
    ${metric(report.calls.toLocaleString('en-US'), 'Model calls', '模型调用')}
    ${metric(String(report.sessions), 'Sessions', '会话')}
    ${metric(usd(report.peakExtraUsd), 'Peak premium', '峰时溢价')}
  </section>

  <div class="two-col">
    <section class="panel">
      <div class="panel-head"><h2>Where the money went</h2><span>花费构成</span></div>
      <div class="stack">
        ${spend.map((part) => `<i style="width:${clamp((part.value / spendTotal) * 100, part.value > 0 ? 1 : 0, 100).toFixed(2)}%;background:${part.color}"></i>`).join('')}
      </div>
      <div class="legend">
        ${spend.map((part) => `<div class="legend-row"><i style="background:${part.color}"></i>${escapeHtml(part.label)}<small>${escapeHtml(part.zh)}</small><b>${escapeHtml(usd(part.value))}</b></div>`).join('')}
        <div class="legend-row"><i style="background:var(--faint)"></i>Total<small>合计</small><b>${escapeHtml(usd(report.costUsd))}</b></div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Cache health</h2><span>缓存评分</span></div>
      <div class="ring-wrap">
        <svg class="ring" viewBox="0 0 120 120" aria-label="Cache score ${escapeHtml(String(report.score))}">
          <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(148,171,214,.14)" stroke-width="9"/>
          <circle cx="60" cy="60" r="46" fill="none" stroke="url(#ringGrad)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${ringOffset.toFixed(2)}" transform="rotate(-90 60 60)"/>
          <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7cff"/><stop offset="1" stop-color="#4fe3c1"/></linearGradient></defs>
          <text x="60" y="64" text-anchor="middle" class="num">${escapeHtml(String(report.score))}</text>
          <text x="60" y="80" text-anchor="middle" class="grade">${escapeHtml(report.grade)} GRADE</text>
        </svg>
        <div class="ring-copy">
          <b>${escapeHtml(percent(report.hitRate))}</b> of prompt tokens came from cache.<br>
          ${report.coldCalls > 0 ? `${report.coldCalls} cold starts cost <b>${escapeHtml(usd(report.coldCostUsd))}</b>.` : 'No cold starts in this window.'}
          ${report.biggestLeak?.missCostUsd > 0 ? `<br>Biggest leak: <b>${escapeHtml(report.biggestLeak.title)}</b> — ${escapeHtml(usd(report.biggestLeak.missCostUsd))} of misses.` : ''}
          <div class="hint">Long, resumed sessions keep this ring full.</div>
        </div>
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head"><h2>Savings by project</h2><span>按项目 · top ${Math.min(report.projects.length, 8)}</span></div>
    ${report.projects.slice(0, 8).map((project) => `
      <div class="project" title="${escapeHtml(project.cwd)}">
        <div class="project-name">${escapeHtml(project.name)}<small>${project.calls.toLocaleString('en-US')} calls · ${escapeHtml(percent(projHit(project)))} hit</small></div>
        <div class="project-bar"><i style="width:${clamp((project.savedUsd / projectMax) * 100, 1, 100).toFixed(2)}%"></i></div>
        <div class="project-value">${escapeHtml(usd(project.savedUsd))}<small>${project.sessions} session${project.sessions === 1 ? '' : 's'}</small></div>
      </div>`).join('')}
  </section>

  ${chart.length > 1 ? `<section class="panel">
    <div class="panel-head"><h2>Savings over time</h2><span>按时间</span></div>
    <div class="chart">
      ${chart.map((day) => `<div class="bar" title="${escapeHtml(day.day)}${day.endDay ? ` → ${escapeHtml(day.endDay)}` : ''}: ${escapeHtml(usd(day.savedUsd))} saved"><i style="height:${clamp((day.savedUsd / chartMax) * 100, day.savedUsd > 0 ? 3 : 0, 100).toFixed(2)}%"></i></div>`).join('')}
    </div>
    <div class="chart-axis"><span>${escapeHtml(chart[0].day)}</span><span>${escapeHtml(chart[chart.length - 1].endDay ?? chart[chart.length - 1].day)}</span></div>
  </section>` : ''}

  ${report.peakExtraUsd > 0.01 ? `<div class="peak">
    <b>${escapeHtml(usd(report.peakExtraUsd))}</b>
    <span>peak premium · 峰时溢价（≈${escapeHtml(cny(report.peakExtraCny))}）<br><strong>${report.peakCalls.toLocaleString('en-US')} calls</strong> ran in the 09:00–12:00 / 14:00–18:00 Beijing peak window, where every token costs 2×. Move batch work off-peak.</span>
  </div>` : ''}

  <section class="panel">
    <div class="panel-head"><h2>What to improve</h2><span>可优化</span></div>
    <div class="tips">
      ${report.tips.map((tip, index) => {
        const copy = tipCopy(tipLang, tip, report.usdToCny)
        return `<div class="tip"><div class="tip-top"><span class="tip-index">${index + 1}</span><h3>${escapeHtml(copy.title)}</h3><span class="impact">${escapeHtml(copy.impact)}</span></div><p>${escapeHtml(copy.body)}</p></div>`
      }).join('')}
    </div>
  </section>

  <footer class="footer">
    Generated locally by <b>dsh-cacheback v${escapeHtml(version)}</b> · 全部数据留在本机，未上传。No network requests.
    <br>Method: every assistant message replayed from <b>~/.dsh/sessions</b> and priced at DeepSeek's published rates (${escapeHtml('2026-11-03')}): peak 09:00–12:00 / 14:00–18:00 Beijing weekdays, excluding Chinese public holidays; off-peak is half price. CNY ≈ USD × ${escapeHtml(String(report.usdToCny))}.
    ${report.skippedCalls > 0 ? `<br>Note: ${report.skippedCalls} call${report.skippedCalls === 1 ? '' : 's'} from non-DeepSeek providers were excluded, because their cache pricing is different.` : ''}
    ${report.redacted ? '<br>Project names and paths are redacted for sharing.' : ''}
    ${report.partialSessions > 0 ? `<br>Note: ${report.partialSessions} session${report.partialSessions === 1 ? '' : 's'} had an incomplete trailing frame while being read; committed calls are included.` : ''}
    <br><span class="install">dsh plugin --profile web add github:${escapeHtml(repo.replace(/^github\.com\//, ''))}</span>
  </footer>
</main>
</body>
</html>
`
}

/**
 * One metric cell.
 * @param {string} value - headline figure (already formatted).
 * @param {string} label - English label.
 * @param {string} zh - Chinese label.
 * @returns {string} HTML.
 */
function metric(value, label, zh) {
  return `<div class="metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span><em>${escapeHtml(zh)}</em></div>`
}

/**
 * Project cache hit rate.
 * @param {object} project - project row.
 * @returns {number} 0..1.
 */
function projHit(project) {
  const total = project.hit + project.miss
  return total > 0 ? project.hit / total : 0
}

/**
 * Clamp a number.
 * @param {number} value - value.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @returns {number} clamped value.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

/**
 * Escape text for HTML element content and attributes.
 * @param {unknown} value - raw value.
 * @returns {string} escaped text.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
