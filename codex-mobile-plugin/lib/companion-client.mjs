import {spawn} from 'node:child_process'
import {readFileSync,openSync,closeSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {LifecycleState,runtimeRoot,desktopInstanceId} from './lifecycle.mjs'
import {gatewayOptions} from './network-config.mjs'

const root=runtimeRoot(process.env),lifecycle=new LifecycleState(root)
const pluginVersion=JSON.parse(readFileSync(new URL('../plugin.json',import.meta.url),'utf8')).version
async function runtimeRequest(path='/health',method='GET',body){
  const runtime=JSON.parse(readFileSync(join(root,'runtime.json'),'utf8'))
  const response=await fetch(`http://127.0.0.1:${runtime.port}${path}`,{method,headers:{authorization:`Bearer ${runtime.adminSecret}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(3000)})
  if(!response.ok)throw new Error('手机网关不可用')
  const value=await response.json()
  if(path==='/health'&&value.service!=='codex-mobile-plugin')throw new Error('端口被其他服务占用')
  return value
}
export async function companionStatus(){try{return await runtimeRequest()}catch{return{running:false}}}
export const autostartEnabled=()=>lifecycle.enabled()
const current=status=>status.running&&status.adminProtocol===1&&status.version===pluginVersion&&status.desktopInstance===desktopInstanceId(process.env)
export async function startCompanion(args={},context={}, {automatic=false}={}){
  if(automatic&&(!lifecycle.enabled()||!process.env.CODEX_APP_TOOLS_PIPE_PATH))return{running:false,skipped:true}
  if(!automatic)lifecycle.enable(true)
  return lifecycle.locked(async()=>{
    if(!lifecycle.enabled())return{running:false,skipped:true}
    const bootstrap=lifecycle.bootstrap()
    context={...context,threadId:context.threadId||bootstrap.threadId}
    if(!context.threadId){if(automatic)return{running:false,skipped:true};throw new Error('首次启动需要在本地 Codex 聊天中打开一次手机远控，之后会自动恢复')}
    const config=lifecycle.read('config.json',{})
    const {port,exposeLan}=gatewayOptions(config,bootstrap,args)
    lifecycle.write('bootstrap.json',{threadId:context.threadId,port,exposeLan})
    const status=await companionStatus()
    if(current(status)&&port===status.port&&status.host===(exposeLan?'0.0.0.0':'127.0.0.1')){
      try{await runtimeRequest('/_codex-mobile/desktop/check','POST');return status}catch{}
    }
    if(status.running){await runtimeRequest('/_codex-mobile/stop','POST',{manual:false});await new Promise(resolve=>setTimeout(resolve,400))}
    const log=openSync(join(root,'companion.log'),'a',0o600)
    let child
    try{child=spawn(process.execPath,[fileURLToPath(new URL('../companion.mjs',import.meta.url))],{detached:true,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,CODEX_THREAD_ID:context.threadId,CODEX_MOBILE_PORT:String(port),CODEX_MOBILE_EXPOSE_LAN:String(exposeLan)}})}finally{closeSync(log)}
    let launchError;child.on('error',error=>{launchError=error});child.unref()
    const deadline=Date.now()+20000
    while(Date.now()<deadline){
      if(launchError)throw launchError
      await new Promise(resolve=>setTimeout(resolve,250))
      const value=await companionStatus()
      if(current(value)){
        if(!lifecycle.enabled()){await runtimeRequest('/_codex-mobile/stop','POST');return{running:false,skipped:true}}
        return value
      }
      if(child.exitCode!=null)break
    }
    throw new Error(`手机网关启动失败，请查看 ${join(root,'companion.log')}`)
  })
}
export const companionPairing=()=>runtimeRequest('/_codex-mobile/pairing')
export const companionPanel=async()=>({...await runtimeRequest('/_codex-mobile/panel'),autostartEnabled:lifecycle.enabled()})
export const refreshPairing=()=>runtimeRequest('/_codex-mobile/pairing/refresh','POST')
export const revokeDevice=deviceId=>runtimeRequest('/_codex-mobile/devices/revoke','POST',{deviceId})
export async function stopCompanion(){
  lifecycle.enable(false)
  return lifecycle.locked(async()=>{if(!(await companionStatus()).running)return{running:false};return runtimeRequest('/_codex-mobile/stop','POST')})
}
