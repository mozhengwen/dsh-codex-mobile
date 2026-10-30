import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { WebSocket, WebSocketServer } from 'ws'
import { RelayClient } from '../../dsh-mobile/lib/relay-client.js'

test('DSH and Codex routes stay isolated across HTTP, sockets and reconnects', async t => {
  const allocator = http.createServer()
  await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve))
  const port = allocator.address().port
  await new Promise(resolve => allocator.close(resolve))
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url), windowsHide: true,
    env: { ...process.env, PORT: String(port), DSH_PLUGIN_TOKEN: 'dsh-test-relay-token-for-tests-only', CODEX_PLUGIN_TOKEN: 'codex-test-relay-token-for-tests-only' }, stdio: 'ignore',
  })
  const sockets = []
  t.after(async () => { for (const ws of sockets) ws.terminate(); const exited = once(child, 'exit'); child.kill(); await exited })
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok } catch { return false } })
  const base = `http://127.0.0.1:${port}`
  async function plugin(backend) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/plugin?backend=${backend}`, { headers: { authorization: `Bearer ${backend}-test-relay-token-for-tests-only` } })
    sockets.push(ws)
    ws.on('message', bytes => {
      const message = JSON.parse(String(bytes))
      if (message.type === 'http-request') ws.send(JSON.stringify({ type: 'http-response', id: message.id, status: 200,
        headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ backend, path: message.path })).toString('base64') }))
      if (message.type === 'ws-open') ws.send(JSON.stringify({ type: 'ws-open-ok', id: message.id }))
      if (message.type === 'ws-up') ws.send(JSON.stringify({ type: 'ws-down', id: message.id, text: JSON.stringify({ type: 'pong', backend }) }))
    })
    await once(ws, 'open')
    return ws
  }
  const dsh = await plugin('dsh')
  let codex = await plugin('codex')
  const headers = { cookie: 'dsh_mobile_session=test' }
  assert.deepEqual(await fetch(base + '/mobile/api/sessions', { headers }).then(r => r.json()), { backend: 'dsh', path: '/mobile/api/sessions' })
  assert.deepEqual(await fetch(base + '/backends/codex/mobile/api/sessions', { headers }).then(r => r.json()), { backend: 'codex', path: '/mobile/api/sessions' })
  assert.equal((await fetch(base + '/backends/codex/_codex-mobile/pairing')).status, 404)
  const app = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws`, { headers })
  sockets.push(app); const read = messages(app); await once(app, 'open')
  const codexApp = new WebSocket(`ws://127.0.0.1:${port}/backends/codex/mobile/ws`, { headers })
  sockets.push(codexApp); const readCodex = messages(codexApp); await once(codexApp, 'open')
  app.send('{"type":"ping"}'); codexApp.send('{"type":"ping"}')
  assert.equal((await read('pong')).backend, 'dsh'); assert.equal((await readCodex('pong')).backend, 'codex')
  const closed = once(codexApp, 'close')
  codex = await plugin('codex'); await closed
  await delay(50)
  assert.equal(dsh.readyState, 1)
  assert.equal(app.readyState, 1)
  const health = await fetch(base + '/health',{headers:{authorization:'Bearer dsh-test-relay-token-for-tests-only'}}).then(r => r.json())
  assert.deepEqual(health.backends, { dsh: true, codex: true })
  app.send('{"type":"ping"}'); assert.equal((await read('pong')).backend, 'dsh')
})

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (await check()) return
    await delay(50)
  }
  throw new Error('condition timed out')
}
function messages(ws) {
  const queue = []
  ws.on('message', text => queue.push(JSON.parse(String(text))))
  return async type => {
    await until(() => queue.some(frame => frame.type === type))
    return queue.splice(queue.findIndex(frame => frame.type === type), 1)[0]
  }
}

test('relay restores a stream after desktop replacement and forwards expired pairing', { timeout: 20_000 }, async t => {
  const local = http.createServer((req, res) => {
    if(req.url==='/mobile/api/ping'){
      res.writeHead(req.headers.cookie==='dsh_mobile_session=valid'?200:401,{'content-type':'application/json'})
      res.end(JSON.stringify({ok:req.headers.cookie==='dsh_mobile_session=valid'}));return
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ workspaces: [{ id: 'w1', path: 'D:\\demo' }] }))
  })
  const localWss = new WebSocketServer({ noServer: true })
  local.on('upgrade', (req, socket, head) => {
    if (req.headers.cookie !== 'dsh_mobile_session=valid') {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
      return
    }
    localWss.handleUpgrade(req, socket, head, ws => {
      ws.send(JSON.stringify({ type: 'ready' }))
      ws.on('message', data => {
        const frame = JSON.parse(String(data))
        ws.send(JSON.stringify(frame.type === 'ping' ? { type: 'pong' } : { type: 'snapshot', sessionId: frame.sessionId, items: [] }))
      })
    })
  })
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve))
  const allocator = http.createServer()
  await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve))
  const port = allocator.address().port
  await new Promise(resolve => allocator.close(resolve))
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), DSH_PLUGIN_TOKEN: 'integration-test-relay-token-for-tests-only' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const relay = new RelayClient({ url: `ws://127.0.0.1:${port}/plugin`, token: 'integration-test-relay-token-for-tests-only', getPort: () => local.address().port, log() {} })
  const apps = []
  t.after(async () => {
    for (const app of apps) app.terminate()
    relay.close()
    for (const ws of localWss.clients) ws.terminate()
    localWss.close()
    local.close()
    const exited = once(child, 'exit')
    child.kill()
    await exited
  })
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${port}/health`)).ok } catch { return false } })
  relay.start()
  await until(() => relay.state().connected)
  const workspaces = await fetch(`http://127.0.0.1:${port}/mobile/api/workspaces`, { headers: { cookie: 'dsh_mobile_session=valid' } })
  assert.equal((await workspaces.json()).workspaces[0].id, 'w1')
  const open = cookie => {
    const app = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws`, { headers: { cookie } })
    apps.push(app)
    return app
  }
  const app = open('dsh_mobile_session=valid')
  const read = messages(app)
  await once(app, 'open')
  app.send(JSON.stringify({ type: 'subscribe', sessionId: 's1' }))
  assert.equal((await read('snapshot')).sessionId, 's1')
  app.send(JSON.stringify({ type: 'ping' }))
  await read('pong') // must traverse phone -> relay -> plugin -> local bridge and back
  const replaced = once(app, 'close')
  relay.restart()
  await replaced
  await until(() => relay.state().connected)
  const restored = open('dsh_mobile_session=valid')
  const restoredRead = messages(restored)
  await once(restored, 'open')
  restored.send(JSON.stringify({ type: 'subscribe', sessionId: 's1' }))
  assert.equal((await restoredRead('snapshot')).sessionId, 's1')
  const expired = open('dsh_mobile_session=expired')
  const denied=await new Promise(resolve=>{expired.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode)});expired.on('error',()=>{})})
  assert.equal(denied,401)
})

