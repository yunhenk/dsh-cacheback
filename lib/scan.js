/**
 * Discover DSH session logs and fold each one into a compact, priceable
 * aggregate.
 *
 * The log, not the projection cache, is the source of truth: every
 * `assistant/message` records the usage the provider reported and the model
 * that served it, which is exactly what peak/off-peak pricing needs. Session
 * logs are append-only, so a session can be re-read safely while it is live.
 *
 * @module dsh-cacheback/scan
 */
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import { readSessionLog } from './decode.js'
import { beijingDay, priceCall } from './pricing.js'
import { loadIndex, pruneIndex, saveIndex } from './store.js'

/** Candidate session log names; the highest format generation wins. */
const LOG_PATTERN = /^session(?:\.v(\d+))?\.jsonl(\.zstd)?$/

/**
 * Resolve DSH's home directory the way the running harness does.
 * @param {NodeJS.ProcessEnv} [env] - environment to read.
 * @returns {string} absolute DSH home.
 */
export function resolveHome(env = process.env) {
  if (env.DSH_HOME !== undefined && env.DSH_HOME !== '') return env.DSH_HOME
  return path.join(env.HOME ?? env.USERPROFILE ?? process.cwd(), '.dsh')
}

/**
 * List every session's preferred log file under `<home>/sessions`.
 * @param {string} home - DSH home.
 * @returns {Promise<string[]>} absolute log paths, sorted.
 */
