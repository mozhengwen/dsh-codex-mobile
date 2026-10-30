import {toolTypes,cleanTool,publicTool,safeString as stringify,toolResult,cleanWebAction} from './tool-items.mjs'
const MAX_TEXT = 120000
const textOf = input => (input || []).filter(p => p.type === 'text' || p.type === 'input_text').map(p => p.text || '').join('\n')
const cleanItem = item => {
  const base = { type:item?.type, id:item?.id }
  if (item?.type === 'agentMessage' && item.phase !== 'analysis') return { ...base, text:String(item.text || '').slice(0, MAX_TEXT), phase:item.phase }
  if (item?.type === 'userMessage' || item?.type === 'steeringUserMessage') return { ...base, linkId:item.clientId||item.clientUserMessageId||item.serverClientUserMessageId||item.restoreMessage?.id, text:(item.restoreMessage?.text || textOf(item.content || item.input)).slice(0, MAX_TEXT), time:item.restoreMessage?.createdAt }
  if (toolTypes.has(item?.type)) return cleanTool(item)
  return base
}
const cleanTurn = turn => ({ turnId: turn.turnId || turn.id, status: turn.status, time: turn.turnStartedAtMs || turn.startedAt || 0,
  times:{ ...turn.commandExecutionStartedAtMsById, ...turn.aeonAssistantMessageStartedAtMsById },
  items: (turn.items || []).map(cleanItem), completed: new Set(Object.keys(turn.completedItemIds || {}).filter(id => turn.completedItemIds[id])) })
function publicItem(turn, item, index, uploads, threadId) {
  const id = `${turn.turnId}:${item.id}`, time = item.time || turn.times[item.id] || Number(turn.time) + index
  if (!item.id || item.type === 'reasoning' || item.phase === 'analysis') return null
  if (item.type === 'agentMessage') { const streaming=turn.status==='inProgress'&&!turn.completed.has(item.id); return {id,kind:'assistant',text:item.text,streaming,status:streaming?'running':'ok',time} }
  if (item.type === 'userMessage' || item.type === 'steeringUserMessage') { const remembered=uploads?.message(threadId,item.text,item.linkId); return {id:item.linkId?`${turn.turnId}:user:${item.linkId}`:id,kind:'user',text:remembered?.text??item.text,images:remembered?.images||[],time} }
  if (toolTypes.has(item.type)) return {id,kind:'tool',...publicTool(item,{running:turn.status==='inProgress'&&!turn.completed.has(item.id)&&index===turn.items.length-1}),time}
  return null
}

