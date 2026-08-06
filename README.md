# fend offline calculator / fend 离线计算器

[**▶ 打开计算器 / Open Calculator**](https://tatsuhiroc.github.io/fend-offline/)

An offline-capable web app for [fend](https://github.com/printfn/fend), an arbitrary-precision unit-aware calculator. Works entirely in the browser via WebAssembly — no server, no network required after first load.

基于 [fend](https://github.com/printfn/fend) 的离线网页计算器。通过 WebAssembly 在浏览器本地运行，首次加载后无需网络。

## Features / 功能

- **Arbitrary precision** — `pi * 10^50` gives you 50 digits, no sweat
- **Unit conversion** — `100 kg to lbs`, `5'10" to cm`, `1 lightyear to parsecs`
- **Currency** — live rates on first load, cached for offline use
- **Number bases** — `0xff to decimal`, `0b1001 + 3`
- **Complex numbers** — `cos(pi/4) + i * sin(pi/4)`
- **Trigonometry, logarithms, algebra** — and more

---

- **高精度计算** — `pi * 10^50` 直接给出 50 位
- **单位换算** — `100 kg to lbs`、`5'10" to cm`、`1 lightyear to parsecs`
- **汇率** — 首次加载获取实时汇率，之后离线可用
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

## How it works / 原理

The core [fend](https://github.com/printfn/fend) library is written in Rust and compiled to WebAssembly. This repo packages the pre-built WASM + a minimal React UI into a static site with a [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) for offline caching. The Android APK is built automatically by [GitHub Actions](.github/workflows/build-apk.yml) using [Capacitor](https://capacitorjs.com).

核心 [fend](https://github.com/printfn/fend) 库用 Rust 编写，编译为 WebAssembly。本仓库将预构建的 WASM 和一个轻量 React UI 打包为静态网站，通过 Service Worker 实现离线缓存。安卓 APK 由 [GitHub Actions](.github/workflows/build-apk.yml) 通过 [Capacitor](https://capacitorjs.com) 自动构建。

## Credits / 致谢

- Calculator engine: [printfn/fend](https://github.com/printfn/fend) (MIT License)
- This repo only contains the pre-built web frontend

- 计算引擎：[printfn/fend](https://github.com/printfn/fend)（MIT 许可证）
- 本仓库仅包含预构建的 Web 前端
