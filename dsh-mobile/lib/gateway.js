/**
 * The paired LAN gateway for DSH Mobile.
 *
 * It owns three things:
 *  1. a small HTTP server on the LAN that authenticates a phone by a signed
 *     device cookie learned through a short-lived pairing code;
 *  2. a transparent reverse proxy (HTTP + WebSocket) to the already-running
 *     local DSH web server, reusing that server's launch-token browser cookie;
 *  3. the PWA shell files (manifest, mobile CSS/JS, service worker, icons)
 *     that turn the proxied DSH UI into an installable phone app.
 *
 * The local DSH web server stays loopback-only and unchanged. No DSH source
 * patch and no separate DSH process is involved.
 */
import http from 'node:http'
import https from 'node:https'
import { networkInterfaces } from 'node:os'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { etagOf, guessDeviceName, injectMobileShell, MANIFEST, MOBILE_CSS, MOBILE_JS, OFFLINE_HTML, renderPairingPage, SERVICE_WORKER_JS } from './pages.js'
import { qrSvg } from './qr.js'
const { ImageUploads } = createRequire(import.meta.url)('./image-uploads.cjs')

const COOKIE = 'dsh_mobile_session'
const MAX_BODY = 32 * 1024
const HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
])

function publicFile(name) {
  return fileURLToPath(new URL(`../public/${name}`, import.meta.url))
}

function readBinary(name) {
  return readFileSync(publicFile(name))
}

function isLoopback(hostname) {
  const clean = hostname.replace(/^\[|\]$/g, '')
  return clean === 'localhost' || clean === '::1' || /^127\./.test(clean) || /^::ffff:127\./i.test(clean)
}

function privateRank(address) {
  if (/^192\.168\./.test(address)) return 0
  if (/^10\./.test(address)) return 1
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) return 3
  return 4
}

/** All usable IPv4 LAN addresses, most likely first. */
export function lanAddresses() {
  const found = []
  for (const [name, rows] of Object.entries(networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.family !== 'IPv4' || row.internal) continue
      found.push({ name, address: row.address })
    }
  }
  found.sort((a, b) => privateRank(a.address) - privateRank(b.address) || a.name.localeCompare(b.name))
  return found.map(entry => entry.address)
}

function parseCookies(header) {
  const map = new Map()
  if (typeof header !== 'string') return map
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index <= 0) continue
    map.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return map
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
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

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readJsonBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') return resolve({})
      try { resolve(JSON.parse(text)) } catch { reject(new Error('invalid-json')) }
    })
    req.on('error', reject)
  })
}

function writeHtml(res, status, html, extra = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(html),
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    ...extra,
  })
  res.end(html)
}

function redirect(res, location, extra = {}) {
  res.writeHead(302, { location, 'cache-control': 'no-store', ...extra })
  res.end()
}

function rawStatus(socket, status, reason, headers = {}) {
  const lines = [`HTTP/1.1 ${status} ${reason}`]
  for (const [key, value] of Object.entries(headers)) lines.push(`${key}: ${value}`)
  lines.push('Connection: close', '', '')
  socket.write(lines.join('\r\n'))
  socket.destroy()
}

function requestOptions(origin, path, method, headers) {
  const target = new URL(origin)
  const secure = target.protocol === 'https:'
  return {
    transport: secure ? https : http,
    options: {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port === '' ? (secure ? 443 : 80) : Number(target.port),
      method,
      path,
      headers,
      agent: false,
      rejectUnauthorized: false,
    },
  }
}

