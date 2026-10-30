import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('MCP sidebar entry, packaged UI and private panel actions work without a chat context', async t => {
  const root = mkdtempSync(join(tmpdir(), 'codex-mobile-panel-'))
  const folder = join(root, 'codex-mobile'); mkdirSync(folder)
  const state = { service: 'codex-mobile-plugin', running: true, adminProtocol: 1, code: '123456', devices: [{ id: 'phone-test', name: '<script>test</script>' }], qrSvg: '<svg/>' }
  const requests = []
  const admin = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-admin')
    let text = ''; for await (const part of req) text += part
    requests.push({ path: req.url, method: req.method, input: text ? JSON.parse(text) : null })
    if (req.url.endsWith('/refresh')) state.code = '654321'
    if (req.url.endsWith('/revoke')) state.devices = []
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(state))
  })
  await new Promise(resolve => admin.listen(0, '127.0.0.1', resolve))
  writeFileSync(join(folder, 'runtime.json'), JSON.stringify({ port: admin.address().port, adminSecret: 'test-admin' }))
  const env = { ...process.env, CODEX_HOME: root }; delete env.CODEX_THREAD_ID; delete env.CODEX_APP_TOOLS_PIPE_PATH
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map(); let id = 0
  const lines = createInterface({ input: child.stdout })
  child.stderr.on('data', () => {})
  lines.on('line', line => { const value = JSON.parse(line); const entry = pending.get(value.id); if (!entry) return; clearTimeout(entry.timer); pending.delete(value.id); entry.resolve(value) })
  function rpc(method, params = {}) { return new Promise((resolve, reject) => { const requestId = ++id; const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('RPC timeout')) }, 5000); pending.set(requestId, { resolve, reject, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n') }) }
  t.after(async () => { lines.close(); child.stdin.end(); child.kill(); admin.closeAllConnections(); await new Promise(resolve => admin.close(resolve)); for (const entry of pending.values()) clearTimeout(entry.timer); rmSync(root, { recursive: true, force: true }) })
  const initialized = (await rpc('initialize', { protocolVersion: '2024-11-05' })).result
  assert.ok(initialized.capabilities.resources)
  const tools = (await rpc('tools/list')).result.tools
  const panel = tools.find(x => x.name === 'mobile_panel')
  assert.equal(panel.title, '手机远控')
  assert.deepEqual(panel._meta['openai/ui'].entrypoints.map(x => x.type), ['global', 'thread'])
  const uri = panel._meta.ui.resourceUri
  const resource = (await rpc('resources/read', { uri })).result.contents[0]
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app')
  assert.ok(resource.text.includes('已配对设备'))
  assert.ok(resource.text.includes('ui/initialize'))
  assert.ok(!resource.text.includes('/* PANEL_SCRIPT */'))
  assert.ok((await rpc('resources/read', { uri: 'file:///secret' })).error)
  const open = (await rpc('tools/call', { name: 'mobile_panel', arguments: {} })).result
  assert.equal(open._meta.panel.code, '123456')
  assert.equal(JSON.stringify(open.content).includes('123456'), false)
  assert.equal(JSON.stringify(open.structuredContent).includes('123456'), false)
  const refresh = (await rpc('tools/call', { name: 'pairing_refresh', arguments: {} })).result
  assert.equal(refresh._meta.panel.code, '654321')
  const revoke = (await rpc('tools/call', { name: 'device_revoke', arguments: { deviceId: 'phone-test' } })).result
  assert.equal(revoke._meta.panel.devices.length, 0)
  assert.deepEqual(requests.find(x => x.path.endsWith('/revoke')).input, { deviceId: 'phone-test' })
  assert.equal((await rpc('tools/call', { name: 'device_revoke', arguments: {} })).result.isError, true)
})
