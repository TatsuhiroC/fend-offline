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

APKs are signed with a keystore kept in GitHub Secrets. Branch and tagged builds share an increasing Android versionCode, so a newer package signed with the same certificate installs **over** the previous one. Add these four secrets under **Settings → Secrets and variables → Actions** (or run `bash scripts/make-keystore.sh`, which generates the keystore and prints every value):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` on a single line |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Optionally set `ANDROID_CERT_SHA256` to the keystore's SHA-256 fingerprint (colons included) and CI will refuse to publish an APK signed with anything else.

Keep the keystore file itself backed up: if it is lost, existing installs can only be updated by uninstalling the app first. Without the secrets the workflow still runs, but falls back to a **debug** APK — every runner generates a fresh debug key, so users have to uninstall before installing the next build.

---

APK 使用保存在 GitHub Secrets 里的 keystore 签名；分支构建和正式版本共用递增的安卓版本号，因此签名一致的新包可以覆盖安装旧版本。在 **Settings → Secrets and variables → Actions** 里添加以下四个 secret（也可以直接运行 `bash scripts/make-keystore.sh`，它会生成 keystore 并打印所有需要填的值）：

| Secret | 内容 |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` 的结果（单行） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 密码 |
| `ANDROID_KEY_ALIAS` | 密钥别名 |
| `ANDROID_KEY_PASSWORD` | 密钥密码 |

可选：把 keystore 的 SHA-256 指纹（带冒号）填到 `ANDROID_CERT_SHA256`，CI 就会拒绝发布用其他密钥签名的 APK。

请务必备份 keystore 文件本身：一旦丢失，已安装的用户只能先卸载才能升级。没有配置这些 secret 时 workflow 仍会运行，但会退回到 **debug** APK——每个 runner 都会重新生成一个 debug 密钥，用户必须先卸载才能安装下一个版本。

## How it works / 原理

The core [fend](https://github.com/printfn/fend) library is written in Rust and compiled to WebAssembly. This repo packages the pre-built WASM + a minimal React UI into a static site with a [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) for offline caching. The Android APK is built automatically by [GitHub Actions](.github/workflows/build-apk.yml) using [Capacitor](https://capacitorjs.com).

Web and PWA use the same network-first currency logic. A submitted currency calculation requests the latest USD-based data from [Currency API](https://github.com/fawazahmed0/exchange-api), using its jsDelivr endpoint and Cloudflare mirror. The complete request has a 3-second deadline. Valid responses are saved in browser storage; failed, slow or invalid responses use the last saved rates, or the bundled UN snapshot if no download has succeeded. The page shows the data date and whether online or fallback rates are in use. Currency API publishes daily data, not tick-by-tick trading quotes. Temperature, arithmetic and typing hints never wait for the rates request. Run `npm run rates:update` to refresh the built-in backup snapshot.

### Development / 开发

```sh
npm install                 # Capacitor toolchain (only needed for the APK)
npm run build:web           # builds versioned assets with bundled rates in www/
npm run test:web            # checks network/fallback rates, calculations and worker recovery
npm run rates:update        # refresh exchange-rates.xml (+ bumps the SW cache)
npm run android:keystore    # generate the release keystore and print the CI secrets
npx cap add android && cd android && ./gradlew assembleDebug   # local APK
```

The UI/WASM assets in `assets/` are the upstream [fend web build](https://github.com/printfn/fend) (`wasm/` + `web/`). Build scripts patch only `www/`, add network-first rates with an embedded backup, handle worker startup failures, and give each asset graph a content-derived URL. The service worker activates only after all offline resources download successfully. Updates wait until existing windows close, or until you tap the update button, so an active calculation keeps using one version. After re-syncing upstream, run `npm run test:web`; the build fails if a patch no longer matches. GitHub Pages is published from `www/` by [deploy-pages.yml](.github/workflows/deploy-pages.yml), which requires **Settings → Pages → Source: GitHub Actions**.

---

核心 [fend](https://github.com/printfn/fend) 库用 Rust 编写，编译为 WebAssembly。本仓库将预构建的 WASM 和一个轻量 React UI 打包为静态网站，通过 Service Worker 实现离线缓存。安卓 APK 由 [GitHub Actions](.github/workflows/build-apk.yml) 通过 [Capacitor](https://capacitorjs.com) 自动构建。

普通网页和 PWA 使用同一套在线优先的汇率逻辑。提交货币计算时从 [Currency API](https://github.com/fawazahmed0/exchange-api) 读取最新的美元基准汇率，提供 jsDelivr 和 Cloudflare 两个入口，整个请求最多等待 3 秒。有效数据会保存在浏览器本地；断网、超时或返回无效数据时使用最近保存的汇率，没有保存记录才使用内置的联合国汇率快照。页面显示数据日期及在线／本地来源。这个在线源每日更新，不是秒级交易报价。温度、算术和输入提示不等待汇率请求。`npm run rates:update` 用于刷新内置备用快照。

### 开发

```sh
npm install                 # Capacitor 工具链（仅构建 APK 时需要）
npm run build:web           # 在 www/ 构建带版本地址和内置汇率的程序
npm run test:web            # 验证在线／本地汇率、计算和引擎故障恢复
npm run rates:update        # 刷新 exchange-rates.xml（并自动 bump SW 缓存版本）
npm run android:keystore    # 生成签名用 keystore 并打印 CI secrets
npx cap add android && cd android && ./gradlew assembleDebug   # 本地构建 APK
```

`assets/` 里的 UI/WASM 来自上游 [fend 的 web 构建](https://github.com/printfn/fend)（`wasm/` + `web/` 目录）。构建脚本只修改 `www/`：加入在线优先和内置备用汇率、处理引擎启动失败，并为整组资源生成与内容对应的版本地址。只有完整下载全部离线资源，Service Worker 才会安装成功。更新会等已有窗口关闭，或用户点击更新按钮后生效，避免计算中途混用版本。同步上游后请运行 `npm run test:web`；补丁匹配失败会直接中止构建。GitHub Pages 由 [deploy-pages.yml](.github/workflows/deploy-pages.yml) 发布 `www/`，需要先在 **Settings → Pages → Source** 选择 **GitHub Actions**。

## Credits / 致谢

- Calculator engine: [printfn/fend](https://github.com/printfn/fend) (MIT License)
- This repo only contains the pre-built web frontend

- 计算引擎：[printfn/fend](https://github.com/printfn/fend)（MIT 许可证）
- 本仓库仅包含预构建的 Web 前端
