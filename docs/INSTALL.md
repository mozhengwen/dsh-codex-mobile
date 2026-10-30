# 安装与首次使用

## 环境

- Android 8.0（API 26）及以上；相机权限仅用于扫描配对二维码。
- 电脑保持 DSH 或 Codex 桌面运行并登录。电脑休眠、退出宿主时无法执行任务。
- Node.js 20+，安装 Codex 插件时确保桌面进程的 PATH 中能找到 `node`。
- 从本仓库解压源码到自己的目录。以下命令均从仓库根目录执行，不需要维护者电脑上的目录或密钥。

## Android

如果发布者提供单独的 APK，核对发布说明中的 SHA-256 和签名证书后安装。源码包不包含 APK，也不通过中继提供下载。

自行构建：安装 JDK 17、Android SDK Platform 35、Gradle 8.9，将 SDK 路径写入本机 `dsh-mobile-android/local.properties`（该文件不提交），或设置 `ANDROID_HOME`。

```powershell
gradle -p dsh-mobile-android :app:assembleDebug
adb install -r dsh-mobile-android/app/build/outputs/apk/debug/app-debug.apk
```

Debug 包名带 `.preview`，可与正式版并存。需要正式签名时参考 [Android 构建说明](../dsh-mobile-android/README.md)。未配置私钥的 release 构建生成 unsigned APK，不能直接安装。不要使用或索取维护者签名私钥。

## DSH 插件

在 DSH 的插件安装流程中使用本地 bundle 目录 `dsh-mobile`。支持 `plugin_manager` 的宿主可执行：

```text
plugin_manager install_bundle target=<解压目录下 dsh-mobile 的绝对路径>
```

插件名为 `@local/dsh-mobile`，bundle 清单是 `dsh-mobile/cordis.patch.yml`。不要只添加配置行却没有安装插件源码。安装后重新加载插件，在 DSH 左侧打开「手机远控」。根据 [局域网](LAN.md) 或 [公网](PUBLIC-DEPLOY.md) 指南，在当前 profile 的插件配置中填写网络参数；不要重复插入同名插件。

## Codex 插件

此插件操作现有桌面宿主，单独运行 `node server.mjs` 或只启动 Codex CLI 不能代替桌面提供的工具管道和会话上下文。

仓库已包含 `.agents/plugins/marketplace.json`，从仓库根目录注册本地源：

```powershell
codex plugin marketplace add .
```

重新加载桌面，在插件目录选择 **DSH Mobile 本地插件**，安装 **手机远控 / codex-mobile**。支持 `plugin add` 的 CLI 版本也可执行：

```powershell
codex plugin add codex-mobile@dsh-mobile-local --json
```

如 CLI 不支持该子命令，使用桌面的插件目录；不要手工复制旧版本缓存。官方依据：[插件打包与本地 marketplace](https://developers.openai.com/plugins/build/plugins)。入口展示位置和 marketplace 可用性由宿主版本决定。

网络配置保存在用户私有目录：Windows 默认 `%USERPROFILE%\.codex\codex-mobile\config.json`，macOS/Linux 默认 `~/.codex/codex-mobile/config.json`；自定义 `CODEX_HOME` 时使用其下的 `codex-mobile/config.json`。示例见网络指南。修改配置后在面板停止再启动网关。

第一次从**本地 Codex 聊天**打开插件面板并启动远控，保存宿主调用上下文。之后插件初始化会恢复已启用的网关；「停止远控」同时关闭自动恢复，再启动即重新启用。桌面退出后网关会在存活检查失败后退出。

## 配对与日常使用

1. 先完成网络配置，再确认面板的连接地址是手机可访问地址，不能是手机自己的 `127.0.0.1`。
2. 打开 App 扫描配对二维码，或选择 DSH/Codex 并填入地址和六位配对码。Codex 地址必须以 `/backends/codex` 结尾。
3. 配对码约十分钟过期；配对成功后 App 保存设备凭据，默认三十天。面板可以撤销设备，撤销立即使凭据失效。
4. 分别添加 DSH 和 Codex，顶部下拉可切换。局域网两者端口不同，添加另一连接时检查端口，不能只改 URL 后缀。
5. 在「项目」选择工作区、新建任务，输入框附近选择模型与思考等级，附件按钮选择图片。

## 排错

| 现象 | 检查 |
| --- | --- |
| 连接超时 | 同网段/访客 Wi-Fi 隔离、IP 是否变化、电脑防火墙、电脑休眠；公网检查 DNS、TLS、80/443 和中继连接 |
| 401 / 配对过期 | 在桌面刷新配对码并重新配对；检查地址/后端是否选对 |
| 429 | 等待限流窗口恢复，不要持续点击配对或自动重试错误码 |
| 503 | 桌面插件不在线、令牌不一致或 WSS 中继未连接；先看桌面面板与服务器日志 |
| Codex 无法读取 | 检查桌面运行、首次上下文与 Node PATH；内部协议可能随宿主更新变化 |
| 有历史但不流式 | 确认反代支持 WebSocket 且禁用缓冲；更新 App 和插件，查看是否回退到历史校正 |
| 没有侧栏入口 | 确认插件实际安装、重载后工具资源被发现；宿主版本可能不支持全局入口 |
| TLS 错误 | 检查证书域名、有效期、系统时间和完整链；不要关闭证书校验 |

排错时只分享脱敏日志，移除 Cookie、二维码、配对码、令牌、路径和真实对话内容。
