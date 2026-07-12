# PlotDigitizer 单点采集与曲线采集大功能优化计划

生成日期：2026-05-29
项目路径：仓库根目录

## 1. 目标与结论

目标是把现有 PlotDigitizer 从“单一手动打点工具”升级为同时支持：

1. 单点数据采集：适合离散实验点、柱状图点、散点图点、少量关键点读取。
2. 曲线数据采集：适合从一条曲线取多个控制点，拟合/插值出整条曲线，并按用户选择输出 200-2000 个等间隔数据点。
3. 图片与 PDF 统一采集：PNG/JPG/BMP/TIFF 等图片和 PDF 页面都进入同一套校准、采集、预览、导出流程。

建议采用“先恢复工程基线，再分阶段升级数据模型和 UI”的路线。现有代码已经具备图片/PDF 导入、坐标校准、手动打点、表格和 CSV/XLSX 导出基础，但当前 `dataPoints` 是单数组模型，无法自然表达多曲线、曲线控制点、插值输出点、PDF 多页隔离等新需求，因此本次大功能需要先升级核心状态模型。

## 2. 当前基线

### 2.1 已有能力

- 支持导入图片和 PDF。
- PDF 会被渲染为图片 data URL 后进入画布。
- 支持四条校准线 X1/X2/Y1/Y2。
- 支持线性/对数坐标轴换算。
- 支持手动双击添加数据点。
- 支持数据表格编辑样本标签、删除点。
- 支持 CSV、XLSX、剪贴板导出。
- 坐标轴标题已经在 `axisConfig.x.label`、`axisConfig.y.label` 中维护，导出时会作为列标题。

### 2.2 现有限制

- 只有 `currentStep = 'calibration' | 'digitizing'`，没有采集模式概念。
- `dataPoints: DataPoint[]` 只能表达一组点，不能区分“单点数据”和“曲线控制点/插值点”。
- 没有曲线实体，不能管理多条曲线名称、颜色、控制点、插值点数量。
- PDF 翻页只更新图片，不隔离不同页的数据。
- 没有缩放平移，曲线控制点较多时定位效率不足。
- 没有撤销/重做，误点后只能删除。
- 当前构建基线不健康：依赖锁文件不一致，`npm run build` 失败，应先修复。

## 3. 产品设计

### 3.1 总体工作流

```text
导入图片/PDF
  -> 如果是 PDF，选择页面
  -> 校准坐标轴
  -> 选择采集模式
     -> 单点采集：逐点点击/双击，得到离散数据表
     -> 曲线采集：创建曲线，沿曲线采控制点，设置输出点数，生成插值曲线
  -> 预览数据与曲线
  -> 编辑坐标标题、样本/曲线名称
  -> 导出 CSV/XLSX/剪贴板
```

### 3.2 UI 模式

建议把右侧面板拆成三个阶段：

1. 校准阶段：保持现有 `CalibrationPanel`，增加校准有效性提示。
2. 采集阶段：新增模式切换：
   - 单点模式
   - 曲线模式
3. 导出阶段：在采集面板内保留导出入口，导出弹窗根据当前数据类型提供选项。

### 3.3 单点采集体验

单点模式保留现有逻辑，但需要做成明确模式：

- 工具栏显示“单点采集”已选中。
- 单击或双击添加点，建议默认仍用双击，避免误触；可在设置中切换为单击。
- 表格显示：序号、样本名、X、Y、所属页面。
- 点可删除、重命名，后续可扩展拖动修正。
- 导出时输出原始单点数据。

### 3.4 曲线采集体验

曲线模式建议采用“控制点 + 插值输出”的可靠路线，不一开始做复杂自动识别：

1. 用户点击“新建曲线”。
2. 输入曲线名称，选择颜色。
3. 沿曲线从左到右点击多个控制点。
4. 设置输出点数，范围 200-2000，默认 500。
5. 系统按真实 X 坐标排序控制点，并生成插值后的曲线数据。
6. 画布同时显示控制点和插值曲线预览。
7. 用户可继续增加/删除控制点，插值结果实时更新。

