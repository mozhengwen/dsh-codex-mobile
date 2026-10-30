/**
 * DSH Mobile central backend.
 *
 * One outbound plugin connection (the DSH desktop) and any number of phone
 * connections meet here. The backend owns TLS termination at nginx and the
 * routing; it deliberately keeps no DSH state of its own. HTTP and WebSocket
 * payloads are relayed to the plugin, whose local loopback gateway remains the
 * authority for pairing cookies and Session access.
 */
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'
import {allowedOrigin,clientIp,controlPath,hasDeviceCookie,sameSecret,secureCookie,RateLimiter} from './security.mjs'

const PORT = Number(process.env.PORT ?? 8787)
const PLUGIN_TOKEN = process.env.DSH_PLUGIN_TOKEN ?? ''
const TOKENS = { dsh: PLUGIN_TOKEN, codex: process.env.CODEX_PLUGIN_TOKEN || '' }
const MAX_BODY = 4 * 1024 * 1024
const MAX_PENDING = 64
const limits=new RateLimiter()
let activeHttp=0,openingSockets=0

if (PLUGIN_TOKEN === '') {
  console.error('DSH_PLUGIN_TOKEN is required')
  process.exit(1)
}
for (const [backend, token] of Object.entries(TOKENS)) {
  if (token && (token.length < 32 || /replace-with|change[_-]?me|[<>\s]/i.test(token))) {
    console.error(`${backend} relay token must be a private random value of at least 32 characters; replace the example configuration`)
    process.exit(1)
  }
}
if (TOKENS.codex && TOKENS.codex === TOKENS.dsh) {
  console.error('DSH and Codex must use independent relay tokens')
  process.exit(1)
}

const log = (message, error) => {
  if (error === undefined) console.log(`[dsh-mobile-server] ${message}`)
  else console.error(`[dsh-mobile-server] ${message}`, error)
}

const plugins = new Map()
const pendingHttp = new Map()
const appSockets = new Map()

const wssPlugin = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 })
const wssApp = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

// Detect broken TCP connections on both sides (sleep, network changes, NAT).
// WebSocket control pings terminate here; the App also sends an end-to-end JSON ping.
const heartbeat = setInterval(() => {
  for (const wss of [wssPlugin, wssApp]) {
    for (const ws of wss.clients) {
      if (Date.now() - (ws.lastPongAt ?? 0) > 65_000) {
        ws.terminate()
        continue
      }
      if (ws.readyState === 1) ws.ping()
    }
  }
}, 20_000)
heartbeat.unref()

function watchSocket(ws) {
  ws.lastPongAt = Date.now()
  ws.on('pong', () => { ws.lastPongAt = Date.now() })
}

function failPendingHttp(reason, backend) {
  for (const [id, pending] of pendingHttp) {
    if (backend && pending.backend !== backend) continue
    clearTimeout(pending.timer)
    pendingHttp.delete(id)
    if(pending.verify){pending.verify(503);continue}
    if (!pending.res.destroyed && !pending.res.writableEnded) writeJson(pending.res, 503, { error: reason })
  }
}

