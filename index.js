/**
 * Cacheback — the missing receipt for DeepSeek's prefix cache.
 *
 * Every session log already records the provider's usage per model call.
 * Cacheback replays those calls, prices each one at DeepSeek's published
 * peak/off-peak rates, and turns the total into a receipt: how much the cache
 * saved, where the money actually went, and which habits are still costing
 * money.
 *
 * Everything is local. The plugin reads `~/.dsh/sessions` and writes receipts
 * under `~/.dsh/cacheback`; it never makes a network request.
 *
 * @module dsh-cacheback
 */
import path from 'node:path'

import { generate } from './lib/report.js'

/** Services required before `apply` runs. */
export const inject = ['tools']

/** Tool name shown to the model. */
const TOOL_NAME = 'cache_receipt'

/** Human command name, used as `/cache`. */
const COMMAND_NAME = 'cache'

/**
 * Register the tool and the slash command.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ usdToCny?: number, lang?: 'zh' | 'en', repo?: string, open?: boolean }} [config] - plugin config.
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const defaults = {
    usdToCny: numberOr(config.usdToCny, 7.2),
    lang: config.lang === 'en' ? 'en' : 'zh',
    repo: typeof config.repo === 'string' && config.repo !== ''
      ? config.repo
      : 'github.com/yunhenk/dsh-cacheback',
    open: config.open === true,
    version: '0.1.1',
  }

  ctx.tools.register({
    name: TOOL_NAME,
    description:
      'Show how much money DeepSeek prefix caching has saved on this machine. Replays every local DSH '
      + 'session log, prices each model call at DeepSeek\'s published peak/off-peak rates (cache hit, '
      + 'cache miss, output), and returns a receipt with lifetime savings, cache hit rate, spend '
      + 'breakdown, project ranking, peak premium, cold starts, and concrete tips. Use it when the user '
      + 'asks about token cost, cache efficiency, spend, or "how much has the cache saved me". Formats: '
      + 'summary (chat text), receipt (self-contained HTML file), card (1200x630 shareable SVG), json. '
      + 'All data stays local; nothing is uploaded.',
    parameters: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['summary', 'receipt', 'card', 'json'],
          description: 'summary (default) returns chat text; receipt writes an HTML file; card writes a shareable SVG; json returns the raw report.',
        },
        since: {
          type: 'string',
          description: 'Time window: 7d, 30d, 90d, all (default), or an ISO date such as 2026-10-01.',
        },
        project: {
          type: 'string',
          description: 'Only include sessions whose project name or path contains this text.',
        },
        lang: {
          type: 'string',
          enum: ['zh', 'en'],
          description: 'Language for the chat summary. The receipt and card are bilingual.',
        },
        open: {
          type: 'boolean',
          description: 'Open the generated file in the default browser. Defaults to false.',
        },
        redact: {
          type: 'boolean',
          description: 'Replace project names and paths with Project A/B/C before generating a shareable receipt or card.',
        },
        refresh: {
          type: 'boolean',
          description: 'Re-parse every session log instead of reusing the local parse cache.',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      if (exec.signal.aborted) throw new Error('cache_receipt aborted')
      const result = await generate({
        format: normalizeFormat(args.format),
        since: typeof args.since === 'string' ? args.since : undefined,
        project: typeof args.project === 'string' ? args.project : undefined,
        lang: args.lang === 'en' ? 'en' : defaults.lang,
        open: args.open === true,
        redact: args.redact === true,
        refresh: args.refresh === true,
        usdToCny: defaults.usdToCny,
        repo: defaults.repo,
        version: defaults.version,
      })
      const output = { text: result.text }
      if (result.path !== undefined) output.path = result.path
      return output
    },
    presentCall: () => ({ card: 'generic', title: 'Cacheback receipt', kind: 'read' }),
  })

  // Commands are optional: the plugin still provides the tool in profiles
  // without a human-command registry. `ctx.inject` waits for the service and
  // disposes the registration with this plugin.
  ctx.inject(['commands'], (scope) => {
    const commands = scope.get('commands')
    if (commands === undefined) return
    scope.effect(() => commands.register({
      name: COMMAND_NAME,
      description:
        'DeepSeek cache receipt: savings, hit rate, spend breakdown, and tips. '
        + 'Usage: /cache [receipt|card|json] [7d|30d|90d|all] [zh|en] [redact] [open] [project <name>]',
      input: {
        hint: 'receipt | card | json · 7d | 30d | all · zh | en · redact · project <name>',
      },
      handler: async (invocation) => {
        try {
          const args = parseCommand(invocation.rawInput)
          const result = await generate({
            format: args.format,
            since: args.since,
            project: args.project,
            lang: args.lang ?? defaults.lang,
            open: args.explicitOpen || args.format === 'receipt' || args.format === 'card',
            redact: args.redact,
            refresh: args.refresh,
            usdToCny: defaults.usdToCny,
            repo: defaults.repo,
            version: defaults.version,
          })
          return { kind: 'success', text: result.text }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          return { kind: 'error', text: `cacheback failed: ${reason}` }
        }
      },
    }))
  })
}

/**
 * Parse `/cache` arguments into generate() options.
 * @param {string} raw - text after the command name.
 * @returns {{
 *   format: 'summary' | 'receipt' | 'card' | 'json',
 *   since?: string,
 *   project?: string,
 *   lang?: 'zh' | 'en',
 *   open: boolean,
 *   explicitOpen: boolean,
 *   refresh: boolean,
 *   redact: boolean,
 * }} parsed options.
 */
