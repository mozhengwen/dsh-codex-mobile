# 以安全的内容发布源码

## 导出

安装官方 Gitleaks 并放入 PATH（或设置 `GITLEAKS_BIN`）。从仓库根目录：

```powershell
node scripts/export-source.mjs
```

脚本在 `.release/` 下新建唯一目录，只复制明确列出的项目源码、依赖许可证、测试、模板与本套文档。排除所有旧截图/发布记录、个人站点、私有安全审计、`.tools`、无关项目、运行数据、构建缓存、APK 和签名文件。符号链接会阻止导出，避免越界。

随后检查文件类型、私钥特征，并强制 Gitleaks 脱敏扫描。扫描时临时加入已知模式的测试标记，确认实际目录被覆盖，结束后移除；不会将“全部被排除”的零字节扫描当成成功。发现问题或扫描器缺失会以非零退出，不生成压缩包。成功后生成文件哈希清单、ZIP 与 ZIP 的 SHA-256。只有成功生成的源码包才是可发布结果；工作目录不是发布范围。每次发布还需审查差异与文件清单，检查新加入的个人域名、机器路径和截图。

## 发布到仓库

解压成功的源码包，在这个**干净目录**建立新仓库并查看待提交文件：

```powershell
git init -b main
git add .
git diff --cached --stat
git diff --cached --check
node scripts/check-publishable-secrets.mjs
git commit -m "Initial open-source release"
```

确认文件清单后，再绑定你自己的空远端并推送。不要在原始个人工作目录执行 `git add -f`，不要迁入旧私有历史。本项目不自动创建远端、修改 Git 身份或上传内容。

更新已公开仓库时审查差异，再重新生成源码包。发布 APK 使用独立 Release 附件或本地交付，先计算哈希和签名证书；不要上传到中继服务器。源码包不提供维护者签名私钥。
