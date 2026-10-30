import {existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, lstatSync, copyFileSync} from 'node:fs'
import {join, dirname, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {deflateRawSync} from 'node:zlib'

const root=dirname(dirname(fileURLToPath(import.meta.url)))
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
const output=join(root,'.release',`dsh-codex-mobile-source-${stamp}`)
// Only these reviewed source components are exported. Do not export the workspace root.
const entries=['README.md','LICENSE','SECURITY.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','.gitignore','.gitleaks.toml',
  '.agents/plugins/marketplace.json','docs','scripts','dsh-mobile','codex-mobile-plugin','dsh-mobile-server','dsh-mobile-android']
const generated=new Set(['node_modules','build','.gradle','.kotlin','.idea','.git'])
const files=[]
function copy(path){
  const rel=relative(root,path).split(sep).join('/')
  const stat=lstatSync(path)
  if(stat.isSymbolicLink())throw Error(`Refusing symbolic link: ${rel}`)
  if(stat.isDirectory()){
    if(generated.has(path.split(sep).at(-1)))return
    if(/^(?:dsh-mobile|codex-mobile-plugin)\/docs$/.test(rel)||rel==='dsh-mobile-server/site')return
    for(const child of readdirSync(path).sort())copy(join(path,child))
    return
  }
  if(!stat.isFile())throw Error(`Refusing special file: ${rel}`)
  if(/\.(?:apk|aab|log)$/i.test(rel)||rel.endsWith('/local.properties')||rel==='dsh-mobile-server/deploy/nginx-apex.conf')return
  if(/\.(?:jks|keystore|p12|pfx|pem|key)$/i.test(rel)||/(^|\/)(?:\.env(?:\..*)?|[^/]+\.env|config\.json|runtime\.json|bootstrap\.json|state\.json|signing\.properties|key\.properties)$/.test(rel)&&!rel.endsWith('.example'))throw Error(`Private file blocks export: ${rel}`)
  if(stat.size>8*1024*1024)throw Error(`Unexpected large source file: ${rel}`)
  const destination=join(output,rel)
  if(!resolve(destination).startsWith(resolve(output)+sep))throw Error('Invalid export path')
  mkdirSync(dirname(destination),{recursive:true})
  copyFileSync(path,destination)
  files.push(rel)
}
mkdirSync(output,{recursive:true})
try {
  for(const entry of entries){if(!existsSync(join(root,entry)))throw Error(`Missing source entry: ${entry}`);copy(join(root,entry))}
  const scan=spawnSync(process.execPath,[join(output,'scripts/check-publishable-secrets.mjs')],{
    env:{...process.env,...(!process.env.GITLEAKS_BIN&&existsSync(join(root,'.tools/gitleaks/8.30.1/gitleaks.exe'))?{GITLEAKS_BIN:join(root,'.tools/gitleaks/8.30.1/gitleaks.exe')}:{})},
    stdio:'inherit',windowsHide:true
  })
  if(scan.error||scan.status!==0)throw Error('Export scan failed; no archive was created')
  files.sort()
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
  writeFileSync(join(output,'SOURCE-MANIFEST.sha256'),files.map(file=>`${digest(readFileSync(join(output,file)))}  ${file}`).join('\n')+'\n')
  files.push('SOURCE-MANIFEST.sha256')
  // Portable ZIP writer: includes dotfiles without depending on shell-specific archive behavior.
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0})
  const crc32=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
  const chunks=[],central=[];let offset=0,centralSize=0
  for(const file of files){
    const name=Buffer.from(file),data=readFileSync(join(output,file)),compressed=deflateRawSync(data),crc=crc32(data)
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(name.length,26)
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(33,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42)
    chunks.push(header,name,compressed);central.push(record,name);offset+=header.length+name.length+compressed.length;centralSize+=record.length+name.length
  }
  if(files.length>=65535||offset>=0xffffffff)throw Error('Source archive exceeds ZIP limits')
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16)
  const archive=output+'.zip',bytes=Buffer.concat([...chunks,...central,end])
  writeFileSync(archive,bytes,{flag:'wx'})
  writeFileSync(archive+'.sha256',`${digest(bytes)}  ${archive.split(sep).at(-1)}\n`,{flag:'wx'})
  console.log(JSON.stringify({source:output,archive,files:files.length,sha256:digest(bytes)},null,2))
} catch(error){console.error(error.message);console.error(`Incomplete staging directory is NOT approved for publication: ${output}`);process.exitCode=1}
