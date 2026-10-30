/**
 * Server-side QR rendering for the pairing page and control panel.
 *
 * The encoder is the MIT-licensed `qrcode-generator` by Kazuhiko Arase,
 * vendored under vendor/qrcode.cjs so the gateway has no runtime npm lookup.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const qrcode = require('../vendor/qrcode.cjs')

/**
 * Render a byte-mode QR code as a self-contained SVG string.
 * @param {string} text
 * @param {{ size?: number, margin?: number, dark?: string, light?: string }} [options]
 */
export function qrSvg(text, options = {}) {
  const size = options.size ?? 220
  const margin = options.margin ?? 4
  const dark = options.dark ?? '#101828'
  const light = options.light ?? '#ffffff'
  const code = qrcode(0, 'M')
  code.addData(text)
  code.make()
  const count = code.getModuleCount()
  const view = count + margin * 2
  const rects = []
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!code.isDark(row, col)) continue
      // One path command per dark run keeps the SVG small enough for inline use.
      rects.push(`M${col + margin} ${row + margin}h1v1h-1z`)
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}" role="img" aria-label="Pairing QR code">`,
    `<rect width="${view}" height="${view}" fill="${light}"/>`,
    `<path fill="${dark}" d="${rects.join('')}"/>`,
    '</svg>',
  ].join('')
}
