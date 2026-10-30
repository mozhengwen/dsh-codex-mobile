import test from 'node:test'
import assert from 'node:assert/strict'
import {StreamMirror} from '../lib/desktop-stream.mjs'
import {snapshotOf} from '../lib/projection.mjs'
test('web search, open and find operations are visible in desktop history',()=>{
 const input={thread:{id:'s'},turns:[{id:'t',status:'completed',items:[
  {id:'search',type:'webSearch',query:'Codex plugins',action:{type:'search',queries:['Codex plugins'],_meta:{secret:'PRIVATE'}}},
  {id:'open',type:'webSearch',action:{type:'openPage',url:'https://example.test/docs'}},
  {id:'find',type:'webSearch',action:{type:'findInPage',url:'https://example.test/docs',pattern:'MCP'}}]}]}
 const items=snapshotOf(input).items
 assert.deepEqual(items.map(i=>i.toolName),['搜索网页','打开网页','查找网页']);assert.ok(items[0].args.includes('Codex plugins'));assert.ok(items[2].args.includes('MCP'));assert.equal(JSON.stringify(items).includes('PRIVATE'),false)
})
test('web activity streams query changes, completion and retains native transcript order',()=>{
 const mirror=new StreamMirror()
 mirror.apply({type:'snapshot',revision:1,conversationState:{turns:[{turnId:'t',status:'inProgress',items:[{id:'search',type:'webSearch',query:'old',action:{type:'search',queries:['old']}}]}]}})
 let items=mirror.overlay({items:[{id:'t:search',kind:'tool'}]}).items
 assert.equal(items[0].status,'running')
 const changed=mirror.apply({type:'patches',baseRevision:1,revision:2,patches:[{op:'replace',path:['turns',0,'items',0,'query'],value:'new'},{op:'replace',path:['turns',0,'items',0,'action','queries',0],value:'new'},{op:'add',path:['turns',0,'completedItemIds','search'],value:true}]})
 assert.equal(changed[0].status,'ok');assert.ok(changed[0].args.includes('new'));assert.ok(!changed[0].args.includes('old'))
})
