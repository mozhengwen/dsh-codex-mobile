# Third-party notices

Project-authored source is distributed under the root MIT license. DSH and Codex desktop applications, extracted host bundles, user data and SDK installations are not included.

- `dsh-mobile/vendor/qrcode.cjs` and `codex-mobile-plugin/vendor/qrcode.cjs`: qrcode-generator 2.0.4, MIT, Kazuhiko Arase; original license header retained.
- Both plugin `vendor/ws` directories: ws, MIT; each includes its own LICENSE.
- Codex UI bundles MCP Apps SDK and its dependencies. See `codex-mobile-plugin/vendor/ui-licenses.txt` and retained inline license comments. UI build uses esbuild; dependency versions and integrity hashes are in package-lock.json.
- Android resolves AndroidX/Jetpack Compose, Kotlin/kotlinx, OkHttp, ZXing Android Embedded and transitive dependencies through Gradle. Their respective license terms apply; review dependency notices when distributing your APK. Dependencies and Android SDK are not copied into the source archive.

Product names are used to identify compatible hosts. Upstream trademarks and their usage terms remain with their owners.