// Retains only public assistant text and item identities; reasoning is discarded.
export class StreamMirror {
  constructor(uploads, threadId) { this.turns = new Map(); this.published = new Map(); this.lastValues = new Map(); this.revision = null; this.uploads=uploads; this.threadId=threadId }
  apply(change) {
    const touched = new Set(), specific = new Map(), replacements = new Set()
    const mark=(key,itemId)=>{
      if(!touched.has(key)){touched.add(key);specific.set(key,itemId?new Set([itemId]):null)}
      else if(!itemId)specific.set(key,null)
      else specific.get(key)?.add(itemId)
    }
    if (change.type === 'snapshot') {
      this.turns.clear()
      const state = change.conversationState
      const entries = state.turnHistory?.kind === 'canonical' ? Object.entries(state.turnHistory.history.entitiesByKey) : (state.turns || []).map((t, i) => [String(i), t])
      for (const [key, value] of entries) this.turns.set(key, cleanTurn(value))
      const valid=new Set([...this.turns.values()].flatMap(turn=>turn.items.map((item,index)=>publicItem(turn,item,index,this.uploads,this.threadId)?.id).filter(Boolean)))
      for(const id of this.published.keys())if(!valid.has(id)){this.published.delete(id);this.lastValues.delete(id)}
      for (const [key] of this.turns) mark(key)
    } else {
      if (this.revision !== change.baseRevision) throw new Error('stream-revision-gap')
      for (const patch of change.patches || []) {
        const p = patch.path || []
        if((p[0]==='turnHistory'&&p.length<4)||(p[0]==='turns'&&p.length===1))throw new Error('stream-history-replaced')
        let key, fields
        if (p[0] === 'turnHistory' && p[1] === 'history' && p[2] === 'entitiesByKey' && p.length >= 4) { key = p[3]; fields = p.slice(4) }
        else if (p[0] === 'turns' && p.length >= 2) { key = String(p[1]); fields = p.slice(2) }
        else continue
        if (!fields.length) {
          if (patch.op === 'remove') this.turns.delete(key)
          else { this.turns.set(key, cleanTurn(patch.value)); for (const item of patch.value.items || []) replacements.add(item.id) }
          mark(key); continue
        }
        const turn = this.turns.get(key)
        if (!turn) throw new Error('stream-turn-missing')
        const [field, index, property] = fields
        let changedItem
        if (field === 'items') {
          if (fields.length === 1) { turn.items = (patch.value || []).map(cleanItem); for (const i of turn.items) replacements.add(i.id) }
          else if (fields.length === 2) {
            if (patch.op === 'remove') turn.items.splice(index, 1)
            else { const item = cleanItem(patch.value); if (patch.op === 'add') turn.items.splice(index, 0, item); else turn.items[index] = item; replacements.add(item.id) }
          } else {
            const item = turn.items[index]
            changedItem=item?.id
            if(item?.type==='webSearch'&&property==='query')item.query=stringify(patch.value)
            if(item?.type==='webSearch'&&property==='action'){
              if(fields.length===3)item.action=cleanWebAction(patch.value)
              else if(['type','query','queries','url','pattern'].includes(fields[3])){
                const action={...item.action},name=fields[3]
                if(name==='queries'&&fields.length===5){const queries=[...(action.queries||[])];if(patch.op==='remove')queries.splice(fields[4],1);else if(patch.op==='add')queries.splice(fields[4],0,patch.value);else queries[fields[4]]=patch.value;action.queries=queries}
                else if(patch.op==='remove')delete action[name];else action[name]=patch.value
                item.action=cleanWebAction(action)
              }
            }
            if(item&&property==='agentsStates')item.result=cleanTool({type:'collabAgentToolCall',agentsStates:patch.value}).result
            if(item&&property==='plan')item.result=stringify(patch.value)
            if(item&&property==='src')item.result=cleanTool({type:'imageGeneration',src:patch.value}).result
            if (item && ['text','phase','id','status','aggregatedOutput','result','error','exitCode','command','arguments'].includes(property) && item.type !== 'reasoning') { item[property] = ['aggregatedOutput','result'].includes(property)?toolResult(patch.value):['text','error','command','arguments'].includes(property) ? stringify(patch.value) : patch.value; replacements.add(item.id + ':' + property) }
          }
        } else if (field === 'completedItemIds' && index && patch.value) {turn.completed.add(index);changedItem=index}
        else if (field === 'agentMessageCompletedAtMsById' && index && patch.value) {turn.completed.add(index);changedItem=index}
        else if (field === 'status') turn.status = patch.value
        else if (field === 'turnId') turn.turnId = patch.value
        else if (field === 'aeonAssistantMessageStartedAtMsById' || field === 'commandExecutionStartedAtMsById') { if (index) turn.times[index]=patch.value; else Object.assign(turn.times,patch.value) }
        mark(key,changedItem)
      }
      for (const update of change.acceptedTextChanges || []) {
        const field=update.target?.field
        if (update.type !== 'text' || !['text','aggregatedOutput'].includes(field) || replacements.has(update.key?.itemId) || replacements.has(update.key?.itemId+':'+field)) continue
        const turn = this.turns.get(update.key.entityKey)
        const item = turn?.items.find(i => i.id === update.key.itemId)
        if (!item || (field==='text' && item.type!=='agentMessage') || (field==='aggregatedOutput' && item.type!=='commandExecution') || item.phase==='analysis') continue
        for (const edit of update.edits || []) {
          const text=item[field]||''
          if (!Number.isSafeInteger(edit.at) || edit.at < 0 || edit.at > text.length || !Number.isSafeInteger(edit.deleteCount) || edit.deleteCount < 0 || typeof edit.insert !== 'string') throw new Error('stream-text-mismatch')
          item[field] = (text.slice(0, edit.at) + edit.insert + text.slice(edit.at + edit.deleteCount)).slice(0, MAX_TEXT)
        }
        mark(update.key.entityKey,item.id)
      }
    }
    this.revision = change.revision
    const changed = []
    for (const key of touched) {
      const turn = this.turns.get(key)
      if (!turn?.turnId) continue
      for (let index = 0; index < turn.items.length; index++) {
        const item = turn.items[index]
        if(specific.get(key)&&!specific.get(key).has(item.id))continue
        const value=publicItem(turn,item,index,this.uploads,this.threadId)
        if (!value) continue
        const previous=this.lastValues.get(value.id), encoded=JSON.stringify(value)
        this.lastValues.set(value.id,encoded)
        if (change.type==='snapshot' && !value.streaming && !this.published.has(value.id)) continue
        if (previous!==encoded || (value.streaming&&!this.published.has(value.id))) { this.published.set(value.id,value); changed.push(value) }
      }
    }
    return changed
  }
  overlay(snapshot) {
    if(this.revision==null)return snapshot
    const original=new Map(snapshot.items.map(i=>[i.id,i])), visibleTurns=new Set(snapshot.items.filter(i=>!i.id.startsWith('mobile-')).map(i=>i.id.split(':')[0]))
    const items=[]
    for(const turn of [...this.turns.values()].sort((a,b)=>a.time-b.time)) {
      if(!turn.turnId || (!visibleTurns.has(turn.turnId)&&turn.status!=='inProgress'))continue
      for(let index=0;index<turn.items.length;index++){
        const raw=turn.items[index]
        if(raw.type==='steeringUserMessage'&&raw.linkId&&turn.items.some(i=>i.type==='userMessage'&&i.linkId===raw.linkId))continue
        const item=publicItem(turn,turn.items[index],index,this.uploads,this.threadId)
        if(!item)continue
        const fallback=original.get(`${turn.turnId}:${raw.id}`)||original.get(item.id)
        if(item.kind==='user'&&!item.images.length&&fallback?.images?.length)item.images=fallback.images
        original.delete(item.id);items.push(item)
      }
    }
    const nativeUserTexts=new Set(items.filter(i=>i.kind==='user').map(i=>i.text))
    for(const item of original.values()) {
      if(item.kind==='user'&&nativeUserTexts.has(item.text)&&(item.id.startsWith('mobile-')||visibleTurns.has(item.id.split(':')[0])))continue
      const index=items.findIndex(i=>i.time>item.time)
      if(index<0)items.push(item);else items.splice(index,0,item)
    }
    for(const item of this.published.values())if(!items.some(i=>i.id===item.id))items.push(item)
    const unique=new Map();for(const item of items)unique.set(item.id,item)
    const bounded=[...unique.values()]
    const sizes=bounded.map(i=>Buffer.byteLength(JSON.stringify(i))+1)
    let total=sizes.reduce((a,b)=>a+b,2),offset=0
    while(bounded.length-offset>50&&total>6*1024*1024)total-=sizes[offset++]
    return { ...snapshot, items:bounded.slice(offset), historyNotice:snapshot.historyNotice?.replace('；工具完整输出请在电脑查看','') }
  }
}

