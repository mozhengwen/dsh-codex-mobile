const { randomUUID, createHash } = require('node:crypto')
const { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } = require('node:fs')
const { join } = require('node:path')
const MAX_IMAGE = 2 * 1024 * 1024
const MAX_TOTAL = 512 * 1024 * 1024
const ID = /^[a-f0-9-]{36}$/
function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['image/png', 'png']
  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['image/jpeg', 'jpg']
  if (bytes.length >= 16 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return ['image/webp', 'webp']
  throw new Error('请选择 PNG、JPEG 或 WebP 图片')
}
class ImageUploads {
  constructor(directory) {
    this.directory = directory
    try { this.records = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8')).filter(x => ID.test(x.id) && ['png','jpg','webp'].includes(x.extension)) } catch { this.records = [] }
    try { this.messages = JSON.parse(readFileSync(join(directory, 'messages.json'), 'utf8')) } catch { this.messages = [] }
  }
  save() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    writeFileSync(join(this.directory, 'index.json.tmp'), JSON.stringify(this.records), { mode: 0o600 })
    renameSync(join(this.directory, 'index.json.tmp'), join(this.directory, 'index.json'))
  }
  public(record) { return { id: record.id, name: record.name, mimeType: record.mimeType, size: record.size, url: '/mobile/api/uploads/' + record.id } }
  put(input) {
    if (typeof input?.data !== 'string' || input.data.length > Math.ceil(MAX_IMAGE / 3) * 4 || input.data.length % 4 || /[^A-Za-z0-9+/=]/.test(input.data)) throw new Error('图片编码无效或超过 2 MB')
    const bytes = Buffer.from(input.data, 'base64')
    if (bytes.toString('base64') !== input.data) throw new Error('图片编码无效')
    if (!bytes.length || bytes.length > MAX_IMAGE) throw new Error('图片大小须在 2 MB 以内')
    const [mimeType, extension] = imageType(bytes)
    if (input.mimeType && input.mimeType !== mimeType) throw new Error('图片格式与内容不匹配')
    // Only abandoned uploads are expired. Images already used in messages are retained.
    this.records = this.records.filter(record => {
      if (record.usedAt || Date.now() - record.createdAt < 86400_000) return true
      try { unlinkSync(join(this.directory, record.id + '.' + record.extension)) } catch {}
      return false
    })
    if (this.records.reduce((n, r) => n + r.size, 0) + bytes.length > MAX_TOTAL) throw new Error('电脑的图片附件空间已满')
    const id = randomUUID()
    const name = String(input.name || '图片.' + extension).replace(/[\\/\x00-\x1f]/g, '_').slice(0, 120)
    const record = { id, name, mimeType, extension, size: bytes.length, createdAt: Date.now(), sha256: createHash('sha256').update(bytes).digest('hex') }
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    writeFileSync(join(this.directory, id + '.' + extension), bytes, { flag: 'wx', mode: 0o600 })
    this.records.push(record); this.save()
    return this.public(record)
  }
  get(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw new Error('图片附件不存在')
    const record = this.records.find(x => x.id === id)
    if (!record) throw new Error('图片附件已失效，请重新选择')
    const bytes = readFileSync(join(this.directory, id + '.' + record.extension))
    return { ...this.public(record), bytes, path: join(this.directory, id + '.' + record.extension) }
  }
  resolve(ids = []) {
    if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length) throw new Error('每条消息最多选择 4 张不同图片')
    return ids.map(id => this.get(id))
  }
  markUsed(ids) { for (const id of ids) { const r = this.records.find(x => x.id === id); if (r) r.usedAt = Date.now() }; if (ids.length) this.save() }
  rememberMessage(threadId, text, wireText, ids, createdAt = Date.now()) {
    this.messages.push({ id: randomUUID(), threadId, text, wireText, ids, createdAt }); this.messages = this.messages.slice(-500)
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    writeFileSync(join(this.directory, 'messages.json.tmp'), JSON.stringify(this.messages), { mode: 0o600 })
    renameSync(join(this.directory, 'messages.json.tmp'), join(this.directory, 'messages.json'))
  }
  message(threadId, text) {
    const sent = this.messages.find(x => x.threadId === threadId && x.wireText === text)
    return sent ? { text: sent.text, images: sent.ids.map(id => this.records.find(x => x.id === id)).filter(Boolean).map(x => this.public(x)) } : undefined
  }
  messagesFor(threadId) {
    return this.messages.filter(x => x.threadId === threadId).map(x => ({
      id: 'mobile-' + (x.id || x.ids.join('-')), kind: 'user', text: x.text, wireText: x.wireText,
      time: x.createdAt || Math.min(...x.ids.map(id => this.records.find(r => r.id === id)?.createdAt || Date.now())),
      images: x.ids.map(id => this.records.find(r => r.id === id)).filter(Boolean).map(r => this.public(r)),
    }))
  }
  fromInput(part) {
    const path = part.path
    if (part.type === 'localImage' && typeof path === 'string') {
      const record = this.records.find(r => join(this.directory, r.id + '.' + r.extension) === path)
      return record ? this.public(record) : undefined
    }
    if (part.type !== 'image' || typeof part.url !== 'string' || !part.url.startsWith('data:image/')) return undefined
    const data = part.url.slice(part.url.indexOf(',') + 1)
    if (data.length > Math.ceil(MAX_IMAGE / 3) * 4) return undefined
    const hash = createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex')
    const record = this.records.find(r => r.sha256 === hash)
    return record ? this.public(record) : undefined
  }
}
module.exports = { ImageUploads, MAX_IMAGE, imageType }
