# PlotDigitizer

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)
![Electron](https://img.shields.io/badge/Electron-27-47848f.svg)

PlotDigitizer 是一个从图表图片和 PDF 中提取数值数据的桌面工具，适用于论文曲线、散点图、谱图和实验图表的数据数字化。

## 功能

- 导入 PNG、JPG、BMP、TIFF 等图片及多页 PDF。
- 每个 PDF 页面可建立多个独立图/坐标组，并分别校准线性或对数坐标轴。
- 支持离散单点采集、曲线控制点采集以及线性/三次样条插值。
- 支持坐标轴辅助识别、基于种子点颜色的曲线候选点自动追踪。
- 支持放大镜、局部框选放大、采集点显隐和曲线管理。
- 支持按图截图，并统一汇总多页、多图、多曲线数据。
- 支持复制到剪贴板、CSV、XLSX，以及包含宽表、截图和 PPT 摘要的 ZIP 数据包导出。

## 安装

Windows 用户可在 GitHub 仓库的 **Releases** 页面下载 `PlotDigitizer.Setup.2.0.0.exe`。

当前安装包未进行商业代码签名。Windows SmartScreen 如显示未知发布者，请先核对 Release 页面提供的 SHA-256，再决定是否运行。

## 基本流程

1. 导入图片或 PDF。
2. 框选图区并调整 X1/X2、Y1/Y2 校准线，输入真实坐标值和轴标题。
3. 新建图/坐标组，选择单点采集或曲线采集。
4. 双击图像采集数据；曲线模式可调整插值方式、输出点数或执行自动追踪。
5. 为图保存截图，在导出确认中选择页面、图、曲线和单点名称。
6. 导出 CSV/XLSX，或生成包含全部页数据、截图和 PPT 摘要的 ZIP 数据包。

## 本地开发

环境要求：Node.js 18 或更高版本、npm。

```bash
npm ci
npm run dev
```

常用检查和构建命令：

```bash
npm run lint
npm run build
npm run electron:dev
npm run electron:build
```

## 项目结构

```text
src/
  components/        React 界面组件
  domain/            导出领域模型与数据整形
  hooks/             图片加载、校准与画布交互
  services/          文件导出服务
  store/             Zustand 应用状态
  utils/             坐标、插值、PDF、追踪与截图工具
  App.tsx             应用入口组件
electron/
  main.js             Electron 主进程
```

## 技术栈

- React 18、TypeScript、Vite、Tailwind CSS
- Zustand、pdf.js、SheetJS、JSZip、PptxGenJS
- Electron、electron-builder

## 已知限制

- 自动追踪依赖图像中曲线颜色与背景的差异，低对比度、交叉或严重压缩的曲线仍需人工校正。
- 当前坐标校准以每个图/坐标组的四条边界线为基础。
- Windows 安装包暂未进行代码签名。

## License

[MIT](LICENSE)
