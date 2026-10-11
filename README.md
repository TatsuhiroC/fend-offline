<div align="center">
  <img src="icon-192.png" width="80" height="80" alt="fend 图标">
  <h1>fend offline</h1>
  <p>把算式、单位和货币换算，写成一句话。</p>
  <p>打开就能算，也能离线用。</p>
  <p>
    <a href="https://tatsuhiroc.github.io/fend-offline/"><img src="https://img.shields.io/badge/%E6%89%93%E5%BC%80%E8%AE%A1%E7%AE%97%E5%99%A8-6155A6?style=for-the-badge&amp;logo=googlechrome&amp;logoColor=white" alt="打开计算器"></a>
    <a href="https://github.com/TatsuhiroC/fend-offline/releases/latest"><img src="https://img.shields.io/badge/%E4%B8%8B%E8%BD%BD_APK-238636?style=for-the-badge&amp;logo=android&amp;logoColor=white" alt="下载 Android APK"></a>
  </p>
  <p>
    <a href="https://github.com/TatsuhiroC/fend-offline/releases/latest"><img src="https://img.shields.io/github/v/release/TatsuhiroC/fend-offline?style=flat&amp;label=version&amp;color=6155A6" alt="最新版本"></a>
    · 简体中文 · <a href="README_EN.md">English</a>
  </p>
</div>

![fend 计算器：身高、温度、货币换算，以及输入中的质量计算预览](docs/assets/readme-preview.png)

## 能做什么

- **直接写公式**：支持高精度数值、分数、复数、三角函数和进制转换。
- **带着单位算**：长度、质量、温度、速度等都能换算，输入时就能预览结果。
- **随时打开**：浏览器直接用，也可以添加到桌面或安装 Android APK。

## 试着输入

| 想算什么 | 输入 |
| --- | --- |
| 英尺、英寸转厘米 | `5'10" to cm` |
| 华氏度转摄氏度 | `87 fahrenheit to celsius` |
| 美元转新加坡元 | `100 USD to SGD` |
| 力除以加速度，求质量 | `100 N / (9.8 m/s^2) to kg` |
| 十六进制转十进制 | `0xff to decimal` |

输入后按 **Enter**。更多写法见 [fend 语法文档](https://printfn.github.io/fend/documentation/)。

## 开始使用

| 设备 | 使用方式 |
| --- | --- |
| 电脑 | [打开网页](https://tatsuhiroc.github.io/fend-offline/)，直接输入公式。 |
| iPhone / iPad | 用 Safari 打开网页，点 **分享 → 添加到主屏幕**。 |
| Android | [下载最新 APK](https://github.com/TatsuhiroC/fend-offline/releases/latest)，或通过浏览器菜单安装网页应用。 |

网页首次联网加载并完成缓存后，可以离线使用；APK 已内置计算资源。PWA 出现更新提示时点击更新，APK 则需要下载新包覆盖安装。

## 汇率怎么更新

提交货币换算时，优先获取最新在线汇率；断网或请求失败时，使用上次保存的数据，没有记录才使用内置备用汇率。顶部会显示**来源和数据日期**。

汇率源按日更新，并非实时交易报价。离线数据可能过期；已有金额变量也可能保留赋值时的汇率，直接输入金额换算可使用本次获取的数据。详见[使用与常见问题](docs/USAGE.md)。

---

[使用与常见问题](docs/USAGE.md) · [开发与维护](docs/DEVELOPMENT.md) · [反馈问题](https://github.com/TatsuhiroC/fend-offline/issues)

计算内核来自 [printfn/fend](https://github.com/printfn/fend)（Rust / WebAssembly，MIT）。本项目由 [TatsuhiroC](https://github.com/TatsuhiroC) 维护，提供离线缓存、在线汇率和 Android 打包。第三方许可见 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)。