推荐第一版曲线采集策略：

- 只做手动控制点插值，不做自动曲线追踪。
- 最少 2 个控制点即可线性插值。
- 3 个及以上控制点使用单调分段三次插值或 Catmull-Rom 样条；如果实现风险较高，第一版用分段线性插值，第二版再升级平滑插值。
- 输出点数限制为 200-2000。
- 输出 X 采样默认在曲线控制点覆盖的 X 范围内等间隔生成。
- 对数 X 轴时，输出 X 默认在 log 空间等间隔生成，再还原到真实值。

### 3.5 图片与 PDF 支持

图片和 PDF 都应使用同一套采集模型：

- 图片：一个文件对应一个 `SourcePage`。
- PDF：一个 PDF 文件对应多个 `SourcePage`，每页有自己的 image src、页码、校准和采集数据。
- 页面切换时应切换对应页面的数据，不混合显示不同页的点或曲线。

第一版可以简化为：

- PDF 每页独立保存校准、单点、曲线。
- 切换页面时，如果当前页未校准，提示复制上一页校准或重新校准。
- 导出时可选择当前页或全部页。

## 4. 数据模型优化

### 4.1 新增核心类型

建议在 `src/types/index.ts` 中新增或替换为以下概念：

```ts
export type CollectionMode = 'point' | 'curve';

export type AppStep = 'calibration' | 'collection';

export interface SourcePage {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  pageNumber: number;
  image: ImageData;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  pointSeries: PointSeries;
  curves: CurveSeries[];
}

export interface PointSeries {
  id: string;
  name: string;
  points: DataPoint[];
}

export interface CurveControlPoint extends DataPoint {
  order: number;
}

export interface CurveInterpolatedPoint {
  id: string;
  curveId: string;
  realX: number;
  realY: number;
  screenX?: number;
  screenY?: number;
}

export interface CurveSeries {
  id: string;
  name: string;
  color: string;
  outputCount: number;
  interpolation: 'linear' | 'monotoneCubic';
  controlPoints: CurveControlPoint[];
  interpolatedPoints: CurveInterpolatedPoint[];
  visible: boolean;
}
```

说明：

- `DataPoint` 可以继续复用 screen/real/label 结构。
- 单点数据保存在 `pointSeries.points`。
- 曲线控制点保存在 `curves[].controlPoints`。
- 曲线输出点保存在 `curves[].interpolatedPoints`，可缓存，也可每次由 selector 计算。
- PDF 页面用 `SourcePage` 隔离。

### 4.2 Store 状态建议

将现有 `AppState` 从单页面单数组升级为页面集合：

```ts
interface AppState {
  sourcePages: SourcePage[];
  activePageId: string | null;
  currentStep: AppStep;
  collectionMode: CollectionMode;
  activeCurveId: string | null;

  addPoint: (point: Omit<DataPoint, 'id'>) => void;
  updatePoint: (pointId: string, patch: Partial<DataPoint>) => void;
  deletePoint: (pointId: string) => void;

  createCurve: (name?: string) => string;
  setActiveCurve: (curveId: string) => void;
  addCurveControlPoint: (point: Omit<CurveControlPoint, 'id' | 'order'>) => void;
  deleteCurveControlPoint: (curveId: string, pointId: string) => void;
  updateCurveOptions: (curveId: string, patch: Partial<CurveSeries>) => void;
  regenerateCurve: (curveId: string) => void;

  setActivePage: (pageId: string) => void;
  setCollectionMode: (mode: CollectionMode) => void;
}
```

第一版不必一次性实现全部高级能力，但数据模型要预留：

- 多 PDF 页。
- 多曲线。
- 每条曲线不同输出点数。
- 每条曲线独立颜色与名称。
- 导出时区分原始控制点和插值输出点。

