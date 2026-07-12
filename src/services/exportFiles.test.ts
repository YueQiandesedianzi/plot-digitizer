import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { ExportOptions, PageSession, PlotRegion } from '../types';
import { CANONICAL_EXPORT_COLUMNS, type ExportDataParams } from '../domain/exportModel';
import {
  buildBundleBytes,
  buildWorkbookBytes,
  exportToCSV
} from './exportFiles';

const firstPlot: PlotRegion = {
  id: 'plot-a',
  name: 'Linear plot',
  calibrationLines: { x1: 10, x2: 90, y1: 90, y2: 10 },
  calibrationValues: { x1: 0, x2: 1, y1: 0, y2: 10 },
  axisConfig: {
    x: { label: 'Time', scale: 'linear' },
    y: { label: 'Stress', scale: 'linear' }
  },
  dataPoints: [
    {
      id: 'point-a',
      screenX: 20,
      screenY: 50,
      realX: 0.12345678901234568,
      realY: 5,
      label: 'A',
      qualityFlags: []
    }
  ],
  curves: [],
  activeCurveId: null,
  collectionMode: 'point',
  defaultSampleLabel: 'A'
};

const secondPlot: PlotRegion = {
  ...structuredClone(firstPlot),
  id: 'plot-b',
  name: 'Log plot',
  calibrationValues: { x1: 1, x2: 100, y1: 1, y2: 1000 },
  axisConfig: {
    x: { label: 'Frequency', scale: 'log10', logInputMode: 'value' },
    y: { label: 'Modulus', scale: 'log10', logInputMode: 'value' }
  },
  dataPoints: [
    {
      id: 'point-b',
      screenX: 95,
      screenY: 50,
      realX: 133.3521432163324,
      realY: 31.622776601683793,
      label: 'B',
      qualityFlags: ['outside-calibration']
    }
  ]
};

const session: PageSession = {
  pageNumber: 1,
  imageData: {
    src: 'blob:test',
    naturalWidth: 1000,
    naturalHeight: 800,
    name: 'figure.png'
  },
  plotRegions: [firstPlot, secondPlot],
  activePlotId: firstPlot.id,
  calibrationLines: firstPlot.calibrationLines,
  calibrationValues: firstPlot.calibrationValues,
  axisConfig: firstPlot.axisConfig,
  dataPoints: firstPlot.dataPoints,
  curves: [],
  activeCurveId: null,
  currentStep: 'digitizing',
  collectionMode: 'point',
  defaultSampleLabel: 'A'
};

function params(options: Partial<ExportOptions> = {}): ExportDataParams {
  return {
    pageNumber: 1,
    imageData: session.imageData,
    dataPoints: session.dataPoints,
    curves: session.curves,
    axisConfig: session.axisConfig,
    calibrationLines: session.calibrationLines,
    calibrationValues: session.calibrationValues,
    pageSessions: [session],
    options: {
      format: 'csv',
      precision: 4,
      schema: 'v2.1',
      valueMode: 'full',
      pageScope: 'all',
      dataScope: 'all',
      delimiter: ',',
      ...options
    }
  };
}

describe('v2.1 trusted exports', () => {
  it('uses the fixed long-form columns and round-trippable number text', () => {
    const csv = exportToCSV(params());
    const [header, firstRow, secondRow] = csv.split('\n');
    expect(header).toBe(CANONICAL_EXPORT_COLUMNS.join(','));
    const xIndex = CANONICAL_EXPORT_COLUMNS.indexOf('x_value');
    expect(Number(firstRow.split(',')[xIndex])).toBe(firstPlot.dataPoints[0].realX);
    expect(secondRow).toContain('outside-calibration');
  });

  it('writes numeric X/Y cells and per-plot metadata into three sheets', () => {
    const workbook = XLSX.read(buildWorkbookBytes(params()), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Data', 'Plots', 'Project']);
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Data);
    expect(typeof data[0].x_value).toBe('number');
    expect(data[0].x_value).toBe(firstPlot.dataPoints[0].realX);
    expect(data[1].quality_flags).toBe('outside-calibration');

    const plots = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Plots);
    expect(plots[0]).toMatchObject({ x_label: 'Time', x_scale: 'linear' });
    expect(plots[1]).toMatchObject({
      x_label: 'Frequency',
      x_scale: 'log10',
      y_label: 'Modulus'
    });
  });

  it(
    'keeps canonical data in bundles and adds legacy files without replacing it',
    async () => {
      const bytes = await buildBundleBytes(
        params({ schema: 'legacy-v2.0' }),
        'bundle'
      );
      const zip = await JSZip.loadAsync(bytes);
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      expect(manifest.canonical.row_count).toBe(2);
      expect(manifest.legacy_files).toHaveLength(2);
      expect(zip.file(manifest.canonical.csv)).not.toBeNull();
      expect(zip.file(manifest.canonical.xlsx)).not.toBeNull();
      expect(Object.keys(zip.files).filter((name) => name.startsWith('plots/') && name.endsWith('.xlsx'))).toHaveLength(2);

      const canonicalCsv = await zip.file(manifest.canonical.csv)!.async('string');
      const canonicalWorkbook = XLSX.read(
        await zip.file(manifest.canonical.xlsx)!.async('arraybuffer'),
        { type: 'array' }
      );
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        canonicalWorkbook.Sheets.Data
      );
      expect(canonicalCsv).toContain('point-a');
      expect(rows.map((row) => row.point_id)).toEqual(['point-a', 'point-b']);
    },
    20000
  );
});
