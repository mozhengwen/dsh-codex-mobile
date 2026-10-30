# 自建公网中继（Ubuntu / Debian + Nginx）

适用：一位用户的一套 DSH 和一套 Codex 桌面。中继每个后端只有一个当前连接；同一令牌的另一实例会替换它。多位独立用户请分别部署实例、域名与令牌，不要共享部署者密钥。

以下用 `relay.example.com`，全部替换成自己的域名。电脑主动出站 WSS，无需电脑公网 IP 或端口映射。APK 不部署到服务器。

## 1. 服务器与依赖

准备一台你管理的 Linux 服务器，安装 Node.js 20+、npm、Nginx、Certbot 和 Nginx 插件。域名 A（及实际使用时 AAAA）解析到服务器。云安全组与主机防火墙允许 80/443，SSH 限制到自己的管理来源；不要在未确认 SSH 规则前启用或清空防火墙。

```bash
node --version
sudo apt-get update
sudo apt-get install nginx certbot python3-certbot-nginx
sudo useradd --system --user-group --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin dsh-mobile-relay
```

已有服务用户时跳过 `useradd`。systemd 模板使用 `/usr/bin/node`，若 Node 安装在其他位置，先修正 `ExecStart`；不要依赖某位用户的 nvm 目录，服务的 ProtectHome 会阻止访问。

只将仓库中的 `dsh-mobile-server` 源码目录传到服务器自己的临时目录。以下在该目录内执行：

```bash
sudo install -d -o root -g root -m 755 /opt/dsh-mobile-server
sudo install -m 644 server.mjs security.mjs package.json package-lock.json /opt/dsh-mobile-server/
sudo npm --prefix /opt/dsh-mobile-server ci --omit=dev
sudo install -o root -g root -m 600 deploy/dsh-mobile-server.env.example /etc/dsh-mobile-server.env
sudo install -m 644 dsh-mobile-server.service /etc/systemd/system/dsh-mobile-server.service
```

## 2. 独立令牌

在你自己的终端运行两次下列命令，各生成一个不同的 32 字节随机值。不要将输出贴到聊天、issue、命令行参数或提交中。

```bash
openssl rand -hex 32
openssl rand -hex 32
sudoedit /etc/dsh-mobile-server.env
```

填入：

```dotenv
PORT=8787
DSH_PLUGIN_TOKEN=<第一个随机值>
CODEX_PLUGIN_TOKEN=<第二个不同的随机值>
```

即使只用 Codex，目前服务器也要求设置 `DSH_PLUGIN_TOKEN`，为它生成一个独立值即可，不必连接 DSH。令牌相当于受信任桌面的凭证，只保存在这个文件与对应电脑的私有配置中。

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dsh-mobile-server
sudo systemctl status dsh-mobile-server --no-pager
curl --fail http://127.0.0.1:8787/health
```

匿名健康响应应只含服务存活信息。Node 始终监听 `127.0.0.1:8787`，不要开放 8787。

## 3. 先申请证书，再启用完整 TLS 模板

模板不能在证书尚不存在时直接加载。先使用 HTTP 引导模板：

```bash
sed 's/relay.example.com/你的实际域名/g' deploy/nginx-bootstrap.conf | sudo tee /etc/nginx/sites-available/dsh-mobile >/dev/null
sudo ln -s /etc/nginx/sites-available/dsh-mobile /etc/nginx/sites-enabled/dsh-mobile
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --nginx -d 你的实际域名
```

已有同名站点链接时核对后跳过 `ln -s`；不要覆盖其他业务站点。证书成功后再替换为包含限流、无查询参数日志与 WebSocket 代理的 TLS 配置：

```bash
sed 's/relay.example.com/你的实际域名/g' deploy/nginx-dsh.conf | sudo tee /etc/nginx/sites-available/dsh-mobile >/dev/null
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
curl --fail https://你的实际域名/health
```

模板中的 map/limit zone/log format 位于 http 上下文，Debian/Ubuntu 的 `sites-enabled` 默认在此上下文 include。其他布局需按自己的 nginx.conf 放置。模板只安装一次；多个实例需使用不同 zone/map 名称和端口。

## 4. 电脑插件

DSH 已安装插件的 profile 配置：

```yaml
- id: dsh-mobile
  name: '@local/dsh-mobile'
  config:
    port: 47821
    bindHost: '127.0.0.1'
    publicUrl: 'https://relay.example.com'
    relayUrl: 'wss://relay.example.com/plugin'
    relayToken: '<DSH_PLUGIN_TOKEN 的真实值，仅写在电脑私有配置>'
```

Codex 用户私有目录 `codex-mobile/config.json`：

```json
{
  "port": 47822,
  "exposeLan": false,
  "publicUrl": "https://relay.example.com/backends/codex",
  "relayUrl": "wss://relay.example.com/plugin?backend=codex",
  "relayToken": "<CODEX_PLUGIN_TOKEN 的真实值，仅写在电脑私有配置>"
}
```

重载 DSH 插件；Codex 在面板停止再启动。确认面板显示中继已连接。电脑出站必须能访问域名 443，电脑网关保持 loopback，无需入站规则。

## 5. 手机配对与验收

- DSH 地址 `https://relay.example.com`；Codex 地址 `https://relay.example.com/backends/codex`。分别使用对应桌面的二维码或配对码。
- 未配对访问 `/mobile/api/sessions` 与 `/backends/codex/mobile/api/sessions` 应返回 401；配对页可公开查看。
- 手机关闭 Wi-Fi，用蜂窝网络验证配对、项目列表、对话与流式输出。模型发送测试会使用自己的模型额度。
- 撤销一个测试设备后，该设备应无法再读取会话。TLS 应有效且管理路径 `/dsh-mobile/api/status`、`/_codex-mobile/panel` 不对公网开放。
- `/dsh-mobile/app.apk` 固定 404，APK 单独本地构建和交付。

## 运维与升级

```bash
sudo journalctl -u dsh-mobile-server -n 100 --no-pager
sudo nginx -t
sudo systemctl status dsh-mobile-server
sudo certbot renew --dry-run
```

升级前在服务器私有目录备份当前代码、站点配置及环境文件；保护备份权限，不要放进仓库。用新版本源码覆盖明确的文件、运行 `npm ci --omit=dev`，通过检查后重启中继。中继重启会短暂断开，桌面自动重连；不要删除桌面配对状态。

令牌泄露时生成新值，更新服务器和对应电脑后重启。手机凭据泄露在桌面撤销设备。日志虽不记录 URL 查询参数，也需按私有运维数据保管。安全限制和尚未覆盖的风险见 [SECURITY.md](../SECURITY.md)。