const server = http.createServer((req, res) => {
  if(activeHttp>=32){res.setHeader('connection','close');writeJson(res,503,{error:'relay-busy'});return}
  activeHttp++;let released=false
  const release=()=>{if(!released){released=true;activeHttp--}}
  res.once('finish',release);res.once('close',release)
  handleHttp(req, res).catch(error => {
    log('http request failed', {code:error.code||'request-error'})
    if (!res.headersSent) writeJson(res, 500, { error: 'backend-internal' })
    else res.destroy()
  })
})

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function route(raw) {
  const url = new URL(raw ?? '/', 'http://backend')
  let backend = 'dsh'
  if (url.pathname === '/backends/codex' || url.pathname.startsWith('/backends/codex/')) {
    backend = 'codex'; url.pathname = url.pathname.slice('/backends/codex'.length) || '/'
  }
  return { url, backend }
}
async function handleHttp(req, res) {
  let parsed;try{parsed=route(req.url);controlPath(parsed.url.pathname)}catch{return writeJson(res,400,{error:'invalid-path'})}
  const { url, backend } = parsed
  if(!allowedOrigin(req))return writeJson(res,403,{error:'origin-forbidden'})
  const ip=clientIp(req)
  if(!limits.allow('http:'+ip,600,60_000))return writeJson(res,429,{error:'too-many-requests'})
  const plugin = plugins.get(backend)
  if (url.pathname === '/health') {
    const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'')
    const operator=sameSecret(supplied,TOKENS.dsh)||sameSecret(supplied,TOKENS.codex)
    writeJson(res, 200, {
      ok: true,
      service: 'dsh-mobile-server',
      ...(operator?{plugin:plugin?.ws.readyState===1,backends:Object.fromEntries(['dsh','codex'].map(key=>[key,plugins.get(key)?.ws.readyState===1])),connections:appSockets.size}:{}),
    })
    return
  }
  if (url.pathname === '/dsh-mobile/app.apk') {
    writeJson(res,404,{error:'not-found'})
    return
  }
  // The plugin's control API (pairing rotation, device revocation) is for the
  // local DSH page only. It must never be reachable through the public relay.
  if (controlPath(url.pathname)) {
    writeJson(res, 404, { error: 'not-found' })
    return
  }
  if (url.pathname.startsWith('/mobile/api/') && !hasDeviceCookie(req)) {
    writeJson(res, 401, { error: 'pairing-required' })
    return
  }
  if (url.pathname === '/mobile/ws') {
    writeJson(res, 426, { error: 'websocket-upgrade-required' })
    return
  }
  if (plugin === undefined || plugin.ws.readyState !== 1) {
    writeJson(res, 503, { error: 'desktop-offline', message: 'The DSH desktop plugin is not connected.' })
    return
  }
  if(url.pathname==='/pair'&&req.method==='POST'&&!limits.allow('pair:'+ip,10,60_000))return writeJson(res,429,{error:'too-many-pairing-attempts'})
  if(Number(req.headers['content-length']||0)>MAX_BODY)return writeJson(res,413,{error:'body-too-large'})
  if(pendingHttp.size>=MAX_PENDING)return writeJson(res,503,{error:'relay-busy'})
  const body = await readBody(req)
  const id = randomUUID()
  const headers = {
    cookie: req.headers.cookie ?? '',
    accept: req.headers.accept ?? '*/*',
    'content-type': req.headers['content-type'] ?? 'application/octet-stream',
    'user-agent': req.headers['user-agent'] ?? 'DSH-Mobile-App',
  }
  const timer = setTimeout(() => {
    const pending = pendingHttp.get(id)
    if (pending === undefined) return
    pendingHttp.delete(id)
    writeJson(res, 504, { error: 'desktop-timeout' })
  }, 120_000)
  timer.unref?.()
  pendingHttp.set(id, { res, timer, backend })
  res.once('close',()=>{const pending=pendingHttp.get(id);if(pending?.res===res){clearTimeout(pending.timer);pendingHttp.delete(id)}})
  plugin.ws.send(JSON.stringify({
    type: 'http-request',
    id,
    method: req.method ?? 'GET',
    path: `${url.pathname}${url.search}`,
    headers,
    body: body.toString('base64'),
  }))
}

