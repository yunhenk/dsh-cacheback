/**
 * Localized copy for the handful of tips the report can emit.
 * @module dsh-cacheback/tips
 */
import { cny, percent, usd } from './format.js'

/**
 * Turn a tip descriptor into a title and one paragraph.
 * @param {'zh' | 'en'} lang - output language.
 * @param {object} tip - descriptor from buildReport.
 * @param {number} usdToCny - display conversion.
 * @returns {{ title: string, body: string, impact: string }} localized copy.
 */
export function tipCopy(lang, tip, usdToCny) {
  return lang === 'zh' ? zh(tip, usdToCny) : en(tip)
}

/** @param {object} tip @param {number} rate @returns {{title:string,body:string,impact:string}} */
function zh(tip, rate) {
  switch (tip.id) {
    case 'peak':
      return {
        title: '把重活挪到谷时',
        body: `${tip.calls?.toLocaleString('en-US')} 次调用落在峰时。峰时价格是谷时的 2 倍；把批量任务放到晚上或午休，同样的 token 直接半价。`,
        impact: `${usd(tip.impactUsd)} / ${cny(tip.impactUsd * rate)}`,
      }
    case 'cold':
      return {
        title: '少开新会话，避免冷启动',
        body: `${tip.calls} 次调用从空缓存开始，共 ${usd(tip.impactUsd)}。第一个请求永远按未命中价重读整个前缀；续用同一个会话，别每个任务都新开。`,
        impact: `${tip.calls} 次 · ${usd(tip.impactUsd)}`,
      }
    case 'manySessions':
      return {
        title: '一个项目，一个热会话',
        body: `${tip.sessions} 个会话分散在 ${tip.projects} 个项目。每个新会话都要重新读一遍前缀（按未命中价）；把同一项目的任务收进一个长会话更省。`,
        impact: `${tip.sessions} 会话`,
      }
    case 'outputHeavy':
      return {
        title: '输出才是大头',
        body: `输出占账单 ${percent(tip.share)}。让回答更短，或只在对的步骤开推理，能直接砍掉最大的一块。`,
        impact: percent(tip.share),
      }
    case 'coldCache':
      return {
        title: '缓存偏冷',
        body: `只有 ${percent(tip.hitRate)} 的输入命中了缓存。长会话、少重开，是 DeepSeek 最便宜的用法。`,
        impact: percent(tip.hitRate),
      }
    case 'toolChurn':
      return {
        title: '工具前缀变过，缓存就断了',
        body: `在 ${tip.sessions} 个会话里检测到 ${tip.changes} 次工具表变化。每次变化都会让缓存前缀失效，下一次请求按未命中价重读整段；装/卸插件尽量放在会话之间。`,
        impact: `${tip.changes} 次`,
      }
    case 'stableTools':
      return {
        title: '保持工具前缀稳定',
        body: '装/卸插件会改写缓存前缀，下一次请求要按未命中价重读整段。插件变更尽量放在会话之间，别在长任务中途折腾工具。',
        impact: '插件',
      }
    default:
      return { title: tip.id, body: '', impact: '' }
  }
}

/** @param {object} tip @returns {{title:string,body:string,impact:string}} */
function en(tip) {
  switch (tip.id) {
    case 'peak':
      return {
        title: 'Move heavy work off-peak',
        body: `${tip.calls?.toLocaleString('en-US')} calls ran at peak. Peak is twice the off-peak rate; schedule batch work for the evening or lunch and the same tokens cost half.`,
        impact: `${usd(tip.impactUsd)} extra`,
      }
    case 'cold':
      return {
        title: 'Resume, don\'t restart',
        body: `${tip.calls} calls began with an empty cache and cost ${usd(tip.impactUsd)}. The first request always re-reads the whole prefix at the miss price; keep one session alive instead of starting a new one per task.`,
        impact: `${tip.calls} cold starts`,
      }
    case 'manySessions':
      return {
        title: 'One warm session per project',
        body: `${tip.sessions} sessions across ${tip.projects} projects. Every new session re-reads its prefix at the miss price; fold a project's tasks into one long session.`,
        impact: `${tip.sessions} sessions`,
      }
    case 'outputHeavy':
      return {
        title: 'Output is the big cost',
        body: `Output is ${percent(tip.share)} of the bill. Ask for shorter answers, or reserve reasoning for the hard steps.`,
        impact: percent(tip.share),
      }
    case 'coldCache':
      return {
        title: 'Your cache is cold',
        body: `Only ${percent(tip.hitRate)} of input was served from cache. Long, resumed sessions are the cheapest way to use DeepSeek.`,
        impact: percent(tip.hitRate),
      }
    case 'toolChurn':
      return {
        title: 'Your tool prefix moved, so the cache broke',
        body: `${tip.sessions} sessions changed their tool table ${tip.changes} times. Every change invalidates the cached prefix and the next request re-reads it at the miss price; batch plugin changes between sessions.`,
        impact: `${tip.changes} changes`,
      }
    case 'stableTools':
      return {
        title: 'Keep the tool prefix stable',
        body: 'Installing or removing plugins rewrites the cached prefix; the next request re-reads it at the miss price. Batch plugin changes between sessions, not in the middle of a long task.',
        impact: 'plugins',
      }
    default:
      return { title: tip.id, body: '', impact: '' }
  }
}