## 5. 算法与采样方案

### 5.1 坐标换算继续复用

`utils/coordinate.ts` 的 `calculateRealValue` 继续作为屏幕坐标到真实坐标的唯一入口。

需要新增反向换算：

```ts
calculateScreenValue(realX, realY, calibrationLines, calibrationValues, axisScales)
```

用途：

- 根据插值后的真实坐标，在画布上绘制曲线预览。
- 后续拖动数据点后重新定位。
- 导入外部数据后可回显。

### 5.2 曲线控制点排序

生成插值前按真实 X 坐标排序：

```text
controlPoints -> sort by realX ascending -> remove invalid duplicate X -> interpolate
```

对重复 X 的处理建议：

- 第一版：提示用户控制点 X 重复，跳过重复点。
- 后续版：允许垂直曲线或参数化曲线，但这会显著增加复杂度。

### 5.3 插值方法

第一阶段推荐：

- 默认 `linear` 分段线性插值，稳定、易验证。
- 保留 `monotoneCubic` 选项，但可以作为第二阶段实现。

线性插值流程：

1. 获取已排序控制点。
2. 根据坐标轴类型生成输出 X：
   - 线性 X：`xMin + i * (xMax - xMin) / (N - 1)`
   - 对数 X：`10 ** (log10(xMin) + i * (log10(xMax) - log10(xMin)) / (N - 1))`
3. 找到输出 X 所在的控制点区间。
4. 根据区间两端控制点计算 Y。
5. 如果 Y 轴是对数轴，建议在 logY 空间插值。

### 5.4 输出点数

曲线输出点数范围：

- 最小：200
- 最大：2000
- 默认：500

UI 控件：

- 使用 number input + slider。
- 输入超出范围时自动 clamp。
- 大于 1000 点时提示导出数据较多，但不阻止。

## 6. 导出设计

### 6.1 导出模式

导出弹窗应支持：

1. 单点数据：导出 pointSeries.points。
2. 曲线控制点：导出用户手动采集的控制点。
3. 曲线插值点：导出生成的 200-2000 个点。
4. 全部数据：单点 + 曲线控制点 + 曲线插值点。

### 6.2 推荐列结构

单点数据：

```text
Source File, Page, Data Type, Series Name, Point Index, X Label, Y Label
```

曲线控制点：

```text
Source File, Page, Data Type, Curve Name, Control Point Index, X Label, Y Label
```

曲线插值点：

```text
Source File, Page, Data Type, Curve Name, Interpolated Index, X Label, Y Label
```

其中 `X Label` 和 `Y Label` 使用用户编辑后的 `axisConfig.x.label`、`axisConfig.y.label` 作为真实列名。为了让多类型合并导出更稳定，建议实际导出为：

```text
source,page,type,series,index,<xAxisLabel>,<yAxisLabel>
```

### 6.3 坐标标题编辑

当前坐标标题在 `CalibrationPanel` 中编辑，导出时已经读取 `axisConfig`。优化建议：

- 在采集阶段和导出弹窗也显示可编辑坐标标题。
- 标题修改应写回当前 `SourcePage.axisConfig`。
- PDF 多页时默认每页独立标题；提供“应用到全部页面”按钮。

## 7. UI 改造计划

### 7.1 顶部状态栏

顶部保留：

- 导入图片/PDF
- PDF 页码导航
- 当前步骤
- 重置/换图

新增：

- 当前页面采集数据统计：
  - 单点数量
  - 曲线数量
  - 当前曲线控制点数量
  - 插值输出点数量

### 7.2 右侧采集面板

建议新增 `CollectionPanel`，替代或升级现有 `DigitizingPanel`：

- 顶部：模式切换 `单点采集 | 曲线采集`
- 单点模式：
  - 默认样本名
  - 点列表
  - 删除/重命名
