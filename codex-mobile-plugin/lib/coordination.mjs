import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Desktop's existing IPC router. Never starts another app-server or claims ownership.
// Private desktop protocol: fail closed when a desktop update changes it.
export class CoordinationClient {
  constructor({ endpoint = process.platform === 'win32' ? '\\\\.\\pipe\\codex-ipc' : join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'ipc', 'ipc.sock'), timeout = 10_000 } = {}) {
    this.endpoint = endpoint
    this.timeout = timeout
    this.clientId = 'initializing-client'
    this.pending = new Map()
    this.broadcastHandlers = new Set()
  }
  async start() {
    if (this.starting) return this.starting
    this.starting = (async () => {
      this.socket = net.connect(this.endpoint)
      let buffer = Buffer.alloc(0)
      this.socket.on('data', data => {
        buffer = Buffer.concat([buffer, data])
        while (buffer.length >= 4) {
          const length = buffer.readUInt32LE(0)
          if (!length || length > 32 * 1024 * 1024) return this.close()
          if (buffer.length < length + 4) break
          let message
          try { message = JSON.parse(buffer.subarray(4, length + 4).toString()) } catch { return this.close() }
          buffer = buffer.subarray(length + 4)
          this.receive(message)
        }
      })
      this.socket.on('error', () => this.fail(new Error('Codex 桌面控制通道不可用')))
      this.socket.on('close', () => { this.fail(new Error('Codex 桌面控制通道已关闭')); this.starting = undefined })
      await new Promise((resolve, reject) => { this.socket.once('connect', resolve); this.socket.once('error', reject) })
      const result = await this.request('initialize', { clientType: 'codex-mobile' }, { version: 0 })
      this.clientId = result.clientId
      return result
    })().catch(error => { this.close(); throw error })
    return this.starting
  }
  write(message) {
    const bytes = Buffer.from(JSON.stringify(message))
    const header = Buffer.alloc(4)
    header.writeUInt32LE(bytes.length)
    this.socket.write(Buffer.concat([header, bytes]))
  }
  receive(message) {
    if (message.type === 'client-discovery-request') {
      this.write({ type: 'client-discovery-response', requestId: message.requestId, response: { canHandle: false } })
    } else if (message.type === 'broadcast') {
      for (const listener of this.broadcastHandlers) listener(message)
    } else if (message.type === 'response') {
      const entry = this.pending.get(message.requestId)
      if (!entry) return
      clearTimeout(entry.timer); this.pending.delete(message.requestId)
      if (message.resultType === 'success') entry.resolve({ ...message.result, ...(message.handledByClientId ? { handledByClientId: message.handledByClientId } : {}) })
      else entry.reject(new Error(typeof message.error === 'string' ? message.error : JSON.stringify(message.error || 'desktop-control-failed')))
    }
  }
  onBroadcast(listener) { this.broadcastHandlers.add(listener); return () => this.broadcastHandlers.delete(listener) }
  broadcast(method, params, { version = 1, targetClientIds } = {}) {
    this.write({ type: 'broadcast', method, params, version, sourceClientId: this.clientId, ...(targetClientIds ? { targetClientIds } : {}) })
  }
  request(method, params, { version = 1, hostId, targetClientId, timeout = this.timeout } = {}) {
    const requestId = randomUUID()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('Codex 桌面控制响应超时')) }, timeout)
      this.pending.set(requestId, { resolve, reject, timer })
      try { this.write({ type: 'request', requestId, sourceClientId: this.clientId, version, method, params,
        ...(hostId ? { hostId } : {}), ...(targetClientId ? { targetClientId } : {}) }) }
      catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error) }
    })
  }
  async owner(conversationId, hostId = 'local', options = {}) {
    await this.start()
    return this.request('thread-owner-discovery', { conversationId, hostId }, options)
  }
  async interrupt(conversationId, hostId, expectedTurnId) {
    const owner = await this.owner(conversationId, hostId)
    const targetClientId = owner.handledByClientId
    if (!targetClientId) throw new Error('桌面尚未加载此任务，请先在桌面打开任务')
    return this.request('thread-follower-interrupt-turn', { conversationId, mode: 'user-stop', expectedTurnId }, {
      targetClientId, version: hostId && hostId !== 'local' ? 5 : 4, ...(hostId && hostId !== 'local' ? { hostId } : {}),
    })
  }
  async sendImages(conversationId, hostId, text, images, { running = false, cwd = '' } = {}) {
    return this.sendPrompt(conversationId,hostId,text,images,{running,cwd})
  }
  async readModelSettings(conversationId,hostId='local') {
    const owner=await this.owner(conversationId,hostId)
    return this.request('thread-follower-read-model-settings',{conversationId},{targetClientId:owner.handledByClientId,version:hostId==='local'?1:2,...(hostId!=='local'?{hostId}:{})})
  }
  async setModelSettings(conversationId,hostId,selection) {
    const owner=await this.owner(conversationId,hostId)
    return this.request('thread-follower-update-thread-settings',{conversationId,threadSettings:{model:selection.model,reasoningEffort:selection.reasoningEffort||null}},{targetClientId:owner.handledByClientId,version:hostId==='local'?2:3,...(hostId!=='local'?{hostId}:{})})
  }
  async sendPrompt(conversationId, hostId, text, images = [], { running = false, cwd = '', model, reasoningEffort } = {}) {
    let owner
    try { owner = await this.owner(conversationId, hostId) } catch (error) { if (error.message.includes('no-client-found')) error.code = 'THREAD_NOT_LOADED'; throw error }
    if (!owner.handledByClientId) { const error = new Error('桌面尚未加载此任务，请稍后重试'); error.code = 'THREAD_NOT_LOADED'; throw error }
    const input = [...(text ? [{ type: 'text', text, text_elements: [] }] : []), ...images.map(image => ({ type: 'image', url: `data:${image.mimeType};base64,${image.bytes.toString('base64')}` }))]
    const id = randomUUID()
    const restoreMessage = { id, text: text || '图片', cwd, createdAt: Date.now(), context: { prompt: text, addedFiles: [], fileAttachments: [], ideContext: null, imageAttachments: [], workspaceRoots: [cwd || '/'] } }
    const method = running ? 'thread-follower-steer-turn' : 'thread-follower-start-turn'
    const params = running ? { conversationId, input, restoreMessage, clientUserMessageId: id } : {
      conversationId, turnStart: { request: { threadId: conversationId, input, clientUserMessageId: id, ...(model?{model}:{}), ...(reasoningEffort?{effort:reasoningEffort}:{}) }, context: { restoreMessage } },
    }
    const result=await this.request(method, params, { targetClientId: owner.handledByClientId, version: (running ? 1 : 2) + (hostId && hostId !== 'local' ? 1 : 0), ...(hostId && hostId !== 'local' ? { hostId } : {}) })
    return {...result,clientUserMessageId:id}
  }
  fail(error) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error) }; this.pending.clear() }
  close() { this.fail(new Error('控制连接已关闭')); this.socket?.destroy(); this.starting = undefined }
}
