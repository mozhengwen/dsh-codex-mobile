/**
 * Outbound relay client for the central DSH Mobile backend.
 *
 * The plugin keeps its loopback gateway (for local PWA / diagnostics), but the
 * phone talks to the cloud backend. This client dials the backend over WSS and
 * services its HTTP and WebSocket RPCs against 127.0.0.1:<gateway port>.
 */
import http from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { WebSocket } = require('../vendor/ws')

const MAX_HTTP_BODY = 20 * 1024 * 1024

export class RelayClient {
  /**
   * @param {{
   *   url: string,
   *   token: string,
   *   getPort: () => number,
   *   log?: (message: string, error?: unknown) => void,
   * }} options
   */
  constructor(options) {
    this.url = options.url
    this.token = options.token
    this.getPort = options.getPort
    this.log = options.log ?? ((message, error) => {
      if (error === undefined) console.warn(`[dsh-mobile] relay: ${message}`)
      else console.warn(`[dsh-mobile] relay: ${message}`, error)
    })
    this.socket = undefined
    this.stopped = false
    this.retry = undefined
    this.localSockets = new Map()
    this.heartbeat = undefined
    this.awaitingPong = false
    this.lastPong = 0
  }

  start() {
    this.stopped = false
    this.#startHeartbeat()
    this.#connect()
  }

  restart() {
    this.stopped = false
    if (this.retry !== undefined) {
      clearTimeout(this.retry)
      this.retry = undefined
    }
    const socket = this.socket
    this.socket = undefined
    this.#closeLocalSockets()
    this.awaitingPong = false
    if (socket !== undefined) {
      try { socket.terminate() } catch { try { socket.close() } catch { /* already closed */ } }
    }
    this.#connect()
  }

  state() {
    return {
      configured: true,
      connected: this.socket !== undefined && this.socket.readyState === 1,
      url: this.url,
      lastPong: this.lastPong,
      awaitingPong: this.awaitingPong,
    }
  }