function rejectUpgrade(socket, status, reason) {
  if(socket.destroyed)return
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

function verifyCookie(plugin,backend,cookie){return new Promise(resolve=>{
 if(pendingHttp.size>=MAX_PENDING)return resolve(503)
 const id=randomUUID(),timer=setTimeout(()=>{pendingHttp.delete(id);resolve(503)},6000);timer.unref()
 pendingHttp.set(id,{backend,timer,verify:resolve})
 try{plugin.ws.send(JSON.stringify({type:'http-request',id,method:'GET',path:'/mobile/api/ping',headers:{cookie,accept:'application/json'},body:''}))}catch{clearTimeout(timer);pendingHttp.delete(id);resolve(503)}
})}

server.on('upgrade',(req,socket,head)=>{socket.on('error',()=>{});handleUpgrade(req,socket,head).catch(()=>rejectUpgrade(socket,400,'Bad Request'))})
async function handleUpgrade(req, socket, head) {
  let parsed;try{parsed=route(req.url)}catch{return rejectUpgrade(socket,400,'Bad Request')}
  if(!allowedOrigin(req))return rejectUpgrade(socket,403,'Forbidden')
  const { url, backend: routedBackend } = parsed
  const backend = url.pathname === '/plugin' ? url.searchParams.get('backend') || routedBackend : routedBackend
  const plugin = plugins.get(backend)
  if (url.pathname === '/plugin') {
    const auth = req.headers.authorization ?? ''
    const supplied = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!sameSecret(supplied,TOKENS[backend])) {
      rejectUpgrade(socket, 401, 'Unauthorized')
      return
    }
    wssPlugin.handleUpgrade(req, socket, head, ws => {
      attachPlugin(ws, backend)
    })
    return
  }
  if (url.pathname === '/mobile/ws') {
    if (!hasDeviceCookie(req)) {
      rejectUpgrade(socket, 401, 'Unauthorized')
      return
    }
    if (plugin === undefined || plugin.ws.readyState !== 1) {
      rejectUpgrade(socket, 503, 'Service Unavailable')
      return
    }
    if(openingSockets>=32||appSockets.size>=64||!limits.allow('ws:'+clientIp(req),30,60_000))return rejectUpgrade(socket,429,'Too Many Requests')
    openingSockets++;socket.pause()
    let status;try{status=await verifyCookie(plugin,backend,req.headers.cookie)}finally{openingSockets--}
    if(socket.destroyed)return
    if(status!==200)return rejectUpgrade(socket,status===401||status===403?401:503,status===401||status===403?'Unauthorized':'Service Unavailable')
    if(plugins.get(backend)!==plugin||plugin.ws.readyState!==1)return rejectUpgrade(socket,503,'Service Unavailable')
    socket.resume()
    wssApp.handleUpgrade(req, socket, head, ws => {
      attachApp(ws, req, backend)
    })
    return
  }
  rejectUpgrade(socket, 404, 'Not Found')
}

