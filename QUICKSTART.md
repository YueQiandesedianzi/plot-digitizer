# PlotDigitizer 快速开始指南

## 🚀 项目简介

PlotDigitizer 是一个功能强大的曲线数据提取工具，支持从图片和 PDF 中提取数据点，支持导出为 CSV 或 Excel 格式。

### 核心特性
- ✅ 支持图片格式 (PNG, JPG, BMP, TIFF)
- ✅ 支持 PDF 文件解析
- ✅ 4 点坐标校准
- ✅ 手动打点提取数据
- ✅ 放大镜辅助精确定位
- ✅ CSV/Excel 导出
- ✅ 组件化架构，TypeScript 开发

---

## 📦 环境准备

### 1. 安装 Node.js
确保你的电脑上已安装 Node.js (推荐 v18 或更高版本)
```bash
node -v
```

### 2. 安装依赖
在项目根目录下运行：
```bash
npm install
```

---

## 🎯 快速启动

### 开发模式 (Web)
```bash
npm run dev
```
然后打开浏览器访问显示的链接 (通常是 http://localhost:5173)

### Electron 桌面端
```bash
# 先构建项目
npm run build

# 然后启动 Electron
npm run electron:dev
```

---

## 📖 使用说明

### 第一步：导入文件
1. 点击右上角的 "导入图片/PDF" 按钮
2. 选择你需要提取数据的图表文件
3. 如果是 PDF 文件，可以使用页码导航选择不同页面

### 第二步：坐标校准
1. 拖动蓝色的 X1/X2 线到横坐标的刻度位置
2. 拖动红色的 Y1/Y2 线到纵坐标的刻度位置
3. 在右侧面板中输入对应的数值
4. 可以选择坐标轴类型（线性/对数）
5. 点击 "确认校准 & 开始打点"

### 第三步：数据采集
1. 双击图片上的曲线进行打点
2. 鼠标悬停时会显示放大镜，辅助精确定位
3. 可以在右侧表格中编辑或删除数据点
4. 可以修改下一个点的标签

### 第四步：数据导出
1. 点击右侧的 "导出" 按钮
2. 选择导出格式（CSV 或 Excel）
3. 选择精度和分隔符（CSV）
4. 点击 "导出文件" 或 "复制到剪贴板"

---

## 📁 项目结构

```
PlotDigitizer/
├── src/
│   ├── components/           # React 组件
│   │   ├── Canvas/           # 画布相关组件
│   │   ├── Sidebar/          # 侧边栏组件
│   │   ├── DataTable/        # 数据表格组件
│   │   └── Export/           # 导出对话框
│   ├── hooks/               # 自定义 React Hooks
│   ├── store/               # Zustand 状态管理
│   ├── utils/               # 工具函数
│   ├── types/               # TypeScript 类型定义
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 应用入口
│   └── index.css            # 样式文件
├── electron/                # Electron 相关
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🔧 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run lint` | 运行代码检查 |
| `npm run electron:dev` | 启动 Electron 开发模式 |
| `npm run electron:build` | 构建 Electron 应用 |

---

## 📝 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Zustand** - 状态管理
- **XLSX** - Excel 文件处理
- **pdf.js** - PDF 解析
- **Electron** - 桌面应用

---

## 🐛 常见问题

### PDF 文件无法加载？
- 确保网络连接正常（需要从 CDN 加载 PDF worker）
- 尝试将 PDF 转换为图片格式再导入

### 导出的坐标不准确？
- 确保校准线完全对齐图表刻度
- 使用放大镜辅助精确定位

### Electron 模式无法启动？
- 确保先运行 `npm run build` 构建前端代码
- 检查 Node.js 版本是否兼容

---

## 🎉 下一步

完成基础功能的 Phase 1 开发后，未来还会实现：
- 🔄 自动曲线追踪
- 📊 多曲线管理
- ↩️ 撤销/重做
- 🔍 画布缩放平移
- 🎨 图像预处理

祝使用愉快！
