# Changelog

## 2.2.0

- 增加证据链导出：ZIP 包新增 `evidence/evidence_report.json`，记录源文件、页面/图区域、坐标轴、校准问题、点数统计、质量标记和每张图的 `accepted` / `needs_review` / `invalid` 状态。
- XLSX 新增 `Evidence` sheet，将每张图的证据摘要展开为可筛选表格；`Project` sheet 增加 evidence schema 版本。
- 扩展 `quality_flags`，导出行会标记 `manual-point`、`curve-control`、`curve-interpolated`、`auto-traced`、`low-confidence`、`needs-review` 等来源和风险信息。
- 自动追踪确认后的点会保留 `auto-traced` 标记；低置信追踪结果会额外标记 `low-confidence` 和 `needs-review`，避免候选结果被误认为普通手动点。
- 保持 canonical CSV/XLSX 的 v2.1 长表 schema 兼容，v2.2 作为证据和复核增强层提供。

## 2.1.0

- 增加统一校准校验、安全自定义公式解析和 `outside-calibration` 质量标记。
- 增加事务式图片/PDF 导入、每页独立撤销/恢复和未保存修改确认。
- 增加自包含 `.plotdigitizer` 项目文件、源文件 SHA-256 校验和 IndexedDB 自动恢复。
- 默认使用 v2.1 长表 CSV/XLSX；XLSX 固定提供 `Data`、`Plots`、`Project` 三个 sheet。
- ZIP 导出固定包含 canonical 数据、逐图工作簿、截图、PPT 摘要和 manifest。
- `legacy-v2.0` 导出已弃用，仅保留一个兼容版本；后续版本将移除。
- 增加 Vitest、Testing Library、Playwright、Electron smoke 和 GitHub Actions 基线。
