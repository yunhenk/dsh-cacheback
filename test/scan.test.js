import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { zstdCompressSync } from 'node:zlib'

import { decodeZstdFrames, readSessionLog } from '../lib/decode.js'
import { discoverSessionFiles, parseSessionFile } from '../lib/scan.js'

/** A rejection helper that never runs; keeps the test readable. */
const PEAK = Date.UTC(2026, 10, 3, 2, 0, 0)
const LUNCH = Date.UTC(2026, 10, 3, 4, 30, 0)

/**
 * One assistant-message event.
 * @param {number} seq - event sequence.
 * @param {number} time - epoch ms.
 * @param {object} usage - provider usage.
 * @returns {object} event.
 */
function call(seq, time, usage) {
  return {
    type: 'assistant/message',
    seq,
    time,
    data: {
      usage,
      message: { source: { kind: 'model', provider: 'deepseek-official', model: 'deepseek-flash' } },
    },
  }
}

test('parseSessionFile folds calls, title, project, and pricing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cacheback-test-'))
  const file = path.join(dir, 'session.jsonl')
  const lines = [
    { type: 'session', version: 4, id: 'session-test', createdAt: PEAK - 1000, cwd: '/work/alpha', isSeeded: false },
    { type: 'session/title', seq: 1, data: { title: 'A tidy test' } },
    call(2, PEAK, { inputTokens: 1_000_000, cacheReadTokens: 9_000_000, outputTokens: 0 }),
    call(3, LUNCH, { inputTokens: 0, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 }),
  ]
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const info = { size: 1, mtimeMs: 1 }
  const session = await parseSessionFile(file, info)

  assert.equal(session.calls, 2)
  assert.equal(session.hit, 10_000_000)
  assert.equal(session.miss, 1_000_000)
  assert.equal(session.out, 1_000_000)
  assert.equal(session.title, 'A tidy test')
  assert.equal(session.project, 'alpha')
  // Peak call: 9M hits at .006 + 1M misses at .30 = .054 + .30 = .354
  // Off-peak call: 1M hits at .003 + 1M output at .60 = .003 + .60 = .603
  assert.ok(Math.abs(session.costUsd - 0.957) < 1e-9)
  assert.equal(session.byModel.flash.calls, 2)
  assert.deepEqual(Object.keys(session.byDay), ['2026-11-03'])
})

test('inherited (seeded) events are not billed twice', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cacheback-seed-'))
  const file = path.join(dir, 'session.jsonl')
  const lines = [
    { type: 'session', id: 's', createdAt: PEAK, cwd: '/work/alpha', isSeeded: true, inheritedEventCount: 2 },
    call(1, PEAK, { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }),
    { type: 'session/end-seed', seq: 2 },
    call(3, PEAK, { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }),
  ]
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  const session = await parseSessionFile(file, { size: 1, mtimeMs: 1 })
  assert.equal(session.calls, 1)
})

test('multi-frame zstd decoding concatenates every batch', async () => {
  const first = zstdCompressSync(Buffer.from('{"type":"session"}\n'))
  const second = zstdCompressSync(Buffer.from('{"type":"assistant/message"}\n'))
  const decoded = decodeZstdFrames(Buffer.concat([first, second]))
  assert.equal(decoded.text, '{"type":"session"}\n{"type":"assistant/message"}\n')
  assert.equal(decoded.failedFrames, 0)
})

test('a torn trailing frame is skipped, committed frames survive', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cacheback-torn-'))
  const file = path.join(dir, 'session.jsonl.zstd')
  const frame = zstdCompressSync(Buffer.from('{"type":"session"}\n'))
  await writeFile(file, Buffer.concat([frame, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00])]))
  const decoded = await readSessionLog(file)
  assert.equal(decoded.text, '{"type":"session"}\n')
})

test('discoverSessionFiles picks the highest format generation', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'cacheback-home-'))
  const sessionDir = path.join(home, 'sessions', '--work-alpha--', 'session-1')
  await mkdir(sessionDir, { recursive: true })
  await writeFile(path.join(sessionDir, 'session.v3.jsonl'), '')
  await writeFile(path.join(sessionDir, 'session.v4.jsonl'), '')
  const files = await discoverSessionFiles(home)
  assert.equal(files.length, 1)
  assert.ok(files[0].endsWith('session.v4.jsonl'))
})
