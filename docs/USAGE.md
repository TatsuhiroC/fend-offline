# 使用与常见问题

[返回首页](../README.md) · [English summary](#english-summary)

## 输入公式

写好公式后按 Enter。输入过程中会显示预览；按 ↑ / ↓ 可以找回之前的输入，输入 `clear` 并回车可以清空屏幕。

在手机或电脑上，点击任意一条已经计算过的公式，就会将原公式填回输入框。修改后按 Enter 重新计算。长按或拖动仍可选择文字进行复制。

单位也参与运算。例如：

```text
100 N / (9.8 m/s^2) to kg
```

这里的 `m/s^2` 是加速度，力除以加速度得到质量。`m/s` 是速度；括号可以明确整个分母，避免连续乘除产生不同含义。

普通的 `cup`、`pounds` 表示容量和质量；货币请写 `CUP`、`GBP`。货币别名如 `zł`、`zl`、`TL`、`₺` 也支持在线更新。

更多语法见 [fend 文档](https://printfn.github.io/fend/documentation/)。

## 离线使用和更新

- **网页 / PWA**：首次联网打开后，等待页面和离线资源加载完成。之后可以从桌面图标离线打开。清除网站数据会删除缓存及已保存汇率，需要重新联网加载。
- **PWA 更新**：看到顶部的 “Update available — tap to reload” 后点击更新。没有提示时，完全关闭该计算器和同站点标签页，再联网打开。
- **Android APK**：从[最新版本](https://github.com/TatsuhiroC/fend-offline/releases/latest)下载安装包。新正式版沿用包名与签名，可覆盖安装；网页发布不会自动替换已安装 APK。

## 顶部的汇率状态

| 显示 | 含义 |
| --- | --- |
| `Online rates` | 本次成功取得在线数据，日期是数据源的日期。 |
| `Local fallback · saved rates` | 正在使用之前下载并保存的数据，等待在线更新或在请求失败时作为备用。 |
| `Local fallback · built-in rates` | 没有可用的已保存数据，正在使用程序内置的备用快照。 |
| `Updating online rates…` | 正在请求在线数据。 |
| `Online update timed out / unavailable` | 请求超时或失败，仍可用本地数据换算。 |

货币计算提交时会尝试在线更新。来源是 [Currency API](https://github.com/fawazahmed0/exchange-api)，使用 jsDelivr 和 Cloudflare 两个入口。数据按日更新；与 Google 或银行报价不同，可能来自数据日期、来源、取价时间或价差。

联网不等于一定能访问汇率入口。若提交换算后仍显示本地来源，请留意更新状态和日期。两个入口均未取得成功响应时，程序会使用备用数据；本项目没有保证中国大陆所有网络都能直连这些入口。

## 一个多月没打开，离线汇率是什么日期？

如果一个月前成功下载过汇率，今天离线打开时会用那份保存的数据，直到再次成功联网更新。没有下载记录才使用内置快照。请以顶部日期为准。

## 已有金额变量为什么没有按新汇率变化？

当前 fend 内核可能在 `x = 100 CNY` 这样的变量中保存赋值时的换算比例，下载新汇率不会自动重估已有金额变量。

需要按新汇率计算时，直接输入 `100 CNY to USD`，或在更新后重新给变量赋值。顶部在线状态表示下载的数据，并不保证所有旧变量已经重估。

## English summary

- Press Enter to calculate, ↑ / ↓ to recall inputs, or submit `clear` to clear the screen. Use parentheses around a compound denominator; `100 N / (9.8 m/s^2) to kg` calculates mass.
- Tap or click a previously submitted formula to load it into the input for editing, then press Enter to calculate. Text selection and copying remain available.
- The web app works offline after completed caching. Tap the PWA update prompt, or close all calculator windows and reopen online. Clearing site data removes cached resources and saved rates.
- Download a new APK from [Releases](https://github.com/TatsuhiroC/fend-offline/releases/latest) to update Android. Official releases keep the same package and signing certificate for upgrades.
- A submitted currency calculation requests daily [Currency API](https://github.com/fawazahmed0/exchange-api) data through jsDelivr and Cloudflare. Failed requests use the last saved rates, then a bundled snapshot. Read the source and date in the header; offline data can be a month old if that was the last successful download.
- An internet connection does not guarantee access to either rate endpoint. Direct access from every mainland China network has not been verified.
- Monetary variables may retain assignment-time conversion factors. Enter an amount directly or reassign it after updating rates to use the new dataset.