  #startHeartbeat() {
    if (this.heartbeat !== undefined) return
    this.heartbeat = setInterval(() => {
      const socket = this.socket
      if (socket === undefined || socket.readyState !== 1) return
      if (this.awaitingPong) {
        this.log('heartbeat timeout; reconnecting')
        this.restart()
        return
      }
      this.awaitingPong = true
      try { socket.ping() } catch (error) {
        this.log('heartbeat failed', error)
        this.restart()
      }
    }, 20_000)
    this.heartbeat.unref?.()
  }

  #connect() {
    if (this.stopped || this.socket !== undefined) return
    const headers = { authorization: `Bearer ${this.token}` }
    const socket = new WebSocket(this.url, { headers, handshakeTimeout: 10_000 })
    this.socket = socket
    socket.on('open', () => {
      if (this.socket !== socket) return
      this.log(`connected to ${this.url}`)
      this.awaitingPong = false
      this.lastPong = Date.now()
      this.#send({ type: 'register', name: 'dsh-mobile', version: '0.3.0' })
    })
    socket.on('pong', () => {
      if (this.socket !== socket) return
      this.awaitingPong = false
      this.lastPong = Date.now()
    })
    socket.on('message', data => {
      if (this.socket !== socket) return
      this.#onMessage(String(data)).catch(error => this.log('RPC failed', error))
    })
    socket.on('close', () => {
      if (this.socket !== socket) return
      this.socket = undefined
      this.awaitingPong = false
      this.#closeLocalSockets()
      if (!this.stopped) this.#schedule()
    })
    socket.on('error', error => this.log('connection error', error))
  }

  #schedule() {
    if (this.stopped || this.retry !== undefined) return
    this.retry = setTimeout(() => {
      this.retry = undefined
      this.#connect()
    }, 3_000)
    this.retry.unref?.()
  }

  #send(payload) {
    const socket = this.socket
    if (socket === undefined || socket.readyState !== 1) return
    try { socket.send(JSON.stringify(payload)) } catch (error) { this.log('send failed', error) }
  }

  async #onMessage(text) {
    let message
    try { message = JSON.parse(text) } catch { return }
    if (message === null || typeof message !== 'object') return
    if (message.type === 'http-request') {
      await this.#http(message)
      return
    }
    if (message.type === 'ws-open') {
      this.#openLocalSocket(message)
      return
    }
    if (message.type === 'ws-up') {
      const local = this.localSockets.get(message.id)
      if (local !== undefined && local.readyState === 1) local.send(String(message.text ?? ''))
      return
    }
    if (message.type === 'ws-close') {
      this.#closeLocal(message.id)
    }
  }

  async #http(message) {
    const body = message.body === undefined ? Buffer.alloc(0) : Buffer.from(String(message.body), 'base64')
    if (body.length > MAX_HTTP_BODY) {
      this.#send({ type: 'http-response', id: message.id, status: 413, headers: {}, body: '' })
      return
    }
    const port = this.getPort()
    if (!Number.isInteger(port) || port <= 0) {
      this.#send({ type: 'http-response', id: message.id, status: 503, headers: {}, body: Buffer.from('gateway-not-ready').toString('base64') })
      return
    }
    const headers = {
      host: `127.0.0.1:${port}`,
      accept: message.headers?.accept ?? '*/*',
      'accept-encoding': 'identity',
      'content-type': message.headers?.['content-type'] ?? 'application/octet-stream',
      'content-length': body.length,
      cookie: message.headers?.cookie ?? '',
      'user-agent': message.headers?.['user-agent'] ?? 'DSH-Mobile-Relay/0.2',
    }
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      method: message.method ?? 'GET',
      path: message.path ?? '/',
      headers,
      agent: false,
    })
    request.setTimeout(120_000, () => request.destroy(new Error('local gateway timeout')))
    request.on('response', response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        this.#send({
          type: 'http-response',
          id: message.id,
          status: response.statusCode ?? 500,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('base64'),
        })
      })
    })
    request.on('error', error => {
      this.#send({
        type: 'http-response',
        id: message.id,
        status: 502,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: Buffer.from(JSON.stringify({ error: 'plugin-gateway-unreachable', message: error.message })).toString('base64'),
      })
    })
    request.end(body)
  }

  #openLocalSocket(message) {
    const port = this.getPort()
    if (!Number.isInteger(port) || port <= 0) {
      this.#send({ type: 'ws-close', id: message.id, reason: 'gateway-not-ready' })
      return
    }
    const headers = {}
    if (typeof message.headers?.cookie === 'string' && message.headers.cookie !== '') headers.cookie = message.headers.cookie
    const relaySocket = this.socket
    const send = payload => {
      if (this.socket === relaySocket) this.#send(payload)
    }
    const local = new WebSocket(`ws://127.0.0.1:${port}/mobile/ws`, { headers, perMessageDeflate: false, handshakeTimeout: 10_000 })
    this.localSockets.set(message.id, local)
    local.on('open', () => {
      send({ type: 'ws-open-ok', id: message.id })
    })
    local.on('message', data => {
      send({ type: 'ws-down', id: message.id, text: String(data) })
    })
    local.on('unexpected-response', (request, response) => {
      send({ type: 'ws-close', id: message.id, code: response.statusCode === 401 ? 4401 : 1013, reason: response.statusCode === 401 ? 'pairing-required' : 'gateway-unavailable' })
      response.resume()
      local.terminate()
    })
    local.on('close', () => {
      this.localSockets.delete(message.id)
      send({ type: 'ws-close', id: message.id })
    })
    local.on('error', error => {
      this.log('local websocket error', error)
      send({ type: 'ws-close', id: message.id, reason: 'local-websocket-error' })
    })
  }

  #closeLocal(id) {
    const local = this.localSockets.get(id)
    if (local === undefined) return
    this.localSockets.delete(id)
    try { local.close() } catch { /* already closed */ }
  }

  #closeLocalSockets() {
    for (const id of [...this.localSockets.keys()]) this.#closeLocal(id)
  }

  close() {
    this.stopped = true
    if (this.retry !== undefined) {
      clearTimeout(this.retry)
      this.retry = undefined
    }
    if (this.heartbeat !== undefined) {
      clearInterval(this.heartbeat)
      this.heartbeat = undefined
    }
    this.#closeLocalSockets()
    const socket = this.socket
    this.socket = undefined
    if (socket !== undefined) {
      try { socket.close() } catch { /* already closed */ }
    }
  }
}
