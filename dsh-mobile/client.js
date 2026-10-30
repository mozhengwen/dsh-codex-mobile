window.__ModuleLoader__.load({
  id: '@local/dsh-mobile',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-mobile'
    const PANEL_ID = 'dsh-mobile'
    const API = '/dsh-mobile/api'

    const zh = {
      'nav.label': '手机远控',
      'page.title': '手机远控',
      'page.subtitle': '把正在运行的 DSH 桌面版装进手机，使用同一套会话和工具。',
      'page.back': '返回会话',
      'status.running': '网关运行中',
      'status.stopped': '网关未运行',
      'status.starting': '正在启动…',
      'status.devices': '{count} 台设备',
      'status.ready': '电脑端服务已就绪',
      'status.notRunning': '电脑端服务未运行',
      'relay.on': '云端中转已连接',
      'relay.off': '云端中转未连接',
      'pairing.title': '手机配对',
      'pairing.hint': '用 DSH 手机版 App 扫描二维码，或在 App 里输入下面的 6 位配对码。',
      'pairing.expires': '{time} 后失效',
      'pairing.expired': '配对码已过期',
      'pairing.refresh': '刷新配对码',
      'pairing.open': '下载安卓 App',
      'pairing.copy': '复制地址和配对码',
      'pairing.copied': '已复制',
      'pairing.url': '手机访问地址',
      'pairing.code': '配对码',
      'pairing.scan': '手机扫码',
      'pairing.lan': '互联网 / 云端中继',
      'install.title': '还没安装手机 App？',
      'install.hint': '下载 APK 安装后，扫描上方的配对二维码完成连接。',
      'install.download': '下载 APK',
      'install.scan': '扫码安装',
      'devices.title': '已配对设备',
      'devices.empty': '还没有配对设备',
      'devices.emptyHint': '手机 App 扫码连接成功后，会出现在这里。',
      'devices.lastSeen': '最近访问 {time}',
      'devices.pairedAt': '配对于 {time}',
      'devices.revoke': '撤销',
      'devices.revokeConfirm': '撤销「{name}」的访问？这台手机需要重新配对。',
      'devices.limit': '最多 {limit} 台',
      'setup.title': '手机 App 连接电脑 DSH',
      'setup.ios': '1. 下载并安装 APK',
      'setup.android': '2. 用 App 扫描左侧配对二维码',
      'setup.sameWifi': '3. 手机和电脑联网，电脑保持 DSH 运行',
      'warnings.title': '安全提示',
      'error.title': '手机远控暂时不可用',
      'error.retry': '重试',
      'error.noHost': 'Host 插件没有返回状态。请确认插件已启用。',
      'loading': '正在读取网关状态…',
      'footer': '手机 App 通过本插件操控电脑端 DSH 的同一套会话，不会另开会话。',
      'stateFile': '配对状态：{file}',
      'time.justNow': '刚刚',
      'time.minutes': '{count} 分钟前',
      'time.hours': '{count} 小时前',
      'time.days': '{count} 天前',
      'time.seconds': '{count} 秒',
      'time.minutesShort': '{count} 分',
    }

    const en = {
      'nav.label': 'Mobile',
      'page.title': 'DSH Mobile',
      'page.subtitle': 'Put this running DSH desktop on your phone, with the same sessions and tools.',
      'page.back': 'Back to conversation',
      'status.running': 'Gateway running',
      'status.stopped': 'Gateway stopped',
      'status.starting': 'Starting…',
      'status.devices': '{count} devices',
      'status.ready': 'Desktop service ready',
      'status.notRunning': 'Desktop service offline',
      'relay.on': 'Cloud relay connected',
      'relay.off': 'Cloud relay offline',
      'pairing.title': 'Pair a phone',
      'pairing.hint': 'Scan with the DSH Mobile app, or type the 6-digit pairing code in the app.',
      'pairing.expires': 'expires in {time}',
      'pairing.expired': 'Pairing code expired',
      'pairing.refresh': 'New code',
      'pairing.open': 'Download Android app',
      'pairing.copy': 'Copy URL + code',
      'pairing.copied': 'Copied',
      'pairing.url': 'Phone URL',
      'pairing.code': 'Pairing code',
      'pairing.scan': 'Scan with phone',
      'pairing.lan': 'Internet / cloud relay',
      'install.title': 'App not installed yet?',
      'install.hint': 'Download and install the APK, then scan the pairing QR above.',
      'install.download': 'Download APK',
      'install.scan': 'Scan to install',
      'devices.title': 'Paired devices',
      'devices.empty': 'No paired devices yet',
      'devices.emptyHint': 'A phone appears here after the app pairs.',
      'devices.lastSeen': 'Last seen {time}',
      'devices.pairedAt': 'Paired {time}',
      'devices.revoke': 'Revoke',
      'devices.revokeConfirm': 'Revoke access for “{name}”? The phone will need to pair again.',
      'devices.limit': 'Up to {limit}',
      'setup.title': 'Connect the phone app to this DSH',
      'setup.ios': '1. Download and install the APK',
      'setup.android': '2. Scan the pairing QR in the app',
      'setup.sameWifi': '3. Keep both online and DSH running on the computer',
      'warnings.title': 'Security notes',
      'error.title': 'Mobile access is unavailable',
      'error.retry': 'Retry',
      'error.noHost': 'The Host plugin returned no status. Check that the plugin is enabled.',
      'loading': 'Reading gateway status…',
      'footer': 'The phone app controls the same desktop DSH sessions through this plugin; no second session is started.',
      'stateFile': 'Pairing state: {file}',
      'time.justNow': 'just now',
      'time.minutes': '{count} min ago',
      'time.hours': '{count} hr ago',
      'time.days': '{count} d ago',
      'time.seconds': '{count}s',
      'time.minutesShort': '{count}m',
    }

    function translate(locale, key, vars) {
      const dict = locale === 'en' ? en : zh
      let text = dict[key] ?? zh[key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
      }
      return text
    }

    function localeId(snapshot) {
      return snapshot?.id ?? snapshot?.locale ?? snapshot?.language ?? 'zh'
    }

    function useLocale(ctx) {
      const [version, setVersion] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        const update = () => { if (alive) setVersion(value => value + 1) }
        const dispose = ctx.locale.subscribe(update)
        return () => { alive = false; if (typeof dispose === 'function') dispose() }
      }, [ctx])
      void version
      return localeId(ctx.locale.getSnapshot())
    }

    function t(locale, key, vars) {
      return translate(String(locale).startsWith('en') ? 'en' : 'zh', key, vars)
    }

    function relativeTime(locale, timestamp) {
      if (!Number.isFinite(timestamp)) return ''
      const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
      if (seconds < 45) return t(locale, 'time.justNow')
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return t(locale, 'time.minutes', { count: minutes })
      const hours = Math.round(minutes / 60)
      if (hours < 24) return t(locale, 'time.hours', { count: hours })
      return t(locale, 'time.days', { count: Math.round(hours / 24) })
    }

    function remaining(expiresAt) {
      const ms = Math.max(0, Number(expiresAt) - Date.now())
      const seconds = Math.ceil(ms / 1000)
      if (seconds <= 0) return { expired: true, text: '' }
      if (seconds < 60) return { expired: false, text: `${seconds}s` }
      return { expired: false, text: `${Math.ceil(seconds / 60)}m` }
    }

    function formatDate(value) {
      try {
        return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      } catch {
        return ''
      }
    }

    function MobileIcon({ size = 16, active }) {
      return h('svg', {
        viewBox: '0 0 16 16', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('rect', { x: 4, y: 1.4, width: 8, height: 13.2, rx: 1.9, opacity: active ? 1 : 0.9 }),
        h('path', { d: 'M6.1 5.1l1.5 1.5-1.5 1.5' }),
        h('path', { d: 'M8.3 8.1h2.1' }),
        h('circle', { cx: 8, cy: 12.1, r: 0.55, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function ApiError(message) {
      const error = new Error(message)
      error.name = 'ApiError'
      return error
    }

    async function request(path, options) {
      let response
      try {
        response = await fetch(`${API}${path}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          ...options,
          headers: { accept: 'application/json', ...(options?.headers ?? {}) },
        })
      } catch (cause) {
        throw ApiError(cause instanceof Error ? cause.message : String(cause))
      }
      let body = undefined
      try { body = await response.json() } catch { /* empty body */ }
      if (!response.ok) {
        if (response.status === 403) throw ApiError('forbidden')
        throw ApiError(body?.error ?? `HTTP ${response.status}`)
      }
      return body
    }

    async function copyText(text) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }

    const CSS = `
.dsm-root{height:100%;overflow:auto;box-sizing:border-box;padding:26px 30px 40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
.dsm-wrap{max-width:1080px;margin:0 auto}
.dsm-head{display:flex;align-items:flex-start;gap:14px;margin-bottom:22px}
.dsm-back{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:9px;min-height:30px;padding:0 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap;margin-top:2px}
.dsm-back:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dsm-head-main{min-width:0;flex:1}
.dsm-title{font-size:25px;line-height:1.25;font-weight:650;letter-spacing:-.02em;margin:0}
.dsm-sub{color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6;margin:5px 0 0}
.dsm-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:999px;padding:5px 10px;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;margin-top:2px}
.dsm-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary)}
.dsm-dot[data-on]{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent)}
.dsm-grid{display:grid;grid-template-columns:minmax(340px,1.08fr) minmax(280px,.92fr);gap:16px;align-items:start}
.dsm-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:15px;padding:18px;min-width:0}
.dsm-card-title{font-size:14px;font-weight:650;margin:0 0 4px}
.dsm-card-sub{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.55;margin:0}
.dsm-pair{display:flex;gap:18px;margin-top:16px;align-items:flex-start}
.dsm-qr{width:184px;flex:0 0 auto;background:#fff;border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.14)}
.dsm-qr svg{display:block;width:100%;height:auto}
.dsm-qr-fallback{width:184px;height:184px;border-radius:12px;background:var(--dsw-alias-bg-layer-2);display:grid;place-items:center;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center;padding:12px}
.dsm-pair-main{min-width:0;flex:1}
.dsm-label{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--dsw-alias-label-secondary);font-weight:650;margin:0 0 5px}
.dsm-code{font:650 28px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.14em;margin:0 0 10px;color:var(--dsw-alias-label-primary);white-space:nowrap}
.dsm-expiry{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:10px}
.dsm-url-row{display:flex;align-items:center;gap:7px;margin:2px 0 12px;min-width:0}
.dsm-url{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:7px 9px}
.dsm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.dsm-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;min-height:32px;padding:0 11px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.dsm-btn:hover{border-color:var(--dsw-alias-border-l2)}
.dsm-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsm-btn[data-primary]{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.dsm-btn[data-danger]{color:var(--dsw-alias-state-error-primary)}
.dsm-btn:disabled{opacity:.5;cursor:default}
.dsm-small{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}
.dsm-devices{margin-top:12px;display:grid;gap:2px}
.dsm-device{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l1);min-width:0}
.dsm-device:first-child{border-top:0}
.dsm-device-glyph{width:30px;height:30px;flex:0 0 auto;border-radius:8px;background:var(--dsw-alias-bg-layer-2);display:grid;place-items:center;color:var(--dsw-alias-label-secondary)}
.dsm-device-main{min-width:0;flex:1}
.dsm-device-name{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsm-device-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.dsm-empty{border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;padding:18px 14px;text-align:center;margin-top:12px}
.dsm-empty-title{font-size:12.5px;font-weight:600}
.dsm-empty-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;margin-top:4px}
.dsm-wide{grid-column:1/-1}
.dsm-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
.dsm-install{display:flex;gap:16px;align-items:center;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:14px;margin-top:12px}
.dsm-install-qr{width:118px;flex:0 0 auto;background:#fff;border-radius:10px;padding:6px}
.dsm-install-qr svg{display:block;width:100%;height:auto}
.dsm-install-main{min-width:0;flex:1}
.dsm-install-title{font-size:12.5px;font-weight:650;margin-bottom:3px}
.dsm-install-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}
.dsm-install .dsm-actions{margin-top:8px}
.dsm-step{background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:12px;min-width:0}
.dsm-step-num{width:21px;height:21px;border-radius:50%;display:grid;place-items:center;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:700;margin-bottom:8px}
.dsm-step-text{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.55}
.dsm-warn{display:flex;gap:8px;font-size:11.5px;line-height:1.55;color:var(--dsw-alias-state-warn-primary);margin-top:8px}
.dsm-error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l1));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, var(--dsw-alias-bg-layer-1))}
.dsm-error .dsm-card-title{color:var(--dsw-alias-state-error-primary)}
.dsm-loading{display:flex;align-items:center;gap:9px;color:var(--dsw-alias-label-secondary);font-size:12.5px;padding:22px 0}
.dsm-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);border-radius:50%;animation:dsm-spin .8s linear infinite}
@keyframes dsm-spin{to{transform:rotate(360deg)}}
.dsm-footer{margin-top:16px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.55}
.dsm-footer code{font-size:10.5px;background:var(--dsw-alias-bg-layer-2);padding:1px 4px;border-radius:4px}
@media (max-width:820px){.dsm-root{padding:18px 16px 30px}.dsm-grid{grid-template-columns:1fr}.dsm-pair{gap:14px}.dsm-steps{grid-template-columns:1fr}.dsm-head{flex-wrap:wrap}.dsm-badge{margin-left:0}.dsm-title{font-size:22px}}
@media (max-width:520px){.dsm-root{padding:14px 12px 26px}.dsm-pair{flex-direction:column;align-items:center}.dsm-qr{width:min(220px,70vw)}.dsm-qr-fallback{width:min(220px,70vw);height:auto;aspect-ratio:1}.dsm-pair-main{width:100%}.dsm-code{text-align:center}.dsm-expiry{justify-content:center}.dsm-card{padding:15px;border-radius:13px}.dsm-actions .dsm-btn{flex:1}}
`

    // DSH's own dark palette is neutral-bluish with a white primary button.
    // These overrides keep the panel visually inside the host instead of
    // looking like a separate teal admin dashboard.
    const DSH_CSS = `
