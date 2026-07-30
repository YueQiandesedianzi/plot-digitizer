# PlotDigitizer

![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)
![Electron](https://img.shields.io/badge/Electron-27-47848f.svg)

PlotDigitizer 是一个从图表图片和 PDF 中提取数值数据的桌面工具，适用于论文曲线、散点图、谱图和实验图表的数据数字化。

## 功能

- 事务式导入 PNG、JPEG、WebP、GIF、BMP 图片及多页 PDF；失败时不破坏当前项目。
- 每个 PDF 页面可建立多个独立图/坐标组，并分别校准线性或对数坐标轴。
- 支持离散单点采集、曲线控制点采集以及线性/三次样条插值。
- 支持坐标轴辅助识别、基于种子点颜色的曲线候选点自动追踪。
- 支持放大镜、局部框选放大、采集点显隐和曲线管理。
- 支持按图截图，并统一汇总多页、多图、多曲线数据。
- 支持每页独立的 50 步撤销/恢复，以及 `Ctrl+Z` / `Ctrl+Shift+Z`。
- 支持自包含 `.plotdigitizer` 项目文件、SHA-256 校验和 IndexedDB 自动恢复。
- 默认导出 v2.1 长表 CSV/XLSX，并保留手动点、曲线控制点、插值点和自动追踪点的质量标记。
- XLSX 固定包含 `Data`、`Plots`、`Evidence`、`Project` 四个 sheet，便于按图复核校准、点数和风险状态。
- ZIP 固定包含 canonical CSV/XLSX、逐图 XLSX、截图、PPT 摘要、manifest 和 `evidence/evidence_report.json`。

## 安装

Windows 用户可在 GitHub 仓库的 **Releases** 页面下载对应版本安装包。

当前安装包未进行商业代码签名。Windows SmartScreen 如显示未知发布者，请先核对 Release 页面提供的 SHA-256，再决定是否运行。

## 基本流程

1. 导入图片或 PDF。
2. 框选图区并调整 X1/X2、Y1/Y2 校准线，输入真实坐标值和轴标题。
3. 新建图/坐标组，选择单点采集或曲线采集。
4. 双击图像采集数据；曲线模式可调整插值方式、输出点数或执行自动追踪。
5. 保存 `.plotdigitizer` 项目；若异常退出，下一次启动可选择恢复本地快照。
6. 为图保存截图，在导出确认中选择页面、图、曲线和单点名称。
7. 导出 v2.1 CSV/XLSX，或生成包含 canonical 数据、逐图工作簿、截图、PPT 摘要和 evidence report 的 ZIP。

校准跨度小于 2 px、端点值相同、对数真实数非正或自定义公式非法/非单调时，采点和导出会被阻止。框外采点允许外推，但会标记为 `outside-calibration`。

## 证据链导出

v2.2 新增证据优先的导出层，不改变 canonical 数据表的 v2.1 schema，而是在 ZIP 和 XLSX 中补充可复核元数据：

- `evidence/evidence_report.json`：记录源文件信息、页面/图区域、坐标轴、校准问题、数据点数、质量标记统计和每张图的 `accepted` / `needs_review` / `invalid` 状态。
- `Evidence` sheet：把每张图的证据摘要展开成表格，方便在 Excel 中筛选需要复核的图。
- `quality_flags`：导出行会标记 `manual-point`、`curve-control`、`curve-interpolated`、`auto-traced`、`low-confidence`、`needs-review`、`outside-calibration` 等来源和风险信息。

自动追踪仍然是候选辅助流程。接受候选点后，点会标记为 `auto-traced`；当追踪置信度低于阈值时，会额外标记 `low-confidence` 和 `needs-review`，用于后续人工检查。

`legacy-v2.0` 导出仅用于一个版本周期内的兼容迁移，已弃用，并计划在后续版本移除。选择 legacy 打包时，legacy 文件会附加到 ZIP，不会替代 canonical v2.1 数据。

## 本地开发

环境要求：Node.js 22.x、npm 10 或更高版本。

```bash
npm ci
npm run dev
```

常用检查和构建命令：

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run electron:dev
npm run test:electron
npm run electron:build
```

## 项目结构

```text
src/
  components/        React 界面组件
  domain/            导出领域模型与数据整形
  hooks/             图片加载、校准与画布交互
  services/          项目、恢复、导入与导出服务
  store/             Zustand 应用状态
  utils/             坐标、插值、PDF、追踪与截图工具
  App.tsx             应用入口组件
electron/
  main.js             Electron 主进程
  preload.js          安全项目文件桥接
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
