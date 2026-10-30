// Keep a wire checkpoint. History polling reconciles membership, rather than
// serializing megabytes of unchanged history onto the phone every two seconds.
export class ConversationPublisher {
 constructor(send,{textAppend=false,intervalMs=40}={}){this.send=send;this.textAppend=textAppend;this.intervalMs=intervalMs;this.items=new Map();this.order=[];this.pending=new Map();this.baseline=false;this.closed=false}
 offer(item){
  if(this.closed)return
  if(!this.items.has(item.id)){this.flush();this.emit(item);return}
  this.pending.set(item.id,item)
  if((item.kind==='assistant'&&!item.streaming)||(item.kind==='tool'&&['ok','error'].includes(item.status)))this.flush()
  else if(!this.timer){this.timer=setTimeout(()=>this.flush(),this.intervalMs);this.timer.unref?.()}
 }
 emit(item){
  const previous=this.items.get(item.id)
  if(!previous){this.send({type:'item',item});this.items.set(item.id,item);this.order.push(item.id);return}
  const patch={}
  for(const [key,value]of Object.entries(item))if(key!=='id'&&JSON.stringify(previous[key])!==JSON.stringify(value))patch[key]=value
  if(!Object.keys(patch).length)return
  if(this.textAppend&&typeof patch.text==='string'&&typeof previous.text==='string'&&patch.text.startsWith(previous.text)){
   patch.textAppend=patch.text.slice(previous.text.length);patch.baseLength=previous.text.length;delete patch.text
  }
  this.send({type:'item-update',id:item.id,patch});this.items.set(item.id,item)
 }
 flush(){clearTimeout(this.timer);this.timer=null;for(const item of this.pending.values())this.emit(item);this.pending.clear()}
 checkpoint(snapshot,{force=false}={}){
  if(this.closed)return
  const {items,running,...meta}=snapshot,signature=JSON.stringify(meta),ids=items.map(i=>i.id)
  const appendOnly=this.order.length<=ids.length&&this.order.every((id,index)=>id===ids[index])
  if(!this.baseline||force||signature!==this.metadata||!appendOnly){
   clearTimeout(this.timer);this.timer=null;this.pending.clear()
   this.send(snapshot);this.items=new Map(items.map(i=>[i.id,i]));this.order=ids;this.baseline=true;this.metadata=signature;this.running=running;return
  }
  for(const item of items)this.pending.set(item.id,item)
  this.flush()
  if(running!==this.running){this.send({type:'status',running});this.running=running}
 }
 close(){this.closed=true;clearTimeout(this.timer);this.pending.clear()}
}
