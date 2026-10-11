# 开发与维护

[返回首页](../README.md) · [English quick start](#english-quick-start)

## 本地构建

使用 Node.js 22.14 或更新版本；CI 使用 Node.js 24。普通网页构建与测试无需 Android 工具链。

```sh
npm ci
npm run build:web
npm run test:web
```

构建输出在 `www/`，用支持 WebAssembly 的本地 HTTP 服务预览。不要直接通过 `file://` 打开。

## 目录和构建方式

| 路径 | 用途 |
| --- | --- |
| `assets/` | 上游 fend 的预构建 React 界面和 WASM 内核。 |
| `scripts/` | 汇率、计算引擎恢复、输入预览、离线缓存及 Android 构建补丁。 |
| `tests/` | 使用实际 WASM 和受控网络数据的回归测试。 |
| `exchange-rates.xml` | 内置备用汇率的源数据。 |
| `resources/` | Android 图标和启动画面的源图。 |
| `www/` | 自动生成的网页发布目录，不提交到仓库。 |
| `docs/` | 使用、维护和 README 图片；不打入网页或 APK。 |

计算内核来自 [printfn/fend](https://github.com/printfn/fend) 的 Rust / WebAssembly 构建。脚本只修改 `www/`，保留 `assets/` 的上游源文件。构建会嵌入备用汇率、移除闲置加载动画和等待工具、清除不存在的调试映射引用，再为整组资源生成与内容对应的版本地址。嵌入后不再发布独立 XML 副本。

同步上游 UI/WASM 后必须运行 `npm run test:web`；补丁无法匹配时构建会失败。第三方许可保留在 `THIRD_PARTY_NOTICES.txt`，会随网页和 APK 一起发布。

## 汇率和运行时

提交货币计算时同时请求两个入口，整个响应下载和校验最多等待 15 秒：

- `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json`
- `https://latest.currency-api.pages.dev/v1/currencies/usd.min.json`

有效响应以美元为基准并保存到本地存储；失败、超时或无效响应依次退回已保存数据和内置联合国快照。顶部显示来源、数据日期和更新状态。算术、温度及输入提示不等待网络；下载完成会重算正在输入的预览。金额变量的既有内核限制见[使用说明](USAGE.md#已有金额变量为什么没有按新汇率变化)。

更新内置备用快照：

```sh
npm run rates:update
npm run test:web
```

提交更新后的 XML 并重新构建、部署，才能更新发布包中的备用数据。

运行时处理存储受限、损坏的历史记录、引擎启动失败、过期计算响应和过大的汇率响应。PR 自动执行依赖漏洞检查及计算回归测试。

## PWA 部署

GitHub Pages 由 [.github/workflows/deploy-pages.yml](../.github/workflows/deploy-pages.yml) 发布 `www/`。仓库设置应为 **Settings → Pages → Source: GitHub Actions**。

全部离线资源下载成功后才安装 Service Worker。新版等旧窗口关闭或用户点击更新后生效；多个窗口跨版本打开时，旧窗口仍可加载原版资源。缓存按应用路径隔离，所有窗口确认新版后才清理旧缓存，同时保护下载中和等待启用的版本。

## Android 构建和签名

APK 由 [.github/workflows/build-apk.yml](../.github/workflows/build-apk.yml) 使用 Capacitor 构建，复用同一份 `www/`。本地 Android 构建还需要 JDK 21 和 Android SDK：

```sh
npx cap add android
cd android
./gradlew assembleDebug
```

原生应用停用并清理旧 Service Worker 缓存，以免旧网页覆盖包内资源；本地保存的在线汇率仍保留在应用存储中。

**已有发布必须继续使用原签名密钥，不要生成替代密钥。** 只有新项目首次配置时，才运行 `npm run android:keystore`。辅助脚本将密钥和仅本人可读的凭据文件保存在 `.signing/`，不会打印密码，并提供从私密文件读取内容的上传命令。

在 **Settings → Secrets and variables → Actions** 设置：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | keystore 文件的单行 Base64。 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码。 |
| `ANDROID_KEY_ALIAS` | 密钥别名。 |
| `ANDROID_KEY_PASSWORD` | 密钥密码。 |
| `ANDROID_CERT_SHA256`（可选） | 预期签名证书的 SHA-256 指纹，可带冒号。 |

安全备份原 keystore 和凭据，切勿提交到仓库或日志。密钥丢失后无法继续给现有安装签发同签名升级包。

正式标签必须是完整语义版本（如 `v1.0.5`），且配置全部四项签名凭据，否则构建停止。未配置凭据的分支构建使用每次不同的 debug 密钥，不能用于正式版覆盖升级。

分支与标签构建共用递增的 `versionCode`；同包名、同签名且版本号更高的 APK 可覆盖安装并保留存储。发布前核对版本、签名和包内资源。Android 构建使用只读仓库权限，已验证 APK 在独立发布任务中上传至 Release。

## English quick start

Use Node.js 22.14+ (CI uses 24):

```sh
npm ci
npm run test:web
```

Serve the generated `www/` directory over HTTP. `assets/` contains the upstream React/WASM build; patches apply only to `www/`. Run the regression suite after syncing upstream. `npm run rates:update` refreshes the bundled backup source; rebuild and deploy to publish it.

GitHub Pages publishes `www/` through its workflow. Capacitor packages that same output for Android; local Android builds require JDK 21 and the Android SDK. Tagged releases require the four signing secrets listed above. **Keep the existing release key for upgrades; generate a key only for a new project.** Back up the keystore and credentials securely. An optional certificate fingerprint prevents unexpected signing identities, and CI checks the APK signature before publishing.
