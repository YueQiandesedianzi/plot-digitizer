# PlotDigitizer 代码通读报告

生成日期：2026-05-29
项目路径：仓库根目录

## 1. 项目概览

PlotDigitizer 是一个用于从图表图片或 PDF 中提取曲线数据点的桌面/网页应用。当前代码形态是 Vite + React + TypeScript 的前端项目，并通过 Electron 打包为 Windows 桌面应用。

### 1.1 技术栈

| 层级 | 当前实现 |
| --- | --- |
| UI 框架 | React 18 |
| 类型系统 | TypeScript 5 |
| 构建工具 | Vite 4 |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 图标 | lucide-react |
| PDF 解析 | pdfjs-dist |
| Excel 导出 | xlsx |
| 桌面壳 | Electron 27 + electron-builder |

### 1.2 入口与运行方式

- Web 入口：`src/main.tsx`，挂载 `src/App.tsx`。
- HTML 入口：`index.html`，通过 `<script type="module" src="/src/main.tsx">` 启动。
- Electron 入口：`electron/main.js`，开发时优先加载 `http://localhost:5173`，失败后加载 `dist/index.html`。
- 主要命令：
  - `npm run dev`：启动 Vite 开发服务。
  - `npm run build`：执行 `tsc && vite build`。
  - `npm run electron:dev`：启动 Electron。
  - `npm run electron:build`：先构建前端，再用 electron-builder 打包。

### 1.3 当前构建状态

已在当前环境执行 `npm run build`，结果失败。失败是当前代码基线的一部分，不是本报告生成失败。

主要失败类别：

- `zustand`、`xlsx`、`pdfjs-dist` 在 `package.json` 中声明，但当前 `node_modules` 顶层不存在，对应模块解析失败。
- `package.json` 版本为 `2.0.0`，但 `package-lock.json` 根包版本仍为 `1.0.0`，且 lockfile 根依赖只包含 `lucide-react`、`react`、`react-dom`，没有 `zustand`、`xlsx`、`pdfjs-dist`。
- TypeScript strict 配置下存在未使用导入与隐式 `any`：
  - 多个组件中 `React` 默认导入未使用。
  - `useCalibration.ts` 中 `useMemo` 未使用。
  - `appStore.ts` 因 Zustand 类型未解析，引发大量 `set`、`state`、回调参数隐式 `any`。
  - `MainCanvas.tsx`、`DataTable.tsx` 的 `map` 回调参数被推断为隐式 `any`。

## 2. 目录与源码结构

当前应关注的源码和配置如下：

```text
PlotDigitizer/
  index.html
  package.json
  package-lock.json
  vite.config.ts
  tsconfig.json
  tailwind.config.js
  electron/
    main.js
  src/
    App.tsx
    main.tsx
    index.css
    types/index.ts
    store/appStore.ts
    utils/coordinate.ts
    utils/export.ts
    utils/pdfParser.ts
    hooks/useImageLoader.ts
    hooks/useCalibration.ts
    hooks/useCanvasInteraction.ts
    components/
      Canvas/MainCanvas.tsx
      Sidebar/CalibrationPanel.tsx
      Sidebar/DigitizingPanel.tsx
      DataTable/DataTable.tsx
      Export/ExportDialog.tsx
```

同时存在旧版文件 `src/App.jsx`、`src/main.jsx`。当前 `index.html` 指向 `src/main.tsx`，所以运行入口是 TypeScript 版本；旧 JSX 文件更像重构前备份。后续改功能时应避免误改旧入口。

## 3. 整体架构

应用分为四层：

| 层级 | 代表文件 | 职责 |
| --- | --- | --- |
| App/页面层 | `src/App.tsx` | 组织全局布局、导入按钮、步骤条、PDF 翻页、左右区域切换 |
| 组件层 | `components/*` | 画布、校准面板、采集面板、表格、导出弹窗 |
| Hook 层 | `hooks/*` | 封装文件加载、坐标校准、画布鼠标交互 |
| 状态/工具层 | `store/*`、`utils/*`、`types/*` | 全局状态、类型定义、坐标换算、导出、PDF 转图像 |

核心数据流：

```text
用户操作
  -> React 组件事件
  -> 自定义 Hook 处理
  -> Zustand store 写入状态
  -> 组件重新渲染
  -> 画布/表格/导出内容更新
```

