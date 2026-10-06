# fend offline calculator / fend 离线计算器

[**▶ 打开计算器 / Open Calculator**](https://tatsuhiroc.github.io/fend-offline/)

An offline-capable web app for [fend](https://github.com/printfn/fend), an arbitrary-precision unit-aware calculator. Works entirely in the browser via WebAssembly — no server, no network required after first load.

基于 [fend](https://github.com/printfn/fend) 的离线网页计算器。通过 WebAssembly 在浏览器本地运行，首次加载后无需网络。

## Features / 功能

- **Arbitrary precision** — `pi * 10^50` gives you 50 digits, no sweat
- **Unit conversion** — `100 kg to lbs`, `5'10" to cm`, `1 lightyear to parsecs`
- **Currency** — a bundled exchange-rate snapshot (223 currencies), works offline too
- **Number bases** — `0xff to decimal`, `0b1001 + 3`
- **Complex numbers** — `cos(pi/4) + i * sin(pi/4)`
- **Trigonometry, logarithms, algebra** — and more

---

- **高精度计算** — `pi * 10^50` 直接给出 50 位
- **单位换算** — `100 kg to lbs`、`5'10" to cm`、`1 lightyear to parsecs`
- **汇率** — 内置汇率快照（223 种货币），完全离线可用
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

Download the latest APK from the [Releases](https://github.com/TatsuhiroC/fend-offline/releases) page and install it on your Android phone — no app store needed. All calculator resources are bundled inside the APK, so it works fully offline.

从 [Releases](https://github.com/TatsuhiroC/fend-offline/releases) 页面下载最新 APK，直接安装到安卓手机即可，无需应用商店。APK 内置全部计算资源，完全离线可用。

### APK signing / APK 签名

APKs are signed with a keystore kept in GitHub Secrets, so each release installs **over** the previous one. Add these four secrets under **Settings → Secrets and variables → Actions** (or run `bash scripts/make-keystore.sh`, which generates the keystore and prints every value):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 < release.keystore` on a single line |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

Optionally set `ANDROID_CERT_SHA256` to the keystore's SHA-256 fingerprint (colons included) and CI will refuse to publish an APK signed with anything else.

Keep the keystore file itself backed up: if it is lost, existing installs can only be updated by uninstalling the app first. Without the secrets the workflow still runs, but falls back to a **debug** APK — every runner generates a fresh debug key, so users have to uninstall before installing the next build.

---

APK 使用保存在 GitHub Secrets 里的 keystore 签名，因此新版本可以直接覆盖安装旧版本。在 **Settings → Secrets and variables → Actions** 里添加以下四个 secret（也可以直接运行 `bash scripts/make-keystore.sh`，它会生成 keystore 并打印所有需要填的值）：

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

Exchange rates are shipped as a bundled snapshot (`exchange-rates.xml`, 223 currencies). Upstream's endpoint at `fend.pr.workers.dev` only answers with `Access-Control-Allow-Origin: https://printfn.github.io`, so it cannot be called from this deployment at all; instead `npm run rates:update` refreshes the snapshot and the build rewrites the bundle to fetch it same-origin, which also makes currencies work offline.

### Development / 开发

```sh
npm install                 # Capacitor toolchain (only needed for the APK)
npm run build:web           # copies the site into www/ and patches the rates URL
npm run rates:update        # refresh exchange-rates.xml (+ bumps the SW cache)
npm run android:keystore    # generate the release keystore and print the CI secrets
npx cap add android && cd android && ./gradlew assembleDebug   # local APK
```

The UI/WASM assets in `assets/` are the upstream [fend web build](https://github.com/printfn/fend) (`wasm/` + `web/`); `assets/` is never patched in place, so a re-sync from upstream only needs a matching `sw.js` asset list. GitHub Pages is published from `www/` by [deploy-pages.yml](.github/workflows/deploy-pages.yml), which requires **Settings → Pages → Source: GitHub Actions**.

---

核心 [fend](https://github.com/printfn/fend) 库用 Rust 编写，编译为 WebAssembly。本仓库将预构建的 WASM 和一个轻量 React UI 打包为静态网站，通过 Service Worker 实现离线缓存。安卓 APK 由 [GitHub Actions](.github/workflows/build-apk.yml) 通过 [Capacitor](https://capacitorjs.com) 自动构建。

汇率以内置快照（`exchange-rates.xml`，223 种货币）的形式发布。上游的 `fend.pr.workers.dev` 只返回 `Access-Control-Allow-Origin: https://printfn.github.io`，从本站点根本无法调用；因此改用 `npm run rates:update` 刷新快照，构建时把 bundle 里的地址改写成同源文件，顺便也让它完全离线可用。

### 开发

```sh
npm install                 # Capacitor 工具链（仅构建 APK 时需要）
npm run build:web           # 把站点复制到 www/ 并改写汇率地址
npm run rates:update        # 刷新 exchange-rates.xml（并自动 bump SW 缓存版本）
npm run android:keystore    # 生成签名用 keystore 并打印 CI secrets
npx cap add android && cd android && ./gradlew assembleDebug   # 本地构建 APK
```

`assets/` 里的 UI/WASM 来自上游 [fend 的 web 构建](https://github.com/printfn/fend)（`wasm/` + `web/` 目录）；`assets/` 不会被就地修改，所以重新同步上游后只需要更新 `sw.js` 的资源清单。GitHub Pages 由 [deploy-pages.yml](.github/workflows/deploy-pages.yml) 发布 `www/`，需要先在 **Settings → Pages → Source** 选择 **GitHub Actions**。

## Credits / 致谢

- Calculator engine: [printfn/fend](https://github.com/printfn/fend) (MIT License)
- This repo only contains the pre-built web frontend

- 计算引擎：[printfn/fend](https://github.com/printfn/fend)（MIT 许可证）
- 本仓库仅包含预构建的 Web 前端
