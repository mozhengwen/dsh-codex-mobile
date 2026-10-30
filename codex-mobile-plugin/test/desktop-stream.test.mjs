import test from 'node:test'
import assert from 'node:assert/strict'
import { StreamMirror } from '../lib/desktop-stream.mjs'
import { desktopModelCatalog, validateSelection } from '../lib/model-catalog.mjs'
const path=['turnHistory','history','entitiesByKey','turn:1']
const snapshot={type:'snapshot',revision:1,conversationState:{turnHistory:{kind:'canonical',history:{entitiesByKey:{'turn:1':{turnId:'t1',status:'inProgress',turnStartedAtMs:1000,items:[{id:'r1',type:'reasoning',content:['PRIVATE REASONING']},{id:'a1',type:'agentMessage',text:'你',phase:'final_answer'}],completedItemIds:{}}}}}}}
test('native text edits stream before completion, ignore reasoning and reconcile stale snapshots',()=>{
 const mirror=new StreamMirror();assert.equal(mirror.apply(snapshot)[0].text,'你')
 const next=mirror.apply({type:'patches',baseRevision:1,revision:2,patches:[],acceptedTextChanges:[{type:'text',key:{entityKey:'turn:1',itemId:'a1'},target:{field:'text'},edits:[{at:1,deleteCount:0,insert:'好'}]}]})
 assert.equal(next[0].text,'你好');assert.equal(next[0].streaming,true)
 const overlay=mirror.overlay({items:[{id:'t1:a1',kind:'assistant',text:'你',time:1001}]})
 assert.equal(overlay.items[0].text,'你好');assert.equal(JSON.stringify(overlay).includes('PRIVATE'),false)
 const done=mirror.apply({type:'patches',baseRevision:2,revision:3,patches:[{op:'add',path:[...path,'completedItemIds','a1'],value:true}]})
 assert.equal(done[0].streaming,false)
 assert.throws(()=>mirror.apply({type:'patches',baseRevision:9,revision:10,patches:[]}),/revision-gap/)
})
test('native transcript preserves steering order and exposes tool output',()=>{
 const mirror=new StreamMirror();mirror.apply({type:'snapshot',revision:1,conversationState:{turns:[{turnId:'t',status:'inProgress',turnStartedAtMs:1,items:[{type:'agentMessage',id:'a',text:'before'},{type:'steeringUserMessage',id:'s',clientUserMessageId:'u',restoreMessage:{text:'human',createdAt:10}},{type:'agentMessage',id:'b',text:'after'},{type:'commandExecution',id:'cmd',command:'test',status:'inProgress',aggregatedOutput:'line 1'}],completedItemIds:{a:true}}]}})
 const result=mirror.overlay({items:[{id:'t:a',kind:'assistant',text:'before',time:1},{id:'t:b',kind:'assistant',text:'after',time:2},{id:'mobile-u',kind:'user',text:'human',time:10}]})
 assert.deepEqual(result.items.map(i=>i.text||i.result),['before','human','after','line 1'])
 const change=mirror.apply({type:'patches',baseRevision:1,revision:2,patches:[{op:'replace',path:['turns',0,'items',3,'aggregatedOutput'],value:'line 1\nline 2'}]})
 assert.equal(change.find(i=>i.kind==='tool').result,'line 1\nline 2')
})
test('models and effort choices come from the desktop tool schema and reject unsupported selections',()=>{
 const models=desktopModelCatalog(new Map([['create_thread',{name:'create_thread',inputSchema:{properties:{model:{description:'Models: model-a (Example.; supported reasoning efforts: low, high), model-b (Example.; supported reasoning efforts: medium).'}}}}]]))
 assert.equal(models.length,2);assert.equal(validateSelection(models,{provider:'codex',model:'model-a',reasoningEffort:'high'}).reasoningEffort,'high')
 assert.throws(()=>validateSelection(models,{provider:'codex',model:'model-a',reasoningEffort:'ultra'}),/不支持/)
})
test('tool results retain readable content and exclude private UI metadata and inline binary data',()=>{
 const mirror=new StreamMirror()
 mirror.apply({type:'snapshot',revision:1,conversationState:{turns:[{turnId:'t',status:'inProgress',items:[{id:'tool',type:'mcpToolCall',tool:'test',result:{content:[{type:'text',text:'public output'},{type:'image',data:'PRIVATE-BINARY'}],_meta:{secret:'PRIVATE-META'}}}]}]}})
 const item=mirror.overlay({items:[{id:'t:tool',kind:'tool'}]}).items[0]
 assert.equal(item.result,'public output\n[图片]')
 assert.equal(JSON.stringify(item).includes('PRIVATE'),false)
})
test('a resnapshot removes rolled-back live items instead of appending ghost messages',()=>{
 const mirror=new StreamMirror();mirror.apply(snapshot)
 mirror.apply({type:'snapshot',revision:10,conversationState:{turns:[]}})
 assert.deepEqual(mirror.overlay({items:[]}).items,[])
})
