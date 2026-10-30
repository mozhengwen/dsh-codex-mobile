import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'

test('unsafe example, short or shared backend credentials prevent startup',()=>{
  for(const tokens of [
    {DSH_PLUGIN_TOKEN:'short'},
    {DSH_PLUGIN_TOKEN:'replace-with-the-same-64-char-token-as-the-plugin'},
    {DSH_PLUGIN_TOKEN:'same-backend-credential-for-test-only',CODEX_PLUGIN_TOKEN:'same-backend-credential-for-test-only'}
  ]){
    const result=spawnSync(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,CODEX_PLUGIN_TOKEN:'',...tokens},windowsHide:true,encoding:'utf8',timeout:3000})
    assert.equal(result.status,1)
    assert.match(result.stderr,/relay token|independent/)
    for(const token of Object.values(tokens))assert.equal(result.stderr.includes(token),false)
  }
})