核心业务流程：

```text
导入图片或 PDF
  -> 写入 imageData
  -> 进入 calibration
  -> 拖动 X1/X2/Y1/Y2 校准线
  -> 输入真实坐标值和坐标轴类型
  -> 切换到 digitizing
  -> 双击画布添加数据点
  -> 表格编辑标签或删除点
  -> 导出 CSV/XLSX 或复制到剪贴板
```

## 4. 核心状态模型

状态集中在 `src/store/appStore.ts`，类型定义在 `src/types/index.ts`。

### 4.1 关键类型

- `AxisScale = 'linear' | 'log'`：坐标轴类型，支持线性和对数。
- `CalibrationLines`：校准线在画布上的百分比位置：
  - `x1`、`x2` 是垂直线的横向百分比。
  - `y1`、`y2` 是水平线的纵向百分比。
- `CalibrationValues`：校准线对应的真实坐标值。
- `AxisConfig`：坐标轴显示标签和 scale。
- `DataPoint`：采集到的点，包含屏幕百分比坐标、真实坐标和样本标签。
- `ImageData`：图片源、自然宽高、文件名。
- `AppStep = 'calibration' | 'digitizing'`：应用当前步骤。
- `ExportOptions`：导出格式、精度、CSV 分隔符。

### 4.2 默认状态

- 初始图片为空。
- 校准线默认：
  - `x1 = 10`
  - `x2 = 90`
  - `y1 = 90`
  - `y2 = 10`
- 校准真实值默认：
  - `x1 = 0`
  - `x2 = 10`
  - `y1 = 0`
  - `y2 = 100`
- 坐标轴默认均为 `linear`。
- 默认样本标签为 `Sample A`。
- 初始步骤为 `calibration`。

### 4.3 状态修改入口

后续改功能通常应优先从这些 store action 入手：

- 图片相关：`setImageData`、`resetImage`。
- 校准相关：`setCalibrationLine`、`setCalibrationValue`、`setAxisScale`、`setAxisLabel`。
- 数据点相关：`addDataPoint`、`deleteDataPoint`、`updateDataPointLabel`、`clearDataPoints`。
- 步骤流转：`setCurrentStep`。
- 全量重置：`resetApp`。

注意：`addDataPoint` 使用 `Date.now().toString()` 生成 id。短时间内连续打点理论上可能碰撞，后续如果做自动追踪或批量导入，建议改为更稳定的 id 方案。

## 5. 功能链路通读

### 5.1 文件导入与 PDF 转图片

涉及文件：

- `src/App.tsx`
- `src/hooks/useImageLoader.ts`
- `src/utils/pdfParser.ts`

流程：

1. 用户点击导入按钮，`triggerFileUpload` 触发隐藏的 `<input type="file">`。
2. `handleFileChange` 获取文件并调用 `loadImageFile`。
3. `loadImageFile` 会先清空错误、进入 loading、清空已有数据点，并把步骤重置为 `calibration`。
4. 如果文件类型是 `application/pdf`：
   - 调用 `getPDFPageCount` 读取页数。
   - 调用 `pdfToImage(file, 1)` 把第一页渲染为 PNG data URL。
   - 设置 `isPdf`、`pdfFile`、`pdfPageCount`、`currentPdfPage`。
5. 如果是普通图片：
   - 检查 `file.type.startsWith('image/')`。
   - 使用 `URL.createObjectURL(file)` 生成图片 URL。
   - 写入 `imageData.src` 和 `imageData.name`。
6. 图片加载完成后，`handleImageLoad` 写入自然宽高。

风险点：

- 图片对象 URL 没有在换图或重置时 revoke，长期频繁导入可能有内存释放问题。
- PDF worker 使用 CDN：`//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`。离线环境或网络受限时 PDF 可能失败。
- PDF 翻页时只更新 `src` 和页码，没有清空或重置当前页的数据点；当前逻辑下跨 PDF 页的数据点可能混在一起。

### 5.2 坐标校准

涉及文件：

- `src/components/Canvas/MainCanvas.tsx`
- `src/components/Sidebar/CalibrationPanel.tsx`
- `src/hooks/useCalibration.ts`
- `src/utils/coordinate.ts`

