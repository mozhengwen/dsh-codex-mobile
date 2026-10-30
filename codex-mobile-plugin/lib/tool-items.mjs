export const toolTypes=new Set(['commandExecution','mcpToolCall','dynamicToolCall','fileChange','imageView','webSearch','collabAgentToolCall','imageGeneration','contextCompaction','worktreeInit','subAgentActivity','todo-list'])
export const safeString=value=>(typeof value==='string'?value:value==null?'':JSON.stringify(value,(key,value)=>key==='_meta'||(key==='data'&&typeof value==='string'&&value.length>2000)?undefined:value)).slice(0,128000)
export const toolResult=value=>Array.isArray(value?.content)?value.content.map(part=>part.type==='text'?part.text:part.type==='image'?'[图片]':part.type==='audio'?'[音频]':safeString(part)).join('\n').slice(0,128000):safeString(value)
export function cleanWebAction(action){
 if(!action||typeof action!=='object')return{}
 return Object.fromEntries(['type','query','queries','url','pattern'].filter(key=>action[key]!=null).map(key=>[key,Array.isArray(action[key])?action[key].slice(0,20).map(v=>safeString(v).slice(0,4000)):safeString(action[key]).slice(0,12000)]))
}
export function cleanTool(item){
 const tool={type:item.type,id:item.id,command:safeString(item.command),arguments:safeString(item.arguments??item.changes),aggregatedOutput:toolResult(item.aggregatedOutput??item.output),result:toolResult(item.result),error:safeString(item.error),exitCode:item.exitCode,status:item.status,tool:item.tool||item.type}
 if(item.type==='webSearch'){tool.query=safeString(item.query);tool.action=cleanWebAction(item.action)}
 else if(item.type==='imageView')tool.arguments=safeString(item.path)
 else if(item.type==='collabAgentToolCall'){tool.arguments=safeString({action:item.tool,threadIds:item.receiverThreads,prompt:item.prompt,model:item.model});tool.result=safeString(Object.fromEntries(Object.entries(item.agentsStates||{}).map(([id,state])=>[id,typeof state==='string'?state:{status:state?.status}])))}
 else if(item.type==='subAgentActivity'){tool.arguments=safeString({agent:item.agentPath,threadId:item.agentThreadId});tool.result=safeString(item.kind)}
 else if(item.type==='imageGeneration'){tool.arguments=safeString(item.revisedPrompt);tool.result=typeof item.src==='string'&&item.src.startsWith('data:')?'[图片已生成]':safeString(item.src||item.status)}
 else if(item.type==='contextCompaction')tool.arguments=safeString(item.source)
 else if(item.type==='todo-list'){tool.arguments=safeString(item.explanation);tool.result=safeString(item.plan)}
 return tool
}
export function publicTool(item,{running=false}={}){
 let toolName=item.type==='commandExecution'?'terminal':({imageView:'查看图片',collabAgentToolCall:'子任务',imageGeneration:'生成图片',contextCompaction:'压缩上下文',worktreeInit:'准备工作区',subAgentActivity:'子任务活动','todo-list':'执行计划'})[item.type]||item.tool
 let args=item.command||item.arguments||''
 if(item.type==='webSearch'){
  toolName=({openPage:'打开网页',open_page:'打开网页',open:'打开网页',findInPage:'查找网页',find_in_page:'查找网页',find:'查找网页'})[item.action?.type]||'搜索网页'
  args=safeString({...(item.query?{query:item.query}:{}),...item.action})
 }
 const failed=['failed','error','errored'].includes(item.status)||item.exitCode>0||Boolean(item.error)
 const active=['inProgress','in_progress','running','searching','pending'].includes(item.status)||(!item.status&&running)
 const output=item.aggregatedOutput||item.result||''
 return{toolName,args:args.slice(0,12000),result:output.length>24000?'…（输出较长，显示末尾 24000 字符）\n'+output.slice(-24000):output,error:item.error||undefined,status:failed?'error':active?'running':'ok'}
}
