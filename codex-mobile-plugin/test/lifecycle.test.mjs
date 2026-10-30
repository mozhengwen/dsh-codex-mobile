import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {AutoStarter,LifecycleState,desktopInstanceId} from '../lib/lifecycle.mjs'
test('automatic startup retries desktop warm-up without blocking and cancels retries on shutdown',async()=>{
 let calls=0;const auto=new AutoStarter(async()=>{if(++calls<3)throw Error('warming')},{delays:[5]})
 auto.resume({threadId:'caller'});auto.resume()
 for(let i=0;i<100&&calls<3;i++)await new Promise(r=>setTimeout(r,5))
 assert.equal(calls,3);await auto.close();auto.resume();await new Promise(r=>setTimeout(r,10));assert.equal(calls,3)
})
test('startup preferences persist and simultaneous MCP sessions share one launch lock',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mobile-lifecycle-'));const a=new LifecycleState(root),b=new LifecycleState(root)
 try{
  assert.equal(a.enabled(),true);a.enable(false);assert.equal(b.enabled(),false);b.enable(true);assert.equal(a.enabled(),true)
  a.write('bootstrap.json',{threadId:'saved',port:47822});assert.equal(b.bootstrap().threadId,'saved')
  let active=0,max=0
  await Promise.all([a,b].map(state=>state.locked(async()=>{max=Math.max(max,++active);await new Promise(r=>setTimeout(r,20));active--})))
  assert.equal(max,1);assert.equal(existsSync(join(root,'launch.lock')),false)
  a.write('launch.lock',{pid:2147483647});assert.equal(await b.locked(async()=>true),true)
  assert.notEqual(desktopInstanceId({CODEX_APP_TOOLS_PIPE_PATH:'a'}),desktopInstanceId({CODEX_APP_TOOLS_PIPE_PATH:'b'}))
 }finally{rmSync(root,{recursive:true})}
})
