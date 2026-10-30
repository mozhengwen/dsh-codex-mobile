import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PairingStore as DshStore } from '../lib/store.js'
import { PairingStore as CodexStore } from '../../codex-mobile-plugin/lib/pairing-store.mjs'

const phone1 = 'c4bc5938-825f-4cb6-b39c-8da2af00136b'
const phone2 = 'fc12b80a-1ac1-4127-b0aa-4c2808d81d76'
for (const [backend, Store] of [['DSH', DshStore], ['Codex', CodexStore]]) {
  test(`${backend}: re-pairing the same installation retains its device identity and cookie`, t => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-identity-'))
    t.after(() => rmSync(directory, { recursive: true }))
    const file = join(directory, 'state.json'), store = new Store({ file })
    const first = store.addDevice('Xiaomi', 'okhttp/4.12.0', 8, { clientId: phone1 })
    const expires = Date.now() + 60_000, cookie = `${first.id}.${expires}.${store.signSession(first.id, expires)}`
    const next = store.addDevice('Xiaomi', 'okhttp/4.12.0', 8, { clientId: phone1 })
    assert.equal(next.id, first.id)
    assert.equal(store.devices.length, 1)
    assert.ok(store.verifySession(cookie))
    assert.equal(new Store({ file }).devices[0].clientId, phone1)
    store.addDevice('Xiaomi', 'okhttp/4.12.0', 8, { clientId: phone2 })
    assert.equal(store.listDevices().length, 2, 'same model, separate installations')
  })
  test(`${backend}: historical duplicates are grouped without losing access, and revoked together`, t => {
    const directory = mkdtempSync(join(tmpdir(), 'mobile-history-'))
    t.after(() => rmSync(directory, { recursive: true }))
    const file = join(directory, 'state.json'), store = new Store({ file })
    const records = Array.from({ length: 3 }, () => store.addDevice('Xiaomi', 'okhttp/4.12.0'))
    const cookies = records.map(r => { const e = Date.now() + 60_000; return `${r.id}.${e}.${store.signSession(r.id, e)}` })
    assert.equal(store.listDevices().length, 1)
    assert.equal(store.listDevices()[0].pairingCount, 3)
    assert.ok(cookies.every(c => store.verifySession(c)))
    const updated = store.addDevice('Xiaomi', 'okhttp/4.12.0', 8, { clientId: phone1, previousId: records[0].id })
    assert.equal(updated.id, records[0].id)
    assert.equal(store.listDevices().length, 1)
    assert.equal(store.listDevices()[0].pairingCount, 3)
    assert.ok(cookies.every(c => new Store({ file }).verifySession(c)))
    assert.equal(store.removeDevice(store.listDevices()[0].id), true)
    assert.equal(store.listDevices().length, 0)
    assert.ok(cookies.every(c => !store.verifySession(c)))
  })
}
