import http from 'node:http'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { CoordinationClient } from './coordination.mjs'
import { PairingStore } from './pairing-store.mjs'
import { capabilities, sessionRows, projectRows, snapshotOf } from './projection.mjs'
import { ThreadReader } from './thread-reader.mjs'
import { DesktopStreams } from './desktop-stream.mjs'
import { desktopModelCatalog, validateSelection } from './model-catalog.mjs'
import { bootstrapThread } from './thread-bootstrap.mjs'
import { ConversationPublisher } from './conversation-publisher.mjs'

const require = createRequire(import.meta.url)
const { WebSocketServer } = require('../vendor/ws')
const qrcode = require('../vendor/qrcode.cjs')
const { ImageUploads } = require('./image-uploads.cjs')
const pluginVersion = JSON.parse(readFileSync(new URL('../plugin.json', import.meta.url), 'utf8')).version
const COOKIE = 'dsh_mobile_session'
function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}
const localPeer = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
function routePath(req) {
  const path = new URL(req.url, 'http://localhost').pathname
  return path.startsWith('/backends/codex/') ? path.slice('/backends/codex'.length) : path
}
async function body(req) {
  let text = ''
  const limit = routePath(req) === '/mobile/api/uploads' ? 3 * 1024 * 1024 : 256 * 1024
  for await (const part of req) { text += part; if (text.length > limit) throw new Error('request-too-large') }
  return req.headers['content-type']?.includes('application/json') ? JSON.parse(text || '{}') : new URLSearchParams(text)
}

