# DSH / Codex Mobile

用原生 Android App 远程操作电脑上运行的 DSH 或 Codex 桌面会话。支持局域网直连与自建公网中继，模型和工具仍在电脑执行。

这是社区项目，与 DSH、OpenAI 官方无隶属关系。源码采用 [MIT](LICENSE) 许可；宿主程序不随本项目分发。Codex 接入依赖桌面内部通信协议，宿主更新后可能需要适配。

## 从这里开始

1. [安装 Android App 和桌面插件](docs/INSTALL.md)。
2. 手机与电脑在同一可信网络：按 [局域网指南](docs/LAN.md) 配置，无需云服务器。
3. 外出访问：按 [公网部署指南](docs/PUBLIC-DEPLOY.md) 部署自己的 HTTPS 中继。
4. 在电脑「手机远控」面板获取二维码或十分钟有效的配对码，在 App 配对。DSH、Codex 分别配对，随后从顶部下拉切换。

**本仓库不提供公共中继或共享密钥。每位部署者使用自己的地址和令牌。服务器不托管 APK。**

## 功能与边界

| 功能 | DSH | Codex |
| --- | --- | --- |
| 项目/最近任务、工作区选择、发送、重命名、停止 | 支持 | 支持 |
| 流式文本、工具记录、网页搜索记录 | 支持 | 支持，依赖桌面协议 |
| 图片上传与预览 | 支持 | 支持；远程项目先发文字创建任务 |
| 模型、思考等级 | 按宿主能力 | 按宿主能力 |
| 审批、结构化提问 | 支持 | 在电脑端处理 |
| 插件初始化恢复已启用网关 | 随宿主加载 | 支持，首次需本地聊天上下文 |

图片每条最多四张，压缩后每张不超过 2 MB。Codex 历史通常取最近十轮，大会话可能缩减；尚无历史翻页。本机新建 Codex 会话完整首发与远程原生发送还需要不同宿主环境的实际验收，当前自动化测试不代表所有桌面版本兼容。

## 结构

```text
dsh-mobile/           DSH 插件与本机网关（默认 47821）
codex-mobile-plugin/  Codex MCP 插件与伴随网关（默认 47822）
dsh-mobile-android/   Kotlin / Jetpack Compose Android App
dsh-mobile-server/    Node.js 公网中继、Nginx、systemd 模板
.agents/plugins/     Codex 本地 marketplace 清单
docs/                 安装、局域网、公网、安全与发布说明
scripts/              密钥检查和白名单源码导出
```

公网链路：`手机 HTTPS/WSS → 自建中继 ← WSS 桌面插件 → 本机网关 → 桌面宿主`。中继会接触转发中的明文载荷，因此必须信任中继管理员；这不是手机到电脑的端到端加密协议。会话由桌面保存，图片保存在电脑受控附件目录。

## 开发与发布

需要 Node.js 20+；Android 需要 JDK 17、Android SDK 35、Gradle 8.9。Codex UI 已提供自包含构建产物，安装运行不需要 npm 下载 UI 依赖。

```powershell
node --test dsh-mobile/test/*.test.mjs codex-mobile-plugin/test/*.test.mjs
npm --prefix dsh-mobile-server ci
node --test dsh-mobile-server/test/*.test.mjs
node scripts/check-publishable-secrets.mjs
node scripts/export-source.mjs
```

检查工具需要单独安装官方 [Gitleaks](https://github.com/gitleaks/gitleaks)，或设置 `GITLEAKS_BIN` 指向可执行文件。导出脚本扫描实际导出内容，未安装扫描器或发现风险时停止，不会上传任何内容。

详见 [安全边界](SECURITY.md)、[贡献与验证](CONTRIBUTING.md)、[源码发布流程](docs/RELEASING.md)、[第三方许可](THIRD_PARTY_NOTICES.md)。