function attachPlugin(ws, backend) {
  watchSocket(ws)
  const previous = plugins.get(backend)
  if (previous !== undefined) {
    try { previous.ws.close(1001, 'replaced') } catch { /* noop */ }
  }
  const plugin = { ws, connectedAt: Date.now(), info: {} }
  plugins.set(backend, plugin)
  if (previous !== undefined) {
    failAppSockets('desktop-reconnected', backend)
    failPendingHttp('desktop-reconnected', backend)
    previous.ws.terminate()
  }
  log('plugin connected')
  ws.on('message', data => {
    if (plugins.get(backend)?.ws !== ws) return
    let message
    try { message = JSON.parse(String(data)) } catch { return }
    if (message === null || typeof message !== 'object') return
    if (message.type === 'register') {
      plugin.info = { name: message.name, version: message.version }
      return
    }
    if (message.type === 'http-response') {
      const pending = pendingHttp.get(message.id)
      if (pending === undefined || pending.backend !== backend) return
      pendingHttp.delete(message.id)
      clearTimeout(pending.timer)
      if(pending.verify){pending.verify(message.status===200?200:message.status===401||message.status===403?401:503);return}
      const body = message.body ? Buffer.from(String(message.body), 'base64') : Buffer.alloc(0)
      const headers = {}
      for (const [name, value] of Object.entries(message.headers ?? {})) {
        const lower = name.toLowerCase()
        if (lower === 'connection' || lower === 'transfer-encoding' || lower === 'keep-alive') continue
        if(lower==='set-cookie')headers[name]=Array.isArray(value)?value.map(v=>secureCookie(v,backend)):secureCookie(value,backend)
        else if(lower==='location'&&backend==='codex'&&typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//'))headers[name]='/backends/codex'+value
        else headers[name] = value
      }
      headers['content-length'] = body.length
      pending.res.writeHead(message.status ?? 502, headers)
      pending.res.end(body)
      return
    }
    if (message.type === 'ws-open-ok') {
      const app = appSockets.get(message.id)
      if (app === undefined || app.backend !== backend) return
      app.ready = true
      clearTimeout(app.openTimer)
      for (const text of app.queue.splice(0)) {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ws-up', id: message.id, text }))
      }
      app.queueBytes=0
      return
    }
    if (message.type === 'ws-down') {
      const app = appSockets.get(message.id)
      if (app !== undefined && app.backend === backend && app.ws.readyState === 1) app.ws.send(String(message.text ?? ''))
      return
    }
    if (message.type === 'ws-close') {
      const app = appSockets.get(message.id)
      if (app === undefined || app.backend !== backend) return
      appSockets.delete(message.id)
      clearTimeout(app.openTimer)
      try { app.ws.close(message.code === 4401 ? 4401 : 1013, message.reason ?? 'plugin-closed') } catch { /* noop */ }
    }
  })
  ws.on('close', () => {
    if (plugins.get(backend)?.ws !== ws) return
    plugins.delete(backend)
    log('plugin disconnected')
    failPendingHttp('desktop-offline', backend)
    failAppSockets('desktop-offline', backend)
  })
  ws.on('error', error => log('plugin websocket error', error))
}

function attachApp(ws, req, backend) {
  const plugin = plugins.get(backend)
  watchSocket(ws)
  const id = randomUUID()
  const app = { id, ws, ready: false, queue: [], queueBytes:0, backend }
  app.openTimer = setTimeout(() => {
    if (!app.ready) ws.close(1013, 'desktop-stream-timeout')
  }, 15_000)
  app.openTimer.unref()
  appSockets.set(id, app)
  plugin.ws.send(JSON.stringify({
    type: 'ws-open',
    id,
    path: '/mobile/ws',
    headers: { cookie: req.headers.cookie ?? '' },
  }))
  ws.on('message', data => {
    if (plugin === undefined || plugin.ws.readyState !== 1) {
      ws.close(1011, 'desktop-offline')
      return
    }
    const text = String(data)
    if(!limits.allow('frame:'+id,120,1000)){ws.close(1008,'message-rate-limit');return}
    if (!app.ready) {
      app.queueBytes+=Buffer.byteLength(text)
      app.queue.push(text)
      if (app.queue.length > 32||app.queueBytes>128*1024) ws.close(1009, 'queue-overflow')
      return
    }
    plugin.ws.send(JSON.stringify({ type: 'ws-up', id, text }))
  })
  ws.on('close', () => {
    clearTimeout(app.openTimer)
    appSockets.delete(id)
    if (plugin !== undefined && plugin.ws.readyState === 1) {
      plugin.ws.send(JSON.stringify({ type: 'ws-close', id }))
    }
  })
  ws.on('error', error => log('app websocket error', error))
}

function failAppSockets(reason, backend) {
  for (const [id, app] of appSockets) {
    if (backend && app.backend !== backend) continue
    clearTimeout(app.openTimer)
    appSockets.delete(id)
    try { app.ws.close(1011, reason) } catch { /* noop */ }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  log(`listening on 127.0.0.1:${PORT}`)
})

function shutdown() {
  clearInterval(heartbeat)
  log('shutting down')
  for (const [id, pending] of pendingHttp) {
    clearTimeout(pending.timer)
    pendingHttp.delete(id)
    if(pending.verify){pending.verify(503);continue}
    writeJson(pending.res, 503, { error: 'backend-shutdown' })
  }
  failAppSockets('backend-shutdown')
  for (const plugin of plugins.values()) plugin.ws.close(1001, 'backend-shutdown')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref?.()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
