import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import pptxgen from 'pptxgenjs';
import type { CalibrationIssue, ExportOptions, PlotRegion } from '../types';
import {
  CANONICAL_EXPORT_COLUMNS,
  type ExportDataParams,
  type ExportPlot,
  buildCanonicalRecords,
  buildExportRows,
  expandExportPlots,
  getSelectedExportPages,
  hasPlotOutput
} from '../domain/exportModel';
import { validateCalibration } from '../domain/calibration';

export interface ExportValidationIssue {
  pageNumber: number;
  plotId: string;
  plotName: string;
  issue: CalibrationIssue;
}

export function validateExportParams(params: ExportDataParams): ExportValidationIssue[] {
  return getSelectedExportPages(params).flatMap((page) => {
    const plots = page.plotRegions.length
      ? page.plotRegions.filter(hasPlotOutput)
      : [fallbackPlot(params)];
    return plots.flatMap((plot) =>
      validateCalibration({
        calibrationLines: plot.calibrationLines,
        calibrationValues: plot.calibrationValues,
        axisConfig: plot.axisConfig,
        imageData:
          page.imageData.naturalWidth > 0 && page.imageData.naturalHeight > 0
            ? page.imageData
            : undefined
      }).issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => ({
          pageNumber: page.pageNumber,
          plotId: plot.id,
          plotName: plot.name,
          issue
        }))
    );
  });
}

export function exportToCSV(params: ExportDataParams): string {
  assertExportValid(params);
  if (params.options.schema === 'legacy-v2.0') return buildLegacyCsv(params);
  return buildCanonicalCsv(params);
}

