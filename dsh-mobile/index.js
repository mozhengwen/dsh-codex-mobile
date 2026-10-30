/**
 * Host half of DSH Mobile.
 *
 * Starts the paired LAN gateway and registers the loopback-only control API
 * used by the sidebar page. The phone's authenticated page is a transparent
 * proxy of this process's own DSH Web GUI, so it has exactly the same sessions,
 * tools, approvals, and streaming behavior as the desktop.
 */
import { MobileGateway } from './lib/gateway.js'
import { MobileBridge } from './lib/mobile-bridge.js'
import { RelayClient } from './lib/relay-client.js'
import { PairingStore, resolveDshHome } from './lib/store.js'

/** Services required before the gateway and native bridge can work. */
export const inject = ['webServer', 'connection', 'sessionController']

const PREFIX = '/dsh-mobile/api'

function isLoopbackHost(hostname) {
  const clean = hostname.replace(/^\[|\]$/g, '')
  return clean === 'localhost' || clean === '::1' || /^127\./.test(clean) || /^::ffff:127\./i.test(clean)
}

/**
 * The control API is for the local DSH page only. It can mint pairing codes
 * and revoke phones, so a LAN request must never reach it even if somebody
 * later exposes the DSH web server itself.
 */
function isLocalRequest(req) {
  const remote = req.socket.remoteAddress
  if (typeof remote !== 'string' || !isLoopbackHost(remote)) return false
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  const hostname = host.replace(/:\d+$/, '')
  if (!isLoopbackHost(hostname)) return false
  const origin = req.headers.origin
  if (typeof origin === 'string') {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

function readBody(req, limit = 16 * 1024) {
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {Record<string, unknown>} config
 */
export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  // The Loader passes the row's config here; the fiber entry is a fallback for
  // compositions that hand a plugin a bare context without the second argument.
  const raw = config !== null && typeof config === 'object' && Object.keys(config).length > 0
    ? config
    : (ctx.fiber?.entry?.options?.config ?? {})
  if (raw.enabled === false) return

  const store = new PairingStore()
  const log = (message, error) => {
    if (error === undefined) console.warn(`[dsh-mobile] ${message}`)
    else console.warn(`[dsh-mobile] ${message}`, error)
  }
  const bridge = new MobileBridge({ ctx, log })
  const gateway = new MobileGateway({
    ctx,
    store,
    bridge,
    config: raw,
    log,
  })
  const relay = typeof raw.relayUrl === 'string' && raw.relayUrl !== '' && typeof raw.relayToken === 'string' && raw.relayToken !== ''
    ? new RelayClient({
        url: raw.relayUrl,
        token: raw.relayToken,
        getPort: () => gateway.port,
        log,
      })
    : undefined
  gateway.relay = relay

  const disposeRoutes = ctx.effect(() => {
    const routes = [
      {
        kind: 'exact',
        path: `${PREFIX}/status`,
        handler: (req, res) => {
          if (!isLocalRequest(req)) {
            writeJson(res, 403, { error: 'forbidden' })
            return
          }
          if (req.method !== 'GET') {
            writeJson(res, 405, { error: 'method-not-allowed' })
            return
          }
          writeJson(res, 200, gateway.status())
        },
      },
      {
        kind: 'exact',
        path: `${PREFIX}/relay/reconnect`,
        handler: (req, res) => {
          if (!isLocalRequest(req)) {
            writeJson(res, 403, { error: 'forbidden' })
            return
          }
          if (req.method !== 'POST') {
            writeJson(res, 405, { error: 'method-not-allowed' })
            return
          }
          if (relay === undefined) {
            writeJson(res, 404, { error: 'relay-not-configured' })
            return
          }
          relay.restart()
          writeJson(res, 200, { ok: true, relay: relay.state() })
        },
      },
      {
        kind: 'exact',
        path: `${PREFIX}/pairing`,
        handler: (req, res) => {
          if (!isLocalRequest(req)) {
            writeJson(res, 403, { error: 'forbidden' })
            return
          }
          if (req.method !== 'POST') {
            writeJson(res, 405, { error: 'method-not-allowed' })
            return
          }
          writeJson(res, 200, gateway.rotatePairing())
        },
      },
      {
        kind: 'exact',
        path: `${PREFIX}/devices`,
        handler: async (req, res) => {
          if (!isLocalRequest(req)) {
            writeJson(res, 403, { error: 'forbidden' })
            return
          }
          if (req.method === 'GET') {
            writeJson(res, 200, { devices: store.listDevices(), limit: gateway.deviceLimit })
            return
          }
          if (req.method !== 'DELETE') {
            writeJson(res, 405, { error: 'method-not-allowed' })
            return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id') ?? ''
          if (id === '') {
            writeJson(res, 400, { error: 'id-required' })
            return
          }
          const removed = gateway.revokeDevice(id)
          writeJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'device-not-found' })
        },
      },
    ]
    const disposers = routes.map(route => ctx.webServer.register(route))
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'dsh-mobile: control API')

  ctx.effect(() => {
    bridge.bind()
    let disposed = false
    gateway.start(raw).then(() => {
      if (!disposed) relay?.start()
    }).catch(error => {
      if (disposed) return
      gateway.error = error instanceof Error ? error.message : String(error)
      console.error(`[dsh-mobile] gateway did not start: ${gateway.error}`)
    })
    return () => {
      disposed = true
      relay?.close()
      bridge.close()
      disposeRoutes()
      void gateway.close()
    }
  }, 'dsh-mobile: paired LAN gateway')

  console.log(`[dsh-mobile] state ${store.stateFile}; control API ${PREFIX}/status; home ${resolveDshHome()}`)
}
