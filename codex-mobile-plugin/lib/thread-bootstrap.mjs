import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {existsSync,readdirSync,statSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'
import {randomUUID} from 'node:crypto'
function kernelPath(){
 const root=join(process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'),'OpenAI','Codex','bin')
 const paths=readdirSync(root).map(v=>join(root,v,'codex.exe')).filter(existsSync).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs)
 if(!paths.length)throw new Error('找不到桌面内置 Codex 内核')
 return paths[0]
}
// Bootstrap a blank local thread only. No model turn is ever run by this helper.
// The process closes before the existing desktop resumes ownership.
export async function bootstrapThread({cwd,model,modelProvider}){
 const directory=cwd||join(homedir(),'Documents','Codex','Mobile',randomUUID())
 if(!cwd)mkdirSync(directory,{recursive:true})
 const child=spawn(kernelPath(),['app-server','--listen','stdio://'],{windowsHide:true,env:process.env,stdio:['pipe','pipe','pipe']})
 const lines=createInterface({input:child.stdout}),pending=new Map();let sequence=0
 const fail=error=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear()}
 child.stderr.on('data',()=>{});child.stdin.on('error',fail);child.on('error',fail);child.on('exit',()=>fail(new Error('会话初始化进程已退出')))
 lines.on('line',line=>{let m;try{m=JSON.parse(line)}catch{return};const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)})
 const request=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('初始化桌面会话超时'))},20000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')})
 try{
  await request('initialize',{clientInfo:{name:'codex-mobile-native',version:'0.5.1'},capabilities:{experimentalApi:true}})
  child.stdin.write('{"jsonrpc":"2.0","method":"initialized"}\n')
  const result=await request('thread/start',{cwd:directory,...(model?{model}:{}),...(modelProvider?{modelProvider}:{})})
  if(!result.thread?.id)throw new Error('桌面内核未返回会话 ID')
  await request('thread/name/set',{threadId:result.thread.id,name:'新任务'})
  return {threadId:result.thread.id,hostId:'local',cwd:directory}
 }finally{
  lines.close();fail(new Error('初始化结束'))
  if(child.exitCode==null){
   await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve()},2000);child.once('exit',()=>{clearTimeout(timer);resolve()});child.stdin.end()})
  }
 }
}
