import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {WebSocket} from 'ws'
import {allowedOrigin,clientIp,controlPath,hasDeviceCookie,secureCookie,RateLimiter} from '../security.mjs'
test('origin matching, exact cookies, decoded control routes and bounded IP limits',()=>{
 const req={headers:{host:'dsh.example',origin:'https://dsh.example','x-forwarded-proto':'https','x-real-ip':'198.51.100.1'},socket:{remoteAddress:'127.0.0.1'}}
 assert.equal(allowedOrigin(req),true);assert.equal(clientIp(req),'198.51.100.1')
 assert.equal(allowedOrigin({...req,headers:{...req.headers,origin:'https://dsh.example.attacker.invalid'}}),false)
 assert.equal(allowedOrigin({...req,headers:{...req.headers,origin:'null'}}),false)
 assert.equal(hasDeviceCookie({headers:{cookie:'not_dsh_mobile_session=forged'}}),false)
 assert.equal(hasDeviceCookie({headers:{cookie:'dsh_mobile_session='}}),false)
 for(const path of ['/dsh-mobile/api','/dsh-mobile/%61pi/state','/_codex-mobile%2fpairing','/%255fcodex-mobile/panel'])assert.equal(controlPath(path),true)
 assert.equal(controlPath('/mobile/api/sessions'),false)
 const cookie=secureCookie('dsh_mobile_session=value; Path=/; SameSite=Lax','codex')
 assert.match(cookie,/Path=\/backends\/codex/);assert.match(cookie,/Secure; HttpOnly; SameSite=Strict/)
 let now=0;const limiter=new RateLimiter({now:()=>now,maxKeys:2})
 assert.equal(limiter.allow('a',1,100),true);assert.equal(limiter.allow('a',1,100),false);assert.equal(limiter.allow('b',1,100),true);assert.equal(limiter.allow('c',1,100),false);now=101;assert.equal(limiter.allow('c',1,100),true)
})
test('public relay authenticates websocket upgrades, blocks cross-site requests and hardens cookies',{timeout:20000},async t=>{
 const allocator=http.createServer();await new Promise(r=>allocator.listen(0,'127.0.0.1',r));const port=allocator.address().port;await new Promise(r=>allocator.close(r))
 const base=`http://127.0.0.1:${port}`,socketBase=base.replace('http:','ws:'),sockets=[]
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),windowsHide:true,env:{...process.env,PORT:String(port),DSH_PLUGIN_TOKEN:'fixture-dsh-relay-token-for-tests-only',CODEX_PLUGIN_TOKEN:'fixture-codex-relay-token-for-tests-only'},stdio:'ignore'})
 t.after(async()=>{for(const s of sockets)s.terminate();const done=once(child,'exit');child.kill();await done})
 for(let n=0;n<100;n++){try{if((await fetch(base+'/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,30))}
 for(const backend of ['dsh','codex']){
  const plugin=new WebSocket(socketBase+'/plugin?backend='+backend,{headers:{authorization:`Bearer fixture-${backend}-relay-token-for-tests-only`}});sockets.push(plugin)
  plugin.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='http-request'){
   const pair=m.path==='/pair',valid=pair||m.headers.cookie==='dsh_mobile_session=valid'
   plugin.send(JSON.stringify({type:'http-response',id:m.id,status:valid?(pair?302:200):401,headers:pair?{'set-cookie':['dsh_mobile_session=valid; Path=/; HttpOnly; SameSite=Lax'],location:'/'}:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({ok:valid})).toString('base64')}))
  }if(m.type==='ws-open'){plugin.send(JSON.stringify({type:'ws-open-ok',id:m.id}));plugin.send(JSON.stringify({type:'ws-down',id:m.id,text:'{"type":"ready"}'}))}})
  await once(plugin,'open')
 }
 assert.equal((await fetch(base+'/mobile/api/sessions')).status,401)
 assert.equal((await fetch(base+'/mobile/api/ping',{headers:{cookie:'dsh_mobile_session=valid',origin:'https://attacker.invalid'}})).status,403)
 const denied=await new Promise(resolve=>{const ws=new WebSocket(socketBase+'/mobile/ws',{headers:{cookie:'dsh_mobile_session=forged'}});sockets.push(ws);ws.on('open',()=>resolve(101));ws.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode)});ws.on('error',()=>{})})
 assert.equal(denied,401)
 const evil=await new Promise(resolve=>{const ws=new WebSocket(socketBase+'/mobile/ws',{headers:{cookie:'dsh_mobile_session=valid',origin:'https://attacker.invalid'}});sockets.push(ws);ws.on('open',()=>resolve(101));ws.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode)});ws.on('error',()=>{})})
 assert.equal(evil,403)
 const valid=new WebSocket(socketBase+'/backends/codex/mobile/ws',{headers:{cookie:'dsh_mobile_session=valid'}});sockets.push(valid);await once(valid,'open')
 const pair=await fetch(base+'/backends/codex/pair',{method:'POST',redirect:'manual',body:'code=fixture'})
 assert.equal(pair.status,302);assert.match(pair.headers.get('set-cookie'),/Secure/);assert.match(pair.headers.get('set-cookie'),/Path=\/backends\/codex/);assert.equal(pair.headers.get('location'),'/backends/codex/')
 for(const path of ['/dsh-mobile/%61pi/state','/backends/codex/%5fcodex-mobile/pairing'])assert.equal((await fetch(base+path,{headers:{cookie:'dsh_mobile_session=valid'}})).status,404)
 const health=await fetch(base+'/health').then(r=>r.json());assert.equal(health.backends,undefined);assert.equal(health.connections,undefined)
 assert.equal((await fetch(base+'/dsh-mobile/app.apk')).status,404)
 const raw=await new Promise(resolve=>{const s=net.connect(port,'127.0.0.1'),parts=[];s.on('connect',()=>s.write('GET http://[ HTTP/1.1\r\nHost: local\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));s.on('data',d=>parts.push(d));s.on('close',()=>resolve(Buffer.concat(parts).toString()))})
 assert.match(raw,/400/);assert.equal((await fetch(base+'/health')).status,200)
})

