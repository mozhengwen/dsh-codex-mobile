/**
 * Fold DSH Session events into the small, stable chat vocabulary the native
 * Android app renders. Keeping this translation on the Host means the phone
 * never has to understand DSH internals, and DSH upgrades only touch this file.
 */

const MAX_TOOL_TEXT = 24_000
const MAX_ITEM_TEXT = 120_000

function truncate(value, limit) {
  if (typeof value !== 'string') return ''
  return value.length <= limit ? value : `${value.slice(0, limit)}\n… (${value.length - limit} more chars)`
}

function textOf(content, skipImages = false) {
  if (!Array.isArray(content)) return { text: '', reasoning: '' }
  const texts = []
  const reasoning = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
    else if (block.type === 'reasoning' && typeof block.text === 'string') reasoning.push(block.text)
    else if (block.type === 'image' && !skipImages) texts.push('🖼 图片')
    else if (block.type === 'file') texts.push(`📎 ${block.attachment?.name ?? '文件'}`)
  }
  return { text: texts.join('\n'), reasoning: reasoning.join('\n') }
}

function errorText(reason) {
  if (reason === null || typeof reason !== 'object') return ''
  if (typeof reason.failure?.message === 'string') return reason.failure.message
  if (typeof reason.kind === 'string') return `Turn ${reason.kind}`
  return ''
}

export class SessionView {
  constructor({ sessionId = '' } = {}) {
    this.sessionId = sessionId
    this.items = []
    this.byId = new Map()
    this.toolByCall = new Map()
    this.lastSeq = 0
    this.running = false
    this.live = { text: '', reasoning: '' }
  }

