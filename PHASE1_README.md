# PlotDigitizer - Phase 1 (MVP) 开发完成

## 项目概述

已成功基于现有项目重构，完成 Phase 1（MVP）开发，包括：
- TypeScript 迁移
- 组件化架构
- 图片/PDF 导入
- 4线校准
- 手动打点
- CSV/Excel 导出

## 新增文件结构

```
src/
├── types/
│   └── index.ts              # TypeScript 类型定义
├── store/
│   └── appStore.ts           # Zustand 全局状态管理
├── utils/
│   ├── coordinate.ts         # 坐标转换算法
│   ├── export.ts             # 数据导出工具
│   └── pdfParser.ts          # PDF 解析工具
├── hooks/
│   ├── useImageLoader.ts     # 图片/PDF 加载 Hook
│   ├── useCalibration.ts     # 校准逻辑 Hook
│   └── useCanvasInteraction.ts  # Canvas 交互 Hook
├── components/
│   ├── Canvas/
│   │   └── MainCanvas.tsx    # 主画布组件
│   ├── Sidebar/
│   │   ├── CalibrationPanel.tsx  # 校准面板
│   │   └── DigitizingPanel.tsx   # 数据采集面板
│   ├── DataTable/
│   │   └── DataTable.tsx     # 数据表格组件
│   └── Export/
│       └── ExportDialog.tsx  # 导出对话框
├── App.tsx                   # 主应用组件（TypeScript）
└── main.tsx                  # 入口文件（TypeScript）
```

## 技术栈更新

- TypeScript 5.x (新增)
- React 18.x
- Zustand 4.x (状态管理)
- XLSX (Excel 导出)
- pdfjs-dist (PDF 解析)
- Tailwind CSS
- Vite
- Electron (保持不变)

## Phase 1 功能特性

### 1. 文件导入
- 支持拖拽上传
- 支持点击按钮选择文件
- 支持 PDF 导入（可翻页）
- 支持常用图片格式

### 2. 4线校准
- 可拖动的 X1/X2/Y1/Y2 校准线
- 支持线性/对数坐标轴
- 可自定义坐标轴标签
- 实时预览校准效果

### 3. 手动打点
- 双击图片打点
- 放大镜辅助
- 可编辑 Sample Name
- 可删除数据点

### 4. 数据导出
- CSV 格式（支持多种分隔符）
- Excel 格式 (.xlsx)
- 复制到剪贴板
- 自定义精度

## 安装和运行

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式（Web）

```bash
npm run dev
```

### 3. 构建生产版本

```bash
npm run build
```

### 4. Electron 开发模式

```bash
npm run electron:dev
```

### 5. Electron 打包

```bash
npm run electron:build
```

## 下一步（Phase 2 及以后）

- [ ] 自动曲线追踪
- [ ] 多曲线管理
- [ ] 撤销/重做功能
- [ ] 画布缩放/平移
- [ ] 图像预处理（旋转/裁剪/对比度等）
- [ ] 图表预览
- [ ] 更多校准点支持
- [ ] 自然对数坐标轴

## 注意事项

1. 旧的 `App.jsx` 和 `main.jsx` 文件已保留作为备份
2. 新代码全部使用 TypeScript 编写
3. 所有组件都已分离，便于后续维护和扩展
4. 全局状态使用 Zustand 管理，避免了 prop drilling
