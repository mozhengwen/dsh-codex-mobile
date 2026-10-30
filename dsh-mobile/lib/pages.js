/**
 * HTML surfaces of the phone gateway: the pairing form (the only
 * unauthenticated human page), the offline fallback, and the mobile shell
 * tags injected into DSH's own index. The authenticated app itself is the real
 * DSH web UI, proxied unchanged, so every DSH feature stays available.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { qrSvg } from './qr.js'

const publicFile = name => fileURLToPath(new URL(`../public/${name}`, import.meta.url))

export const MOBILE_CSS = readFileSync(publicFile('mobile.css'), 'utf8')
export const MOBILE_JS = readFileSync(publicFile('mobile.js'), 'utf8')
export const SERVICE_WORKER_JS = readFileSync(publicFile('sw.js'), 'utf8')
export const OFFLINE_HTML = readFileSync(publicFile('offline.html'), 'utf8')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** A short, non-identifying device label from the User-Agent. */
export function guessDeviceName(userAgent = '') {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android 手机'
  if (/Macintosh/i.test(userAgent)) return 'Mac'
  if (/Windows/i.test(userAgent)) return 'Windows'
  return '我的手机'
}

/** Display 123456 as 123 456. */
function spacedCode(code) {
  return typeof code === 'string' && code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code
}