.dsm-root{background:
  radial-gradient(900px 420px at 8% -18%, color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent), transparent 62%),
  var(--dsw-alias-bg-base);padding:24px 28px 36px}
.dsm-wrap{max-width:1120px}
.dsm-head{align-items:center;gap:12px;margin-bottom:20px}
.dsm-mark{width:42px;height:42px;flex:0 0 auto;border-radius:12px;display:grid;place-items:center;background:linear-gradient(145deg,#5686fe,#7aaaff);box-shadow:0 6px 18px color-mix(in srgb,#5686fe 28%,transparent)}
.dsm-mark svg{display:block;width:24px;height:24px;color:#f5f6f7}
.dsm-title{font-size:22px;font-weight:550;letter-spacing:-.018em;line-height:1.25}
.dsm-sub{font-size:12.5px;line-height:1.55;margin-top:4px;max-width:680px}
.dsm-eyebrow{font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--dsw-alias-state-business-primary);font-weight:650;margin:0 0 3px}
.dsm-conn{display:flex;align-items:center;gap:7px;margin-top:7px;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsm-conn code{font:10.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:2px 6px}
.dsm-badge{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);padding:5px 11px;font-size:11px}
.dsm-card{border-color:var(--dsw-alias-border-l2);border-radius:14px;padding:20px;box-shadow:0 1px 0 rgba(255,255,255,.02)}
.dsm-card-title{font-size:13.5px;font-weight:600;letter-spacing:.005em}
.dsm-card-sub{font-size:11.5px}
.dsm-qr{width:196px;padding:9px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.24);border:1px solid rgba(0,0,0,.06)}
.dsm-code{font-size:31px;font-weight:600;letter-spacing:.12em}
.dsm-label{font-size:9.5px;letter-spacing:.12em;font-weight:600}
.dsm-url{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsm-btn{min-height:31px;font-size:11.5px;border-radius:7px;border-color:var(--dsw-alias-border-l2)}
.dsm-btn[data-primary]{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);font-weight:600}
.dsm-btn[data-primary]:hover{background:var(--dsw-alias-button-primary-hover)}
.dsm-step{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:9px}
.dsm-step-num{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);color:var(--dsw-alias-state-business-primary)}
.dsm-install{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsm-device-glyph{color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent)}
.dsm-footer{border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px;margin-top:18px}
@media (max-width:820px){.dsm-head{align-items:flex-start}.dsm-mark{width:36px;height:36px}.dsm-title{font-size:20px}.dsm-qr{width:172px}}
`

    function Page({ ctx }) {
      const locale = useLocale(ctx)
      const [status, setStatus] = React.useState(undefined)
      const [error, setError] = React.useState(undefined)
      const [busy, setBusy] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const [, setTick] = React.useState(0)

      const load = React.useCallback(async () => {
        try {
          const next = await request('/status')
          setStatus(next)
          setError(undefined)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        const run = async () => {
          try {
            const next = await request('/status')
            if (alive) { setStatus(next); setError(undefined) }
          } catch (cause) {
            if (alive) setError(cause instanceof Error ? cause.message : String(cause))
          }
        }
        void run()
        const id = setInterval(run, 5000)
        return () => { alive = false; clearInterval(id) }
      }, [])

      React.useEffect(() => {
        const id = setInterval(() => setTick(value => value + 1), 1000)
        return () => clearInterval(id)
      }, [])

      React.useEffect(() => {
        if (!copied) return undefined
        const id = setTimeout(() => setCopied(false), 1600)
        return () => clearTimeout(id)
      }, [copied])

      const rotate = async () => {
        setBusy(true)
        try {
          const next = await request('/pairing', { method: 'POST' })
          setStatus(next)
          setError(undefined)
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }

      const revoke = async device => {
        const history = device.pairingCount > 1 ? (String(locale).startsWith('en') ? `\nAll ${device.pairingCount} historical pairing records will be revoked.` : `\n将同时撤销 ${device.pairingCount} 份历史配对记录。`) : ''
        if (!window.confirm(t(locale, 'devices.revokeConfirm', { name: device.name }) + history)) return
        setBusy(true)
        try {
          await request(`/devices?id=${encodeURIComponent(device.id)}`, { method: 'DELETE' })
          await load()
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause))
        } finally {
          setBusy(false)
        }
      }

      const copy = async () => {
        if (!status?.pairing?.url) return
        try {
          await copyText(`${status.primaryUrl}\n配对码：${status.pairing.code}`)
          setCopied(true)
        } catch {
          setError(t(locale, 'pairing.copy') + ' failed')
        }
      }

      const openPhone = () => {
        if (status?.apkUrl) window.open(status.apkUrl, '_blank', 'noopener,noreferrer')
      }

      const running = status?.running === true
      const remainingInfo = status?.pairing ? remaining(status.pairing.expiresAt) : { expired: true, text: '' }
      const warnings = Array.isArray(status?.warnings) ? status.warnings : []

      return h('div', { className: 'dsm-root', 'data-dsh-plugin': 'dsh-mobile' },
        h('style', { key: 'dsm-style' }, CSS + DSH_CSS),
        h('div', { className: 'dsm-wrap' },
          h('div', { className: 'dsm-head' },
            h('button', {
              type: 'button', className: 'dsm-back', 'data-dsh-center-view-back': '',
              onClick: () => ctx.layout.selectPanel(null),
              title: t(locale, 'page.back'),
            }, '‹ ', t(locale, 'page.back')),
            h('div', { className: 'dsm-mark', 'aria-hidden': true },
              h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('rect', { x: 6.4, y: 2.2, width: 11.2, height: 19.6, rx: 2.4 }),
                h('path', { d: 'M9.2 8.2l2 2-2 2M12.4 12.6h2.6' }),
                h('circle', { cx: 12, cy: 18.4, r: .7, fill: 'currentColor', stroke: 'none' }),
              ),
            ),
            h('div', { className: 'dsm-head-main' },
              h('p', { className: 'dsm-eyebrow' }, 'DSH MOBILE'),
              h('h1', { className: 'dsm-title' }, t(locale, 'page.title')),
              h('p', { className: 'dsm-sub' }, t(locale, 'page.subtitle')),
              status === undefined ? null : h('div', { className: 'dsm-conn' },
                h('span', { className: 'dsm-dot', 'data-on': running ? '' : undefined }),
                h('span', null, running ? t(locale, 'status.ready') : t(locale, 'status.notRunning')),
                h('code', null, status.primaryUrl),
                status.relay ? h('code', null, status.relay.connected ? t(locale, 'relay.on') : t(locale, 'relay.off')) : null,
              ),
            ),
            status === undefined ? null : h('span', { className: 'dsm-badge' },
              h('span', { className: 'dsm-dot', 'data-on': running ? '' : undefined }),
              running ? t(locale, 'status.running') : (status.error ? t(locale, 'status.stopped') : t(locale, 'status.starting')),
              running ? ` · ${t(locale, 'status.devices', { count: status.devices?.length ?? 0 })}` : '',
            ),
          ),

          status === undefined && error === undefined ? h('div', { className: 'dsm-loading' },
            h('span', { className: 'dsm-spinner' }), t(locale, 'loading'),
          ) : null,

          error !== undefined && status === undefined ? h('div', { className: 'dsm-card dsm-error' },
            h('h2', { className: 'dsm-card-title' }, t(locale, 'error.title')),
            h('p', { className: 'dsm-card-sub' }, error === 'forbidden' ? t(locale, 'error.noHost') : error),
            h('div', { className: 'dsm-actions' }, h('button', { type: 'button', className: 'dsm-btn', onClick: () => void load() }, t(locale, 'error.retry'))),
          ) : null,

          status === undefined ? null : h(React.Fragment, null,
            !running ? h('div', { className: 'dsm-card dsm-error', style: { marginBottom: 16 } },
              h('h2', { className: 'dsm-card-title' }, t(locale, 'error.title')),
              h('p', { className: 'dsm-card-sub' }, status.error ?? 'Gateway is not running.'),
              h('div', { className: 'dsm-actions' }, h('button', { type: 'button', className: 'dsm-btn', onClick: () => void load() }, t(locale, 'error.retry'))),
            ) : null,

            h('div', { className: 'dsm-grid' },
              h('section', { className: 'dsm-card' },
                h('h2', { className: 'dsm-card-title' }, t(locale, 'pairing.title')),
                h('p', { className: 'dsm-card-sub' }, t(locale, 'pairing.hint')),
                h('div', { className: 'dsm-pair' },
                  status.pairing?.qrSvg
                    ? h('div', { className: 'dsm-qr', dangerouslySetInnerHTML: { __html: status.pairing.qrSvg }, 'aria-label': t(locale, 'pairing.scan') })
                    : h('div', { className: 'dsm-qr-fallback' }, t(locale, 'pairing.scan')),
                  h('div', { className: 'dsm-pair-main' },
                    h('p', { className: 'dsm-label' }, t(locale, 'pairing.code')),
                    h('p', { className: 'dsm-code' }, status.pairing ? `${status.pairing.code.slice(0, 3)} ${status.pairing.code.slice(3)}` : '— — —'),
                    h('div', { className: 'dsm-expiry' },
                      h('span', { className: 'dsm-dot', 'data-on': remainingInfo.expired ? undefined : '' }),
                      remainingInfo.expired ? t(locale, 'pairing.expired') : t(locale, 'pairing.expires', { time: remainingInfo.text }),
                    ),
                    h('p', { className: 'dsm-label' }, t(locale, 'pairing.url')),
                    h('div', { className: 'dsm-url-row' },
                      h('code', { className: 'dsm-url', title: status.primaryUrl }, status.primaryUrl),
                      h('button', { type: 'button', className: 'dsm-btn', onClick: () => void copy(), disabled: !status.pairing?.url }, copied ? t(locale, 'pairing.copied') : t(locale, 'pairing.copy')),
                    ),
                    h('div', { className: 'dsm-actions' },
                      h('button', { type: 'button', className: 'dsm-btn', onClick: () => void rotate(), disabled: busy }, t(locale, 'pairing.refresh')),
                      h('button', { type: 'button', className: 'dsm-btn', 'data-primary': '', onClick: openPhone, disabled: !status.apkAvailable }, status.apkAvailable ? t(locale, 'pairing.open') : 'APK 未构建'),
                    ),
                    h('p', { className: 'dsm-small', style: { marginTop: 10 } }, t(locale, 'pairing.lan')),
                  ),
                ),
              ),

              h('section', { className: 'dsm-card' },
                h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 } },
                  h('h2', { className: 'dsm-card-title' }, t(locale, 'devices.title')),
                  h('span', { className: 'dsm-small' }, t(locale, 'devices.limit', { limit: status.deviceLimit ?? 8 })),
                ),
                (status.devices?.length ?? 0) === 0
                  ? h('div', { className: 'dsm-empty' },
                    h('div', { className: 'dsm-empty-title' }, t(locale, 'devices.empty')),
                    h('div', { className: 'dsm-empty-sub' }, t(locale, 'devices.emptyHint')),
                  )
                  : h('div', { className: 'dsm-devices' }, status.devices.map(device =>
                    h('div', { className: 'dsm-device', key: device.id },
                      h('span', { className: 'dsm-device-glyph' }, h(MobileIcon, { size: 17 })),
                      h('div', { className: 'dsm-device-main' },
                        h('div', { className: 'dsm-device-name', title: device.name }, device.name, device.pairingCount > 1 ? h('span', { className: 'dsm-small', style: { marginLeft: 8 } }, String(locale).startsWith('en') ? `${device.pairingCount} pairing records` : `${device.pairingCount} 份历史配对`) : null),
                        h('div', { className: 'dsm-device-meta', title: `${t(locale, 'devices.pairedAt', { time: formatDate(device.createdAt) })} · ${t(locale, 'devices.lastSeen', { time: relativeTime(locale, device.lastSeenAt) })}` },
                          `${t(locale, 'devices.pairedAt', { time: formatDate(device.createdAt) })} · ${t(locale, 'devices.lastSeen', { time: relativeTime(locale, device.lastSeenAt) })}`),
                      ),
                      h('button', { type: 'button', className: 'dsm-btn', 'data-danger': '', disabled: busy, onClick: () => void revoke(device) }, t(locale, 'devices.revoke')),
                    ),
                  )),
                warnings.length > 0 ? h('div', { style: { marginTop: 14 } },
                  h('p', { className: 'dsm-label' }, t(locale, 'warnings.title')),
                  warnings.map((warning, index) => h('div', { className: 'dsm-warn', key: index }, h('span', { 'aria-hidden': true }, '!'), h('span', null, warning))),
                ) : null,
              ),

              h('section', { className: 'dsm-card dsm-wide' },
                h('h2', { className: 'dsm-card-title' }, t(locale, 'setup.title')),
                status.apkAvailable ? h('div', { className: 'dsm-install' },
                  h('div', { className: 'dsm-install-main' },
                    h('div', { className: 'dsm-install-title' }, t(locale, 'install.title')),
                    h('div', { className: 'dsm-install-hint' }, t(locale, 'install.hint')),
                    h('div', { className: 'dsm-actions' },
                      h('button', { type: 'button', className: 'dsm-btn', 'data-primary': '', onClick: openPhone }, t(locale, 'install.download')),
                    ),
                  ),
                ) : null,
                h('div', { className: 'dsm-steps' },
                  h('div', { className: 'dsm-step' }, h('div', { className: 'dsm-step-num' }, '1'), h('div', { className: 'dsm-step-text' }, t(locale, 'setup.ios'))),
                  h('div', { className: 'dsm-step' }, h('div', { className: 'dsm-step-num' }, '2'), h('div', { className: 'dsm-step-text' }, t(locale, 'setup.android'))),
                  h('div', { className: 'dsm-step' }, h('div', { className: 'dsm-step-num' }, '3'), h('div', { className: 'dsm-step-text' }, t(locale, 'setup.sameWifi'))),
                ),
              ),
            ),

            h('p', { className: 'dsm-footer' },
              t(locale, 'footer'),
              status.stateFile ? h('div', null, h('code', null, t(locale, 'stateFile', { file: status.stateFile }))) : null,
            ),
          ),
        ),
      )
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-mobile: locale')

      const disposeNav = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 50,
        label: () => ctx.locale.bind(NS)('nav.label'),
      }, MobileIcon))

      const disposeMain = ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
      }, props => h(Page, { ...props, ctx })))

      ctx.effect(() => () => {
        disposeNav()
        disposeMain()
      }, 'dsh-mobile: panel')
    }

    return {
      inject: ['slots', 'locale', 'layout'],
      apply,
    }
  },
})
