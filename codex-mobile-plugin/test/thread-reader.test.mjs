import test from 'node:test'
import assert from 'node:assert/strict'
import { ThreadReader } from '../lib/thread-reader.mjs'

test('oversized active turns fall back to bounded summaries and reuse the successful profile', async () => {
  const calls = [], data = { thread: { id: 'active' }, turns: [] }
  const reader = new ThreadReader({ async call(name, args) {
    calls.push(args)
    if (args.includeOutputs || args.turnLimit > 3) throw new Error('Tool response exceeds the size limit. A single oversized turn cannot be returned')
    return data
  } }, {})
  const result = await reader.read('active')
  assert.equal(result.value, data)
  assert.match(result.historyNotice, /3 轮/)
  assert.equal(calls.length, 3)
  await reader.read('active')
  assert.equal(calls.length, 4)
  assert.equal(calls[3].turnLimit, 3)
})
test('desktop failures are propagated without pretending the history is empty', async () => {
  let calls = 0
  const reader = new ThreadReader({ async call() { calls++; throw new Error('桌面响应超时') } }, {})
  await assert.rejects(reader.read('active'), /桌面响应超时/)
  assert.equal(calls, 1)
})
