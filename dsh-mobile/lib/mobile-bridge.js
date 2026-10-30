/**
 * Native-app bridge: the phone-facing BFF over this DSH Host.
 *
 * The Android app never runs DSH and never sees DSH's internal wire protocol.
 * It lists Sessions, subscribes to one Session, sends prompts/cancels, and
 * answers approvals/questions through this small JSON vocabulary. Every action
 * is executed by the already-running DSH Agent on the computer.
 */
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { SessionView } from './session-view.js'

const require = createRequire(import.meta.url)
const { WebSocketServer } = require('../vendor/ws')

const MAX_PROMPT = 120_000
const APPROVAL_TIMEOUT_MS = 60_000
const QUESTION_TIMEOUT_MS = 90_000

function textOfContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block !== null && typeof block === 'object' && block.type === 'text')
    .map(block => block.text)
    .filter(text => typeof text === 'string')
    .join('\n')
}

function cleanTitle(value, fallback) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function approvalPrompt(request) {
  const reason = request.displayReason ?? {}
  return cleanTitle(reason.zh, cleanTitle(reason.en, request.reason ?? request.toolName))
}

export class MobileBridge {
  /**
   * @param {{
   *   ctx: import('@deepseek-ai/cordis').Context,
   *   log?: (message: string, error?: unknown) => void,
   * }} options
   */
  constructor(options) {
    this.ctx = options.ctx
    this.log = options.log ?? ((message, error) => {
      if (error === undefined) console.warn(`[dsh-mobile] ${message}`)
      else console.warn(`[dsh-mobile] ${message}`, error)
    })
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false })
    this.clients = new Map()
    this.pending = new Map()
    this.disposers = []
  }

  get sessionController() {
    return this.ctx.sessionController
  }

  get sessionQuery() {
    return this.ctx.get('sessionQuery')
  }

  /** Register the interaction waterfalls while this plugin is mounted. */
  bind() {
    this.disposers.push(this.ctx.on('approval/request', (request, next) => this.#approval(request, next), { prepend: true }))
    this.disposers.push(this.ctx.on('user-questions/request', (request, next) => this.#question(request, next), { prepend: true }))
  }

  hasClients() {
    return this.clients.size > 0
  }

  /** Attach one authenticated `/mobile/ws` WebSocket to this bridge. */
  handleUpgrade(request, socket, head, session) {
    this.wss.handleUpgrade(request, socket, head, ws => {
      const id = randomUUID()
      const client = {
        id,
        ws,
        subscription: undefined,
        closed: false,
      }
      this.clients.set(ws, client)
      ws.on('message', data => {
        this.#onMessage(client, data).catch(error => {
          this.#send(client, { type: 'error', message: error instanceof Error ? error.message : String(error) })
        })
      })
      ws.on('close', () => {
        client.closed = true
        this.#stopSubscription(client)
        this.clients.delete(ws)
        if (this.clients.size === 0) this.#releasePending(null)
      })
      ws.on('error', error => {
        this.log('mobile websocket error', error)
      })
      this.#send(client, { type: 'ready', clientId: id, deviceId: session.id })
    })
  }

  async #onMessage(client, data) {
    let message
    try {
      message = JSON.parse(String(data))
    } catch {
      throw new Error('invalid JSON')
    }
    if (message === null || typeof message !== 'object') throw new Error('invalid message')
    if (message.type === 'ping') {
      this.#send(client, { type: 'pong' })
      return
    }
    if (message.type === 'unsubscribe') {
      this.#stopSubscription(client)
      return
    }
    if (message.type === 'subscribe') {
      if (typeof message.sessionId !== 'string' || message.sessionId === '') throw new Error('sessionId required')
      this.#stopSubscription(client)
      await this.#startSubscription(client, message.sessionId)
      return
    }
    throw new Error(`unknown message type ${String(message.type)}`)
  }

  #send(client, payload) {
    if (client.closed) return
    if (client.ws.readyState !== 1) return
    try {
      client.ws.send(JSON.stringify(payload))
    } catch (error) {
      this.log('mobile websocket send failed', error)
    }
  }

  broadcast(payload) {
    for (const client of this.clients.values()) this.#send(client, payload)
  }

  #stopSubscription(client) {
    const subscription = client.subscription
    if (subscription === undefined) return
    client.subscription = undefined
    subscription.controller.abort()
  }

  async #startSubscription(client, sessionId) {
    const controller = new AbortController()
    client.subscription = { sessionId, controller }
    try {
      const info = await this.#sessionInfo(sessionId)
      if (client.closed || client.subscription?.controller !== controller) return
    const view = new SessionView({ sessionId })
      view.running = info.running
      let opened = false
      const stream = this.sessionController.follow({
        address: { kind: 'session', sessionId },
        maxMessages: 80,
        turnWindow: { minMessages: 24, minTurns: 1 },
        assistantStream: true,
      }, controller.signal)
      for await (const frame of stream) {
        if (client.closed || client.subscription?.controller !== controller) return
        if (frame === null || typeof frame !== 'object') continue
        if (!opened && frame.type === 'snapshot') {
          for (const record of frame.records ?? []) {
            if (record?.type === 'event') view.applyEvent(record.event)
          }
          view.lastSeq = Number(frame.cursor) || view.lastSeq
          view.loadLiveAttempt(frame.assistantStream?.activeAttempt)
          opened = true
          this.#send(client, view.snapshot(
            sessionId,
            info.title,
            info.cwd,
            frame.hasMore === true,
            this.#pendingForSession(sessionId),
          ))
          continue
        }
        if (frame.type === 'event') {
          for (const update of view.applyEvent(frame.event)) this.#send(client, update)
          continue
        }
        if (frame.type === 'assistant-stream') {
          for (const update of view.applyStreamFrame(frame.frame)) this.#send(client, update)
        }
      }
      if (!client.closed && client.subscription?.controller === controller) this.#send(client, { type: 'closed', sessionId })
    } catch (error) {
      if (controller.signal.aborted) return
      this.log('session follow failed', error)
      this.#send(client, { type: 'error', message: error instanceof Error ? error.message : String(error) })
      if (client.subscription?.controller === controller) this.#send(client, { type: 'closed', sessionId })
    }
  }

  async #sessionInfo(sessionId) {
    let title = '会话'
    let cwd = ''
    let running = false
    let blank = false
    try {
      const signal = new AbortController().signal
      const list = await this.sessionController.list({}, signal)
      const summary = list.items.find(item => item.sessionId === sessionId)
      if (summary !== undefined) {
        running = summary.running
        blank = summary.blank
        cwd = summary.cwd ?? ''
      }
      if (this.sessionQuery !== undefined) {
        const observation = await this.sessionQuery.readTitleSnapshot(sessionId, signal)
        title = cleanTitle(observation?.title?.title, blank ? '新会话' : '会话')
      }
    } catch (error) {
      this.log('could not read session info', error)
    }
    return { title, cwd, running, blank }
  }

  /** Sessions shown on the phone: roots only, newest activity first. */
  async listSessions() {
    const signal = new AbortController().signal
    const list = await this.sessionController.list({}, signal)
    const archived = await this.#archivedSessionIds()
    const rows = list.items.filter(item => item.origin !== 'subagent' && !archived.has(item.sessionId))
    const ids = rows.map(item => item.sessionId)
    const titles = new Map()
    if (this.sessionQuery !== undefined && ids.length > 0) {
      try {
        const observed = await this.sessionQuery.readTitleSnapshots(ids, signal)
        for (const result of observed) {
          if (result.status === 'fulfilled') titles.set(result.sessionId, result.value.title?.title)
        }
      } catch (error) {
        this.log('could not read session titles', error)
      }
    }
    return rows
      .map(item => ({
        id: item.sessionId,
        title: cleanTitle(titles.get(item.sessionId), item.blank ? '新会话' : item.sessionId.slice(-8)),
        cwd: item.cwd ?? '',
        updatedAt: item.updatedAt,
        running: item.running,
        blank: item.blank,
        parentId: item.parentSessionId,
        projectId: item.workspaceId,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** The workspace archive set is delivered as the opening baseline frame. */
  async #archivedSessionIds() {
    const workspace = this.ctx.get('workspaceController')
    if (workspace === undefined) return new Set()
    const controller = new AbortController()
    const iterator = workspace.follow(controller.signal)[Symbol.asyncIterator]()
    try {
      const first = await iterator.next()
      const ids = first.value?.type === 'baseline' ? first.value.value?.archivedSessionIds : undefined
      return new Set(Array.isArray(ids) ? ids : [])
    } catch {
      return new Set()
    } finally {
      controller.abort()
      await iterator.return?.()
    }
  }

  /** Read the same registered Workspaces the desktop sidebar uses. */
  async listWorkspaces() {
    const workspace = this.ctx.get('workspaceController')
    const defaultDirectory = this.ctx.get('workingDirectory')?.defaultDirectory ?? ''
    if (workspace === undefined) return { workspaces: [], defaultDirectory }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('workspace list timed out')), 8000)
    const iterator = workspace.follow(controller.signal)[Symbol.asyncIterator]()
    try {
      const first = await iterator.next()
      if (first.value?.type !== 'baseline') throw new Error('workspace baseline unavailable')
      return {
        workspaces: (first.value.value?.items ?? []).map(item => ({
          id: item.workspaceId, title: item.title, path: item.path,
        })),
        defaultDirectory,
      }
    } finally {
      clearTimeout(timer)
      controller.abort()
      await iterator.return?.()
    }
  }

  /** Preserve desktop Workspace membership, rather than only copying its path. */
  async createSession(request = {}) {
    if (typeof request.workspaceId === 'string' && request.workspaceId.trim() !== '') {
      if (typeof request.cwd === 'string' && request.cwd.trim() !== '') throw new Error('请选择工作区或目录，不能同时指定')
      const { workspaces } = await this.listWorkspaces()
      const workspace = workspaces.find(item => item.id === request.workspaceId)
      if (workspace === undefined) throw new Error('工作区已不存在，请刷新后重试')
      const created = await this.sessionController.create({ workspaceId: workspace.id })
      return { sessionId: created.sessionId, title: '新会话', cwd: workspace.path, projectId: workspace.id, hostId: 'local' }
    }
    let cwd = typeof request.cwd === 'string' && request.cwd.trim() !== '' ? request.cwd.trim() : undefined
    if (cwd === undefined) {
      const workingDirectory = this.ctx.get('workingDirectory')
      cwd = workingDirectory?.defaultDirectory
    }
    const created = await this.sessionController.create(cwd === undefined ? {} : { cwd })
    return { sessionId: created.sessionId, title: '新会话', cwd: cwd ?? '' }
  }

  async prompt(sessionId, text, requestId, images = []) {
    if (typeof text !== 'string' || (text.trim() === '' && images.length === 0)) throw new Error('消息不能为空')
    if (text.length > MAX_PROMPT) throw new Error('消息过长')
    const signal = new AbortController().signal
    const request = {
      requestId: typeof requestId === 'string' && requestId !== '' ? requestId : randomUUID(),
      sessionId,
      mode: 'queue',
      content: [...(text.trim() ? [{ type: 'text', text }] : []), ...images.map(image => ({ type: 'image', data: image.bytes.toString('base64'), mediaType: image.mimeType, name: image.name }))],
      clientTimeZone: 'Asia/Shanghai',
    }
    await this.sessionController.prompt(request, signal)
    return { accepted: true }
  }
  async image(sessionId, attachmentId) {
    const value = await this.sessionController.attachment({ sessionId, attachmentId }, new AbortController().signal)
    return { mimeType: value.attachment.mediaType, bytes: Buffer.from(value.data, 'base64') }
  }

  async cancel(sessionId) {
    return this.sessionController.cancel({ sessionId })
  }

  async rename(sessionId, title) {
    if (typeof title !== 'string' || title.trim() === '') throw new Error('标题不能为空')
    return this.sessionController.rename({ sessionId, title: title.trim().slice(0, 120) })
  }

  /** Hide one Session from the workspace list without deleting its log. */
  async archiveSession(sessionId) {
    const workspace = this.ctx.get('workspaceController')
    if (workspace === undefined) throw new Error('workspace controller unavailable')
    return workspace.archiveSession({ sessionId, stopActivity: true })
  }

  async models() {
    return this.sessionController.modelCatalog()
  }
  async modelSettings(sessionId) {
    const catalog=await this.models()
    const models=catalog.groups.flatMap(group=>group.models.map(model=>({provider:group.id,id:model.id,name:model.name,providerName:group.name,efforts:model.reasoning?.efforts||[],defaultEffort:model.reasoning?.defaultEffort})))
    let selected=catalog.default
    if(sessionId){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),iterator=this.sessionController.follow({address:{kind:'session',sessionId},maxMessages:1,assistantStream:false},controller.signal)[Symbol.asyncIterator]()
      try{const first=await iterator.next();const value=first.value?.projections?.values?.modelSelection;selected=value?.next||value?.lastUsed||selected}finally{clearTimeout(timer);controller.abort();await iterator.return?.()}
    }
    return {models,selected}
  }
  async selectModel(sessionId,input) {
    const catalog=await this.modelSettings(sessionId),model=catalog.models.find(m=>m.id===input.model&&m.provider===input.provider)
    if(!model)throw new Error('该模型当前不可用，请刷新模型列表')
    if(input.reasoningEffort&&!model.efforts.some(e=>e.id===input.reasoningEffort))throw new Error('该模型不支持所选思考等级')
    return this.sessionController.selectModel({sessionId,provider:input.provider,model:input.model,...(input.reasoningEffort?{reasoningEffort:input.reasoningEffort}:{})},new AbortController().signal)
  }

  #pendingForSession(sessionId) {
    return [...this.pending.values()]
      .filter(entry => entry.interaction.sessionId === sessionId)
      .map(entry => entry.interaction)
  }

  #releasePending(predicate) {
    for (const entry of [...this.pending.values()]) {
      if (predicate !== null && predicate(entry.interaction) !== true) continue
      entry.resolve(undefined)
    }
  }

  #waitForInteraction(interaction, signal, timeoutMs) {
    return new Promise(resolve => {
      const id = interaction.id
      const finish = value => {
        const entry = this.pending.get(id)
        if (entry === undefined) return
        this.pending.delete(id)
        clearTimeout(entry.timer)
        if (entry.onAbort !== undefined) signal?.removeEventListener('abort', entry.onAbort)
        resolve(value)
      }
      const timer = setTimeout(() => finish(undefined), timeoutMs)
      const onAbort = () => finish(undefined)
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        interaction,
        onAbort,
        timer,
        resolve: value => finish(value),
      })
      this.broadcast({ type: 'interaction', interaction })
    })
  }

  /** Answer one pending approval/question from the phone. */
  answerInteraction(id, payload) {
    const entry = this.pending.get(id)
    if (entry === undefined) return false
    if (entry.interaction.kind === 'approval') {
      const outcome = payload?.outcome
      if (outcome !== 'allowed-once' && outcome !== 'rejected') throw new Error('无效的审批结果')
      entry.resolve(outcome)
    } else {
      if (!Array.isArray(payload?.answers)) throw new Error('答案格式无效')
      entry.resolve({ answers: payload.answers })
    }
    this.broadcast({ type: 'interaction-resolved', id })
    return true
  }

  async #approval(request, next) {
    if (!this.hasClients()) return next()
    if (request.signal?.aborted) return 'cancelled'
    const interaction = {
      id: randomUUID(),
      kind: 'approval',
      sessionId: String(request.agent.id),
      toolName: String(request.toolName),
      callId: request.callId === undefined ? undefined : String(request.callId),
      reason: request.reason ?? '',
      prompt: approvalPrompt(request),
      createdAt: Date.now(),
    }
    const outcome = await this.#waitForInteraction(interaction, request.signal, APPROVAL_TIMEOUT_MS)
    if (request.signal?.aborted) return 'cancelled'
    if (outcome === 'allowed-once' || outcome === 'rejected') return outcome
    this.broadcast({ type: 'interaction-resolved', id: interaction.id })
    return next()
  }

  async #question(request, next) {
    if (!this.hasClients()) return next()
    const interaction = {
      id: randomUUID(),
      kind: 'question',
      sessionId: request.agent === undefined ? '' : String(request.agent.id),
      callId: request.wait?.callId === undefined ? undefined : String(request.wait.callId),
      questions: request.questions,
      createdAt: Date.now(),
    }
    const answer = await this.#waitForInteraction(interaction, request.signal, QUESTION_TIMEOUT_MS)
    if (request.signal?.aborted) throw new Error('question cancelled')
    if (answer !== undefined && Array.isArray(answer.answers)) return answer
    this.broadcast({ type: 'interaction-resolved', id: interaction.id })
    return next()
  }

  close() {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.#releasePending(null)
    for (const client of this.clients.values()) {
      client.closed = true
      this.#stopSubscription(client)
      try { client.ws.close() } catch { /* already closed */ }
    }
    this.clients.clear()
    this.wss.close()
  }
}
