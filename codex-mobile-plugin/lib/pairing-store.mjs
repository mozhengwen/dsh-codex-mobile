/**
 * Durable pairing state for the phone gateway.
 *
 * The file holds only a signing secret and the public device records used by
 * the control panel. The phone's cookie is an HMAC over its device id and
 * expiry, so a stolen state file still cannot be used as a session without
 * the cookie. Pairing codes are intentionally memory-only: restarting DSH
 * rotates them and forces a fresh scan.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const STATE_VERSION = 1
const PAIRING_TTL_MS = 10 * 60 * 1000

/** Resolve the DSH home directory the same way the rest of the harness does. */
export function resolveDshHome() {
  const value = process.env.DSH_HOME
  return value !== undefined && value !== '' ? value : join(homedir(), '.dsh')
}

function randomId() {
  return randomBytes(12).toString('base64url')
}

function normalizeDevice(entry) {
  if (typeof entry !== 'object' || entry === null) return undefined
  const { id, name, userAgent, createdAt, lastSeenAt } = entry
  if (typeof id !== 'string' || id === '') return undefined
  return {
    id,
    ...(typeof entry.clientId === 'string' && /^[a-f0-9-]{36}$/i.test(entry.clientId) ? { clientId: entry.clientId } : {}),
    name: typeof name === 'string' && name !== '' ? name.slice(0, 60) : 'Phone',
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 300) : '',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : Date.now(),
  }
}

export class PairingStore {
  /**
   * @param {{ file?: string, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.file = options.file ?? join(resolveDshHome(), 'dsh-mobile', 'state.json')
    this.now = options.now ?? Date.now
    this.secret = ''
    this.devices = []
    this.pairing = null
    this.lastSaveError = undefined
    this.#load()
    this.rotatePairing()
  }

  #load() {
    try {
      const text = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(text)
      if (typeof parsed?.secret === 'string' && parsed.secret.length >= 32) {
        this.secret = parsed.secret
        this.devices = Array.isArray(parsed.devices)
          ? parsed.devices.map(normalizeDevice).filter(entry => entry !== undefined)
          : []
        return
      }
      throw new Error('missing signing secret')
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.lastSaveError = `pairing state at ${this.file} could not be read; starting fresh: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    this.secret = randomBytes(32).toString('base64url')
    this.devices = []
    this.#save()
  }

  #save() {
    try {
      const target = this.file
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
      const temporary = `${target}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify({
        version: STATE_VERSION,
        updatedAt: this.now(),
        secret: this.secret,
        devices: this.devices,
      }, null, 2), { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, target)
      try {
        // The mode option is advisory on Windows; chmod keeps POSIX homes private.
        if (process.platform !== 'win32' && (statSync(target).mode & 0o077) !== 0) {
          writeFileSync(target, readFileSync(target), { mode: 0o600 })
        }
      } catch {
        // A permission repair is best-effort; the record is still usable.
      }
      this.lastSaveError = undefined
    } catch (error) {
      this.lastSaveError = error instanceof Error ? error.message : String(error)
    }
  }

  /** Create a fresh code/secret pair, invalidating every previously displayed code. */
  rotatePairing(ttlMs = PAIRING_TTL_MS) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const token = randomBytes(18).toString('base64url')
    const expiresAt = this.now() + ttlMs
    this.pairing = { code, token, expiresAt }
    return this.pairing
  }

  /** Current pairing offer; rotates when expired so the panel always works. */
  currentPairing() {
    if (this.pairing === null || this.pairing.expiresAt <= this.now()) {
      this.rotatePairing()
    }
    return this.pairing
  }

  /** @param {string} candidate */
  matchPairing(candidate) {
    const pairing = this.currentPairing()
    if (typeof candidate !== 'string' || candidate.length === 0) return false
    const expected = candidate.length <= 6 ? pairing.code : pairing.token
    const a = Buffer.from(candidate)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  /**
   * @param {string} name
   * @param {string} userAgent
   * @param {number} limit
   */
  addDevice(name, userAgent, limit = 8, identity = {}) {
    const clientId = typeof identity.clientId === 'string' && /^[a-f0-9-]{36}$/i.test(identity.clientId) ? identity.clientId : undefined
    const previous = this.devices.find(d => (clientId && d.clientId === clientId) || (identity.previousId && d.id === identity.previousId))
    const record = normalizeDevice({
      id: previous?.id || randomId(),
      clientId: clientId || previous?.clientId,
      name,
      userAgent,
      createdAt: previous?.createdAt ?? this.now(),
      lastSeenAt: this.now(),
    })
    this.devices = this.devices.filter(d => d.id !== record.id)
    this.devices.unshift(record)
    if (this.devices.length > Math.max(1, limit)) this.devices.length = limit
    this.#save()
    return record
  }

  /** @param {string} id */
  removeDevice(id) {
    const before = this.devices.length
    const ids = new Set(this.listDevices().find(d => d.id === id)?.recordIds || [id])
    this.devices = this.devices.filter(device => !ids.has(device.id))
    if (this.devices.length !== before) this.#save()
    return this.devices.length !== before
  }

  /** @param {string} id */
  touchDevice(id) {
    const device = this.devices.find(entry => entry.id === id)
    if (device === undefined) return false
    const now = this.now()
    // Avoid rewriting the state file for every asset request.
    if (now - device.lastSeenAt > 60_000) {
      device.lastSeenAt = now
      this.#save()
    }
    return true
  }

  /** @param {string} id */
  hasDevice(id) {
    return this.devices.some(device => device.id === id)
  }

  listDevices() {
    const families = new Map()
    for (const device of this.devices) {
      const key = JSON.stringify([device.name, device.userAgent])
      if (!families.has(key)) families.set(key, [])
      families.get(key).push(device)
    }
    const rows = []
    for (const family of families.values()) {
      const known = family.filter(d => d.clientId)
      const legacy = family.filter(d => !d.clientId)
      const groups = known.length === 1 ? [[known[0], ...legacy]] : [...known.map(d => [d]), ...(legacy.length ? [legacy] : [])]
      for (const group of groups) {
        const primary = group.find(d => d.clientId) || [...group].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        const { clientId, ...device } = primary
        rows.push({ ...device, createdAt: Math.min(...group.map(d => d.createdAt)), lastSeenAt: Math.max(...group.map(d => d.lastSeenAt)), recordIds: group.map(d => d.id), pairingCount: group.length })
      }
    }
    return rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  }

  /**
   * Sign a session cookie value.
   * @param {string} id
   * @param {number} expiresAt
   */
  signSession(id, expiresAt) {
    return createHmac('sha256', this.secret).update(`${id}.${expiresAt}`).digest('base64url')
  }

  /**
   * Verify a cookie without revealing which part failed.
   * @param {string | undefined} value
   * @param {() => number} now
   */
  verifySession(value, now = this.now) {
    if (typeof value !== 'string' || value === '') return undefined
    const parts = value.split('.')
    if (parts.length !== 3) return undefined
    const [id, rawExpiry, signature] = parts
    const expiresAt = Number(rawExpiry)
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now()) return undefined
    const expected = this.signSession(id, expiresAt)
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined
    if (!this.hasDevice(id)) return undefined
    return { id, expiresAt }
  }

  get stateFile() {
    return this.file
  }

  get healthy() {
    return existsSync(this.file) && this.lastSaveError === undefined
  }
}

export const PAIRING_TTL = PAIRING_TTL_MS