- 曲线模式：
  - 曲线列表
  - 新建曲线
  - 曲线名称、颜色、可见性
  - 输出点数 200-2000
  - 插值方法
  - 控制点列表
  - 重新生成/清空当前曲线
- 底部：导出按钮

### 7.3 画布表现

单点模式：

- 采集点继续显示为绿色点。
- 点序号显示在点旁。

曲线模式：

- 控制点显示为曲线颜色的实心点。
- 控制点之间显示浅色连线。
- 插值曲线显示为更平滑的主线。
- 当前激活曲线高亮，非激活曲线降低透明度。
- 鼠标悬停显示当前真实坐标。

## 8. 实施阶段

### Phase 0：恢复工程基线

目标：保证后续功能开发有可靠反馈。

任务：

- 执行依赖恢复，使 `package.json` 和 `package-lock.json` 一致。
- 确认 `zustand`、`xlsx`、`pdfjs-dist` 安装成功。
- 修复 TypeScript 未使用导入和隐式 `any`。
- 修复明显中文乱码。
- 让 `npm run build` 通过。

验收：

- `npm run build` 通过。
- 应用能导入图片并进入校准界面。
- PDF 至少能读取第一页。

### Phase 1：采集模式与数据模型升级

目标：建立单点/曲线共存的数据结构。

任务：

- 新增 `CollectionMode`。
- 将 `currentStep` 调整为 `calibration | collection`。
- 新增 `SourcePage`、`PointSeries`、`CurveSeries` 类型。
- Store 支持 active page、active curve、collection mode。
- 保持现有单点采集行为不丢失。

验收：

- 单点模式能完成当前已有打点流程。
- UI 能切换单点/曲线模式。
- 曲线模式可创建曲线但暂不要求插值完整。

### Phase 2：曲线控制点采集

目标：用户能在曲线模式下创建曲线并采集控制点。

任务：

- 新建/删除/重命名曲线。
- 选择曲线颜色。
- 双击画布添加当前曲线控制点。
- 控制点列表展示、删除。
- 画布渲染控制点和控制点连线。

验收：

- 至少支持一张图片上一条曲线。
- 支持多条曲线切换。
- 每条曲线的控制点互不混淆。

### Phase 3：插值输出 200-2000 点

目标：根据控制点生成整条曲线数据。

任务：

- 新增 `utils/interpolation.ts`。
- 实现分段线性插值。
- 支持线性/对数 X 采样。
- 支持线性/对数 Y 插值。
- 输出点数范围 200-2000。
- 画布预览插值曲线。

验收：

- 2 个控制点可生成 200-2000 个点。
- 3 个及以上控制点按 X 排序后生成连续曲线。
- 修改输出点数后插值点数量实时更新。
- 对数坐标轴下输出不出现 NaN/Infinity。

### Phase 4：图片/PDF 页面级数据隔离

目标：图片和 PDF 都可稳定采集，PDF 多页数据不混淆。

任务：

- 图片导入创建一个 `SourcePage`。
- PDF 导入创建或懒加载多个 `SourcePage`。
- 切换 PDF 页时切换 active page。
- 每页独立保存校准、单点、曲线。
- 提供复制上一页校准到当前页的入口。

验收：

- PDF 第 1 页和第 2 页可分别采点/采曲线。
- 页间切换后数据恢复正确。
- 导出当前页和全部页结果正确区分页码。

### Phase 5：导出升级

目标：导出既支持单点，也支持曲线控制点和插值点。

任务：

- 扩展 `ExportOptions`，增加导出数据范围。
- CSV/XLSX 都支持：
  - 单点数据
  - 曲线控制点
  - 曲线插值点
  - 当前页/全部页
- 坐标标题可在采集阶段和导出弹窗编辑。
- CSV 字段做转义，避免样本名含逗号导致错列。

验收：

- 单点导出列标题使用用户编辑后的 X/Y 标题。
- 曲线插值导出点数等于用户设置值。
- XLSX 至少包含一个数据表；可选增强为不同数据类型分 sheet。