function shellHead(title) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b1220">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>${PAIRING_CSS}</style>
</head>`
}

const PAIRING_CSS = `
:root{color-scheme:dark;--bg:#151517;--panel:#232324;--panel2:#2c2c2e;--line:rgba(255,255,255,.12);--text:#f5f6f7;--muted:#cfd3d6;--accent:#7aaaff;--accent2:#5686fe;--danger:#f25a5a;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{background:radial-gradient(900px 480px at 8% -12%,#263148 0,transparent 58%),var(--bg);color:var(--text);display:flex;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 18px max(24px,env(safe-area-inset-bottom));-webkit-font-smoothing:antialiased}
main{width:100%;max-width:460px;margin:auto}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:22px;color:#d3e2ff;font-weight:550;letter-spacing:.01em}
.brand svg{width:30px;height:30px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.03)}
h1{font-size:25px;line-height:1.25;letter-spacing:-.02em;margin:0 0 8px}
.lead{color:var(--muted);font-size:14.5px;line-height:1.65;margin:0 0 18px}
.qr{background:#fff;border-radius:14px;padding:10px;width:max-content;max-width:100%;margin:0 auto 14px;box-shadow:0 10px 30px rgba(0,0,0,.28)}
.qr svg{display:block;width:min(230px,62vw);height:auto}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:31px;letter-spacing:.18em;text-align:center;margin:4px 0 4px;color:#fff}
.meta{text-align:center;color:var(--muted);font-size:12.5px;margin:0 0 20px}
form{display:grid;gap:12px}
label{display:grid;gap:7px;color:var(--muted);font-size:12.5px;font-weight:600;letter-spacing:.02em}
input{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--panel2);color:var(--text);padding:13px 14px;font:inherit;font-size:16px;outline:none}
input:focus{border-color:rgba(122,170,255,.8);box-shadow:0 0 0 3px rgba(122,170,255,.16)}
button{width:100%;border:1px solid transparent;border-radius:10px;padding:14px 16px;background:var(--text);color:#151517;font:inherit;font-size:15px;font-weight:650;cursor:pointer;touch-action:manipulation}
button.secondary{background:var(--panel2);color:var(--text);border-color:var(--line)}
button:active{transform:translateY(1px)}
.hint{color:var(--muted);font-size:12px;line-height:1.65;margin:16px 0 0}
.error{background:rgba(242,90,90,.12);border:1px solid rgba(242,90,90,.34);color:#ffd4d4;border-radius:10px;padding:11px 13px;font-size:13px;line-height:1.5;margin:0 0 16px}
.divider{display:flex;align-items:center;gap:12px;color:#81858c;font-size:11px;letter-spacing:.12em;margin:18px 0;text-transform:uppercase}
.divider:before,.divider:after{content:"";height:1px;background:var(--line);flex:1}
.steps{counter-reset:step;display:grid;gap:10px;margin:16px 0 0;padding:0;list-style:none;color:var(--muted);font-size:12.5px;line-height:1.55}
.steps li{display:grid;grid-template-columns:22px 1fr;gap:9px}
.steps li:before{counter-increment:step;content:counter(step);width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:rgba(122,170,255,.14);color:#b7c8fe;font-size:11px;font-weight:700}
.foot{color:#81858c;text-align:center;font-size:11px;margin:18px 0 0}
@media (max-width:420px){.card{padding:20px;border-radius:16px}h1{font-size:22px}}
`

/**
 * The unauthenticated pairing page.
 * @param {{
 *   token?: string,
 *   code?: string,
 *   deviceName?: string,
 *   error?: string,
 *   host?: string,
 *   expiresAt?: number,
 * }} options
 */
export function renderPairingPage(options = {}) {
  const token = typeof options.token === 'string' ? options.token : ''
  const code = typeof options.code === 'string' ? options.code : ''
  const deviceName = options.deviceName ?? '我的手机'
  const error = options.error
  const qrTarget = options.qrTarget
  const hasToken = token !== ''
  const showCode = !hasToken || code !== ''
  return `${shellHead('DSH Mobile 配对')}
<body>
<main>
  <div class="brand">
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="url(#g)" stroke="rgba(255,255,255,.22)"/><defs><linearGradient id="g" x1="4" y1="3" x2="28" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="#5686fe"/><stop offset="1" stop-color="#7aaaff"/></linearGradient></defs><rect x="9" y="7" width="14" height="18" rx="3" stroke="#06202a" stroke-width="1.8"/><path d="M13 14l2.4 2.4L13 18.8M17 19h3" stroke="#06202a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="22" r="1" fill="#06202a"/></svg>
    <span>DSH Mobile</span>
  </div>
  <section class="card">
    <h1>${hasToken ? '连接这台电脑' : '手机远控 DSH'}</h1>
    <p class="lead">${hasToken ? '已识别桌面版发来的配对请求。确认设备名称后连接，即可在手机上使用完整的 DSH 界面。' : '在电脑上的 DSH 侧边栏打开「手机远控」，扫描二维码，或输入 6 位配对码。'}</p>
    ${error === undefined ? '' : `<p class="error">${escapeHtml(error)}</p>`}
    ${qrTarget !== undefined ? `<div class="qr">${qrSvg(qrTarget, { size: 230 })}</div>` : ''}
    ${showCode && code !== '' ? `<div class="code">${escapeHtml(spacedCode(code))}</div><p class="meta">配对码 10 分钟内有效</p>` : ''}
    <form method="post" action="/pair" autocomplete="off">
      ${hasToken ? `<input type="hidden" name="token" value="${escapeHtml(token)}">` : `<label>6 位配对码<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required autofocus></label>`}
      <label>设备名称<input name="name" maxlength="60" value="${escapeHtml(deviceName)}" required></label>
      <button type="submit">连接 DSH</button>
    </form>
    <p class="hint">手机与电脑需要连接到同一 Wi-Fi / 局域网。连接成功后，DSH 的全部会话、输入框和工具审批都会显示在手机上。</p>
    ${hasToken ? '' : `<ol class="steps"><li>在电脑侧边栏打开「手机远控」。</li><li>用手机相机扫描屏幕上的二维码。</li><li>确认设备名称并点「连接 DSH」。</li></ol>`}
    <p class="foot">仅限你信任的局域网 · 配对会话可随时在电脑上撤销</p>
  </section>
</main>
</body>
</html>`
}

/** Offline fallback served by the service worker when the desktop is unreachable. */
export function renderOfflinePage() {
  return OFFLINE_HTML
}

/**
 * Add the mobile shell metadata to a DSH index response. DSH's own boot rows
 * and `<base href="./">` stay untouched; only head/body additions are made.
 * @param {string} html
 * @param {{ nonce?: string }} [options]
 */
export function injectMobileShell(html, options = {}) {
  const nonce = options.nonce
  const nonceAttr = nonce === undefined ? '' : ` nonce="${escapeHtml(nonce)}"`
  const head = [
    '<meta name="theme-color" content="#0b1220">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="DSH Mobile">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<link rel="manifest" href="/dsh-mobile/manifest.webmanifest">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/dsh-mobile/icon-180.png">',
    '<link rel="stylesheet" href="/dsh-mobile/mobile.css">',
  ].join('')
  const body = `<script${nonceAttr} src="/dsh-mobile/mobile.js" defer></script>`
  let output = html
  if (/<\/head>/i.test(output)) output = output.replace(/<\/head>/i, `${head}</head>`)
  else output = `${head}${output}`
  if (/<\/body>/i.test(output)) output = output.replace(/<\/body>/i, `${body}</body>`)
  else output = `${output}${body}`
  return output
}

/** PWA manifest served at /dsh-mobile/manifest.webmanifest. */
export const MANIFEST = JSON.stringify({
  name: 'DSH Mobile',
  short_name: 'DSH',
  description: 'The paired DSH desktop, on your phone.',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  display_override: ['standalone', 'fullscreen', 'minimal-ui'],
  orientation: 'any',
  background_color: '#080d17',
  theme_color: '#0b1220',
  categories: ['productivity', 'developer'],
  icons: [
    { src: '/dsh-mobile/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/dsh-mobile/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/dsh-mobile/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2)

/** Stable ETag for an inline asset. */
export function etagOf(text) {
  return `"${createHash('sha256').update(text).digest('base64url').slice(0, 16)}"`
}