export class MobileGateway {
  /**
   * @param {{
   *   ctx: import('@deepseek-ai/cordis').Context,
   *   store: import('./store.js').PairingStore,
   *   config?: Record<string, unknown>,
   *   log?: (message: string, error?: unknown) => void,
   * }} options
   */
  constructor(options) {
    this.ctx = options.ctx
    this.store = options.store
    this.uploads = new ImageUploads(options.uploadDirectory || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'dsh-mobile', 'uploads'))
    this.bridge = options.bridge
    this.config = options.config ?? {}
    this.log = options.log ?? ((message, error) => {
      if (error === undefined) console.warn(`[dsh-mobile] ${message}`)
      else console.warn(`[dsh-mobile] ${message}`, error)
    })
    this.server = undefined
    this.sockets = new Set()
    this.startedAt = undefined
    this.error = undefined
    this.bindHost = '0.0.0.0'
    this.port = 0
    this.upstreamCookie = undefined
    this.cookiePromise = undefined
    this.assets = new Map()
    this.pairAttempts = new Map()
    this.#prepareAssets()
  }

  get sessionDays() {
    const value = Number(this.config.sessionDays)
    return Number.isFinite(value) && value >= 1 && value <= 365 ? Math.floor(value) : 30
  }

  get deviceLimit() {
    const value = Number(this.config.deviceLimit)
    return Number.isFinite(value) && value >= 1 && value <= 32 ? Math.floor(value) : 8
  }

  get upstreamOrigin() {
    return this.ctx.webServer.getOrigin().replace(/\/+$/, '')
  }

  #prepareAssets() {
    const entries = [
      ['/dsh-mobile/mobile.css', 'text/css; charset=utf-8', Buffer.from(MOBILE_CSS)],
      ['/dsh-mobile/mobile.js', 'text/javascript; charset=utf-8', Buffer.from(MOBILE_JS)],
      ['/dsh-mobile/sw.js', 'text/javascript; charset=utf-8', Buffer.from(SERVICE_WORKER_JS)],
      ['/dsh-mobile/offline.html', 'text/html; charset=utf-8', Buffer.from(OFFLINE_HTML)],
      ['/dsh-mobile/manifest.webmanifest', 'application/manifest+json; charset=utf-8', Buffer.from(MANIFEST)],
      ['/dsh-mobile/icon.svg', 'image/svg+xml', readBinary('icon.svg')],
      ['/dsh-mobile/icon-180.png', 'image/png', readBinary('icon-180.png')],
      ['/dsh-mobile/icon-192.png', 'image/png', readBinary('icon-192.png')],
      ['/dsh-mobile/icon-512.png', 'image/png', readBinary('icon-512.png')],
      ['/dsh-mobile/icon-maskable-512.png', 'image/png', readBinary('icon-maskable-512.png')],
    ]
    for (const [path, type, body] of entries) {
      this.assets.set(path, { type, body, etag: etagOf(body) })
    }
  }

  /** @param {Record<string, unknown>} [config] */
  async start(config = this.config) {
    this.config = config
    this.error = undefined
    const desiredHost = typeof config.bindHost === 'string' && config.bindHost.trim() !== ''
      ? config.bindHost.trim()
      : '127.0.0.1'
    const desiredPort = Number(config.port)
    const port = Number.isSafeInteger(desiredPort) && desiredPort >= 0 && desiredPort <= 65535 ? desiredPort : 47821
    this.bindHost = desiredHost
    this.port = port
    const server = http.createServer((req, res) => {
      this.#handleRequest(req, res).catch(error => {
        this.log('request failed', error)
        if (!res.headersSent) writeJson(res, 500, { error: 'gateway-internal' })
        else res.destroy()
      })
    })
    server.on('upgrade', (req, socket, head) => {
      this.#handleUpgrade(req, socket, head).catch(error => {
        this.log('upgrade failed', error)
        socket.destroy()
      })
    })
    server.on('clientError', (error, socket) => {
      if (!socket.destroyed) rawStatus(socket, 400, 'Bad Request')
      this.log('client error', error)
    })
    server.on('connection', socket => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })
    this.server = server
    await new Promise((resolve, reject) => {
      const onError = error => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, desiredHost)
    }).catch(error => {
      this.error = error instanceof Error ? error.message : String(error)
      this.server = undefined
      try { server.close() } catch { /* already failed */ }
      throw error
    })
    const address = server.address()
    this.port = typeof address === 'object' && address !== null ? address.port : port
    this.startedAt = Date.now()
    server.on('error', error => {
      this.error = error instanceof Error ? error.message : String(error)
      this.log('server error', error)
    })
    this.log(`listening on ${this.bindHost}:${this.port}; DSH at ${this.upstreamOrigin}`)
    // Warm the proxy credential, but do not make startup depend on it: the
    // local DSH page can still be booting while this plugin activates.
    this.#ensureUpstreamCookie().catch(error => this.log('could not pre-authenticate the local DSH page', error))
  }

  async close() {
    const server = this.server
    this.server = undefined
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()
    if (server !== undefined) {
      await new Promise(resolve => {
        server.close(() => resolve())
        setTimeout(resolve, 1000).unref?.()
      })
    }
    this.error = 'gateway stopped'
  }

  get running() {
    return this.server !== undefined
  }

  /** All browser-facing base URLs, primary first. */
  get baseUrls() {
    const configured = typeof this.config.publicUrl === 'string' ? this.config.publicUrl.trim() : ''
    const urls = []
    if (configured !== '') {
      try {
        const parsed = new URL(configured)
        if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.username === '' && parsed.password === '') {
          urls.push(parsed.href.replace(/\/+$/, ''))
        }
      } catch {
        // Ignore an invalid publicUrl; the status panel reports the LAN URL.
      }
    }
    const addresses = lanAddresses()
    for (const address of addresses) urls.push(`http://${address}:${this.port}`)
    if (urls.length === 0) urls.push(`http://127.0.0.1:${this.port}`)
    return [...new Set(urls)]
  }

  get primaryUrl() {
    return this.baseUrls[0]
  }

  status() {
    const pairing = this.store.currentPairing()
    const base = this.primaryUrl
    const url = `${base}/pair?token=${encodeURIComponent(pairing.token)}`
    const apkFile = publicFile('dsh-mobile.apk')
    const apkAvailable = existsSync(apkFile)
    const apkUrl = `${base}/dsh-mobile/app.apk`
    const warnings = []
    if (!this.running) warnings.push(this.error ?? '网关未启动')
    if (this.running && this.bindHost === '0.0.0.0') warnings.push('网关监听所有网卡，请仅在可信局域网内使用')
    if (this.running && lanAddresses().length === 0) warnings.push('未检测到局域网 IPv4 地址，手机可能无法访问')
    if (this.running && base.startsWith('http://')) warnings.push('当前为 HTTP 局域网连接；请勿在公共 Wi-Fi 使用')
    return {
      running: this.running,
      error: this.error,
      startedAt: this.startedAt,
      bindHost: this.bindHost,
      port: this.port,
      upstreamOrigin: this.running ? this.upstreamOrigin : undefined,
      urls: this.baseUrls,
      primaryUrl: base,
      apkAvailable,
      apkUrl: apkAvailable ? apkUrl : undefined,
      apkQrSvg: apkAvailable ? qrSvg(apkUrl, { size: 180 }) : undefined,
      pairing: {
        code: pairing.code,
        url,
        expiresAt: pairing.expiresAt,
        qrSvg: qrSvg(url, { size: 220 }),
      },
      devices: this.store.listDevices(),
      deviceLimit: this.deviceLimit,
      sessionDays: this.sessionDays,
      stateFile: this.store.stateFile,
      warnings,
      secureContext: base.startsWith('https://'),
      relay: this.relay?.state(),
    }
  }

  /** Rotate the pairing code shown by the desktop control panel. */
  rotatePairing() {
    this.store.rotatePairing()
    return this.status()
  }

  /** Revoke one paired phone. */
  revokeDevice(id) {
    if (typeof id !== 'string' || id === '') return false
    return this.store.removeDevice(id)
  }

  #authorize(req) {
    const cookies = parseCookies(req.headers.cookie)
    const session = this.store.verifySession(cookies.get(COOKIE))
    if (session === undefined) return undefined
    this.store.touchDevice(session.id)
    return session
  }

  #pairPage(req, res, error, token = '') {
    const query = new URL(req.url ?? '/', 'http://gateway').searchParams
    const fromQuery = query.get('token') ?? ''
    writeHtml(res, error === undefined ? 200 : 400, renderPairingPageSafe({
      token: token !== '' ? token : fromQuery,
      deviceName: guessDeviceName(req.headers['user-agent']),
      error,
    }))
  }

  async #handlePair(req, res) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (this.#authorize(req) !== undefined) {
        redirect(res, '/')
        return
      }
      this.#pairPage(req, res)
      return
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    const remote = req.socket.remoteAddress ?? 'unknown'
    const attempt = this.#pairAttempts(remote)
    if (!attempt.allowed) {
      this.#pairPage(req, res, '尝试次数过多，请稍后再试。')
      return
    }
    let fields
    try {
      const body = await readBody(req)
      fields = new URLSearchParams(body.toString('utf8'))
    } catch (error) {
      this.#pairPage(req, res, error instanceof Error && error.message === 'body-too-large' ? '请求过大。' : '无法读取配对请求。')
      return
    }
    const token = fields.get('token') ?? ''
    const code = fields.get('code') ?? ''
    const candidate = token !== '' ? token : code
    if (!this.store.matchPairing(candidate)) {
      attempt.count++
      this.#pairPage(req, res, '配对码无效或已过期，请在电脑上刷新配对码。', token)
      return
    }
    const rawName = (fields.get('name') ?? '').trim()
    const name = (rawName === '' ? guessDeviceName(req.headers['user-agent']) : rawName).slice(0, 60)
    const device = this.store.addDevice(name, String(req.headers['user-agent'] ?? ''), this.deviceLimit, { clientId: fields.get('clientId'), previousId: this.#authorize(req)?.id })
    const maxAge = this.sessionDays * 24 * 60 * 60
    const expiresAt = Date.now() + maxAge * 1000
    const signature = this.store.signSession(device.id, expiresAt)
    const cookie = `${COOKIE}=${encodeURIComponent(`${device.id}.${expiresAt}.${signature}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
    this.log(`paired ${name} (${device.id.slice(0, 6)}) from ${remote}`)
    res.writeHead(302, {
      location: '/',
      'cache-control': 'no-store',
      'set-cookie': cookie,
      'referrer-policy': 'no-referrer',
    })
    res.end()
  }

  #pairAttempts(remote) {
    const now = Date.now()
    const current = this.pairAttempts.get(remote)
    if (current === undefined || current.resetAt <= now) {
      const fresh = { count: 0, resetAt: now + 10 * 60 * 1000, allowed: true }
      this.pairAttempts.set(remote, fresh)
      return fresh
    }
    current.allowed = current.count < 12
    return current
  }

  async #handleRequest(req, res) {
    const url = new URL(req.url ?? '/', 'http://gateway')
    const path = url.pathname

    if (path === '/health') {
      writeJson(res, 200, { ok: this.running, service: 'dsh-mobile', dsh: this.running ? this.upstreamOrigin : undefined })
      return
    }
    if (path === '/pair') {
      await this.#handlePair(req, res)
      return
    }
    if (this.assets.has(path)) {
      this.#sendAsset(req, res, path)
      return
    }
    if (path === '/dsh-mobile/app.apk') {
      this.#sendApk(req, res)
      return
    }
    if (path === '/favicon.ico') {
      // A phone home-screen icon is provided by the manifest; fall back to the
      // DSH favicon via the proxy if the browser asks anyway.
      const session = this.#authorize(req)
      if (session === undefined) {
        res.writeHead(204, { 'cache-control': 'public, max-age=86400' })
        res.end()
        return
      }
    }

    const session = this.#authorize(req)
    if (session === undefined) {
      if ((req.method === 'GET' || req.method === 'HEAD') && (path === '/' || path === '/index.html')) {
        redirect(res, '/pair')
        return
      }
      writeJson(res, 401, {
        error: 'pairing-required',
        message: 'Open the pairing link shown in DSH on the computer.',
        pair: '/pair',
      })
      return
    }

    if (path.startsWith('/mobile/api/')) {
      await this.#handleMobileApi(req, res, url, session)
      return
    }

    await this.#proxyHttp(req, res, path, true)
  }

  async #handleMobileApi(req, res, url, session) {
    const method = req.method ?? 'GET'
    const path = url.pathname
    try {
      if (path === '/mobile/api/uploads' && method === 'POST') {
        const input = await readJsonBody(req, 3 * 1024 * 1024)
        writeJson(res, 200, { attachment: this.uploads.put(input) })
        return
      }
      const upload = /^\/mobile\/api\/uploads\/([a-f0-9-]{36})$/.exec(path)
      const nativeImage = /^\/mobile\/api\/sessions\/([^/]+)\/images\/([^/]+)$/.exec(path)
      if ((upload || nativeImage) && method === 'GET') {
        const image = upload ? this.uploads.get(upload[1]) : await this.bridge.image(decodeURIComponent(nativeImage[1]), decodeURIComponent(nativeImage[2]))
        res.writeHead(200, { 'content-type': image.mimeType, 'content-length': image.bytes.length, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' })
        res.end(image.bytes); return
      }
      if (path === '/mobile/api/ping' && method === 'GET') {
        writeJson(res, 200, { ok: true, service: 'dsh-mobile', deviceId: session.id })
        return
      }
      if (path === '/mobile/api/sessions' && method === 'GET') {
        writeJson(res, 200, { sessions: await this.bridge.listSessions() })
        return
      }
      if (path === '/mobile/api/workspaces' && method === 'GET') {
        writeJson(res, 200, await this.bridge.listWorkspaces())
        return
      }
      if (path === '/mobile/api/sessions' && method === 'POST') {
        const body = await readJsonBody(req)
        writeJson(res, 200, await this.bridge.createSession(body))
        return
      }
      if (path === '/mobile/api/models' && method === 'GET') {
        writeJson(res, 200, await this.bridge.modelSettings())
        return
      }
      const modelRoute=/^\/mobile\/api\/sessions\/([^/]+)\/model$/.exec(path)
      if(modelRoute&&method==='GET'){writeJson(res,200,await this.bridge.modelSettings(decodeURIComponent(modelRoute[1])));return}
      if(modelRoute&&method==='POST'){writeJson(res,200,await this.bridge.selectModel(decodeURIComponent(modelRoute[1]),await readJsonBody(req)));return}
      const prompt = /^\/mobile\/api\/sessions\/([^/]+)\/prompt$/.exec(path)
      if (prompt !== null && method === 'POST') {
        const body = await readJsonBody(req)
        if (typeof body?.text !== 'string') throw new Error('text required')
        const ids = body.attachmentIds || []
        const images = this.uploads.resolve(ids)
        writeJson(res, 200, await this.bridge.prompt(decodeURIComponent(prompt[1]), body.text, body.requestId, images))
        this.uploads.markUsed(ids)
        return
      }
      const cancel = /^\/mobile\/api\/sessions\/([^/]+)\/cancel$/.exec(path)
      if (cancel !== null && method === 'POST') {
        writeJson(res, 200, await this.bridge.cancel(decodeURIComponent(cancel[1])))
        return
      }
      const rename = /^\/mobile\/api\/sessions\/([^/]+)\/rename$/.exec(path)
      if (rename !== null && method === 'POST') {
        const body = await readJsonBody(req)
        writeJson(res, 200, await this.bridge.rename(decodeURIComponent(rename[1]), body?.title))
        return
      }
      const archive = /^\/mobile\/api\/sessions\/([^/]+)$/.exec(path)
      if (archive !== null && method === 'DELETE') {
        writeJson(res, 200, await this.bridge.archiveSession(decodeURIComponent(archive[1])))
        return
      }
      const answer = /^\/mobile\/api\/interactions\/([^/]+)$/.exec(path)
      if (answer !== null && method === 'POST') {
        const body = await readJsonBody(req)
        const accepted = this.bridge.answerInteraction(decodeURIComponent(answer[1]), body)
        writeJson(res, accepted ? 200 : 404, accepted ? { accepted: true } : { error: 'interaction-not-found' })
        return
      }
      writeJson(res, 404, { error: 'not-found' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log('mobile API failed', error)
      writeJson(res, message === 'invalid-json' || message === 'body-too-large' ? 400 : 500, { error: message })
    }
  }

  #sendApk(req, res) {
    const file = publicFile('dsh-mobile.apk')
    if (!existsSync(file)) {
      writeJson(res, 404, { error: 'apk-not-built' })
      return
    }
    const stat = statSync(file)
    const headers = {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': stat.size,
      'content-disposition': 'attachment; filename="DSH-Mobile-0.3.0.apk"',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    }
    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(file).pipe(res)
  }

  #sendAsset(req, res, path) {
    const asset = this.assets.get(path)
    if (asset === undefined) {
      writeJson(res, 404, { error: 'not-found' })
      return
    }
    if (req.headers['if-none-match'] === asset.etag) {
      res.writeHead(304, { etag: asset.etag, 'cache-control': 'no-cache' })
      res.end()
      return
    }
    const headers = {
      'content-type': asset.type,
      'content-length': asset.body.length,
      etag: asset.etag,
      'cache-control': path.endsWith('/sw.js') ? 'no-cache' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    }
    if (path.endsWith('/sw.js')) headers['service-worker-allowed'] = '/'
    if (path.endsWith('/offline.html')) headers['cache-control'] = 'public, max-age=86400'
    res.writeHead(200, headers)
    if (req.method === 'HEAD') res.end()
    else res.end(asset.body)
  }

  async #ensureUpstreamCookie() {
    if (this.upstreamCookie !== undefined) return this.upstreamCookie
    if (this.cookiePromise !== undefined) return this.cookiePromise
    this.cookiePromise = this.#acquireUpstreamCookie().finally(() => {
      this.cookiePromise = undefined
    })
    return this.cookiePromise
  }

  async #acquireUpstreamCookie() {
    const origin = new URL(this.upstreamOrigin)
    let authenticated
    try {
      authenticated = this.ctx.connection.authenticatedUrl(`${origin.href.replace(/\/+$/, '')}/`)
    } catch (error) {
      throw new Error(`DSH browser authentication is unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const target = new URL(authenticated)
    if (target.host !== origin.host) {
      throw new Error('DSH authenticated URL does not match the local web server origin')
    }
    const { transport, options } = requestOptions(this.upstreamOrigin, `${target.pathname}${target.search}`, 'GET', {
      host: origin.host,
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'DSH-Mobile-Gateway/0.1',
      connection: 'close',
    })
    const response = await new Promise((resolve, reject) => {
      const request = transport.request(options, resolve)
      request.setTimeout(8000, () => request.destroy(new Error('DSH authentication timed out')))
      request.on('error', reject)
      request.end()
    })
    const status = response.statusCode ?? 0
    const setCookies = response.headers['set-cookie']
    response.resume()
    if (setCookies === undefined || setCookies.length === 0) {
      throw new Error(`DSH did not issue a browser cookie (HTTP ${status})`)
    }
    const cookie = setCookies[0].split(';')[0]
    if (cookie === '') throw new Error('DSH issued an empty browser cookie')
    this.upstreamCookie = cookie
    this.log(`authenticated to local DSH at ${origin.host}`)
    return cookie
  }

  #upstreamHeaders(req, cookie) {
    const origin = new URL(this.upstreamOrigin)
    const headers = {}
    const pass = [
      'accept', 'accept-language', 'cache-control', 'content-type', 'content-length',
      'if-match', 'if-none-match', 'if-modified-since', 'if-unmodified-since', 'range',
      'user-agent', 'pragma', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
    ]
    for (const name of pass) {
      const value = req.headers[name]
      if (value !== undefined) headers[name] = value
    }
    headers.host = origin.host
    headers.cookie = cookie
    headers.origin = origin.origin
    if (typeof req.headers.referer === 'string') {
      try {
        const referer = new URL(req.headers.referer)
        headers.referer = `${origin.origin}${referer.pathname}${referer.search}`
      } catch {
        // Drop an unparsable referer rather than forwarding a foreign one.
      }
    }
    // Identity keeps the HTML transform possible without a gzip codec.
    headers['accept-encoding'] = 'identity'
    return headers
  }

  #rewriteLocation(value) {
    if (typeof value !== 'string') return value
    try {
      const location = new URL(value)
      if (location.origin === new URL(this.upstreamOrigin).origin) {
        return `${location.pathname}${location.search}${location.hash}`
      }
    } catch {
      // Relative locations are already correct.
    }
    return value
  }

  #proxyHttp(req, res, path, retry) {
    return (async () => {
      let cookie
      try {
        cookie = await this.#ensureUpstreamCookie()
      } catch (error) {
        writeHtml(res, 503, renderPairingPageSafe({
          error: `无法连接本机 DSH：${error instanceof Error ? error.message : String(error)}`,
        }))
        return
      }
      const { transport, options } = requestOptions(
        this.upstreamOrigin,
        req.url ?? path,
        req.method ?? 'GET',
        this.#upstreamHeaders(req, cookie),
      )
      const upstream = transport.request(options)
      upstream.setTimeout(120_000, () => upstream.destroy(new Error('upstream timeout')))
      upstream.on('error', error => {
        this.log('upstream request failed', error)
        if (!res.headersSent) writeJson(res, 502, { error: 'upstream-unreachable' })
        else res.destroy()
      })
      upstream.on('response', async response => {
        const status = response.statusCode ?? 502
        if (status === 401 && retry && (req.method === 'GET' || req.method === 'HEAD')) {
          response.resume()
          this.upstreamCookie = undefined
          await this.#proxyHttp(req, res, path, false)
          return
        }
        const contentType = String(response.headers['content-type'] ?? '')
        const isHtml = contentType.includes('text/html')
        if (!isHtml || req.method === 'HEAD') {
          const headers = {}
          for (const [name, value] of Object.entries(response.headers)) {
            if (HOP_HEADERS.has(name.toLowerCase()) || name.toLowerCase() === 'set-cookie') continue
            if (name.toLowerCase() === 'location') headers[name] = this.#rewriteLocation(value)
            else headers[name] = value
          }
          res.writeHead(status, headers)
          response.pipe(res)
          return
        }

        const chunks = []
        let size = 0
        try {
          for await (const chunk of response) {
            size += chunk.length
            if (size > 4 * 1024 * 1024) throw new Error('HTML response too large')
            chunks.push(chunk)
          }
        } catch (error) {
          this.log('could not read upstream HTML', error)
          if (!res.headersSent) writeJson(res, 502, { error: 'upstream-read-failed' })
          else res.destroy()
          return
        }
        const body = injectMobileShell(Buffer.concat(chunks).toString('utf8'))
        const headers = {}
        for (const [name, value] of Object.entries(response.headers)) {
          const lower = name.toLowerCase()
          if (HOP_HEADERS.has(lower) || lower === 'set-cookie' || lower === 'content-length' || lower === 'content-encoding') continue
          if (lower === 'location') headers[name] = this.#rewriteLocation(value)
          else headers[name] = value
        }
        headers['content-length'] = Buffer.byteLength(body)
        headers['cache-control'] = 'no-store'
        res.writeHead(status, headers)
        res.end(body)
      })
      req.pipe(upstream)
    })()
  }

  async #handleUpgrade(req, socket, head) {
    const url = new URL(req.url ?? '/', 'http://gateway')
    const session = this.#authorize(req)
    if (session === undefined) {
      rawStatus(socket, 401, 'Unauthorized', { 'content-type': 'text/plain; charset=utf-8' })
      return
    }
    if (url.pathname === '/mobile/ws') {
      this.bridge.handleUpgrade(req, socket, head, session)
      return
    }
    const originHeader = req.headers.origin
    if (typeof originHeader === 'string') {
      let origin
      try {
        origin = new URL(originHeader)
      } catch {
        rawStatus(socket, 403, 'Forbidden')
        return
      }
      if (origin.host !== req.headers.host) {
        rawStatus(socket, 403, 'Forbidden')
        return
      }
    }
    let cookie
    try {
      cookie = await this.#ensureUpstreamCookie()
    } catch (error) {
      this.log('websocket authentication failed', error)
      rawStatus(socket, 503, 'Service Unavailable')
      return
    }
    const upstreamOrigin = new URL(this.upstreamOrigin)
    const headers = {
      host: upstreamOrigin.host,
      cookie,
      origin: upstreamOrigin.origin,
      connection: 'Upgrade',
      upgrade: 'websocket',
      'accept-encoding': 'identity',
    }
    for (const name of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions', 'user-agent']) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name]
    }
    const { transport, options } = requestOptions(this.upstreamOrigin, url.pathname + url.search, 'GET', headers)
    const upstream = transport.request(options)
    upstream.setTimeout(15_000, () => upstream.destroy(new Error('upstream websocket handshake timed out')))
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      upstream.setTimeout(0)
      const lines = [`HTTP/1.1 101 Switching Protocols`]
      for (let i = 0; i < response.rawHeaders.length; i += 2) {
        const key = response.rawHeaders[i]
        const value = response.rawHeaders[i + 1]
        if (key.toLowerCase() === 'connection' || key.toLowerCase() === 'upgrade') continue
        lines.push(`${key}: ${value}`)
      }
      lines.push('Connection: Upgrade', 'Upgrade: websocket', '', '')
      socket.write(lines.join('\r\n'))
      if (upstreamHead.length > 0) socket.write(upstreamHead)
      socket.pipe(upstreamSocket)
      upstreamSocket.pipe(socket)
      const close = () => {
        if (!socket.destroyed) socket.destroy()
        if (!upstreamSocket.destroyed) upstreamSocket.destroy()
      }
      socket.on('error', close)
      upstreamSocket.on('error', close)
      socket.on('close', close)
      upstreamSocket.on('close', close)
    })
    upstream.on('response', response => {
      const lines = [`HTTP/1.1 ${response.statusCode ?? 502} ${response.statusMessage ?? 'Bad Gateway'}`]
      for (let i = 0; i < response.rawHeaders.length; i += 2) {
        lines.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`)
      }
      lines.push('', '')
      socket.write(lines.join('\r\n'))
      response.pipe(socket)
    })
    upstream.on('error', error => {
      this.log('upstream websocket failed', error)
      if (!socket.destroyed) rawStatus(socket, 502, 'Bad Gateway')
    })
    upstream.end()
  }
}

function renderPairingPageSafe(options) {
  return renderPairingPage(options)
}
