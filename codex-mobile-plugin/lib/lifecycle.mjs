import {createHash,randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,statSync,renameSync} from 'node:fs'
import {join} from 'node:path'
import {homedir} from 'node:os'

export const runtimeRoot = env => join(env.CODEX_HOME || join(homedir(), '.codex'), 'codex-mobile')
export const desktopInstanceId = env => env.CODEX_APP_TOOLS_PIPE_PATH ? createHash('sha256').update(env.CODEX_APP_TOOLS_PIPE_PATH).digest('hex').slice(0,32) : null

export class LifecycleState {
  constructor(root=runtimeRoot(process.env)){this.root=root}
  read(name,fallback){try{return JSON.parse(readFileSync(join(this.root,name),'utf8'))}catch{return fallback}}
  write(name,value){
    mkdirSync(this.root,{recursive:true,mode:0o700})
    const path=join(this.root,name),temp=path+'.'+randomUUID()+'.tmp'
    writeFileSync(temp,JSON.stringify(value),{mode:0o600})
    try{renameSync(temp,path)}finally{try{unlinkSync(temp)}catch{}}
  }
  enabled(){return this.read('autostart.json',{}).enabled!==false}
  enable(enabled){this.write('autostart.json',{enabled})}
  bootstrap(){return this.read('bootstrap.json',{})}
  async locked(action,{timeoutMs=35000}={}){
    mkdirSync(this.root,{recursive:true,mode:0o700})
    const path=join(this.root,'launch.lock'),deadline=Date.now()+timeoutMs
    let acquired=false
    while(!acquired){
      try{const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify({pid:process.pid}))}finally{closeSync(fd)};acquired=true}
      catch(error){
        if(error.code!=='EEXIST')throw error
        let stale=false
        try{const owner=JSON.parse(readFileSync(path,'utf8'));if(!Number.isInteger(owner.pid)||owner.pid<=0)stale=Date.now()-statSync(path).mtimeMs>2000;else try{process.kill(owner.pid,0)}catch(e){stale=e.code==='ESRCH'}}catch{try{stale=Date.now()-statSync(path).mtimeMs>2000}catch{}}
        if(stale){try{unlinkSync(path)}catch{};continue}
        if(Date.now()>=deadline)throw new Error('手机网关正在启动，请稍后重试')
        await new Promise(resolve=>setTimeout(resolve,100))
      }
    }
    try{return await action()}finally{try{unlinkSync(path)}catch{}}
  }
}

export class AutoStarter {
  constructor(start,{delays=[1000,2000,5000,10000,30000],log=()=>{}}={}){this.start=start;this.delays=delays;this.log=log;this.context={};this.attempt=0;this.closed=false}
  resume(context={}){
    if(this.closed)return
    if(context.threadId)this.context=context
    if(this.pending||this.timer)return
    this.timer=setTimeout(()=>{this.timer=null;this.run()},0);this.timer.unref?.()
  }
  run(){
    if(this.closed||this.pending)return
    this.pending=Promise.resolve().then(()=>this.start(this.context)).catch(error=>{
      this.log(error)
      if(!this.closed){const delay=this.delays[Math.min(this.attempt++,this.delays.length-1)];this.timer=setTimeout(()=>{this.timer=null;this.run()},delay);this.timer.unref?.()}
    }).finally(()=>{this.pending=null})
  }
  cancel(){clearTimeout(this.timer);this.timer=null;this.attempt=0}
  async close(){this.closed=true;this.cancel();await this.pending}
}
