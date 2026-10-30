import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { MobileGateway } from '../lib/gateway.mjs'
import { sessionRows, snapshotOf } from '../lib/projection.mjs'
const { WebSocket } = createRequire(import.meta.url)('../vendor/ws')

const listing = { pinnedThreads: [{ id: 's1', title: 'Pinned', kind: 'codex', hostId: 'local', status: 'active', updatedAt: 1000 }], threads: [
  { id: 's1', kind: 'codex' }, { id: 'chatgpt-only', kind: 'chatgpt' },
] }
const history = { thread: { id: 's1', title: 'Pinned', status: { type: 'active' } }, page: { order: 'newest_first' }, turns: [
  { id: 't2', status: 'inProgress', items: [{ id: 'a2', type: 'agentMessage', text: 'new answer' }] },
  { id: 't1', items: [
    { id: 'u1', type: 'userMessage', content: [{ type: 'text', text: 'hello' }] },
    { id: 'r1', type: 'reasoning', text: 'INTERNAL MUST NOT APPEAR', summary: [] },
    { id: 'c1', type: 'commandExecution', command: 'test', exitCode: 1, status: 'completed' },
  ] },
] }

test('keeps Codex identities, excludes ChatGPT chats and deduplicates pins', () => {
  const rows = sessionRows(listing)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 's1')
  assert.equal(rows[0].updatedAt, 1_000_000)
  assert.equal(rows[0].running, true)
})

test('projects newest-first turns chronologically without exposing reasoning', () => {
  const snapshot = snapshotOf(history)
  assert.deepEqual(snapshot.items.map(x => x.id), ['t1:u1', 't1:c1', 't2:a2'])
  assert.equal(snapshot.items[1].status, 'error')
  assert.equal(snapshot.items[2].text, 'new answer')
  assert.equal(JSON.stringify(snapshot).includes('INTERNAL'), false)
})

test('keeps repeated phone messages while matching native user messages only once', () => {
  const receipts = [1, 2, 3].map(n => ({ id: 'mobile-' + n, kind: 'user', text: '继续', wireText: '继续', time: n, images: [] }))
  const uploads = { messagesFor: () => receipts, message: () => undefined, fromInput: () => undefined }
  const value = { thread: { id: 's1' }, turns: [{ id: 't1', items: [{ id: 'u1', type: 'userMessage', content: [{ type: 'text', text: '继续' }] }] }] }
  const result = snapshotOf(value, uploads)
  assert.equal(result.items.filter(x => x.kind === 'user').length, 3)
  assert.equal(snapshotOf({ thread: { id: 's1' }, turns: [] }, uploads).items.length, 3)
})

test('a transient snapshot failure keeps the socket alive and re-emits unchanged history on recovery', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-mobile-recovery-'))
  let fail = false
  const gateway = new MobileGateway({ stateFile: join(directory, 'state.json'), pollMs: 15, context: { threadId: 'caller' }, control: { close() {} }, desktop: {
    async call(name) { if (name === 'list_threads') return listing; if (name === 'read_thread') { if (fail) throw new Error('desktop temporarily busy'); return history } }
  } })
  const { baseUrl } = await gateway.start({ port: 0 })
  t.after(async () => { await gateway.close(); rmSync(directory, { recursive: true }) })
  const pair = await fetch(baseUrl + '/pair', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ code: gateway.pairing().code }) })
  const ws = new WebSocket(baseUrl.replace('http:', 'ws:') + '/mobile/ws', { headers: { cookie: pair.headers.get('set-cookie').split(';')[0] } })
  t.after(() => ws.terminate())
  const frames = []
  ws.on('message', raw => frames.push(JSON.parse(String(raw))))
  await once(ws, 'open')
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 's1' }))
  const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)) }; assert.fail('frame timeout') }
  await until(() => frames.some(f => f.type === 'snapshot'))
  fail = true
  await until(() => frames.some(f => f.type === 'error'))
  ws.send('{"type":"ping"}')
  await until(() => frames.some(f => f.type === 'pong'))
  fail = false
  await until(() => frames.filter(f => f.type === 'snapshot').length === 2)
  assert.deepEqual(frames.filter(f => f.type === 'snapshot')[0], frames.filter(f => f.type === 'snapshot')[1])
  assert.equal(frames.find(f => f.type === 'error').code, 'snapshot-read-failed')
})