export class MobileGateway {
  constructor({ desktop, context, stateFile, pollMs = 2000, control = new CoordinationClient(), adminSecret, onStop, bootstrap = bootstrapThread } = {}) {
    this.adminSecret = adminSecret
    this.onStop = onStop
    this.desktop = desktop
    this.context = context
    this.reader = new ThreadReader(desktop, context)
    this.pollMs = pollMs
    const file = stateFile || join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'codex-mobile', 'state.json')
    this.store = new PairingStore({ file })
    this.uploads = new ImageUploads(join(dirname(file), 'uploads'))
    this.draftFile = file + '.drafts.json'
    try { this.drafts = new Map(JSON.parse(readFileSync(this.draftFile, 'utf8'))) } catch { this.drafts = new Map() }
    this.control = control
    this.bootstrap = bootstrap
    this.streams = new DesktopStreams(control, this.uploads)
    this.writing = new Set()
    this.clients = new Map()
    this.attempts = new Map()
    this.sessionCache = []
  }
  async start({ port = 47822, exposeLan = false } = {}) {
    if (this.server) return this.status()
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid port')
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch(error => { if (!res.headersSent) json(res, 502, { error: error.message || 'desktop-action-failed' }); else res.destroy() })
    })
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 })
    server.on('upgrade', (req, socket, head) => {
      let path
      try { path = routePath(req) } catch { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return }
      if (path !== '/mobile/ws' || !this.allowedOrigin(req) || !this.auth(req)) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
        return
      }
      this.wss.handleUpgrade(req, socket, head, ws => this.attach(ws, this.deviceId(req)))
    })
    this.server = server
    this.host = exposeLan ? '0.0.0.0' : '127.0.0.1'
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, this.host, resolve) })
      this.port = server.address().port
      return this.status()
    } catch (error) { this.server = undefined; this.wss.close(); throw error }
  }
  status() {
    return { service: 'codex-mobile-plugin', version: pluginVersion, adminProtocol: 1, desktopInstance:this.desktopInstance, running: Boolean(this.server), host: this.host,
      port: this.port, baseUrl: this.server ? `http://127.0.0.1:${this.port}` : null,
      capabilities, clients: this.clients.size, relay: this.relay?.state(), publicUrl: this.publicUrl }
  }
  pairing() {
    if (!this.server) throw new Error('请先启动验证网关')
    const { code, token, expiresAt } = this.store.currentPairing()
    return { ...this.status(), code, expiresAt, pairingUrl: `${this.publicUrl || `http://127.0.0.1:${this.port}`}/pair?token=${token}` }
  }
  panel() {
    const offer = this.pairing()
    const qr = qrcode(0, 'M')
    qr.addData(offer.pairingUrl); qr.make()
    return { ...offer, devices: this.store.listDevices(), maxDevices: 8,
      qrSvg: qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }) }
  }
  deviceId(req) {
    return req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1).split('.')[0]
  }
  auth(req) {
    const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
    return this.store.verifySession(cookie)
  }
  allowedOrigin(req) {
    if (!req.headers.origin) return true
    try { return new URL(req.headers.origin).host === req.headers.host } catch { return false }
  }
  async listSessions() {
    const value = await this.desktop.call('list_threads', { limit: 50 }, this.context)
    const aliases = new Map([...this.drafts].filter(([, draft]) => draft.threadId).map(([id, draft]) => [draft.threadId, id]))
    this.sessionCache = sessionRows(value).map(row => ({ ...row, id: aliases.get(row.id) || row.id, threadId: row.id }))
    for (const [id, draft] of this.drafts) if (!this.sessionCache.some(row => row.id === id)) this.sessionCache.unshift({ id, title: draft.title, cwd: draft.cwd, projectId: draft.projectId, hostId: draft.hostId, updatedAt: draft.updatedAt, blank: !draft.threadId, running: false })
    return this.sessionCache
  }
  async snapshot(id) {
    let session = this.sessionCache.find(x => x.id === id)
    if (!session) session = (await this.listSessions()).find(x => x.id === id)
    if (!session) throw new Error('session-not-found')
    const draft = this.drafts.get(id)
    if (draft && !draft.threadId) return { type: 'snapshot', sessionId: id, title: draft.title, cwd: draft.cwd, running: false, items: [], interactions: [], live: null }
    const { value, historyNotice } = await this.reader.read(draft?.threadId || session.threadId || session.id, draft?.hostId || session.hostId)
    return this.streams.overlay(draft?.threadId||session.threadId||session.id,draft?.hostId||session.hostId,{ ...snapshotOf(value, this.uploads), sessionId: id, historyNotice })
  }
  saveDrafts() {
    mkdirSync(dirname(this.draftFile), { recursive: true })
    writeFileSync(this.draftFile + '.tmp', JSON.stringify([...this.drafts]), { mode: 0o600 })
    renameSync(this.draftFile + '.tmp', this.draftFile)
  }
  async modelSettings(id) {
    await this.desktop.start?.()
    const models=desktopModelCatalog(this.desktop.tools||new Map())
    const session=id?await this.session(id):null,draft=id?this.drafts.get(id):null
    let selected=draft&&!draft.threadId?draft.modelSelection:null
    if(!selected){try{const result=await this.control.readModelSettings(draft?.threadId||session?.threadId||session?.id||this.context.threadId,draft?.hostId||session?.hostId||'local');if(result.settings)selected={provider:'codex',model:result.settings.model,reasoningEffort:result.settings.reasoningEffort||null}}catch{}}
    return {models,selected:selected||null}
  }
  async ensureNativeOwner(threadId,hostId) {
    if(!this.control.owner)return
    try{if((await this.control.owner(threadId,hostId,{timeout:1500})).handledByClientId)return}catch{}
    await this.desktop.call('navigate_to_codex_page',{threadId},this.context)
    const deadline=Date.now()+12000
    while(Date.now()<deadline){
      try{if((await this.control.owner(threadId,hostId,{timeout:1500})).handledByClientId)return}catch{}
      await new Promise(resolve=>setTimeout(resolve,200))
    }
    throw new Error('桌面尚未完成加载，请稍后重试')
  }
  async session(id) {
    return (await this.listSessions()).find(x => x.id === id) || (() => { throw new Error('session-not-found') })()
  }
  async action(id, action, input) {
    if (this.writing.has(id)) throw new Error('任务正在提交，请稍后重试')
    this.writing.add(id)
    try {
      const session = await this.session(id)
      const draft = this.drafts.get(id)
      const threadId = draft?.threadId || session.threadId || id
      const hostId = draft?.hostId || session.hostId || 'local'
      if (action === 'prompt') {
        const submittedAt = Date.now()
        const text = typeof input.text === 'string' ? input.text.trim() : ''
        const ids = input.attachmentIds || []
        const images = this.uploads.resolve(ids)
        if (!text && !images.length) throw new Error('请输入消息或选择图片')
        const filePrompt = images.length ? [text || '请查看图片。', '', '手机上传的图片已保存在这台电脑：', ...images.map(image => `- ${image.path}`), '请先使用 view_image 查看这些图片，再回答用户的问题。'].join('\n') : text
        if (draft && !draft.threadId) {
          if (draft.submitting) throw new Error('上次新建结果未确认，请先在桌面核对任务，避免重复创建')
          if (images.length && hostId !== 'local') throw new Error('远程项目请先发送一条文字创建任务，再发送图片；已有远程任务可接收原生图片')
          draft.submitting = true; this.saveDrafts()
          let result,accepted
          if(hostId==='local'){
            let current;try{current=(await this.control.readModelSettings(this.context.threadId,'local')).settings}catch{}
            result=await this.bootstrap({cwd:draft.cwd,model:draft.modelSelection?.model||current?.model,modelProvider:current?.modelProvider})
            Object.assign(draft,{threadId:result.threadId,hostId:'local',cwd:result.cwd||draft.cwd});this.saveDrafts()
            await this.ensureNativeOwner(result.threadId,'local')
            await this.desktop.call('read_thread',{threadId:result.threadId,hostId:'local',turnLimit:1,includeOutputs:false},this.context)
            await this.desktop.call('move_thread_to_project',{threadId:result.threadId,projectId:draft.target.type==='project'?draft.target.projectId:null},this.context)
            if(draft.title!=='新任务')await this.desktop.call('set_thread_title',{threadId:result.threadId,title:draft.title},this.context)
            accepted=await this.control.sendPrompt(result.threadId,'local',text,images,{running:false,cwd:draft.cwd,...draft.modelSelection})
          }else result=await this.desktop.call('create_thread', { prompt: filePrompt, target: draft.target, ...(draft.title !== '新任务' ? { title: draft.title } : {}),...(draft.modelSelection?{model:draft.modelSelection.model,...(draft.modelSelection.reasoningEffort?{thinking:draft.modelSelection.reasoningEffort}:{})}:{}) }, this.context)
          if (!result.threadId) throw new Error('桌面未返回新任务 ID，请在桌面核对创建结果')
          Object.assign(draft, { threadId: result.threadId, hostId: result.hostId || hostId, title: draft.title === '新任务' ? (text.slice(0, 50) || '图片任务') : draft.title, submitting: false })
          this.saveDrafts()
          this.uploads.rememberMessage(draft.threadId, text, hostId==='local'?text:filePrompt, ids, submittedAt,accepted?.clientUserMessageId)
        } else {
          await this.ensureNativeOwner(threadId,hostId)
          const accepted=await this.control.sendPrompt(threadId,hostId,text,images,{running:session.running,cwd:session.cwd,...draft?.modelSelection})
          this.uploads.rememberMessage(threadId, text, text, ids, submittedAt,accepted?.clientUserMessageId)
        }
        this.uploads.markUsed(ids)
      } else if (action === 'rename') {
        const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : ''
        if (!title) throw new Error('请输入标题')
        if (!draft || draft.threadId) await this.desktop.call('set_thread_title', { threadId, title }, this.context)
        if (draft) { draft.title = title; this.saveDrafts() }
      } else if(action==='model') {
        const catalog=await this.modelSettings(id),selection=validateSelection(catalog.models,input)
        if(draft&&!draft.threadId){draft.modelSelection=selection;this.saveDrafts()}
        else{await this.ensureNativeOwner(threadId,hostId);const result=await this.control.setModelSettings(threadId,hostId,selection);if(result.applied!==true)throw new Error('模型设置尚未应用，请刷新后重试');if(draft){draft.modelSelection=selection;this.saveDrafts()}}
        return {ok:true,selected:selection}
      } else if (action === 'cancel') {
        if (draft && !draft.threadId) return { ok: true }
        const value = await this.desktop.call('read_thread', { threadId, hostId, turnLimit: 1 }, this.context)
        const turn = value.turns?.find(x => x.status === 'inProgress')
        if (turn) await this.control.interrupt(threadId, hostId, turn.id)
      } else throw new Error('unknown-action')
      return { ok: true }
    } finally { this.writing.delete(id) }
  }
  async handle(req, res) {
    const path = routePath(req)
    if (!this.allowedOrigin(req)) return json(res, 403, { error: 'origin-forbidden' })
    if (path.startsWith('/_codex-mobile/')) {
      if (!localPeer(req) || !this.adminSecret || req.headers.authorization !== `Bearer ${this.adminSecret}`) return json(res, 403, { error: 'forbidden' })
      if (path === '/_codex-mobile/desktop/check' && req.method === 'POST') {
        await this.desktop.call('list_threads',{limit:1},this.context)
        return json(res,200,{ok:true})
      }
      if (path === '/_codex-mobile/panel' && req.method === 'GET') return json(res, 200, this.panel())
      if (path === '/_codex-mobile/pairing' && req.method === 'GET') return json(res, 200, this.pairing())
      if (path === '/_codex-mobile/pairing/refresh' && req.method === 'POST') {
        this.store.rotatePairing()
        return json(res, 200, this.panel())
      }
      if (path === '/_codex-mobile/devices/revoke' && req.method === 'POST') {
        const input = await body(req)
        if (typeof input.deviceId !== 'string') return json(res, 400, { error: 'invalid-device' })
        const ids = new Set(this.store.listDevices().find(d => d.id === input.deviceId)?.recordIds || [input.deviceId])
        this.store.removeDevice(input.deviceId)
        for (const client of this.clients.values()) if (ids.has(client.deviceId)) client.ws.close(4401, 'device-revoked')
        return json(res, 200, this.panel())
      }
      if (path === '/_codex-mobile/stop' && req.method === 'POST') { const input=await body(req);json(res, 200, { running: false }); setImmediate(() => this.onStop?.({manual:input.manual!==false})); return }
      return json(res, 404, { error: 'not-found' })
    }
    if (path === '/health' && req.method === 'GET') return json(res, 200, this.status())
    if (path === '/pair' && req.method === 'POST') {
      const key = req.socket.remoteAddress
      const now = Date.now()
      let attempt = this.attempts.get(key)
      if (!attempt || attempt.expiresAt < now) { attempt = { count: 0, expiresAt: now + 60_000 }; this.attempts.set(key, attempt) }
      if (++attempt.count > 10) return json(res, 429, { error: 'too-many-attempts' })
      const input = await body(req)
      if (!this.store.matchPairing(input.get('token') || input.get('code'))) return json(res, 403, { error: 'invalid-pairing-code' })
      const device = this.store.addDevice((input.get('name') || 'Android').slice(0, 60), req.headers['user-agent'] || '', 8, { clientId: input.get('clientId'), previousId: this.auth(req)?.id })
      const expiresAt = now + 30 * 86400_000
      const prefix = req.url.startsWith('/backends/codex/') ? '/backends/codex' : ''
      res.writeHead(302, { location: prefix + '/', 'cache-control': 'no-store', 'set-cookie': `${COOKIE}=${device.id}.${expiresAt}.${this.store.signSession(device.id, expiresAt)}; Path=${prefix || '/'}; HttpOnly; SameSite=Strict; Max-Age=2592000` })
      return res.end()
    }
    if (!this.auth(req)) return json(res, 401, { error: 'pairing-required' })
    if (path === '/mobile/api/uploads' && req.method === 'POST') return json(res, 200, { attachment: this.uploads.put(await body(req)) })
    const upload = /^\/mobile\/api\/uploads\/([a-f0-9-]{36})$/.exec(path)
    if (upload && req.method === 'GET') {
      const image = this.uploads.get(upload[1])
      res.writeHead(200, { 'content-type': image.mimeType, 'content-length': image.bytes.length, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' })
      res.end(image.bytes); return
    }
    if (path === '/mobile/api/ping' && req.method === 'GET') return json(res, 200, { ok: true, service: 'codex-mobile-plugin', capabilities })
    if(path==='/mobile/api/models'&&req.method==='GET')return json(res,200,await this.modelSettings())
    const modelRoute=/^\/mobile\/api\/sessions\/([^/]+)\/model$/.exec(path)
    if(modelRoute&&req.method==='GET')return json(res,200,await this.modelSettings(decodeURIComponent(modelRoute[1])))
    if (path === '/mobile/api/sessions' && req.method === 'POST') {
      const input = await body(req)
      const projects = await this.desktop.call('list_projects', {}, this.context)
      const project = (projects.projects || []).find(p => p.projectKind !== 'chatgpt' && (p.projectId === input.workspaceId || (input.cwd && p.path === input.cwd)))
      if ((input.workspaceId || input.cwd) && !project) return json(res, 400, { error: '请选择桌面已登记的工作区' })
      const id = 'mobile-' + randomUUID()
      const draft = { title: '新任务', cwd: project?.path || '', projectId: project?.projectId || null, hostId: project?.hostId || 'local', updatedAt: Date.now(), target: project ? { type: 'project', projectId: project.projectId, environment: { type: 'local' } } : { type: 'projectless' } }
      this.drafts.set(id, draft); this.saveDrafts()
      return json(res, 200, { sessionId: id, title: draft.title, cwd: draft.cwd, projectId: draft.projectId, hostId: draft.hostId })
    }
    const action = /^\/mobile\/api\/sessions\/([^/]+)\/(prompt|cancel|rename|model)$/.exec(path)
    if (action && req.method === 'POST') return json(res, 200, await this.action(decodeURIComponent(action[1]), action[2], await body(req)))
    if (req.method !== 'GET') return json(res, 501, { error: 'Codex 审批和提问请在桌面处理', capabilities })
    if (path === '/mobile/api/sessions') return json(res, 200, { sessions: await this.listSessions() })
    if (path === '/mobile/api/workspaces') return json(res, 200, {
      workspaces: projectRows(await this.desktop.call('list_projects', {}, this.context)), defaultDirectory: '',
    })
    json(res, 404, { error: 'not-found' })
  }
  attach(ws, deviceId) {
    const client = { ws, deviceId, generation: 0, lastPong: Date.now() }
    this.clients.set(ws, client)
    const send = value => { if (ws.readyState === 1) ws.send(JSON.stringify(value)) }
    ws.on('pong', () => { client.lastPong = Date.now() })
    client.heartbeat = setInterval(() => {
      if (Date.now() - client.lastPong > 60_000) ws.terminate()
      else if (ws.readyState === 1) ws.ping()
    }, 20_000)
    client.heartbeat.unref()
    ws.on('message', data => {
      let message
      try { message = JSON.parse(String(data)) } catch { return send({ type: 'error', message: 'invalid-json' }) }
      if (message.type === 'ping') return send({ type: 'pong' })
      if (message.type === 'unsubscribe') { client.generation++; clearTimeout(client.poll); client.unwatch?.();client.publisher?.close();client.unwatch=null;client.streamKey=null; return }
      if (message.type !== 'subscribe' || typeof message.sessionId !== 'string') return
      const generation = ++client.generation
      client.unwatch?.();client.unwatch=null;client.streamKey=null
      client.publisher?.close()
      const publisher=client.publisher=new ConversationPublisher(send,{textAppend:message.supportsTextAppend===true})
      clearTimeout(client.poll)
      let previousError = ''
      const poll = async () => {
        try {
          let session=this.sessionCache.find(s=>s.id===message.sessionId)
          if(!session)session=(await this.listSessions()).find(s=>s.id===message.sessionId)
          if (client.generation !== generation || ws.readyState !== 1) return
          const draft=this.drafts.get(message.sessionId)
          const threadId=draft?.threadId||session?.threadId||(!draft?session?.id:null),hostId=draft?.hostId||session?.hostId||'local'
          if(threadId&&client.streamKey!==hostId+':'+threadId){
            client.unwatch?.();client.streamKey=hostId+':'+threadId
            client.unwatch=this.streams.watch(threadId,hostId,item=>{
              if(client.generation!==generation||ws.readyState!==1)return
              publisher.offer(item)
            })
          }
          const snapshot = await this.snapshot(message.sessionId)
          if (client.generation !== generation || ws.readyState !== 1) return
          const recovered = Boolean(previousError)
          previousError = ''
          publisher.checkpoint(snapshot,{force:recovered})
        } catch (error) {
          const reason = String(error.message || '请确认桌面仍在运行').slice(0, 240)
          if (client.generation === generation && reason !== previousError) send({ type: 'error', code: 'snapshot-read-failed', message: '暂时无法同步 Codex 会话：' + reason })
          previousError = reason
        }
        if (client.generation === generation && ws.readyState === 1) {
          client.poll = setTimeout(poll, this.pollMs)
          client.poll.unref()
        }
      }
      poll()
    })
    ws.on('close', () => { client.generation++; client.unwatch?.();client.publisher?.close(); clearTimeout(client.poll); clearInterval(client.heartbeat); this.clients.delete(ws) })
    ws.on('error', () => {})
    send({ type: 'ready', capabilities })
  }
  async close() {
    this.streams.close()
    this.control.close()
    for (const client of this.clients.values()) { client.generation++; clearTimeout(client.poll); clearInterval(client.heartbeat); client.ws.terminate() }
    this.clients.clear()
    this.wss?.close()
    const server = this.server
    this.server = undefined
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  }
}
