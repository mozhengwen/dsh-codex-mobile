import test from 'node:test'
import assert from 'node:assert/strict'
import {ConversationPublisher} from '../lib/conversation-publisher.mjs'
const baseline={type:'snapshot',sessionId:'s',title:'Task',running:true,live:null,items:[{id:'old',kind:'tool',result:'x'.repeat(24000),status:'ok'},{id:'a',kind:'assistant',text:'',streaming:true}]}
test('bursty stream updates coalesce into an append without resending history',()=>{
 const frames=[],p=new ConversationPublisher(f=>frames.push(f),{textAppend:true})
 p.checkpoint(baseline)
 for(let i=1;i<=100;i++)p.offer({...baseline.items[1],text:'字'.repeat(i)})
 p.offer({...baseline.items[1],text:'字'.repeat(100),streaming:false})
 assert.equal(frames.length,2);assert.equal(frames[1].patch.textAppend,'字'.repeat(100));assert.equal(frames[1].patch.baseLength,0);assert.equal(frames[1].patch.streaming,false)
 p.checkpoint({...baseline,items:[baseline.items[0],{...baseline.items[1],text:'字'.repeat(100),streaming:false}]})
 assert.equal(frames.length,2);p.close()
})
test('polling emits small item updates, correct status and forced snapshots on recovery',()=>{
 const frames=[],p=new ConversationPublisher(f=>frames.push(f))
 p.checkpoint(baseline)
 const next={...baseline,running:false,items:[baseline.items[0],{...baseline.items[1],text:'complete',streaming:false}]}
 p.checkpoint(next)
 assert.equal(frames.filter(f=>f.type==='snapshot').length,1);assert.equal(frames[1].patch.text,'complete');assert.deepEqual(frames[2],{type:'status',running:false})
 p.checkpoint(next,{force:true});assert.equal(frames.at(-1).type,'snapshot')
 p.checkpoint({...next,items:[next.items[1]]});assert.equal(frames.at(-1).type,'snapshot');p.close()
})
test('a tool boundary flushes preceding text, legacy clients still receive full text',()=>{
 const frames=[],p=new ConversationPublisher(f=>frames.push(f))
 p.checkpoint(baseline);p.offer({...baseline.items[1],text:'before'});p.offer({id:'search',kind:'tool',toolName:'搜索网页',status:'running'})
 assert.equal(frames[1].patch.text,'before');assert.equal(frames[2].item.id,'search');p.close()
})
