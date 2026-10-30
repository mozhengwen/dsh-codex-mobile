import { App, applyDocumentTheme, applyHostStyleVariables } from '@modelcontextprotocol/ext-apps'

const app = new App({ name: '手机远控', version: '0.5.2' }, {}, { autoResize: true })
const $ = id => document.getElementById(id)
let state = { running: false, devices: [] }, loaded = false, working = false, refreshing = false, pendingDevice
let deviceKey, qrSvg, revision = 0
let poll, tick
const error = message => { $('error').textContent = message; $('error').hidden = !message }
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message }
function theme(context) {
  if (context?.theme) applyDocumentTheme(context.theme)
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables)
}
function remaining() {
  if (!state.code || !state.expiresAt) { $('expires').textContent = '启动远控后生成'; return }
  const seconds = Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000))
  $('expires').textContent = seconds > 0 ? `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒后失效` : '正在更新配对码…'
}
function render(next) {
  state = next; loaded = true
  const ready = state.running && !state.needsUpgrade
  $('gateway-state').textContent = state.running ? '网关运行中' : '网关未运行'
  $('gateway-dot').classList.toggle('good', Boolean(state.running))
  $('relay-state').textContent = state.relay?.connected ? '云端中转已连接' : state.running ? '云端中转未连接' : '电脑端服务未启动'
  $('relay-dot').classList.toggle('good', state.relay?.connected === true)
  $('toggle').textContent = state.needsUpgrade ? '更新远控网关' : state.running ? '停止远控' : '启动远控'
  $('toggle').disabled = working
  $('toggle').title = state.running ? '停止远控并关闭自动启动；点击启动可恢复' : '启动远控并启用随 Codex 自动恢复'
  $('autostart-state').textContent = state.autostartEnabled === false ? '已关闭自动启动，点击「启动远控」恢复。' : '已启用随 Codex 自动恢复远控；点击「停止远控」可关闭。'
  $('code').textContent = state.code || '— — —'
  $('address').textContent = state.publicUrl || state.baseUrl || '启动后显示连接地址'
  $('qr').hidden = !state.qrSvg
  $('qr-placeholder').hidden = Boolean(state.qrSvg)
  $('qr-placeholder').textContent = state.needsUpgrade ? '更新网关后显示二维码' : '启动远控后显示二维码'
  if (state.qrSvg !== qrSvg) {
    qrSvg = state.qrSvg
    if (qrSvg) $('qr').src = 'data:image/svg+xml;base64,' + btoa(qrSvg)
    else $('qr').removeAttribute('src')
  }
  $('new-code').disabled = working || !ready
  $('copy').disabled = working || !state.code
  $('device-count').textContent = ready ? `${state.devices?.length || 0} 台设备 · 最多 ${state.maxDevices || 8} 台` : '启动远控后查看'
  remaining()
  const nextKey = JSON.stringify([state.devices, working])
  if (deviceKey === nextKey) return
  deviceKey = nextKey
  const container = $('devices'); container.replaceChildren()
  for (const device of state.devices || []) {
    const row = document.createElement('div'); row.className = 'device'
    const icon = document.createElement('span'); icon.className = 'device-icon'; icon.textContent = '▯'; icon.setAttribute('aria-hidden', 'true')
    const main = document.createElement('div'); main.className = 'device-main'
    const name = document.createElement('div'); name.className = 'device-name'; name.textContent = device.name
    const meta = document.createElement('div'); meta.className = 'device-meta'
    meta.textContent = `最近访问 ${new Date(device.lastSeenAt || device.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
    if (device.pairingCount > 1) meta.textContent += ` · ${device.pairingCount} 份历史配对`
    main.append(name, meta)
    const button = document.createElement('button'); button.textContent = '撤销'; button.className = 'danger'; button.disabled = working
    button.setAttribute('aria-label', `撤销 ${device.name} 的访问`)
    button.onclick = () => { pendingDevice = device.id; $('revoke-description').textContent = `撤销「${device.name}」的访问？这台手机需要重新配对。${device.pairingCount > 1 ? `将同时撤销 ${device.pairingCount} 份历史配对记录。` : ''}`; $('revoke-dialog').showModal() }
    row.append(icon, main, button); container.append(row)
  }
  if (!state.devices?.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = ready ? '还没有配对设备。手机连接成功后会显示在这里。' : '启动远控后查看已配对设备。'; container.append(empty)
  }
}
async function call(name, args = {}) {
  const result = await app.callServerTool({ name, arguments: args })
  if (result.isError) throw new Error(result.content?.find(x => x.type === 'text')?.text || '操作失败')
  return result
}
function panelOf(result) { return result._meta?.panel }
async function load() {
  if (refreshing || working) return
  refreshing = true
  const stamp = revision
  try { const result = await call('panel_state'); if (stamp !== revision) return; const panel = panelOf(result); if (panel) render(panel); else throw new Error('插件未返回面板数据'); error('') }
  catch (cause) { if (stamp !== revision) return; error(cause.message || '读取状态失败'); if (!loaded) $('relay-state').textContent = '暂时无法读取插件状态' }
  finally { refreshing = false }
}
async function action(name, args) {
  if (working) return
  revision++; working = true; notice(''); render(state)
  try {
    const result = await call(name, args)
    const panel = panelOf(result)
    if (panel) render(panel)
    else {
      const next = await call('panel_state')
      if (panelOf(next)) render(panelOf(next))
    }
    error('')
  } catch (cause) { error(cause.message || '操作失败') }
  finally { working = false; render(state) }
}
$('reload').onclick = load
$('toggle').onclick = () => action(state.needsUpgrade || !state.running ? 'gateway_start' : 'gateway_stop')
$('new-code').onclick = () => action('pairing_refresh')
$('keep-device').onclick = () => $('revoke-dialog').close()
$('confirm-revoke').onclick = () => { $('revoke-dialog').close(); if (pendingDevice) action('device_revoke', { deviceId: pendingDevice }) }
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(`地址：${state.publicUrl || state.baseUrl}\n配对码：${state.code}`); notice('已复制地址和配对码') }
  catch { notice('可选中上方地址和配对码，手动复制。') }
}
app.ontoolresult = result => { const panel = panelOf(result); if (panel) render(panel) }
app.onhostcontextchanged = context => theme(context)
app.onteardown = async () => { clearInterval(poll); clearInterval(tick); return {} }
app.connect().then(async () => {
  theme(app.getHostContext())
  await load()
  poll = setInterval(() => { if (!document.hidden) load() }, 5000)
  tick = setInterval(remaining, 1000)
}).catch(cause => { error(`无法连接插件宿主：${cause.message}`); $('relay-state').textContent = '插件连接失败' })
document.addEventListener('visibilitychange', () => { if (!document.hidden) load() })

