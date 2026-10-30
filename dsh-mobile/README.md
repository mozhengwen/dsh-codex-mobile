# DSH 桌面插件

`@local/dsh-mobile` 将现有 DSH 桌面会话提供给原生 Android App。版本 0.5.1，默认仅监听 `127.0.0.1:47821`；局域网直连必须显式设置 `bindHost`，公网使用主动出站 WSS 中继。

- [安装插件与 App](../docs/INSTALL.md)
- [局域网配置](../docs/LAN.md)
- [自建公网中继](../docs/PUBLIC-DEPLOY.md)
- [安全边界](../SECURITY.md)

插件 bundle 清单为 `cordis.patch.yml`，安装后在 DSH 左侧打开「手机远控」。面板提供配对二维码、六位码、设备列表与撤销操作。配对码约十分钟有效，设备凭据默认三十天。

支持项目/工作区、新建任务、流式文本与工具记录、发送/停止、图片、模型与思考等级；可用模型和交互能力来自桌面宿主。审批和结构化提问由 DSH 宿主处理。

本机状态保存在 `$DSH_HOME/dsh-mobile/`，包含设备认证与附件数据，不应随插件分发。公网中继令牌写入宿主私有配置，不写入源码。发布服务器不托管 APK，App 单独构建与安装。

开发测试：`node --test dsh-mobile/test/*.test.mjs`。第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
