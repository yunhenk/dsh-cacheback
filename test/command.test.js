import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, parseCommand } from '../index.js'

test('empty input is a summary', () => {
  assert.deepEqual(parseCommand(''), {
    format: 'summary', open: false, explicitOpen: false, refresh: false, redact: false,
  })
})

test('format, window, language, and project are parsed in any order', () => {
  const parsed = parseCommand('30d project alpha receipt en open refresh')
  assert.equal(parsed.format, 'receipt')
  assert.equal(parsed.since, '30d')
  assert.equal(parsed.project, 'alpha')
  assert.equal(parsed.lang, 'en')
  assert.equal(parsed.open, true)
  assert.equal(parsed.refresh, true)
})

test('project names may contain spaces', () => {
  assert.equal(parseCommand('card project my long name').project, 'my long name')
})

test('unknown tokens are ignored instead of failing', () => {
  const parsed = parseCommand('receipt wat 7d')
  assert.equal(parsed.format, 'receipt')
  assert.equal(parsed.since, '7d')
})

test('the command declares input so "/cache card" is not sent as a message', () => {
  const tools = []
  const commands = []
  const scope = {
    get: () => ({
      register: (definition) => {
        commands.push(definition)
        return () => {}
      },
    }),
    effect: (effect) => effect(),
  }
  const ctx = {
    tools: { register: (tool) => tools.push(tool) },
    inject: (deps, callback) => {
      assert.deepEqual(deps, ['commands'])
      callback(scope)
    },
  }

  apply(ctx, {})

  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'cache_receipt')
  assert.equal(commands.length, 1)
  assert.equal(commands[0].name, 'cache')
  assert.equal(typeof commands[0].input?.hint, 'string')
  assert.ok(commands[0].input.hint.includes('card'))
})