### Phase 6：体验增强

目标：让大功能更适合真实使用。

任务：

- 增加撤销/重做。
- 增加画布缩放和平移。
- 支持拖动修正点位置。
- 支持批量清空当前曲线控制点。
- 增加导出前预览统计。
- 后续再评估自动曲线追踪。

验收：

- 常见误操作可撤销。
- 高分辨率图片上定位效率明显改善。
- 曲线控制点较多时操作不卡顿。

## 9. 测试计划

### 9.1 单元测试

必须覆盖：

- `calculateRealValue`：线性 X/Y、对数 X/Y、反向坐标。
- `interpolateCurve`：2 点、3 点、重复 X、输出数量边界 200/2000。
- `exportToCSV`：字段转义、坐标标题、单点/曲线不同数据类型。
- Store actions：新增点、新建曲线、添加控制点、切换页面。

### 9.2 集成测试

必须覆盖：

- 图片导入 -> 校准 -> 单点采集 -> 导出。
- 图片导入 -> 校准 -> 曲线控制点 -> 生成 500 点 -> 导出。
- PDF 导入 -> 第 1 页采集 -> 第 2 页采集 -> 全部页导出。
- 编辑 X/Y 标题后导出列名正确。

### 9.3 人工验收场景

建议准备三类样例：

1. 散点图图片：验证单点采集。
2. 单曲线折线图图片：验证曲线控制点和插值。
3. 多页 PDF：验证页面隔离和导出页码。

## 10. 风险与取舍

### 10.1 先不做自动曲线识别

自动识别需要图像处理、颜色分割、曲线追踪、噪声处理，风险高。第一版先做“用户沿曲线采控制点 + 插值生成整条曲线”，可控且更快可用。

### 10.2 先做分段线性插值

分段线性插值最稳定，适合工程基线。平滑插值可以作为增强项，但要避免曲线过冲导致数据偏离原图。

### 10.3 PDF 多页必须隔离

如果不升级为页面级数据模型，PDF 支持会在曲线功能加入后迅速变混乱。建议在曲线功能稳定前完成 `SourcePage` 模型。

### 10.4 构建基线必须先修

当前 `npm run build` 失败。直接做大功能会导致无法判断问题来自旧基线还是新功能。因此 Phase 0 是必要前置项。

## 11. 推荐文件改动范围

优先改动：

- `src/types/index.ts`
- `src/store/appStore.ts`
- `src/hooks/useCanvasInteraction.ts`
- `src/hooks/useCalibration.ts`
- `src/utils/coordinate.ts`
- `src/utils/export.ts`
- `src/components/Canvas/MainCanvas.tsx`
- `src/components/Sidebar/DigitizingPanel.tsx`
- `src/components/Export/ExportDialog.tsx`

建议新增：

- `src/utils/interpolation.ts`
- `src/components/Sidebar/CollectionPanel.tsx`
- `src/components/Sidebar/CurvePanel.tsx`
- `src/components/Sidebar/PointPanel.tsx`
- `src/components/DataTable/CurveTable.tsx`

可能需要调整：

- `src/App.tsx`
- `src/hooks/useImageLoader.ts`
- `src/utils/pdfParser.ts`

## 12. 最小可交付版本定义

如果要尽快交付第一版“大功能”，建议 MVP 定义为：

- 图片和 PDF 单页都可采集。
- 单点模式保留现有能力。
- 曲线模式支持新建一条或多条曲线。
- 每条曲线可手动采集控制点。
- 每条曲线可生成 200-2000 个分段线性插值点。
- 导出支持单点、曲线控制点、曲线插值点。
- 坐标标题可编辑并进入导出列名。
- `npm run build` 通过。

MVP 不包含：

- 自动曲线追踪。
- 高级图像预处理。
- 曲线点拖动修正。
- 撤销/重做。
- 平滑三次插值。

这些作为后续增强，避免第一版范围失控。
