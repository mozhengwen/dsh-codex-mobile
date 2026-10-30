# Codex Mobile 插件

版本 0.5.2。通过桌面 MCP 插件接入已有 Codex 会话，提供「手机远控」面板、本机伴随网关、配对、设备撤销与主动出站中继。默认监听 `127.0.0.1:47822`；局域网模式需显式启用。

- [安装和首次启动](../docs/INSTALL.md)
- [局域网直连](../docs/LAN.md)
- [公网中继配置](../docs/PUBLIC-DEPLOY.md)
- [开发与 UI 构建](../CONTRIBUTING.md)
- [安全边界](../SECURITY.md)

插件清单位于 `plugin.json` 与兼容目录 `.codex-plugin/plugin.json`，stdio 配置位于 `mcp.json` / `.mcp.json`。仓库根目录的 marketplace 提供本地安装入口。官方依据：[插件打包](https://developers.openai.com/plugins/build/plugins)。

首次从本地聊天启动网关以保存宿主上下文；后续插件初始化恢复已启用的网关。停止会关闭自动恢复，重新启动即可启用。MCP 会话结束不会立即关闭网关，桌面退出后伴随进程通过存活检查退出。

任务、项目、历史与重命名使用桌面工具通道；原生发送、停止、模型设置和流式输出使用桌面内部 IPC follower 协议。需要宿主提供 `CODEX_APP_TOOLS_PIPE_PATH` 和调用上下文，不能独立作为 Codex CLI 服务使用。宿主更新可能需要适配；侧栏展示位置和入口支持由宿主版本决定。

支持项目/最近视图、草稿、发送、停止、重命名、模型/思考等级、图片与网页工具记录。审批和结构化提问在桌面完成，手机接口返回 501。Codex 历史通常取最近十轮，大会话可缩减；暂不支持历史翻页。

本机新建使用短暂内核初始化空任务，再交由桌面发送；完整实际首发仍需更多宿主版本验收。远程新建调用桌面 create_thread，首条图片需先发文字创建任务；远程原生输入仅有协议测试。加载已有任务可能切换桌面当前页面。

私有状态、config.json、日志、草稿与上传图片在 `CODEX_HOME/codex-mobile/`，默认 `~/.codex/codex-mobile/`，不要复制到插件目录或提交。设备配对独立于 DSH。二维码仅通过 UI 私有元数据传递，不进入工具的模型可见文本。

运行时已捆绑 ws、二维码模块和自包含 UI，不需要下载 UI 依赖。修改面板后使用本目录锁文件 `npm ci` 和 `npm run build:ui`，见开发说明。第三方许可证包含在 `vendor/`。
