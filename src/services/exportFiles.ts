import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import pptxgen from 'pptxgenjs';
import {
  ExportDataParams,
  ExportPage,
  ExportPlot,
  buildExportRows,
  expandExportPlots
} from '../domain/exportModel';
import { formatNumber } from '../utils/coordinate';
import { generateInterpolatedPoints } from '../utils/interpolation';

export function exportToCSV(params: ExportDataParams): string {
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
  const rows = buildExportRows(params);

  return [header, ...rows]
    .map((row) =>
      row.map((value) => escapeCSVField(String(value), delimiter)).join(delimiter)
    )
    .join('\n');
}

export function exportToXLSX(
  params: ExportDataParams,
  filename: string = 'data'
): string {
  const workbookBytes = buildWorkbookBytes(params);

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
  const zip = new JSZip();
  const pages = getExportPages(params);
  const plots = expandExportPlots(pages);
  const filePlans = buildPlotFilePlans(plots);

  filePlans.forEach(({ plot, baseName }) => {
    if (plot.screenshot?.dataUrl) {
      zip.file(
        `screenshots/${baseName}.png`,
        dataUrlToBase64(plot.screenshot.dataUrl),
        { base64: true }
      );
    }

    zip.file(`plots/${baseName}.xlsx`, buildPlotWorkbookBytes(plot, params));
  });

  const pptxBytes = await buildSummaryPptx(filePlans);
  zip.file(`${sanitizeFilename(packageBaseName) || 'plotdigitizer_export'}.pptx`, pptxBytes);

  return zip.generateAsync({ type: 'arraybuffer' });
}

export function createDownloadUrl(
  content: string | ArrayBuffer,
  mimeType: string
): string {
  const blob = new Blob([content], { type: mimeType });
  return URL.createObjectURL(blob);
}

export function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
  const tsv = exportToCSV({
    ...params,
    options: { ...params.options, delimiter: '\t' }
  });

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(tsv);
      return;
    } catch (error) {
      console.warn('navigator.clipboard.writeText failed, using fallback.', error);
    }
  }

  copyTextWithTextarea(tsv);
}

function getExportPages(params: ExportDataParams): ExportPage[] {
  return params.options.pageScope === 'all' && params.pageSessions?.length
    ? params.pageSessions
    : [
        {
          pageNumber: params.pageNumber ?? 1,
          dataPoints: params.dataPoints,
          curves: params.curves,
          axisConfig: params.axisConfig,
          calibrationLines: params.calibrationLines,
          calibrationValues: params.calibrationValues,
          plotRegions: [],
          activePlotId: ''
        }
      ];
}

function escapeCSVField(value: string, delimiter: string): string {
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function copyTextWithTextarea(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('document.execCommand("copy") returned false.');
    }
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

  if (!filePlans.length) {
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
    slide.addText('No plot data was available at export time.', {
      x: 0.6,
      y: 1.3,
      w: 12,
      h: 0.4,
      fontFace: 'Arial',
      fontSize: 14,
      color: '475569'
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

  const output = await pptx.write({ outputType: 'arraybuffer' });
  return output as ArrayBuffer;
}

function buildWorkbookBytes(params: ExportDataParams): ArrayBuffer {
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

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array'
  }) as ArrayBuffer;
}

function buildPlotWorkbookBytes(
  plot: ExportPlot,
  params: ExportDataParams
): ArrayBuffer {
  const worksheet = XLSX.utils.aoa_to_sheet(
    buildPlotWideRows(plot, params.options.precision)
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array'
  }) as ArrayBuffer;
}

function buildPlotWideRows(
  plot: ExportPlot,
  precision: number
): Array<Array<string | number>> {
  const xLabel = getAxisLabel(plot.axisConfig.x.label, 'X');
  const yLabel = getAxisLabel(plot.axisConfig.y.label, 'Y');
  const series = dedupeExportNames([
    ...plot.curves.map((curve, index) => ({
      name: curve.name.trim() || `Curve ${index + 1}`,
      points: generateInterpolatedPoints(
        curve,
        plot.axisConfig,
        plot.calibrationLines,
        plot.calibrationValues
      ).map((point) => ({
        realX: point.realX,
        realY: point.realY
      }))
    })),
    ...plot.dataPoints.map((point, index) => ({
      name: point.label.trim() || `Point ${index + 1}`,
      points: [
        {
          realX: point.realX,
          realY: point.realY
        }
      ]
    }))
  ]);

  if (!series.length) {
    return [['No data']];
  }

  const headerNames: Array<string | number> = [];
  const axisNames: Array<string | number> = [];

  series.forEach((item) => {
    headerNames.push(item.exportName, item.exportName);
    axisNames.push(xLabel, yLabel);
  });

  const maxRows = Math.max(...series.map((item) => item.points.length), 1);
  const rows: Array<Array<string | number>> = [headerNames, axisNames];

  for (let index = 0; index < maxRows; index += 1) {
    const row: Array<string | number> = [];

    series.forEach((item) => {
      const point = item.points[index];
      row.push(
        point
          ? formatNumber(point.realX, plot.axisConfig.x.scale, precision)
          : '',
        point
          ? formatNumber(point.realY, plot.axisConfig.y.scale, precision)
          : ''
      );
    });

    rows.push(row);
  }

  return rows;
}

function dedupeExportNames<T extends { name: string }>(
  items: T[]
): Array<T & { exportName: string }> {
  const usedNames = new Map<string, number>();

  return items.map((item) => {
    const name = item.name.trim();
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);

    return {
      ...item,
      exportName: count === 0 ? name : `${name}_${count + 1}`
    };
  });
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? '';
}

function buildPlotFilePlans(plots: ExportPlot[]): Array<{
  plot: ExportPlot;
  baseName: string;
}> {
  const usedNames = new Map<string, number>();

  return plots.map((plot) => {
    const rawBaseName = `p${String(plot.pageNumber).padStart(3, '0')}_${plot.plotName}`;
    const safeBaseName = sanitizeFilename(rawBaseName) || `p${String(plot.pageNumber).padStart(3, '0')}_plot`;
    const count = usedNames.get(safeBaseName) ?? 0;
    usedNames.set(safeBaseName, count + 1);

    return {
      plot,
      baseName: count === 0 ? safeBaseName : `${safeBaseName}_${count + 1}`
    };
  });
}

function getAxisLabel(label: string | undefined, fallback: string): string {
  return label?.trim() || fallback;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
}