流程：

1. 初始进入 `calibration` 步骤。
2. `MainCanvas` 在图片上覆盖四条校准线：
   - 蓝色竖线：`x1`、`x2`
   - 红色横线：`y1`、`y2`
3. 用户按下某条线时，`handleMouseDown(e, lineKey)` 设置 `draggingLine`。
4. 鼠标移动时，`handleMouseMove` 根据容器尺寸计算百分比位置，并调用 `setCalibrationLine` 更新 store。
5. 用户在 `CalibrationPanel` 输入真实坐标值，并选择 X/Y 轴为 `linear` 或 `log`。
6. 点击确认后，`setCurrentStep('digitizing')` 进入打点步骤。

坐标换算在 `calculateRealValue` 中完成：

- X 轴：
  - 先计算 `xRatio = (screenX - x1) / (x2 - x1)`。
  - 线性轴：`realX = vX1 + xRatio * (vX2 - vX1)`。
  - 对数轴：在 log10 空间插值，再 `Math.pow(10, logX)`。
- Y 轴：
  - 先计算 `yRatio = (screenY - y1) / (y2 - y1)`。
  - 默认 `y1 = 90`、`y2 = 10`，符合图表底部数值小、顶部数值大的常见方向。

风险点：

- 没有校验 `x1 === x2` 或 `y1 === y2`，重合时会除以 0。
- 对数轴如果输入值小于等于 0，会被替换为 `1e-9`，这避免崩溃，但可能掩盖用户输入错误。
- `useCalibration.ts` 中 `setCalibrationLine(draggingLine as any, ...)` 使用了 `any`，后续建议收紧类型。

### 5.3 画布交互与打点

涉及文件：

- `src/components/Canvas/MainCanvas.tsx`
- `src/hooks/useCanvasInteraction.ts`
- `src/utils/coordinate.ts`
- `src/store/appStore.ts`

流程：

1. `MainCanvas` 持有图片容器 ref，并绑定鼠标移动、离开、双击事件。
2. 鼠标移动时：
   - 计算鼠标在容器内的像素位置。
   - 换算为百分比坐标。
   - 换算为原图自然尺寸下的 `imgX`、`imgY`，供放大镜背景定位使用。
3. 放大镜始终跟随鼠标显示，拖动校准线时隐藏。
4. 在 `digitizing` 步骤下双击画布：
   - 获取当前点击点的百分比坐标。
   - 调用 `calculateRealValue` 计算真实坐标。
   - 调用 `addDataPoint` 写入 store。
5. `MainCanvas` 根据 `dataPoints` 在图片上渲染绿色点和序号。

风险点：

- 画布没有缩放/平移状态，目前是 `Zoom: Fit` 的静态提示。
- 坐标使用容器尺寸换算，而图片设置了 `max-w-full`、`max-h` 和 `object-contain`。当前容器实际就是图片元素外层，如果后续增加留白、缩放或复杂布局，需要重新校验坐标换算基准。
- 删除点后序号会重新按数组顺序显示，这是当前可接受行为；如果需要永久点编号，要新增字段。

### 5.4 数据表格与标签编辑

涉及文件：

- `src/components/Sidebar/DigitizingPanel.tsx`
- `src/components/DataTable/DataTable.tsx`
- `src/store/appStore.ts`

流程：

1. 进入 `digitizing` 后右侧显示数据采集面板。
2. 顶部显示当前采集数量，支持复制和打开导出弹窗。
3. `Next` 输入框控制 `defaultSampleLabel`，后续新增点会使用这个标签。
4. `DataTable` 显示所有数据点：
   - 序号
   - Sample 标签
   - X 真实值
   - Y 真实值
   - 删除按钮
5. 用户可直接编辑每个点的 label，调用 `updateDataPointLabel`。

风险点：

- 表格只能编辑 label，不能直接编辑 `realX/realY` 或屏幕坐标。
- 修改单个点的 label 不会同步修改默认标签；旧版 `App.jsx` 曾有类似同步逻辑，新版没有。
- 点较多时没有虚拟列表，未来自动追踪产生大量点后可能卡顿。

### 5.5 导出与复制

涉及文件：

