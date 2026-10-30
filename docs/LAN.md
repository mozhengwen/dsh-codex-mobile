# 局域网与私有网络

无需公网服务器。电脑与手机必须相互可达；示例电脑 IPv4 为 `192.168.1.10`，请换成自己的地址，可在 Windows `ipconfig` 中查看。建议在路由器为电脑保留固定 DHCP 地址。

## 可信内网直连

直连使用 HTTP/WS，仍要求配对，但**不提供链路加密**。只适用于你控制的可信 Wi-Fi，不要在公共 Wi-Fi、访客网络或公网使用，不要设置路由器端口映射。需要加密时使用下文私有网络或 HTTPS 中继方案。

### DSH

在已安装插件的 profile 配置中修改现有 `dsh-mobile` 行：

```yaml
- id: dsh-mobile
  name: '@local/dsh-mobile'
  config:
    port: 47821
    bindHost: '0.0.0.0'
    publicUrl: 'http://192.168.1.10:47821'
    sessionDays: 30
    deviceLimit: 8
```

不要设置 `relayUrl` 或 `relayToken`。重载插件后，手机连接 `http://192.168.1.10:47821`，使用该电脑 DSH 面板的配对码。

### Codex

在用户私有的 `codex-mobile/config.json` 中写入（不要放进源码目录）：

```json
{
  "port": 47822,
  "exposeLan": true,
  "publicUrl": "http://192.168.1.10:47822/backends/codex"
}
```

在插件面板停止再启动网关。手机选择 Codex，地址为 `http://192.168.1.10:47822/backends/codex`。首次启动仍需要本地 Codex 聊天上下文。此模式支持带后缀的配对、API、图片和 WebSocket，管理接口只接受本机连接与私有管理密钥。

### Windows 防火墙

先确认网络是你信任的**专用网络**，管理员 PowerShell 中按需要添加规则；只使用一个后端时只开放对应端口：

```powershell
New-NetFirewallRule -DisplayName 'DSH Mobile LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 47821,47822 -Profile Private -RemoteAddress LocalSubnet
```

不应改成 Public 或任意来源。删除本项目创建的规则：

```powershell
Remove-NetFirewallRule -DisplayName 'DSH Mobile LAN'
```

macOS/Linux 按自身防火墙限制为可信局域网来源。不要开放 DSH 原生宿主端口或任意管理接口。

## 加密的私有网络

可使用你已管理的加密 VPN，让手机通过电脑的 VPN 地址访问直连网关。`publicUrl` 改为该私有地址，防火墙仅允许 VPN 来源；VPN 地址不一定属于 Windows `LocalSubnet`，需按自己的网段单独设置规则。HTTP 数据在 VPN 隧道中传输，不应同时暴露到不可信物理网络。

也可在局域网机器部署 [同一套中继](PUBLIC-DEPLOY.md)，使用自己拥有的域名、有效 TLS 证书与内网 DNS，将域名解析到局域网 IP；电脑插件仍只监听 loopback。无公网入站时需用自己的 DNS-01 流程签发证书，再使用 TLS 模板。App 使用系统信任的证书链，当前没有自定义 CA 导入或跳过验证功能。

## 切回公网

DSH 恢复 `bindHost: '127.0.0.1'`；Codex 设置 `exposeLan: false`。按公网指南填写中继 URL 和独立令牌，重新启动网关，并删除不再使用的防火墙规则。局域网与公网地址在 App 中分别保存连接；不要假设 Cookie 会自动跨地址迁移。
