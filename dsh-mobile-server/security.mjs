import {isIP} from 'node:net'
import {timingSafeEqual} from 'node:crypto'
export const isLoopback=ip=>ip==='::1'||/^(::ffff:)?127\./.test(ip||'')
export function clientIp(req){const forwarded=req.headers['x-real-ip'];return isLoopback(req.socket.remoteAddress)&&typeof forwarded==='string'&&isIP(forwarded)?forwarded:req.socket.remoteAddress||'unknown'}
export function allowedOrigin(req){
 const origin=req.headers.origin
 if(origin===undefined)return true
 if(typeof origin!=='string'||origin==='null')return false
 try{const url=new URL(origin),secure=req.socket.encrypted||(isLoopback(req.socket.remoteAddress)&&req.headers['x-forwarded-proto']==='https');return url.origin===`${secure?'https':'http'}://${req.headers.host}`&&origin===url.origin}catch{return false}
}
export function sameSecret(supplied,expected){if(typeof expected!=='string'||!expected||typeof supplied!=='string')return false;const a=Buffer.from(supplied),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)}
export function hasDeviceCookie(req){return typeof req.headers.cookie==='string'&&req.headers.cookie.split(';').some(part=>/^dsh_mobile_session=.+$/.test(part.trim()))}
export function controlPath(path){
 let decoded=path
 for(let i=0;i<5;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next}
 if(/[\u0000-\u001f\u007f]/.test(decoded))throw new Error('invalid-path')
 const canonical=new URL(decoded.replaceAll('\\','/').replace(/\/+/g,'/'),'http://relay').pathname
 return ['/dsh-mobile/api','/_codex-mobile'].some(prefix=>canonical===prefix||canonical.startsWith(prefix+'/'))
}
export function secureCookie(value,backend){
 if(typeof value!=='string'||!value.startsWith('dsh_mobile_session='))return value
 const parts=value.split(';').filter((part,index)=>index===0||!/^\s*(secure|httponly|path|samesite)(?:\s*=|\s*$)/i.test(part))
 return parts.join(';')+`; Path=${backend==='codex'?'/backends/codex':'/'}; Secure; HttpOnly; SameSite=Strict`
}
export class RateLimiter{
 constructor({now=Date.now,maxKeys=4096}={}){this.now=now;this.maxKeys=maxKeys;this.entries=new Map()}
 allow(key,max,windowMs){
  const now=this.now();let entry=this.entries.get(key)
  if(!entry||entry.until<=now){if(this.entries.size>=this.maxKeys){for(const[k,v]of this.entries)if(v.until<=now)this.entries.delete(k);if(this.entries.size>=this.maxKeys&&!entry)return false}entry={count:0,until:now+windowMs};this.entries.set(key,entry)}
  return ++entry.count<=max
 }
}
