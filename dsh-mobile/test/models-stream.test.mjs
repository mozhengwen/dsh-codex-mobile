import test from 'node:test'
import assert from 'node:assert/strict'
import {MobileBridge} from '../lib/mobile-bridge.js'
import {SessionView} from '../lib/session-view.js'
test('DSH restores compact live text on entry and continues deltas without replaying committed text',()=>{
 const view=new SessionView()
 view.loadLiveAttempt({stream:[{type:'text-chunks',texts:['你','好']},{type:'reasoning-chunks',texts:['summary']}]})
 assert.equal(view.live.text,'你好')
 assert.equal(view.applyStreamFrame({type:'chunk',chunk:{type:'text-delta',text:'！'}})[0].text,'！')
 assert.equal(view.live.text,'你好！')
 assert.deepEqual(view.applyStreamFrame({type:'end',outcome:{kind:'committed'}}),[])
 assert.equal(view.live.text,'你好！')
 const frames=view.applyEvent({type:'assistant/message',seq:1,data:{message:{content:[{type:'text',text:'你好！'}]}}})
 assert.equal(frames[0].item.text,'你好！');assert.equal(view.live.text,'')
})
test('DSH model selection uses desktop catalog efforts and current next-request projection',async()=>{
 const controller={
 async modelCatalog(){return{default:{provider:'p',model:'m'},groups:[{id:'p',name:'Provider',models:[{id:'m',name:'Model',reasoning:{efforts:[{id:'high',name:'高'}]}}]}]}},
 async *follow(){yield{type:'snapshot',projections:{values:{modelSelection:{next:{provider:'p',model:'m',reasoningEffort:'high'}}}}}},
 async selectModel(selection){return{selected:selection}}
 }
 const bridge=new MobileBridge({ctx:{sessionController:controller,get(){}}})
 assert.equal((await bridge.modelSettings('s')).selected.reasoningEffort,'high')
 assert.equal((await bridge.selectModel('s',{provider:'p',model:'m',reasoningEffort:'high'})).selected.model,'m')
 await assert.rejects(bridge.selectModel('s',{provider:'p',model:'m',reasoningEffort:'ultra'}),/不支持/)
})
