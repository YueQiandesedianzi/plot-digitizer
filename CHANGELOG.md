# Changelog

## 2.1.0

- 增加统一校准校验、安全自定义公式解析和 `outside-calibration` 质量标记。
- 增加事务式图片/PDF 导入、每页独立撤销/恢复和未保存修改确认。
- 增加自包含 `.plotdigitizer` 项目文件、源文件 SHA-256 校验和 IndexedDB 自动恢复。
- 默认使用 v2.1 长表 CSV/XLSX；XLSX 固定提供 `Data`、`Plots`、`Project` 三个 sheet。
- ZIP 导出固定包含 canonical 数据、逐图工作簿、截图、PPT 摘要和 manifest。
- `legacy-v2.0` 导出已弃用，仅保留一个兼容版本；后续版本将移除。
- 增加 Vitest、Testing Library、Playwright、Electron smoke 和 GitHub Actions 基线。
