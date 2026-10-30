import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {MobileGateway} from '../lib/gateway.mjs'

test('paired model endpoints update the desktop selection and isolate unsent draft settings',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'mobile-models-')),updates=[]
 let selected={model:'model-a',reasoningEffort:'low'}
 const gateway=new MobileGateway({stateFile:join(directory,'state.json'),context:{threadId:'s1'},control:{
  async owner(){return{handledByClientId:'desktop'}},async readModelSettings(){return{settings:selected}},
  async setModelSettings(id,host,value){updates.push({id,host,value});selected=value;return{applied:true}},close(){}
 },desktop:{tools:new Map([['create_thread',{name:'create_thread',inputSchema:{properties:{model:{description:'model-a (Example.; supported reasoning efforts: low, high), model-b (Example.; supported reasoning efforts: high).'}}}}]]),
  async call(name){if(name==='list_threads')return{threads:[{id:'s1',kind:'codex',hostId:'local'}]};if(name==='list_projects')return{projects:[]};throw Error('unexpected desktop call '+name)}
 }})
 const {baseUrl}=await gateway.start({port:0})
 t.after(async()=>{await gateway.close();rmSync(directory,{recursive:true})})
 const route=baseUrl+'/mobile/api/sessions/s1/model'
 assert.equal((await fetch(route)).status,401)
 const pair=await fetch(baseUrl+'/pair',{method:'POST',redirect:'manual',body:new URLSearchParams({code:gateway.pairing().code})})
 const headers={cookie:pair.headers.get('set-cookie').split(';')[0],'content-type':'application/json'}
 const get=()=>fetch(route,{headers}).then(r=>r.json())
 assert.equal((await get()).selected.reasoningEffort,'low')
 const post=(url,value)=>fetch(url,{method:'POST',headers,body:JSON.stringify(value)}).then(r=>r.json())
 await post(route,{provider:'codex',model:'model-b',reasoningEffort:'high'})
 assert.equal((await get()).selected.model,'model-b');assert.equal(updates.length,1)
 const rejected=await post(route,{provider:'codex',model:'model-b',reasoningEffort:'low'})
 assert.match(rejected.error,/不支持/);assert.equal(updates.length,1)
 const draft=await post(baseUrl+'/mobile/api/sessions',{})
 await post(baseUrl+'/mobile/api/sessions/'+draft.sessionId+'/model',{provider:'codex',model:'model-a',reasoningEffort:'high'})
 assert.equal(updates.length,1)
 const draftSettings=await fetch(baseUrl+'/mobile/api/sessions/'+draft.sessionId+'/model',{headers}).then(r=>r.json())
 assert.equal(draftSettings.selected.model,'model-a');assert.equal((await get()).selected.model,'model-b')
})