export function parseCommand(raw) {
  const tokens = String(raw ?? '').trim().split(/\s+/).filter(Boolean)
  const options = {
    format: 'summary',
    open: false,
    explicitOpen: false,
    refresh: false,
    redact: false,
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const lower = token.toLowerCase()
    if (['summary', 'receipt', 'card', 'json'].includes(lower)) {
      options.format = lower
    } else if (lower === 'open') {
      options.open = true
      options.explicitOpen = true
    } else if (lower === 'refresh') {
      options.refresh = true
    } else if (lower === 'redact') {
      options.redact = true
    } else if (lower === 'zh' || lower === 'en') {
      options.lang = lower
    } else if (lower === 'project') {
      const name = []
      while (index + 1 < tokens.length && !isCommandFlag(tokens[index + 1])) {
        index += 1
        name.push(tokens[index])
      }
      if (name.length > 0) options.project = name.join(' ')
    } else if (/^(all|\d{1,3}d|\d{4}-\d{2}-\d{2})$/.test(lower)) {
      options.since = lower
    }
  }
  return options
}

/**
 * Whether a token is a Cacheback flag rather than part of a project name.
 * @param {string} token - raw token.
 * @returns {boolean} true when the token starts a new option.
 */
function isCommandFlag(token) {
  const lower = token.toLowerCase()
  return ['summary', 'receipt', 'card', 'json', 'open', 'refresh', 'redact', 'zh', 'en', 'project'].includes(lower)
    || /^(all|\d{1,3}d|\d{4}-\d{2}-\d{2})$/.test(lower)
}

/**
 * Only the four documented formats reach generate().
 * @param {unknown} format - requested format.
 * @returns {'summary' | 'receipt' | 'card' | 'json'} safe format.
 */
function normalizeFormat(format) {
  return ['summary', 'receipt', 'card', 'json'].includes(format) ? format : 'summary'
}

/**
 * Coerce a config number.
 * @param {unknown} value - raw value.
 * @param {number} fallback - default.
 * @returns {number} finite number.
 */
function numberOr(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

/**
 * Absolute path helper kept for callers that want to inspect the receipt dir.
 * @returns {string} `~/.dsh/cacheback`.
 */
export function receiptDirectory() {
  const home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '.', '.dsh')
  return path.join(home, 'cacheback')
}
