# 开发与验证

所有命令从仓库根目录执行。Node.js 20+；目前主要在 Windows 桌面环境验证，其他系统需要额外验收。

```powershell
npm --prefix dsh-mobile-server ci
node --test dsh-mobile/test/*.test.mjs codex-mobile-plugin/test/*.test.mjs dsh-mobile-server/test/*.test.mjs
```

Codex 面板预构建为 `codex-mobile-plugin/ui/panel.html`。更改 UI 后：

```powershell
npm --prefix codex-mobile-plugin ci
npm --prefix codex-mobile-plugin run build:ui
```

锁文件固定构建依赖；构建不依赖维护者的 `.tools`。运行插件只使用已捆绑的 ws、二维码模块和 UI 产物。

Android 安装 JDK 17、SDK 35、Gradle 8.9：

```powershell
gradle -p dsh-mobile-android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

自动化测试用模拟桌面、隔离临时状态与本机网络，不应向真实会话发送测试消息或消耗模型额度。真实设备与宿主兼容性需要另行验收，尤其是 Codex 首次创建、本机/远程项目以及宿主升级。

提交前运行 `node scripts/check-publishable-secrets.mjs`；发行前运行 [白名单导出](docs/RELEASING.md)。提交不要包含真实截图、日志、模型密钥、运行目录或签名材料。
