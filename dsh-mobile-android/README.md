# Android App

Kotlin / Jetpack Compose 原生客户端，最低 Android 8.0。版本 0.7.2 源码增加禁止系统备份配对数据，并移除维护者默认服务地址。使用自己的局域网地址或自建中继；支持 DSH/Codex 下拉切换、项目、工作区、图片、模型/思考等级与增量输出。

安装和使用见 [统一指南](../docs/INSTALL.md)，网络配置见 [局域网](../docs/LAN.md) / [公网](../docs/PUBLIC-DEPLOY.md)。服务器不提供 APK 下载。

## 自行构建

安装 JDK 17、Android SDK Platform 35 和 Gradle 8.9，将 SDK 路径写入不提交的 local.properties，或设置 ANDROID_HOME。从仓库根目录：

```powershell
gradle -p dsh-mobile-android :app:assembleDebug
adb install -r dsh-mobile-android/app/build/outputs/apk/debug/app-debug.apk
```

调试版包名 `com.local.dshmobile.preview`，可与正式版并存。

## 正式签名

发布私钥和密码必须保存在源码外。将 [signing.properties.example](signing.properties.example) 复制到用户私有目录，填写你自己的 keystore 绝对路径与密码，通过 `DSH_SIGNING_PROPERTIES` 指定该配置文件。默认查找用户目录 `.dsh-mobile/signing/dsh-mobile-release.properties`。也可使用 DSH_KEYSTORE_FILE、DSH_KEYSTORE_PASSWORD、DSH_KEY_ALIAS、DSH_KEY_PASSWORD 环境变量。

配置成功后：

```powershell
gradle -p dsh-mobile-android :app:assembleRelease
adb install -r dsh-mobile-android/app/build/outputs/apk/release/app-release.apk
```

没有私有签名配置时，产物是 `app-release-unsigned.apk`，不能直接安装。每位发布者使用自己的签名；与你现有安装的签名不同会导致无法覆盖安装。不要上传私钥，不要把密码作为命令参数公开。

## 验证

```powershell
gradle -p dsh-mobile-android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

App 保存连接、配对凭据与草稿。`allowBackup=false` 防止系统备份应用数据；局域网 HTTP 显式保留支持，需遵循可信网络边界。公网使用系统信任的 TLS，不接受关闭证书校验的部署方法。
