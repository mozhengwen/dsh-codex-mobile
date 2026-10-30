# DSH / Codex 公网中继

版本 0.3.2，Node.js 20+。部署到自己的服务器，桌面插件通过 WSS 主动出站连接，手机通过 HTTPS/WSS 访问。服务器不保存会话数据库、不运行模型、不托管 APK。

完整步骤见 [公网部署](../docs/PUBLIC-DEPLOY.md)，包含服务用户、私有令牌、HTTP 证书引导、TLS 反代、电脑配置及验收。内网直连见 [局域网指南](../docs/LAN.md)，不需要启动此服务。

| 地址 | 作用 |
| --- | --- |
| `/health` | 匿名只返回存活信息；有效后台 Bearer 令牌可读取运维状态 |
| `/plugin` | DSH 中继连接，DSH_PLUGIN_TOKEN 认证 |
| `/plugin?backend=codex` | Codex 中继连接，独立 CODEX_PLUGIN_TOKEN 认证 |
| `/pair`、`/mobile/api/*`、`/mobile/ws` | DSH 手机接口 |
| `/backends/codex/pair`、`/backends/codex/mobile/*` | Codex 手机接口 |
| `/dsh-mobile/app.apk` | 固定 404 |

默认绑定 `127.0.0.1:8787`，由 Nginx 提供公网 TLS。设备鉴权由桌面签发的 Cookie 完成；中继令牌只用于认证桌面，不能提供给手机或随源码分发。

模板默认不含真实域名或密钥。每个后端只允许一个当前桌面实例，不提供多租户账号隔离；多位用户应使用独立部署。替换连接、Origin 校验、握手前设备鉴权、Cookie 安全标志、速率/容量限制和 systemd 隔离见 [安全说明](../SECURITY.md)。

测试：先 `npm ci`，再 `npm test`。生产环境使用 `npm ci --omit=dev`。不要将 localhost 服务直接绑定公网或省略 TLS 代理。
