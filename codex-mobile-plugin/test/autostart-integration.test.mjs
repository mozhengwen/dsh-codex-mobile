import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import http from 'node:http'
import {desktopInstanceId} from '../lib/lifecycle.mjs'

test('MCP initialization restores the gateway once, replaces stale desktop owners, and respects manual stop',{timeout:30000},async t=>{
 const root=mkdtempSync(join(tmpdir(),'mobile-autostart-')),folder=join(root,'codex-mobile');mkdirSync(folder)
 const reservation=http.createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));const port=reservation.address().port;await new Promise(r=>reservation.close(r))
 writeFileSync(join(folder,'config.json'),JSON.stringify({port}));writeFileSync(join(folder,'bootstrap.json'),JSON.stringify({threadId:'fixture-caller'}))
 const fixture=join(root,'desktop-fixture.mjs'),starts=join(root,'starts.log')
 writeFileSync(fixture,`import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';const send=m=>process.stdout.write(JSON.stringify(m)+'\\n');createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id==null)return;let result;if(m.method==='initialize'){appendFileSync(${JSON.stringify(starts)},process.pid+'\\n');result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}}}else if(m.method==='tools/list')result={tools:[{name:'list_threads',inputSchema:{type:'object'}}]};else if(m.method==='tools/call')result={content:[{type:'text',text:JSON.stringify({threads:[]})}]};else result={};send({jsonrpc:'2.0',id:m.id,result})})`)
 const children=[]
 const env={...process.env,CODEX_HOME:root,CODEX_MOBILE_APP_TOOLS_SERVER:fixture,CODEX_APP_TOOLS_PIPE_PATH:'fixture-owner-a'};delete env.CODEX_THREAD_ID;delete env.CODEX_MOBILE_PORT
 function open(pipe=env.CODEX_APP_TOOLS_PIPE_PATH){
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...env,CODEX_APP_TOOLS_PIPE_PATH:pipe},windowsHide:true,stdio:['pipe','pipe','pipe']}),pending=new Map();let sequence=0
  children.push(child);child.stderr.on('data',()=>{})
  createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);p.resolve(m.result)}})
  return{child,rpc:(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP request timed out'))},10000);pending.set(id,{resolve,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})}
 }
 async function health(){try{const runtime=JSON.parse(readFileSync(join(folder,'runtime.json'),'utf8'));return{...await fetch(`http://127.0.0.1:${runtime.port}/health`,{signal:AbortSignal.timeout(500)}).then(r=>r.json()),pid:runtime.pid}}catch{return{running:false}}}
 async function until(predicate){const deadline=Date.now()+8000;while(Date.now()<deadline){const value=await health();if(await predicate(value))return value;await new Promise(r=>setTimeout(r,50))}assert.fail('automatic lifecycle transition timed out')}
 t.after(async()=>{
  for(const child of children){child.stdin.end();child.kill()}
  try{const runtime=JSON.parse(readFileSync(join(folder,'runtime.json'),'utf8'));await fetch(`http://127.0.0.1:${runtime.port}/_codex-mobile/stop`,{method:'POST',headers:{authorization:'Bearer '+runtime.adminSecret}});await new Promise(r=>setTimeout(r,200));try{process.kill(runtime.pid)}catch{}}catch{}
  rmSync(root,{recursive:true,force:true})
 })
 const a=open(),b=open();await Promise.all([a.rpc('initialize'),b.rpc('initialize')])
 const first=await until(s=>s.running);assert.equal(first.desktopInstance,desktopInstanceId(env));assert.equal(readFileSync(starts,'utf8').trim().split('\n').length,1)
 const c=open('fixture-owner-b');await c.rpc('initialize')
 const second=await until(s=>s.running&&s.desktopInstance===desktopInstanceId({CODEX_APP_TOOLS_PIPE_PATH:'fixture-owner-b'}));assert.notEqual(second.pid,first.pid)
 await c.rpc('tools/call',{name:'gateway_stop',arguments:{}});await until(s=>!s.running)
 const d=open('fixture-owner-b');await d.rpc('initialize');await new Promise(r=>setTimeout(r,250))
 assert.equal((await health()).running,false);assert.equal(JSON.parse(readFileSync(join(folder,'autostart.json'))).enabled,false)
 await d.rpc('tools/call',{name:'gateway_start',arguments:{}})
 assert.equal((await health()).running,true);assert.equal(JSON.parse(readFileSync(join(folder,'autostart.json'))).enabled,true)
 d.child.stdin.end();await new Promise(r=>setTimeout(r,100));assert.equal((await health()).running,true)
 const e=open('fixture-owner-b');await e.rpc('initialize')
 await e.rpc('tools/call',{name:'gateway_stop',arguments:{}});await until(s=>!s.running)
 writeFileSync(join(folder,'config.json'),JSON.stringify({port,exposeLan:true,publicUrl:`http://192.168.1.10:${port}/backends/codex`}))
 await e.rpc('tools/call',{name:'gateway_start',arguments:{exposeLan:true}})
 const lan=await health();assert.equal(lan.host,'0.0.0.0');assert.equal(lan.publicUrl,`http://192.168.1.10:${port}/backends/codex`)
 assert.equal(JSON.parse(readFileSync(join(folder,'bootstrap.json'))).exposeLan,true)
})
