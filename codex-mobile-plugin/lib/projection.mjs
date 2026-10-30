import {toolTypes,cleanTool,publicTool} from './tool-items.mjs'
export const capabilities = Object.freeze({
  backend: 'codex-desktop-plugin', readOnly: false, sessions: true, workspaces: true,
  snapshots: true, snapshotPollingMs: 2000, rawTokenStream: true,
  createSession: true, prompt: true, cancel: true, interactions: false,
  imageUpload: true, maxImagesPerMessage: 4, maxImageBytes: 2097152,
})

export function sessionRows(value) {
  const rows = [...(value.pinnedThreads || []), ...(value.threads || [])]
  const seen = new Set()
  return rows.filter(item => item.kind === 'codex' && !seen.has(item.id) && seen.add(item.id)).map(item => ({
    id: item.id, title: item.title || 'Codex 任务', cwd: item.cwd || '',
    updatedAt: Number(item.updatedAt || 0) * (Number(item.updatedAt) < 1e12 ? 1000 : 1),
    running: item.status === 'active', blank: false, hostId: item.hostId || 'local',
    projectId: item.projectId || null,
  }))
}

export function projectRows(value) {
  return (value.projects || []).filter(item => item.projectKind !== 'chatgpt' && item.path).map(item => ({
    id: item.projectId, title: item.label || item.path, path: item.path,
    hostId: item.hostId || 'local',
  }))
}

const textContent = value => typeof value === 'string' ? value : Array.isArray(value) ? value.filter(x => x.type === 'text' || x.type === 'input_text').map(x => x.text || '').join('\n') : ''
export function snapshotOf(value, uploads) {
  const items = []
  const turns = value.page?.order === 'newest_first' ? [...(value.turns || [])].reverse() : value.turns || []
  for (const turn of turns) {
    for (const item of turn.items || []) {
      const id = `${turn.id}:${item.id}`
      const previousLength = items.length
      if (item.type === 'userMessage') {
        const text = textContent(item.content)
        const remembered = uploads?.message(value.thread.id, text)
        items.push({ id, kind: 'user', text: remembered?.text ?? text, images: remembered?.images || (uploads ? (item.content || []).map(part => uploads.fromInput(part)).filter(Boolean) : []) })
      }
      else if (item.type === 'agentMessage' && item.phase !== 'analysis') items.push({ id, kind: 'assistant', text: item.text || '' })
      else if (toolTypes.has(item.type)) items.push({id,kind:'tool',...publicTool(cleanTool(item),{running:turn.status==='inProgress'&&item===turn.items.at(-1)})})
      // Do not expose internal reasoning or synthesize progress from missing data.
      if (items.length > previousLength) {
        const timestamp = Number(turn.startedAt || 0)
        items[items.length - 1].time = timestamp * (timestamp < 1e12 ? 1000 : 1) + previousLength
      }
    }
  }
  const receipts = uploads?.messagesFor(value.thread.id) || []
  if (receipts.length) {
    const nativeUsers = items.filter(x => x.kind === 'user')
    const timestamps = turns.map(t => Number(t.startedAt || 0)).filter(Boolean).map(t => t * (t < 1e12 ? 1000 : 1))
    const oldest = timestamps.length ? Math.min(...timestamps) : 0
    const before = receipts.filter(r => r.time < oldest).at(-1)
    for (const receipt of receipts) {
      if (receipt.time < oldest && receipt !== before) continue
      const nativeIndex = nativeUsers.findIndex(x => x.text === receipt.text || x.text === receipt.wireText)
      if (nativeIndex >= 0) { nativeUsers.splice(nativeIndex, 1); continue }
      const { wireText, ...message } = receipt
      items.push(message)
    }
    items.sort((a, b) => (a.time || 0) - (b.time || 0))
  }
  return { type: 'snapshot', sessionId: value.thread.id, title: value.thread.title || 'Codex 任务',
    cwd: value.thread.cwd || '', running: value.thread.status?.type === 'active',
    items, live: null, interactions: [], hasMore: value.page?.hasMore === true }
}
