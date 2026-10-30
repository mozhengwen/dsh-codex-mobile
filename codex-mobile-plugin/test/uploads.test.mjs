import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const { ImageUploads } = createRequire(import.meta.url)('../lib/image-uploads.cjs')
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64')
test('uploads persist, reject unsafe input and map image messages without leaking host paths', t => {
  const root = mkdtempSync(join(tmpdir(), 'mobile-upload-test-')); t.after(() => rmSync(root, { recursive: true, force: true }))
  const store = new ImageUploads(root)
  const image = store.put({ name: '../sample.png', mimeType: 'image/png', data: png.toString('base64') })
  assert.ok(!image.name.includes('/'))
  assert.equal(image.url, '/mobile/api/uploads/' + image.id)
  assert.deepEqual(store.get(image.id).bytes, png)
  assert.throws(() => store.get('../../secret'))
  assert.throws(() => store.put({ data: Buffer.from('<svg/>').toString('base64'), mimeType: 'image/png' }))
  assert.throws(() => store.put({ data: png.toString('base64'), mimeType: 'image/jpeg' }))
  assert.throws(() => store.put({ data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') }))
  assert.throws(() => store.resolve(Array(5).fill(image.id)))
  assert.throws(() => store.resolve([image.id, image.id]))
  store.markUsed([image.id])
  store.rememberMessage('thread', '请看图', 'wire prompt with local path', [image.id])
  const reopened = new ImageUploads(root)
  assert.equal(reopened.message('thread', 'wire prompt with local path').text, '请看图')
  assert.equal(reopened.message('thread', 'wire prompt with local path').images[0].id, image.id)
  assert.equal(reopened.fromInput({ type: 'image', url: 'data:image/png;base64,' + png.toString('base64') }).id, image.id)
  assert.equal(JSON.stringify(reopened.message('thread', 'wire prompt with local path')).includes(root), false)
})
