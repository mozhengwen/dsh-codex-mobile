import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir, networkInterfaces} from 'node:os'
import {join} from 'node:path'
import {once} from 'node:events'
import {createRequire} from 'node:module'
import {MobileGateway} from '../lib/gateway.mjs'
import {gatewayOptions} from '../lib/network-config.mjs'
const {WebSocket}=createRequire(import.meta.url)('../vendor/ws')

test('LAN requires an explicit backend address and cannot accidentally enable the public relay',()=>{
  assert.equal(gatewayOptions().exposeLan,false)
  assert.throws(()=>gatewayOptions({exposeLan:true}),/publicUrl/)
  assert.throws(()=>gatewayOptions({exposeLan:true,publicUrl:'http://192.168.1.10:47822'}),/publicUrl/)
  assert.throws(()=>gatewayOptions({exposeLan:true,publicUrl:'http://192.168.1.10:47822/backends/codex',relayToken:'example'}),/中继/)
  assert.deepEqual(gatewayOptions({exposeLan:true,publicUrl:'http://192.168.1.10:47822/backends/codex'}),{port:47822,exposeLan:true})
})

test('direct LAN uses the Android backend prefix for pairing, API, images and WebSocket; admin stays local',async t=>{
  const root=mkdtempSync(join(tmpdir(),'mobile-lan-'))
  const gateway=new MobileGateway({stateFile:join(root,'state.json'),adminSecret:'fixture-admin',desktop:{async call(){return{threads:[]}}},control:{close(){}}})
  const status=await gateway.start({port:0,exposeLan:true})
  t.after(async()=>{await gateway.close();rmSync(root,{recursive:true,force:true})})
  const base=status.baseUrl+'/backends/codex'
  assert.equal((await fetch(base+'/mobile/api/ping')).status,401)
  const pair=await fetch(base+'/pair',{method:'POST',redirect:'manual',body:new URLSearchParams({code:gateway.pairing().code})})
  assert.equal(pair.status,302)
  assert.match(pair.headers.get('set-cookie'),/Path=\/backends\/codex;/)
  const headers={cookie:pair.headers.get('set-cookie').split(';')[0]}
  assert.equal((await fetch(base+'/mobile/api/ping',{headers})).status,200)
  // Larger than the ordinary JSON body limit; verify prefixed image requests use the image limit.
  const image={name:'test.jpg',mimeType:'image/jpeg',data:Buffer.from([255,216,255,...new Array(270000).fill(0)]).toString('base64')}
  const uploaded=await fetch(base+'/mobile/api/uploads',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(image)})
  assert.equal(uploaded.status,200)
  const attachment=(await uploaded.json()).attachment
  assert.equal((await fetch(base+attachment.url,{headers})).status,200)
  const ws=new WebSocket(base.replace('http:','ws:')+'/mobile/ws',{headers})
  t.after(()=>ws.terminate())
  await once(ws,'open')
  const pong=new Promise(resolve=>ws.on('message',raw=>{if(JSON.parse(String(raw)).type==='pong')resolve()}))
  ws.send(JSON.stringify({type:'ping'}));await pong
  const address=Object.values(networkInterfaces()).flat().find(x=>x.family==='IPv4'&&!x.internal)?.address
  if(address) assert.equal((await fetch(`http://${address}:${status.port}/_codex-mobile/panel`,{headers:{authorization:'Bearer fixture-admin'}})).status,403)
})
