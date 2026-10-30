import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { DesktopClient } from './lib/desktop-client.mjs'
import { MobileGateway } from './lib/gateway.mjs'
import { RelayClient } from './lib/relay-client.mjs'
import { desktopInstanceId,LifecycleState } from './lib/lifecycle.mjs'
import { gatewayOptions } from './lib/network-config.mjs'

const root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'codex-mobile')
mkdirSync(root, { recursive: true, mode: 0o700 })
let config = {}
try { config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')) } catch {}
const desktop = new DesktopClient()
const context = { threadId: process.env.CODEX_THREAD_ID }
const adminSecret = randomBytes(32).toString('base64url')
let relay, closing = false
const lifecycle=new LifecycleState(root)
const gateway = new MobileGateway({ desktop, context, adminSecret, onStop: ({manual})=>{if(manual)lifecycle.enable(false);return close()} })
gateway.desktopInstance = desktopInstanceId(process.env)
async function close() {
  if (closing) return
  closing = true
  relay?.close()
  await gateway.close()
  desktop.close()
  try { const runtime = JSON.parse(readFileSync(join(root, 'runtime.json'), 'utf8')); if (runtime.pid === process.pid) unlinkSync(join(root, 'runtime.json')) } catch {}
  process.exit(0)
}
process.on('SIGTERM', close)
process.on('SIGINT', close)
try {
  if (!context.threadId) throw new Error('必须通过 Codex 桌面插件启动')
  await desktop.call('list_threads', { limit: 1 }, context)
  const options = gatewayOptions(config, lifecycle.bootstrap(), {
    ...(process.env.CODEX_MOBILE_PORT ? {port: Number(process.env.CODEX_MOBILE_PORT)} : {}),
    ...(process.env.CODEX_MOBILE_EXPOSE_LAN ? {exposeLan: process.env.CODEX_MOBILE_EXPOSE_LAN === 'true'} : {})
  })
  await gateway.start(options)
  gateway.publicUrl = config.publicUrl
  if (config.relayUrl && config.relayToken) {
    relay = new RelayClient({ url: config.relayUrl, token: config.relayToken, getPort: () => gateway.port })
    gateway.relay = relay
    relay.start()
  }
  writeFileSync(join(root, 'runtime.json'), JSON.stringify({ pid: process.pid, port: gateway.port, adminSecret }), { mode: 0o600 })
  // The companion survives a chat's MCP session. It exits when its desktop pipe disappears.
  let misses = 0
  setInterval(async () => {
    try { await desktop.call('list_threads', { limit: 1 }, context); misses = 0 }
    catch { if (++misses >= 3) close() }
  }, 30_000).unref()
} catch (error) {
  console.error(error.message)
  relay?.close(); await gateway.close(); desktop.close(); process.exitCode = 1
}