export async function discoverSessionFiles(home) {
  const root = path.join(home, 'sessions')
  let projects
  try {
    projects = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const files = []
  for (const project of projects) {
    if (!project.isDirectory()) continue
    const projectDir = path.join(root, project.name)
    let sessions
    try {
      sessions = await readdir(projectDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const sessionDir = path.join(projectDir, session.name)
      let entries
      try {
        entries = await readdir(sessionDir, { withFileTypes: true })
      } catch {
        continue
      }

      let best
      let bestScore = -1
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const match = LOG_PATTERN.exec(entry.name)
        if (match === null) continue
        const version = match[1] === undefined ? 0 : Number(match[1])
        const score = version * 2 + (match[2] === '.zstd' ? 1 : 0)
        if (score > bestScore) {
          best = entry.name
          bestScore = score
        }
      }
      if (best !== undefined) files.push(path.join(sessionDir, best))
    }
  }

  return files.sort()
}

/**
 * Scan every session, reusing cached parses for unchanged files.
 * @param {{
 *   home?: string,
 *   refresh?: boolean,
 *   concurrency?: number,
 *   holidays?: Set<string>,
 * }} [options] - scan options.
 * @returns {Promise<{
 *   sessions: object[],
 *   files: number,
 *   parsed: number,
 *   reused: number,
 *   failed: number,
 *   partial: number,
 * }>}
 */
export async function scanSessions(options = {}) {
  const home = options.home ?? resolveHome()
  const files = await discoverSessionFiles(home)
  const index = await loadIndex(home)
  const live = new Set(files)
  let dirty = pruneIndex(index, live)

  const sessions = []
  let parsed = 0
  let reused = 0
  let failed = 0
  let partial = 0

  const queue = [...files]
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4))

  async function worker() {
    for (;;) {
      const file = queue.shift()
      if (file === undefined) return
      try {
        const info = await stat(file)
        const key = `${info.size}:${Math.round(info.mtimeMs)}`
        const cached = index.files[file]
        if (!options.refresh && cached?.key === key && cached.session !== undefined) {
          sessions.push(cached.session)
          reused += 1
          continue
        }

        const session = await parseSessionFile(file, info, options.holidays)
        if (session === undefined) {
          failed += 1
          continue
        }
        index.files[file] = { key, session }
        sessions.push(session)
        parsed += 1
        dirty = true
        if (session.partial) partial += 1
      } catch {
        failed += 1
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  if (dirty) await saveIndex(home, index).catch(() => {})

  sessions.sort((left, right) => (right.lastCallAt ?? 0) - (left.lastCallAt ?? 0))
  return { sessions, files: files.length, parsed, reused, failed, partial }
}

/**
 * Parse one session log into a compact aggregate.
 * @param {string} file - absolute log path.
 * @param {{ size: number, mtimeMs: number }} info - file stat.
 * @param {Set<string> | undefined} holidays - holiday overrides.
 * @returns {Promise<object | undefined>} the aggregate, or undefined when the log has no usable header.
 */
export async function parseSessionFile(file, info, holidays) {
  const { text, failedFrames } = await readSessionLog(file)
  const lines = text.split('\n')

  let header = {}
  let title = ''
  let firstUserText = ''
  let inheritCut = -1
  let calls = 0
  let hit = 0
  let miss = 0
  let write = 0
  let out = 0
  let costUsd = 0
  let hitCostUsd = 0
  let missCostUsd = 0
  let outputCostUsd = 0
  let noCacheUsd = 0
  let savedUsd = 0
  let peakExtraUsd = 0
  let peakCalls = 0
  let coldCalls = 0
  let coldCostUsd = 0
  let skippedCalls = 0
  let toolPrefixChanges = 0
  let toolCount = 0
  let toolFingerprint
  let firstCallAt
  let lastCallAt
  const models = new Set()
  const byModel = {}
  const byDay = {}

  for (const line of lines) {
    if (line === '') continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }

    switch (event.type) {
      case 'session':
        header = event
        if (header.isSeeded === true && Number(header.inheritedEventCount) > 0) {
          inheritCut = Math.max(inheritCut, Number(header.inheritedEventCount) - 1)
        }
        break
      case 'session/end-seed':
        inheritCut = Math.max(inheritCut, Number(event.seq) || 0)
        break
      case 'request/header': {
        const tools = event.data?.header?.tools
        if (Array.isArray(tools)) {
          toolCount = tools.length
          const fingerprint = hashString(JSON.stringify(tools))
          if (toolFingerprint !== undefined && fingerprint !== toolFingerprint) toolPrefixChanges += 1
          toolFingerprint = fingerprint
        }
        break
      }
      case 'session/title':
        if (typeof event.data?.title === 'string') title = event.data.title
        break
      case 'user/message':
        if (firstUserText === '') firstUserText = userText(event).slice(0, 80)
        break
      case 'assistant/message': {
        if (event.seq !== undefined && event.seq <= inheritCut) break
        const usage = event.data?.usage
        if (usage === undefined || usage === null) break
        const provider = event.data?.message?.source?.provider
        if (typeof provider === 'string' && provider !== '' && !/deepseek/i.test(provider)) {
          skippedCalls += 1
          break
        }
        const hitTokens = tokenCount(usage.cacheReadTokens)
        const missTokens = tokenCount(usage.inputTokens) + tokenCount(usage.cacheWriteTokens)
        const outputTokens = tokenCount(usage.outputTokens)
        if (hitTokens + missTokens + outputTokens === 0) break

        const time = Number(event.time) || Number(header.createdAt) || 0
        const model = event.data?.message?.source?.model
          ?? event.data?.source?.model
          ?? 'deepseek-flash'
        const priced = priceCall(usage, model, time, { holidays })

        calls += 1
        hit += priced.hitTokens
        miss += priced.missTokens
        write += tokenCount(usage.cacheWriteTokens)
        out += priced.outputTokens
        costUsd += priced.costUsd
        hitCostUsd += priced.hitCostUsd
        missCostUsd += priced.missCostUsd
        outputCostUsd += priced.outputCostUsd
        noCacheUsd += priced.noCacheUsd
        savedUsd += priced.savedUsd
        peakExtraUsd += priced.peakExtraUsd
        if (priced.peak) peakCalls += 1
        if (priced.hitTokens === 0 && priced.missTokens >= 1000) {
          coldCalls += 1
          coldCostUsd += priced.costUsd
        }
        firstCallAt = firstCallAt === undefined ? time : Math.min(firstCallAt, time)
        lastCallAt = lastCallAt === undefined ? time : Math.max(lastCallAt, time)
        models.add(model)
        accumulate(byModel, priced.family, {
          calls: 1,
          hit: priced.hitTokens,
          miss: priced.missTokens,
          out: priced.outputTokens,
          costUsd: priced.costUsd,
          hitCostUsd: priced.hitCostUsd,
          missCostUsd: priced.missCostUsd,
          outputCostUsd: priced.outputCostUsd,
          savedUsd: priced.savedUsd,
        })
        accumulate(byDay, beijingDay(time), {
          calls: 1,
          hit: priced.hitTokens,
          miss: priced.missTokens,
          out: priced.outputTokens,
          costUsd: priced.costUsd,
          hitCostUsd: priced.hitCostUsd,
          missCostUsd: priced.missCostUsd,
          outputCostUsd: priced.outputCostUsd,
          savedUsd: priced.savedUsd,
        })
        break
      }
      default:
        break
    }
  }

  const cwd = typeof header.cwd === 'string' ? header.cwd : ''
  const project = projectName(cwd, file)
  const createdAt = Number(header.createdAt) || firstCallAt || 0
  return {
    id: typeof header.id === 'string' ? header.id : path.basename(path.dirname(file)),
    file,
    cwd,
    project,
    title: title || firstUserText || `${project} · ${beijingDay(createdAt)}`,
    createdAt,
    isSeeded: header.isSeeded === true,
    delegationDepth: Number(header.delegationDepth) || 0,
    calls,
    hit,
    miss,
    write,
    out,
    costUsd,
    hitCostUsd,
    missCostUsd,
    outputCostUsd,
    noCacheUsd,
    savedUsd,
    peakExtraUsd,
    peakCalls,
    coldCalls,
    coldCostUsd,
    skippedCalls,
    firstCallAt: firstCallAt ?? createdAt,
    lastCallAt: lastCallAt ?? createdAt,
    models: [...models],
    byModel,
    byDay,
    partial: failedFrames > 0,
    bytes: info?.size ?? 0,
  }
}

/**
 * Read the plain text of a user message for title fallback.
 * @param {any} event - `user/message` event.
 * @returns {string} first text block, collapsed.
 */
function userText(event) {
  const content = event.data?.message?.content
  if (!Array.isArray(content)) return ''
  const block = content.find((item) => item?.type === 'text' && typeof item.text === 'string')
  return block === undefined ? '' : block.text.replace(/\s+/g, ' ').trim()
}

/**
 * Add one call's figures into a keyed bucket.
 * @param {Record<string, any>} table - bucket table.
 * @param {string} key - bucket key.
 * @param {Record<string, number>} delta - fields to add.
 * @returns {void}
 */
function accumulate(table, key, delta) {
  const bucket = table[key] ?? {
    calls: 0, hit: 0, miss: 0, out: 0,
    costUsd: 0, hitCostUsd: 0, missCostUsd: 0, outputCostUsd: 0, savedUsd: 0,
  }
  for (const [field, value] of Object.entries(delta)) {
    bucket[field] = (bucket[field] ?? 0) + value
  }
  table[key] = bucket
}

/**
 * FNV-1a 32-bit hash, used only to detect whether a tool table changed.
 * @param {string} text - serialized tool table.
 * @returns {string} hexadecimal hash.
 */
function hashString(text) {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Coerce a token count.
 * @param {unknown} value - raw count.
 * @returns {number} finite, non-negative number.
 */
function tokenCount(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

/**
 * Human project name for a session: the workspace directory's basename.
 * @param {string} cwd - session working directory.
 * @param {string} file - session log path, used as a fallback.
 * @returns {string} project label.
 */
function projectName(cwd, file) {
  if (cwd !== '') {
    const base = path.basename(cwd)
    return base === '' ? cwd : base
  }
  const encoded = path.basename(path.dirname(path.dirname(file)))
  return encoded.replace(/^--|--$/g, '').replace(/-/g, '/') || 'unknown'
}