export class DesktopStreams {
  constructor(control, uploads) { this.control = control; this.uploads=uploads; this.entries = new Map() }
  watch(threadId, hostId = 'local', onItem) {
    if (!this.control.onBroadcast || !this.control.owner) return () => {}
    const key = hostId + ':' + threadId
    let entry = this.entries.get(key)
    if (!entry) {
      entry = { key, threadId, hostId, mirror:new StreamMirror(this.uploads,threadId), listeners:new Set(), active:false, owner:null, retry:null }
      this.entries.set(key, entry)
    }
    entry.listeners.add(onItem)
    for (const item of entry.mirror.published.values()) onItem(item)
    this.connect(entry)
    return () => {
      entry.listeners.delete(onItem)
      if (!entry.listeners.size) { this.stop(entry); this.entries.delete(key) }
    }
  }
  connect(entry) {
    if (entry.connecting || entry.active || !entry.listeners.size) return
    entry.connecting = true
    Promise.resolve().then(async () => {
      const owner = await this.control.owner(entry.threadId, entry.hostId)
      if (!entry.listeners.size) return
      if (!owner.handledByClientId) throw new Error('no-stream-owner')
      entry.owner = owner.handledByClientId
      entry.removeListener = this.control.onBroadcast(message => {
        if (message.method !== 'thread-stream-state-changed' || message.version !== 11 || message.sourceClientId !== entry.owner || message.params?.conversationId !== entry.threadId || message.params.hostId !== entry.hostId) return
        try {
          const changed = entry.mirror.apply(message.params.change)
          entry.active = true; entry.lastFrameAt = Date.now()
          for (const item of changed) for (const listener of entry.listeners) listener(item)
        } catch { entry.mirror.revision = null; this.follow(entry, true) }
      })
      this.follow(entry, true)
      entry.watchdog = setInterval(() => {
        if (this.control.socket?.destroyed || (!entry.active && Date.now() - entry.startedAt > 8000)) this.retry(entry)
      }, 3000)
      entry.watchdog.unref?.(); entry.startedAt = Date.now()
    }).catch(() => this.retry(entry)).finally(() => { entry.connecting = false })
  }
  follow(entry, following) { this.control.broadcast('thread-stream-following-changed', { conversationId:entry.threadId, hostId:entry.hostId, following }, { targetClientIds:[entry.owner] }) }
  retry(entry) {
    this.stop(entry)
    if (entry.listeners.size) { entry.retry = setTimeout(() => { entry.retry = null; this.connect(entry) }, 2000); entry.retry.unref?.() }
  }
  stop(entry) {
    clearTimeout(entry.retry); clearInterval(entry.watchdog); entry.removeListener?.(); entry.removeListener = null
    if (entry.owner && !this.control.socket?.destroyed) { try { this.follow(entry, false) } catch {} }
    entry.owner = null; entry.active = false
  }
  overlay(threadId, hostId, snapshot) { return this.entries.get((hostId || 'local') + ':' + threadId)?.mirror.overlay(snapshot) || snapshot }
  close() { for (const entry of this.entries.values()) { entry.listeners.clear(); this.stop(entry) }; this.entries.clear() }
}
