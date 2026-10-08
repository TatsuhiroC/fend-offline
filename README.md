# fend offline calculator / fend 离线计算器

[**▶ 打开计算器 / Open Calculator**](https://tatsuhiroc.github.io/fend-offline/)

An offline-capable web app for [fend](https://github.com/printfn/fend), an arbitrary-precision unit-aware calculator. Works entirely in the browser via WebAssembly — no server, no network required after first load.

基于 [fend](https://github.com/printfn/fend) 的离线网页计算器。通过 WebAssembly 在浏览器本地运行，首次加载后无需网络。

## Features / 功能

- **Arbitrary precision** — `pi * 10^50` gives you 50 digits, no sweat
- **Unit conversion** — `100 kg to lbs`, `5'10" to cm`, `1 lightyear to parsecs`
- **Currency** — latest online rates first, saved rates when offline, bundled snapshot as a final fallback
- **Number bases** — `0xff to decimal`, `0b1001 + 3`
- **Complex numbers** — `cos(pi/4) + i * sin(pi/4)`
- **Trigonometry, logarithms, algebra** — and more

---

- **高精度计算** — `pi * 10^50` 直接给出 50 位
- **单位换算** — `100 kg to lbs`、`5'10" to cm`、`1 lightyear to parsecs`
- **汇率** — 优先读取最新在线汇率，断网时使用已保存的数据，最后以内置快照兜底
- **进制转换** — `0xff to decimal`、`0b1001 + 3`
- **复数** — `cos(pi/4) + i * sin(pi/4)`
- **三角函数、对数、代数** 等等

## Usage / 使用

1. Open the [calculator](https://tatsuhiroc.github.io/fend-offline/) in Safari
2. Tap **Share** → **Add to Home Screen**
3. Use it like a native app — works offline after first visit

---

1. 用 Safari 打开[计算器](https://tatsuhiroc.github.io/fend-offline/)
2. 点 **分享** → **添加到主屏幕**
3. 像原生 app 一样使用，首次访问后可离线使用

## Android APK / 安卓安装包

Download the latest APK from the [Releases](https://github.com/TatsuhiroC/fend-offline/releases) page and install it on your Android phone. It contains the same calculator and network-first rates as the website. Calculator resources and backup rates are bundled for offline use. Website updates do not replace an installed APK: install a rebuilt package to get frontend changes. Saved online rates remain in app storage across an upgrade with the same app ID and signing certificate. The native app retires browser service-worker caches so they cannot override its packaged frontend.

从 [Releases](https://github.com/TatsuhiroC/fend-offline/releases) 页面下载最新 APK，直接安装到安卓手机。APK 与网页共用计算引擎和在线优先的汇率逻辑，并内置计算资源及备用汇率，断网也能使用。网页更新不会替换已安装 APK 的程序代码，需要安装重新构建的包。使用相同应用 ID 和签名覆盖安装时，已保存的在线汇率会保留。原生应用会停用并清理旧网页缓存，避免旧缓存覆盖新安装包的内容。

### APK signing / APK 签名

APKs are signed with a keystore kept in GitHub Secrets. Branch and tagged builds share an increasing Android versionCode, so a newer package signed with the same certificate installs **over** the previous one. Add these four secrets under **Settings → Secrets and variables → Actions** (or run `bash scripts/make-keystore.sh`, which saves a new keystore and owner-only secret files under `.signing/`, without printing credentials):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` on a single line |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Optionally set `ANDROID_CERT_SHA256` to the keystore's SHA-256 fingerprint (colons included) and CI will refuse to publish an APK signed with anything else.

Keep the keystore file itself backed up: if it is lost, existing installs can only be updated by uninstalling the app first. Tagged releases require all four secrets and fail if any are missing. Branch builds without the secrets fall back to a **debug** APK — every runner generates a fresh debug key, so users have to uninstall before installing the next build.

---

APK 使用保存在 GitHub Secrets 里的 keystore 签名；分支构建和正式版本共用递增的安卓版本号，因此签名一致的新包可以覆盖安装旧版本。在 **Settings → Secrets and variables → Actions** 里添加以下四个 secret（也可以直接运行 `bash scripts/make-keystore.sh`，它会把新 keystore 和仅本人可读的 secret 文件保存在 `.signing/`，不会打印密码或密钥内容）：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` 的结果（单行） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

可选：把 keystore 的 SHA-256 指纹（带冒号）填到 `ANDROID_CERT_SHA256`，CI 就会拒绝发布用其他密钥签名的 APK。

请务必备份 keystore 文件本身：一旦丢失，已安装的用户只能先卸载才能升级。正式版本缺少任何签名 secret 时会停止构建；分支构建未配置这些 secret 时会退回到 **debug** APK——每个 runner 都会重新生成一个 debug 密钥，用户必须先卸载才能安装下一个版本。

## How it works / 原理

The core [fend](https://github.com/printfn/fend) library is written in Rust and compiled to WebAssembly. This repo packages the pre-built WASM + a minimal React UI into a static site with a [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) for offline caching. The Android APK is built automatically by [GitHub Actions](.github/workflows/build-apk.yml) using [Capacitor](https://capacitorjs.com).

Web and PWA use the same network-first currency logic. A submitted currency calculation requests the latest USD-based data from [Currency API](https://github.com/fawazahmed0/exchange-api), racing its jsDelivr endpoint and Cloudflare mirror in parallel. The complete request has a 15-second deadline; each mirror can use that entire window. Valid responses are saved in browser storage; failed, slow or invalid responses use the last saved rates, or the bundled UN snapshot if no download has succeeded. The page shows the data date, whether online or local fallback rates are in use, and whether an update is pending, timed out or unavailable. Currency API publishes daily data, not tick-by-tick trading quotes. Temperature, arithmetic and typing hints never wait for the rates request. Plain `cup` and `pounds` are ordinary volume/mass units; `CUP` and `GBP` denote currencies. A typed preview is recalculated when the background rate download succeeds. Run `npm run rates:update` to refresh the built-in backup snapshot.

Known engine limitation: a non-USD currency amount stored in a variable, such as `x = 100 CNY`, retains the assignment-time conversion factor in the current WASM engine. Downloading new rates does not update that factor. For a fresh conversion, enter the amount directly (`100 CNY to USD`) or reassign the variable after the rate update. The online status describes the downloaded dataset; it does not guarantee that an existing monetary variable has been revalued.

### Development / 开发

```sh
npm install                 # Capacitor toolchain (only needed for the APK)
npm run build:web           # builds versioned assets with bundled rates in www/
npm run test:web            # checks network/fallback rates, calculations and worker recovery
npm run rates:update        # refresh backup XML; rebuild/deploy to publish it
npm run android:keystore    # generate a new key and save owner-only secret files
npx cap add android && cd android && ./gradlew assembleDebug   # local APK
```

The UI/WASM assets in `assets/` are the upstream [fend web build](https://github.com/printfn/fend) (`wasm/` + `web/`). Build scripts patch only `www/`, add network-first rates with an embedded backup, handle worker startup failures, and give each asset graph a content-derived URL. They also retain only the loading animation in use, remove unused waiting helpers and absent source-map references, and omit the standalone XML after embedding its rates. The repository XML remains the backup source for future builds. The service worker activates only after all offline resources download successfully. Updates wait until existing windows close, or until you tap the update button, so an active calculation keeps using one version. When one window updates, older windows can still load their exact asset graph. Obsolete caches are removed once all open windows confirm the current version. After re-syncing upstream, run `npm run test:web`; the build fails if a patch no longer matches. GitHub Pages is published from `www/` by [deploy-pages.yml](.github/workflows/deploy-pages.yml), which requires **Settings → Pages → Source: GitHub Actions**.

---

核心 [fend](https://github.com/printfn/fend) 库用 Rust 编写，编译为 WebAssembly。本仓库将预构建的 WASM 和一个轻量 React UI 打包为静态网站，通过 Service Worker 实现离线缓存。安卓 APK 由 [GitHub Actions](.github/workflows/build-apk.yml) 通过 [Capacitor](https://capacitorjs.com) 自动构建。

普通网页和 PWA 使用同一套在线优先的汇率逻辑。提交货币计算时从 [Currency API](https://github.com/fawazahmed0/exchange-api) 读取最新的美元基准汇率，同时尝试 jsDelivr 和 Cloudflare 两个入口，整个请求最多等待 15 秒，单个入口可使用完整等待窗口。有效数据会保存在浏览器本地；断网、超时或返回无效数据时使用最近保存的汇率，没有保存记录才使用内置的联合国汇率快照。页面显示数据日期及在线／本地来源，并标明正在更新、更新超时或获取失败。这个在线源每日更新，不是秒级交易报价。温度、算术和输入提示不等待汇率请求；普通的 `cup`、`pounds` 是容量和重量单位，`CUP`、`GBP` 才表示货币。后台下载成功后，正在输入的预览会自动重新计算。`npm run rates:update` 用于刷新内置备用快照。

已知引擎限制：当前 WASM 引擎会在金额变量中保留赋值时的换算比例，例如 `x = 100 CNY`。下载新汇率不会更新这个比例。需要按新汇率换算时，请直接输入金额（如 `100 CNY to USD`），或在汇率更新后重新赋值。顶部的在线状态描述下载的数据，并不保证已有金额变量也已按新汇率重估。

### 开发

```sh
npm install                 # Capacitor 工具链（仅构建 APK 时需要）
npm run build:web           # 在 www/ 构建带版本地址和内置汇率的程序
npm run test:web            # 验证在线／本地汇率、计算和引擎故障恢复
npm run rates:update        # 刷新备用 XML；重新构建并部署后才发布
npm run android:keystore    # 生成新签名密钥及仅本人可读的 secret 文件
npx cap add android && cd android && ./gradlew assembleDebug   # 本地构建 APK
```

`assets/` 里的 UI/WASM 来自上游 [fend 的 web 构建](https://github.com/printfn/fend)（`wasm/` + `web/` 目录）。构建脚本只修改 `www/`：加入在线优先和内置备用汇率、处理引擎启动失败，并为整组资源生成与内容对应的版本地址。同时只保留实际使用的加载动画，清除闲置等待工具和不存在的调试映射引用；汇率嵌入程序后移除独立 XML 副本。仓库中的 XML 继续作为后续构建的备用数据来源。只有完整下载全部离线资源，Service Worker 才会安装成功。更新会等已有窗口关闭，或用户点击更新按钮后生效，避免计算中途混用版本。一个窗口更新后，其他旧窗口仍能加载各自版本的资源；全部打开的窗口确认使用新版后才清理旧缓存。同步上游后请运行 `npm run test:web`；补丁匹配失败会直接中止构建。GitHub Pages 由 [deploy-pages.yml](.github/workflows/deploy-pages.yml) 发布 `www/`，需要先在 **Settings → Pages → Source** 选择 **GitHub Actions**。

## Credits / 致谢

- Calculator engine: [printfn/fend](https://github.com/printfn/fend) (MIT License)
- This repo packages the pre-built frontend with runtime patches, regression tests, PWA deployment and Android APK builds

- 计算引擎：[printfn/fend](https://github.com/printfn/fend)（MIT 许可证）
- 本仓库包含预构建前端、运行逻辑补丁、回归测试、PWA 部署和 Android APK 构建流程

For existing releases, retain the original signing key; do not generate a replacement.
The key helper displays upload commands that read the private files via stdin. Run these
only when configuring a new project, and back up the key and credentials securely.

已有安装包请继续使用原签名密钥，不要重新生成替代密钥。辅助脚本仅显示从私密文件读取内容的上传命令；
只有新项目首次配置时才需要运行，并请安全备份密钥和密码。

Runtime safeguards handle malformed/blocked history storage, worker startup failures,
superseded calculations, rate-response size limits and scoped PWA caches. Pull requests
run calculator regression tests and an npm dependency audit. Android builds use read-only
repository credentials; tagged-release publishing runs in a separate job.

运行时会处理历史记录损坏、存储受限、计算引擎启动失败、重复提交，以及过大的汇率响应。
PWA 缓存按应用路径隔离。PR 会运行计算回归测试和依赖漏洞检查，APK 构建与正式发布使用不同权限。

Bundled frontend licenses are preserved in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), included in web and APK output.
