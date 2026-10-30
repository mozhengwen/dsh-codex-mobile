import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function findDesktopTools(env = process.env) {
  if (env.CODEX_MOBILE_APP_TOOLS_SERVER && existsSync(env.CODEX_MOBILE_APP_TOOLS_SERVER)) return env.CODEX_MOBILE_APP_TOOLS_SERVER
  const root = join(env.CODEX_HOME || join(homedir(), '.codex'), 'plugins', 'cache', 'openai-bundled', 'codex-app-tools')
  if (!existsSync(root)) throw new Error('找不到桌面内置 codex-app-tools 插件')
  const versions = readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  const file = versions.map(version => join(root, version, 'server.mjs')).find(existsSync)
  if (!file) throw new Error('找不到桌面内置插件的 MCP 入口')
  return file
}

/** Whitelisted desktop actions; writes are dispatched only for authenticated phone actions. */
export class DesktopClient {
  constructor({ env = process.env, serverPath, timeout = 20_000 } = {}) {
    this.env = env
    this.serverPath = serverPath
    this.timeout = timeout
    this.pending = new Map()
    this.sequence = 0
    this.tools = new Map()
  }
  async start() {
    if (this.starting) return this.starting
    this.starting = this.initialize().catch(error => { this.close(); throw error })
    return this.starting
  }
  async initialize() {
    if (!this.env.CODEX_APP_TOOLS_PIPE_PATH) throw new Error('当前插件进程没有桌面工具通道。需在 Codex 桌面本地会话中验证，不能当作独立 CLI 服务使用。')
    this.child = spawn(process.execPath, [this.serverPath || findDesktopTools(this.env)], { env: this.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.child.stderr.on('data', () => {})
    this.child.once('error', error => this.rejectPending(error))
    this.child.once('exit', () => this.rejectPending(new Error('桌面工具连接已关闭')))
    this.lines = createInterface({ input: this.child.stdout })
    this.lines.on('line', line => {
      let message
      try { message = JSON.parse(line) } catch { return }
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
    await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codex-mobile', version: '0.5.1' } })
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
    const { tools } = await this.request('tools/list', {})
    for (const tool of tools) this.tools.set(tool.name, tool)
  }
  request(method, params) {
    const id = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('桌面响应超时')) }, this.timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', error => {
        if (error && this.pending.delete(id)) { clearTimeout(timer); reject(error) }
      })
    })
  }
  async call(name, args, context = {}) {
    if (!['list_threads', 'read_thread', 'list_projects', 'create_thread', 'send_message_to_thread', 'set_thread_title', 'move_thread_to_project', 'navigate_to_codex_page'].includes(name)) throw new Error('不允许的桌面操作')
    const threadId = context.threadId || this.env.CODEX_THREAD_ID
    if (!threadId) throw new Error('缺少由 Codex 执行器提供的调用会话上下文')
    await this.start()
    const tool = [...this.tools.values()].find(tool => tool.name === name || tool.name.endsWith(`__${name}`))
    if (!tool) throw new Error(`桌面未提供 ${name}`)
    const result = await this.request('tools/call', {
      name: tool.name, arguments: args,
      _meta: { 'x-codex-turn-metadata': { thread_id: threadId, ...(context.turnId ? { turn_id: context.turnId } : {}) } },
    })
    const text = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || ''
    if (result.isError) throw new Error(text || '桌面读取失败')
    try { return JSON.parse(text) } catch { throw new Error('桌面返回了未知格式的数据') }
  }
  rejectPending(error) {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
    this.pending.clear()
  }
  close() {
    this.rejectPending(new Error('连接已关闭'))
    this.lines?.close()
    this.child?.stdin.end()
    this.child?.kill()
    this.starting = undefined
    this.child = undefined
  }
}