test('phone protocol requires pairing, reads workspaces/snapshots and dispatches authenticated phone actions', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'codex-mobile-test-'))
  const file = join(directory, 'pairing.json')
  const calls = []; const stopped = []; const nativePrompts=[]
  const gateway = new MobileGateway({ stateFile: file, adminSecret: 'local-admin',bootstrap:async()=>({threadId:'created',cwd:'D:\\project',hostId:'local'}), control: { async interrupt(...args) { stopped.push(args) }, async sendPrompt(...args){nativePrompts.push(args)},close() {} }, context: { threadId: 'caller' }, desktop: {
    async call(name, args) {
      calls.push({ name, args })
      if (name === 'list_threads') return listing
      if (name === 'read_thread') { assert.ok(['s1', 'created'].includes(args.threadId)); return history }
      if (name === 'list_projects') return { projects: [{ projectId: 'p1', projectKind: 'local', label: 'Project', path: 'D:\\project' }] }
      if (name === 'create_thread') { assert.deepEqual(args.target, { type: 'project', projectId: 'p1', environment: { type: 'local' } }); return { threadId: 'created', hostId: 'local' } }
      if (name === 'send_message_to_thread' || name === 'set_thread_title' || name === 'move_thread_to_project') return { ok: true }
      throw new Error('unexpected method')
    },
  } })
  const { baseUrl } = await gateway.start({ port: 0 })
  t.after(async () => { await gateway.close(); rmSync(directory, { recursive: true }) })
  assert.equal((await fetch(`${baseUrl}/mobile/api/sessions`)).status, 401)
  const pair = await fetch(`${baseUrl}/pair`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ code: gateway.pairing().code, name: 'test' }) })
  assert.equal(pair.status, 302)
  const headers = { cookie: pair.headers.get('set-cookie').split(';')[0] }
  const sessions = await fetch(`${baseUrl}/mobile/api/sessions`, { headers }).then(r => r.json())
  assert.equal(sessions.sessions[0].id, 's1')
  const spaces = await fetch(`${baseUrl}/mobile/api/workspaces`, { headers }).then(r => r.json())
  assert.equal(spaces.workspaces[0].id, 'p1')
  const post = async (path, data, auth = headers) => {
    const r = await fetch(baseUrl + path, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(data) })
    return { status: r.status, data: await r.json() }
  }
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII='
  assert.equal((await post('/mobile/api/uploads', { data: png }, {})).status, 401)
  const uploaded = await post('/mobile/api/uploads', { name: 'sample.png', mimeType: 'image/png', data: png })
  assert.equal(uploaded.status, 200)
  assert.equal((await fetch(baseUrl + uploaded.data.attachment.url)).status, 401)
  const binary = await fetch(baseUrl + uploaded.data.attachment.url, { headers })
  assert.equal(binary.headers.get('content-type'), 'image/png')
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()), Buffer.from(png, 'base64'))
  assert.equal((await post('/mobile/api/sessions/s1/prompt', { text: 'must never send' }, {})).status, 401)
  const draft = await post('/mobile/api/sessions', { workspaceId: 'p1' })
  assert.equal(draft.status, 200)
  const id = draft.data.sessionId
  assert.equal(calls.some(x => x.name === 'create_thread'), false)
  assert.equal((await gateway.snapshot(id)).items.length, 0)
  assert.equal((await post('/mobile/api/sessions/' + id + '/prompt', { text: 'first human prompt' })).status, 200)
  assert.equal((await post('/mobile/api/sessions/' + id + '/prompt', { text: 'follow up' })).status, 200)
  assert.equal(calls.filter(x => x.name === 'create_thread').length, 0)
  assert.equal(nativePrompts[0][0], 'created')
  assert.equal(calls.some(x=>x.name==='send_message_to_thread'),false)
  assert.equal((await gateway.snapshot(id)).sessionId, id)
  assert.equal((await post('/mobile/api/sessions/' + id + '/rename', { title: 'renamed' })).status, 200)
  assert.equal((await post('/mobile/api/sessions/s1/cancel', {})).status, 200)
  assert.deepEqual(stopped, [['s1', 'local', 't2']])
  assert.equal((await post('/mobile/api/sessions', { workspaceId: 'missing' })).status, 400)
  assert.equal((await post('/mobile/api/interactions/missing', { outcome: 'allowed-once' })).status, 501)
  assert.equal((await fetch(`${baseUrl}/mobile/api/sessions`, { headers: { ...headers, origin: 'http://evil.invalid' } })).status, 403)
  const ws = new WebSocket(baseUrl.replace('http:', 'ws:') + '/mobile/ws', { headers })
  t.after(() => ws.terminate())
  await once(ws, 'open')
  const next = once(ws, 'message')
  ws.send(JSON.stringify({ type: 'subscribe', sessionId: 's1' }))
  const snapshot = JSON.parse(String((await next)[0]))
  assert.equal(snapshot.type, 'snapshot')
  assert.equal(snapshot.items.length, 3)
  const pong = once(ws, 'message')
  ws.send(JSON.stringify({ type: 'ping' }))
  assert.equal(JSON.parse(String((await pong)[0])).type, 'pong')
  assert.equal(nativePrompts[0][2], 'first human prompt')
  const sentImages = await post('/mobile/api/sessions/s1/prompt', { text: '请查看图片', attachmentIds: [uploaded.data.attachment.id] })
  assert.equal(sentImages.status, 200)
  assert.equal(nativePrompts.at(-1)[2],'请查看图片')
  assert.equal(nativePrompts.at(-1)[3].length,1)
  assert.equal(gateway.uploads.message('s1','请查看图片').images.length, 1)
  assert.equal((await fetch(baseUrl + '/_codex-mobile/panel', { headers })).status, 403)
  const admin = { authorization: 'Bearer local-admin', 'content-type': 'application/json' }
  const panel = await fetch(baseUrl + '/_codex-mobile/panel', { headers: admin }).then(r => r.json())
  assert.ok(panel.qrSvg.includes('<svg'))
  assert.equal(panel.devices.length, 1)
  const old = panel.code
  await fetch(baseUrl + '/_codex-mobile/pairing/refresh', { method: 'POST', headers: admin })
  assert.equal(gateway.store.matchPairing(old), false)
  assert.equal((await fetch(baseUrl + '/mobile/api/sessions', { headers })).status, 200)
  const closed = once(ws, 'close')
  await fetch(baseUrl + '/_codex-mobile/devices/revoke', { method: 'POST', headers: admin, body: JSON.stringify({ deviceId: panel.devices[0].id }) })
  assert.equal((await closed)[0], 4401)
  assert.equal((await fetch(baseUrl + '/mobile/api/sessions', { headers })).status, 401)
})
