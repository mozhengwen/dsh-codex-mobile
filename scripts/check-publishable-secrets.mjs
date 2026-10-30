import{existsSync,readdirSync,readFileSync,statSync,writeFileSync,unlinkSync,mkdtempSync,rmSync}from'node:fs'
import{join,dirname,relative}from'node:path'
import{fileURLToPath}from'node:url'
import{spawnSync}from'node:child_process'
import{randomBytes}from'node:crypto'
import{tmpdir}from'node:os'
const root=dirname(dirname(fileURLToPath(import.meta.url)))
const projects=['dsh-mobile','dsh-mobile-server','dsh-mobile-android','codex-mobile-plugin']
const excluded=new Set(['node_modules','build','.gradle','.kotlin']),findings=[]
function walk(folder){for(const entry of readdirSync(folder,{withFileTypes:true})){
 const path=join(folder,entry.name)
 if(entry.isSymbolicLink())continue
 if(entry.isDirectory()){if(!excluded.has(entry.name))walk(path);continue}
 if(!entry.isFile())continue
 if(/\.(jks|keystore|p12|pfx|key)$/i.test(entry.name)||/^(?:signing|key)\.properties$/.test(entry.name))findings.push({file:relative(root,path),type:'private-signing-or-key-file'})
 if(statSync(path).size<4*1024*1024&&/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(readFileSync(path,'utf8')))findings.push({file:relative(root,path),type:'private-key-material'})
}}
for(const project of projects)walk(join(root,project))
if(findings.length){console.error(JSON.stringify({releaseBlocked:true,findings},null,2));process.exit(1)}
let binary=process.env.GITLEAKS_BIN||'gitleaks'
const local=join(root,'.tools','gitleaks','8.30.1','gitleaks.exe')
if(!process.env.GITLEAKS_BIN&&existsSync(local))binary=local
// A disposable known-pattern marker proves this actual source path is scanned.
// In particular, an inherited allowlist must not silently exclude a staging directory.
const markerName='.scan-canary-'+randomBytes(8).toString('hex')+'.txt'
const marker=join(root,'codex-mobile-plugin',markerName)
const reports=mkdtempSync(join(tmpdir(),'mobile-secret-check-')),report=join(reports,'report.json')
let code=2
try{
 writeFileSync(marker,'github_token = "ghp_'+randomBytes(18).toString('hex')+'"\n',{flag:'wx'})
 const result=spawnSync(binary,['dir','.', '--config',join(root,'.gitleaks.toml'),'--redact=100','--no-banner','--no-color','--log-level','error','--report-format','json','--report-path',report,'--max-target-megabytes','32'],{cwd:root,stdio:'pipe',windowsHide:true})
 if(result.error)throw Error('Gitleaks is required. Install the official binary or set GITLEAKS_BIN. Scan did not complete.')
 if(![0,1].includes(result.status)||!existsSync(report))throw Error('Gitleaks did not complete successfully. No release is approved.')
 const matches=JSON.parse(readFileSync(report,'utf8'))
 if(!matches.some(x=>x.File?.endsWith(markerName)))throw Error('Scanner coverage check failed: the source directory may have been excluded. No release is approved.')
 const actual=matches.filter(x=>!x.File?.endsWith(markerName))
 if(actual.length){console.error(JSON.stringify({releaseBlocked:true,findings:actual.map(x=>({file:x.File,line:x.StartLine,rule:x.RuleID}))},null,2));code=1}
 else{console.log('Source coverage verified; Gitleaks found no secrets (temporary scanner marker excluded).');code=0}
}catch(error){console.error(error.message)}finally{try{unlinkSync(marker)}catch{};rmSync(reports,{recursive:true,force:true})}
process.exit(code)
