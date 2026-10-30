import test from 'node:test'
import assert from 'node:assert/strict'
import { MobileBridge } from '../lib/mobile-bridge.js'
import { SessionView } from '../lib/session-view.js'

test('DSH accepts image-only messages as native encoded images and retrieves session-authorized previews', async () => {
  let prompt
  const bridge = new MobileBridge({ ctx: { get() {}, sessionController: {
    async prompt(value) { prompt = value },
    async attachment(value) { assert.deepEqual(value, { sessionId: 's1', attachmentId: 'image-ref' }); return { attachment: { mediaType: 'image/png' }, data: 'YWJj' } },
  } } })
  await bridge.prompt('s1', '', 'request-1', [{ name: 'sample.png', mimeType: 'image/png', bytes: Buffer.from('abc') }])
  assert.equal(prompt.requestId, 'request-1')
  assert.deepEqual(prompt.content, [{ type: 'image', name: 'sample.png', mediaType: 'image/png', data: 'YWJj' }])
  const image = await bridge.image('s1', 'image-ref')
  assert.deepEqual(image.bytes, Buffer.from('abc'))
})

test('image-only durable DSH messages retain thumbnails without putting base64 in snapshots', () => {
  const view = new SessionView({ sessionId: 's1' })
  const frames = view.applyEvent({ type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: { attachmentId: 'image-ref', mediaType: 'image/png', name: 'sample.png' } }] } })
  assert.equal(frames[0].item.kind, 'user')
  assert.equal(frames[0].item.text, '')
  assert.equal(frames[0].item.images[0].url, '/mobile/api/sessions/s1/images/image-ref')
  assert.equal(frames[0].item.images[0].name, 'sample.png')
})