- `src/components/Sidebar/DigitizingPanel.tsx`
- `src/components/Export/ExportDialog.tsx`
- `src/utils/export.ts`
- `src/utils/coordinate.ts`

流程：

1. 右侧面板的“复制”按钮使用 TSV 格式复制到剪贴板。
2. “导出”按钮打开 `ExportDialog`。
3. 导出弹窗支持：
   - 格式：CSV 或 XLSX。
   - 精度：0 到 10。
   - CSV 分隔符：逗号、制表符、空格。
4. CSV 由 `exportToCSV` 生成字符串，再通过 `downloadFile` 创建 blob 下载。
5. XLSX 由 `exportToXLSX` 使用 `XLSX.utils.aoa_to_sheet` 和 `XLSX.writeFile` 输出。
6. 剪贴板复制通过 `navigator.clipboard.writeText`。

风险点：

- CSV 没有对 label 或轴标签中的分隔符、换行、引号做转义；如果样本名包含逗号，CSV 结构可能错位。
- `exportToXLSX` 接收了 `options` 但当前没有使用精度格式化。
- 剪贴板 API 在非安全上下文或 Electron 权限受限时可能失败；当前只打印错误，没有 UI 提示。

### 5.6 Electron 桌面壳

涉及文件：

- `electron/main.js`
- `package.json`
- `vite.config.ts`

流程：

1. Electron 创建 `BrowserWindow`，默认尺寸 `1400x900`，最小 `1000x700`。
2. `nodeIntegration: false`、`contextIsolation: true`，安全默认值较好。
3. 开发/未打包时尝试加载 Vite 开发服务。
4. 加载失败或生产模式时读取 `dist/index.html`。
5. 打包配置输出到 `release`，Windows 使用 NSIS。

风险点：

- `electron/main.js` 中 icon 指向 `../public/icon.ico`，但当前根目录清单中未看到 `public` 目录。打包时可能找不到图标。
- 桌面端依赖前端 `dist`，而当前 `npm run build` 失败，所以 Electron 打包链路当前不可用。
- Electron 标题和注释也有乱码，应在修复编码时一并处理。

## 6. 当前问题清单

### 6.1 依赖与 lockfile 不一致

`package.json` 声明了：

- `zustand`
- `xlsx`
- `pdfjs-dist`
- TypeScript/ESLint 相关开发依赖

但 `package-lock.json` 根包仍是 `1.0.0`，且根依赖没有这些新增库。当前 `node_modules` 顶层也不存在 `zustand`、`xlsx`、`pdfjs-dist`。这直接导致构建失败。

建议后续第一步执行一次干净依赖恢复，例如重新 `npm install` 并确认 lockfile 更新，再看剩余 TypeScript 错误。

### 6.2 构建失败

当前 `npm run build` 失败，关键错误如下：

- `Cannot find module 'zustand'`
- `Cannot find module 'xlsx'`
- `Cannot find module 'pdfjs-dist'`
- 多处 `TS6133` 未使用导入
- 多处 `TS7006` 隐式 `any`

建议不要在这个状态上继续大改功能。先恢复绿色构建，否则后续无法判断新改动是否引入回归。

### 6.3 编码乱码

README、QUICKSTART、PROJECT_SUMMARY、`App.tsx`、`electron/main.js` 等多处中文文案存在乱码。部分 TSX 源码中的乱码文本可能影响可读性，也可能在某些位置造成标签文本异常。

建议统一确认文件编码为 UTF-8，并把用户可见文案集中修复。

### 6.4 旧版与新版入口并存

`src/App.jsx` 与 `src/main.jsx` 仍保留，当前实际入口是 `src/main.tsx`。后续修改功能时应优先修改 TypeScript 版本。如果要长期维护，建议在确认无用后删除或移入备份目录，避免误改。

### 6.5 缺少测试

当前没有发现测试目录或测试脚本。坐标换算、CSV 导出、PDF 页处理、打点流程都属于容易回归的核心逻辑。

建议至少补：

- `calculateRealValue` 的线性/对数坐标测试。
- `exportToCSV` 的格式化和分隔符测试。
- store action 的状态变更测试。
- 关键 UI 流程的轻量集成测试。

## 7. 后续修改功能的入口指南

### 7.1 想改导入图片/PDF

优先看：