  #add(item) {
    const existing = this.byId.get(item.id)
    if (existing !== undefined) {
      Object.assign(existing, item)
      return { type: 'item-update', id: item.id, patch: { ...item } }
    }
    this.items.push(item)
    this.byId.set(item.id, item)
    return { type: 'item', item }
  }

  #update(id, patch) {
    const item = this.byId.get(id)
    if (item === undefined) return undefined
    Object.assign(item, patch)
    return { type: 'item-update', id, patch }
  }

  /** Apply one durable Session event and return wire frames for the app. */
  applyEvent(event) {
    if (event === null || typeof event !== 'object' || typeof event.type !== 'string') return []
    const seq = Number(event.seq)
    if (Number.isSafeInteger(seq)) this.lastSeq = Math.max(this.lastSeq, seq)
    const data = event.data ?? {}
    const time = Number(event.time) || Date.now()
    const frames = []

    switch (event.type) {
      case 'user/message': {
        // A user/message event carries the Message directly (not under
        // `message`, unlike assistant/message). Runtime context, time
        // context, and skill reminders are also user/message events but must
        // not appear as human chat bubbles.
        const message = data.message ?? data
        if (message?.source?.kind !== 'user') break
        const content = textOf(message.content, true)
        const images = (message.content || []).filter(part => part.type === 'image' && part.attachment?.attachmentId).map(part => ({
          id: String(part.attachment.attachmentId), name: part.attachment.name || '图片', mimeType: part.attachment.mediaType,
          url: `/mobile/api/sessions/${encodeURIComponent(this.sessionId)}/images/${encodeURIComponent(part.attachment.attachmentId)}`,
        }))
        const text = content.text.trim()
        if (text !== '' || images.length > 0) {
          frames.push(this.#add({
            id: `u-${seq}`,
            kind: 'user',
            text: truncate(text, MAX_ITEM_TEXT),
            images,
            time,
          }))
        }
        break
      }
      case 'assistant/message': {
        const content = textOf(data.message?.content)
        if (content.text.trim() !== '' || content.reasoning.trim() !== '') {
          frames.push(this.#add({
            id: `a-${seq}`,
            kind: 'assistant',
            text: truncate(content.text, MAX_ITEM_TEXT),
            reasoning: truncate(content.reasoning, MAX_ITEM_TEXT),
            interrupted: data.interrupted === true,
            time,
          }))
        }
        if (this.live.text !== '' || this.live.reasoning !== '') {
          this.live = { text: '', reasoning: '' }
          frames.push({ type: 'live-clear' })
        }
        break
      }
      case 'tool/call': {
        const callId = String(data.callId ?? '')
        if (callId === '') break
        const item = {
          id: `t-${callId}`,
          kind: 'tool',
          toolName: String(data.name ?? 'tool'),
          toolCallId: callId,
          args: truncate(String(data.arguments ?? ''), MAX_TOOL_TEXT),
          status: 'pending',
          time,
        }
        this.toolByCall.set(callId, item.id)
        frames.push(this.#add(item))
        break
      }
      case 'tool/result': {
        const callId = String(data.message?.toolCallId ?? '')
        const id = this.toolByCall.get(callId)
        if (id === undefined) break
        const content = textOf(data.message?.content)
        frames.push(this.#update(id, {
          status: data.error === undefined && data.message?.isError !== true ? 'ok' : 'error',
          result: truncate(content.text, MAX_TOOL_TEXT),
          error: data.error === undefined ? undefined : String(data.error.reason ?? data.error.code ?? 'error'),
        }))
        break
      }
      case 'turn/start': {
        if (!this.running) {
          this.running = true
          frames.push({ type: 'status', running: true })
        }
        break
      }
      case 'turn/end': {
        if (this.running) {
          this.running = false
          frames.push({ type: 'status', running: false })
        }
        if (data.reason?.kind === 'error') {
          const message = errorText(data.reason)
          frames.push(this.#add({
            id: `e-${seq}`,
            kind: 'error',
            text: message === '' ? '本轮执行失败' : message,
            time,
          }))
        }
        if (this.live.text !== '' || this.live.reasoning !== '') {
          this.live = { text: '', reasoning: '' }
          frames.push({ type: 'live-clear' })
        }
        break
      }
      default:
        break
    }
    return frames.filter(frame => frame !== undefined)
  }

  /** Apply one live assistant-stream frame from `sessionController.follow`. */
  applyStreamFrame(frame) {
    if (frame === null || typeof frame !== 'object') return []
    if (frame.type === 'start') {
      this.live = { text: '', reasoning: '' }
      return [{ type: 'live-clear' }]
    }
    if (frame.type === 'end') {
      if (frame.outcome?.kind === 'committed') return []
      this.live = { text: '', reasoning: '' }
      return [{ type: 'live-clear' }]
    }
    if (frame.type !== 'chunk') return []
    const chunk = frame.chunk
    if (chunk === null || typeof chunk !== 'object') return []
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      this.live.text += chunk.text
      return [{ type: 'delta', kind: 'text', text: chunk.text }]
    }
    if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
      this.live.reasoning += chunk.text
      return [{ type: 'delta', kind: 'reasoning', text: chunk.text }]
    }
    return []
  }

  /** Rebuild live text from the active attempt in a follow snapshot baseline. */
  loadLiveAttempt(attempt) {
    this.live = { text: '', reasoning: '' }
    if (attempt === null || typeof attempt !== 'object' || !Array.isArray(attempt.stream)) return
    for (const chunk of attempt.stream) {
      if (chunk === null || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') this.live.text += chunk.text
      else if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') this.live.reasoning += chunk.text
      else if (chunk.type === 'text-chunks' && Array.isArray(chunk.texts)) this.live.text += chunk.texts.filter(t=>typeof t==='string').join('')
      else if (chunk.type === 'reasoning-chunks' && Array.isArray(chunk.texts)) this.live.reasoning += chunk.texts.filter(t=>typeof t==='string').join('')
      else if (chunk.type === 'chunk' && chunk.chunk?.type === 'text-delta') this.live.text += chunk.chunk.text || ''
    }
  }

  snapshot(sessionId, title, cwd, hasMore, pendingInteractions = []) {
    return {
      type: 'snapshot',
      sessionId,
      title,
      cwd,
      cursor: this.lastSeq,
      running: this.running,
      hasMore,
      items: this.items,
      live: this.live.text !== '' || this.live.reasoning !== '' ? this.live : undefined,
      interactions: pendingInteractions,
    }
  }
}