export function exportToXLSX(
  params: ExportDataParams,
  filename: string = 'data'
): string {
  assertExportValid(params);
  const workbookBytes =
    params.options.schema === 'legacy-v2.0'
      ? buildLegacyWorkbookBytes(params)
      : buildWorkbookBytes(params);
  return downloadFile(
    workbookBytes,
    `${filename}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export async function exportBundle(
  params: ExportDataParams,
  filename: string = 'plotdigitizer_export'
): Promise<string> {
  const zipBytes = await buildBundleBytes(params, filename);
  return downloadFile(zipBytes, `${filename}.zip`, 'application/zip');
}

export async function buildBundleBytes(
  params: ExportDataParams,
  packageBaseName: string = 'plotdigitizer_export'
): Promise<ArrayBuffer> {
  assertExportValid(params);
  const zip = new JSZip();
  const canonicalParams: ExportDataParams = {
    ...params,
    options: { ...params.options, schema: 'v2.1' }
  };
  const plots = expandExportPlots(getSelectedExportPages(canonicalParams));
  const filePlans = buildPlotFilePlans(plots);
  const safeBaseName = sanitizeFilename(packageBaseName) || 'plotdigitizer_export';
  const csvPath = `canonical/${safeBaseName}-v2.1.csv`;
  const xlsxPath = `canonical/${safeBaseName}-v2.1.xlsx`;
  zip.file(csvPath, buildCanonicalCsv(canonicalParams));
  zip.file(xlsxPath, buildWorkbookBytes(canonicalParams));

  const screenshotPaths: string[] = [];
  const plotWorkbookPaths: string[] = [];
  filePlans.forEach(({ plot, baseName }) => {
    const workbookPath = `plots/${baseName}.xlsx`;
    plotWorkbookPaths.push(workbookPath);
    zip.file(
      workbookPath,
      buildWorkbookBytes(canonicalParams, {
        pageNumber: plot.pageNumber,
        plotId: plot.plotId
      })
    );
    if (plot.screenshot?.dataUrl) {
      const screenshotPath = `screenshots/${baseName}.${dataUrlExtension(
        plot.screenshot.dataUrl
      )}`;
      screenshotPaths.push(screenshotPath);
      zip.file(screenshotPath, dataUrlToBase64(plot.screenshot.dataUrl), {
        base64: true
      });
    }
  });

  const summaryPath = `${safeBaseName}-summary.pptx`;
  zip.file(summaryPath, await buildSummaryPptx(filePlans));
  const legacyPaths: string[] = [];
  if (params.options.schema === 'legacy-v2.0') {
    const legacyCsvPath = `legacy/${safeBaseName}-legacy-v2.0.csv`;
    const legacyXlsxPath = `legacy/${safeBaseName}-legacy-v2.0.xlsx`;
    zip.file(legacyCsvPath, buildLegacyCsv(params));
    zip.file(legacyXlsxPath, buildLegacyWorkbookBytes(params));
    legacyPaths.push(legacyCsvPath, legacyXlsxPath);
  }

  const records = buildCanonicalRecords(canonicalParams);
  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        schema_version: '2.1',
        generated_at: new Date().toISOString(),
        canonical: {
          csv: csvPath,
          xlsx: xlsxPath,
          row_count: records.length
        },
        plot_workbooks: plotWorkbookPaths,
        screenshots: screenshotPaths,
        summary_pptx: summaryPath,
        legacy_files: legacyPaths
      },
      null,
      2
    )
  );
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export function buildCanonicalCsv(params: ExportDataParams): string {
  const delimiter = params.options.delimiter || ',';
  const valueMode = params.options.valueMode ?? 'full';
  const records = buildCanonicalRecords(params);
  return [
    CANONICAL_EXPORT_COLUMNS.join(delimiter),
    ...records.map((record) =>
      CANONICAL_EXPORT_COLUMNS.map((column) => {
        const raw = record[column];
        const value =
          (column === 'x_value' || column === 'y_value') && typeof raw === 'number'
            ? formatCsvNumber(raw, valueMode, params.options.precision)
            : String(raw);
        return escapeCSVField(value, delimiter);
      }).join(delimiter)
    )
  ].join('\n');
}

export function buildWorkbookBytes(
  params: ExportDataParams,
  filter?: { pageNumber: number; plotId: string }
): ArrayBuffer {
  const allRecords = buildCanonicalRecords(params);
  const records = filter
    ? allRecords.filter(
        (record) =>
          record.page === filter.pageNumber && record.plot_id === filter.plotId
      )
    : allRecords;
  const allPlots = expandExportPlots(getSelectedExportPages(params));
  const plots = filter
    ? allPlots.filter(
        (plot) =>
          plot.pageNumber === filter.pageNumber && plot.plotId === filter.plotId
      )
    : allPlots;
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([
    [...CANONICAL_EXPORT_COLUMNS],
    ...records.map((record) =>
      CANONICAL_EXPORT_COLUMNS.map((column) => record[column])
    )
  ]);
  applyDataSheetFormatting(dataSheet, records.length, params.options.precision);
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(plots.map(buildPlotMetadataRow)),
    'Plots'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['key', 'value'],
      ['schema_version', '2.1'],
      ['generated_at', new Date().toISOString()],
      ['page_count', new Set(plots.map((plot) => plot.pageNumber)).size],
      ['plot_count', plots.length],
      ['row_count', records.length],
      ['source_name', params.imageData?.name ?? '']
    ]),
    'Project'
  );
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

export function createDownloadUrl(
  content: string | ArrayBuffer,
  mimeType: string
): string {
  return URL.createObjectURL(new Blob([content], { type: mimeType }));
}

export function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function downloadFile(
  content: string | ArrayBuffer,
  filename: string,
  mimeType: string
): string {
  const url = createDownloadUrl(content, mimeType);
  triggerDownload(url, filename);
  return url;
}

export function revokeDownloadUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(params: ExportDataParams): Promise<void> {
  const text = exportToCSV({
    ...params,
    options: { ...params.options, delimiter: '\t' }
  });
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn('navigator.clipboard.writeText failed, using fallback.', error);
    }
  }
  copyTextWithTextarea(text);
}

function assertExportValid(params: ExportDataParams): void {
  const issues = validateExportParams(params);
  if (issues.length > 0) {
    const first = issues[0];
    throw new Error(
      `第 ${first.pageNumber} 页“${first.plotName}”校准无效：${first.issue.message}`
    );
  }
}

function fallbackPlot(params: ExportDataParams): PlotRegion {
  return {
    id: `page-${params.pageNumber ?? 1}`,
    name: 'Figure 1',
    calibrationLines: params.calibrationLines,
    calibrationValues: params.calibrationValues,
    axisConfig: params.axisConfig,
    dataPoints: params.dataPoints,
    curves: params.curves,
    activeCurveId: null,
    collectionMode: 'point',
    defaultSampleLabel: 'Sample A'
  };
}

function formatCsvNumber(
  value: number,
  mode: NonNullable<ExportOptions['valueMode']>,
  precision: number
): string {
  if (!Number.isFinite(value)) throw new Error('导出数据包含非有限数值');
  return mode === 'rounded' ? value.toFixed(precision) : value.toString();
}

function buildLegacyCsv(params: ExportDataParams): string {
  const delimiter = params.options.delimiter || ',';
  const header = [
    'Page',
    'Plot',
    'Data Type',
    'Series',
    'Index',
    'Label',
    params.axisConfig.x.label,
    params.axisConfig.y.label
  ];
  return [header, ...buildExportRows(params)]
    .map((row) =>
      row.map((value) => escapeCSVField(String(value), delimiter)).join(delimiter)
    )
    .join('\n');
}

function buildLegacyWorkbookBytes(params: ExportDataParams): ArrayBuffer {
  const data = [
    [
      'Page',
      'Plot',
      'Data Type',
      'Series',
      'Index',
      'Label',
      params.axisConfig.x.label,
      params.axisConfig.y.label
    ],
    ...buildExportRows(params)
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), 'Data');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function applyDataSheetFormatting(
  worksheet: XLSX.WorkSheet,
  rowCount: number,
  precision: number
): void {
  const format = precision > 0 ? `0.${'0'.repeat(precision)}` : '0';
  const xColumn = CANONICAL_EXPORT_COLUMNS.indexOf('x_value');
  const yColumn = CANONICAL_EXPORT_COLUMNS.indexOf('y_value');
  for (let row = 1; row <= rowCount; row += 1) {
    [xColumn, yColumn].forEach((column) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = format;
    });
  }
  worksheet['!cols'] = CANONICAL_EXPORT_COLUMNS.map((column) => ({
    wch: column.endsWith('_formula') ? 24 : Math.max(12, column.length + 2)
  }));
}

function buildPlotMetadataRow(plot: ExportPlot): Record<string, string | number> {
  return {
    page: plot.pageNumber,
    plot_id: plot.plotId,
    plot_name: plot.plotName,
    x_label: plot.axisConfig.x.label,
    x_scale: plot.axisConfig.x.scale,
    x_log_input_mode: plot.axisConfig.x.logInputMode ?? '',
    x_formula: plot.axisConfig.x.formula ?? '',
    x_screen_1: plot.calibrationLines.x1,
    x_screen_2: plot.calibrationLines.x2,
    x_value_1: plot.calibrationValues.x1,
    x_value_2: plot.calibrationValues.x2,
    y_label: plot.axisConfig.y.label,
    y_scale: plot.axisConfig.y.scale,
    y_log_input_mode: plot.axisConfig.y.logInputMode ?? '',
    y_formula: plot.axisConfig.y.formula ?? '',
    y_screen_1: plot.calibrationLines.y1,
    y_screen_2: plot.calibrationLines.y2,
    y_value_1: plot.calibrationValues.y1,
    y_value_2: plot.calibrationValues.y2,
    point_count: plot.dataPoints.length,
    curve_count: plot.curves.length
  };
}

function escapeCSVField(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

function copyTextWithTextarea(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('浏览器拒绝复制');
  } finally {
    document.body.removeChild(textarea);
  }
}

async function buildSummaryPptx(
  filePlans: Array<{ plot: ExportPlot; baseName: string }>
): Promise<ArrayBuffer> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'PlotDigitizer';
  pptx.subject = 'PlotDigitizer export summary';
  pptx.title = 'PlotDigitizer Export Summary';
  pptx.company = 'PlotDigitizer';
  if (filePlans.length === 0) {
    const slide = pptx.addSlide();
    slide.addText('PlotDigitizer Export Summary', {
      x: 0.6,
      y: 0.5,
      w: 12,
      h: 0.5,
      fontFace: 'Arial',
      fontSize: 26,
      bold: true,
      color: '1f2937'
    });
  }
  filePlans.forEach(({ plot }) => {
    const slide = pptx.addSlide();
    slide.background = { color: 'F8FAFC' };
    slide.addText(`Page ${plot.pageNumber} - ${plot.plotName}`, {
      x: 0.45,
      y: 0.25,
      w: 12.2,
      h: 0.45,
      fontFace: 'Arial',
      fontSize: 22,
      bold: true,
      color: '111827',
      fit: 'shrink'
    });
    if (plot.screenshot?.dataUrl) {
      slide.addImage({
        data: plot.screenshot.dataUrl,
        x: 0.5,
        y: 0.9,
        w: 7.5,
        h: 5.75,
        sizing: { type: 'contain', x: 0.5, y: 0.9, w: 7.5, h: 5.75 }
      });
    }
  });
  return (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
}

function buildPlotFilePlans(plots: ExportPlot[]): Array<{
  plot: ExportPlot;
  baseName: string;
}> {
  const used = new Map<string, number>();
  return plots.map((plot) => {
    const proposed =
      sanitizeFilename(
        `p${String(plot.pageNumber).padStart(3, '0')}_${plot.plotName}`
      ) || `p${String(plot.pageNumber).padStart(3, '0')}_plot`;
    const count = used.get(proposed) ?? 0;
    used.set(proposed, count + 1);
    return {
      plot,
      baseName: count === 0 ? proposed : `${proposed}_${count + 1}`
    };
  });
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? '';
}

function dataUrlExtension(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/jpeg')) return 'jpg';
  if (dataUrl.startsWith('data:image/webp')) return 'webp';
  if (dataUrl.startsWith('data:image/gif')) return 'gif';
  return 'png';
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
}
