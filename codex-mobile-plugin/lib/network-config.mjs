export function gatewayOptions(config = {}, bootstrap = {}, args = {}) {
  const port = args.port ?? config.port ?? bootstrap.port ?? 47822
  const exposeLan = args.exposeLan ?? config.exposeLan ?? bootstrap.exposeLan ?? false
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid port')
  if (typeof exposeLan !== 'boolean') throw new Error('exposeLan must be boolean')
  if (exposeLan) {
    let url
    try { url = new URL(config.publicUrl) } catch { throw new Error('局域网模式需要配置手机可访问的 publicUrl，以 /backends/codex 结尾') }
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/backends/codex' || url.search || url.hash || url.username || url.password) throw new Error('invalid Codex LAN publicUrl')
    if (config.relayUrl || config.relayToken) throw new Error('局域网直连与公网中继请分别配置，不要同时启用')
  }
  return { port, exposeLan }
}