- `src/hooks/useImageLoader.ts`
- `src/utils/pdfParser.ts`
- `src/App.tsx`

常见需求：

- 增加拖拽上传：在 `App.tsx` 画布区域增加 drag/drop，复用 `loadImageFile`。
- 修复 PDF 离线问题：把 PDF worker 改成本地打包资源。
- 多页 PDF 数据隔离：需要新增“页码 -> 数据点”的状态结构。

### 7.2 想改坐标校准

优先看：

- `src/hooks/useCalibration.ts`
- `src/utils/coordinate.ts`
- `src/components/Sidebar/CalibrationPanel.tsx`
- `src/components/Canvas/MainCanvas.tsx`

常见需求：

- 防止校准线重合：在 `setCalibrationLine` 或 hook 中加入最小间距。
- 增加更多校准点：需要扩展 `CalibrationLines`、`CalibrationValues` 和计算模型。
- 支持反向坐标轴：当前已经可通过输入值大小自然支持，但 UI 没有明确提示。

### 7.3 想改打点/曲线采集

优先看：

- `src/hooks/useCanvasInteraction.ts`
- `src/store/appStore.ts`
- `src/components/Canvas/MainCanvas.tsx`
- `src/components/DataTable/DataTable.tsx`

常见需求：

- 单击打点：改 `handleDoubleClick` 绑定和事件名称。
- 拖动已采集点：需要给 DataPoint 增加选中/拖动逻辑，并更新 screen/real 坐标。
- 多曲线：需要把 `dataPoints` 从一维数组升级为曲线集合，并在导出时区分曲线名。

### 7.4 想改导出

优先看：

- `src/utils/export.ts`
- `src/components/Export/ExportDialog.tsx`
- `src/components/Sidebar/DigitizingPanel.tsx`

常见需求：

- 增加 JSON 导出：在 `ExportOptions.format` 增加 `json`，并新增导出函数。
- CSV 正确转义：在 `exportToCSV` 中对字段做 quote/escape。
- Excel 精度格式化：在 `exportToXLSX` 中按 `options.precision` 写入格式化值或单元格格式。

### 7.5 想改 UI 文案或布局

优先看：

- `src/App.tsx`
- `src/components/Sidebar/CalibrationPanel.tsx`
- `src/components/Sidebar/DigitizingPanel.tsx`
- `src/components/Export/ExportDialog.tsx`
- `src/index.css`

建议先修复编码，再统一调整中文文案，否则很难判断哪些是业务文案、哪些是乱码残留。

## 8. 建议路线

### 短期：恢复可维护基线

1. 重新安装并锁定依赖，使 `package.json` 与 `package-lock.json` 一致。
2. 修复 TypeScript 构建错误，使 `npm run build` 通过。
3. 修复中文编码乱码。
4. 明确保留或移除旧版 `App.jsx/main.jsx`。

### 中期：补测试和核心稳定性

1. 给坐标换算和导出工具补单元测试。
2. 给导入、校准、打点、导出补最小集成测试。
3. 修复对象 URL 生命周期。
4. 增加校准值校验，尤其是对数轴正数校验和校准线重合校验。

### 长期：功能扩展

1. 自动曲线追踪。
2. 多曲线/多样本管理。
3. 撤销/重做。
4. 画布缩放和平移。
5. 图像预处理。
6. PDF 多页数据独立管理。

## 9. 修改前检查清单

后续每次改功能前，建议先确认：

- 当前要改的是 TypeScript 入口，不是旧 JSX 备份。
- `npm run build` 是否已经恢复为通过。
- 改动是否需要扩展 `src/types/index.ts`。
- 新状态是否应该放入 Zustand store。
- 坐标相关改动是否影响 `calculateRealValue`。
- 导出相关改动是否同时覆盖 CSV、XLSX、剪贴板。
- 是否需要同步 Electron 打包配置。

## 10. 本报告结论

当前项目的功能边界比较清楚：它已经拆成状态、Hook、工具函数和 UI 组件四层，适合继续迭代。但当前工程基线不健康，首要问题不是业务逻辑，而是依赖锁文件、构建失败和编码乱码。建议在新增复杂功能前，先把依赖、构建、编码和旧文件边界整理干净，这样后续每次修改都能有可靠反馈。
