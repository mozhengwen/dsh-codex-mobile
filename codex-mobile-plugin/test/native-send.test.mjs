import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import {randomUUID} from 'node:crypto'
import {CoordinationClient} from '../lib/coordination.mjs'
test('phone prompts use native turn/steer input and native images, without cross-chat tool attribution',async t=>{
 const endpoint='\\\\.\\pipe\\codex-mobile-native-test-'+randomUUID(),requests=[]
 const server=net.createServer(socket=>{let bytes=Buffer.alloc(0);socket.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);while(bytes.length>=4&&bytes.length>=4+bytes.readUInt32LE(0)){
  const n=bytes.readUInt32LE(0),request=JSON.parse(bytes.subarray(4,n+4));bytes=bytes.subarray(n+4);requests.push(request)
  let result={accepted:true};if(request.method==='initialize')result={clientId:'phone-client'};if(request.method==='thread-follower-read-model-settings')result={settings:{model:'m',reasoningEffort:'high'}};if(request.method==='thread-follower-update-thread-settings')result={applied:true}
  const body=Buffer.from(JSON.stringify({type:'response',requestId:request.requestId,resultType:'success',result,handledByClientId:'desktop-owner'})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);socket.write(Buffer.concat([header,body]))
 }})})
 await new Promise(resolve=>server.listen(endpoint,resolve));const client=new CoordinationClient({endpoint})
 t.after(async()=>{client.close();await new Promise(resolve=>server.close(resolve))})
 const result=await client.sendPrompt('task','local','你好',[{mimeType:'image/png',bytes:Buffer.from('test')}],{cwd:'D:\\project',running:false})
 const start=requests.find(r=>r.method==='thread-follower-start-turn')
 assert.equal(start.version,2);assert.equal(start.params.turnStart.request.input[0].text,'你好');assert.equal(start.params.turnStart.request.input[1].type,'image');assert.match(start.params.turnStart.request.input[1].url,/^data:image\/png;base64,/)
 assert.equal(start.params.turnStart.context.restoreMessage.id,result.clientUserMessageId)
 assert.equal(JSON.stringify(start).includes('app_tool_send_message'),false);assert.equal(JSON.stringify(start).includes('view_image'),false)
 await client.sendPrompt('task','local','继续',[],{running:true});assert.equal(requests.find(r=>r.method==='thread-follower-steer-turn').version,1)
 await client.setModelSettings('task','local',{model:'m',reasoningEffort:'high'});assert.deepEqual(requests.find(r=>r.method==='thread-follower-update-thread-settings').params.threadSettings,{model:'m',reasoningEffort:'high'})
})
