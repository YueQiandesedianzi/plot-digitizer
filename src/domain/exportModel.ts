import {
  AxisConfig,
  CalibrationLines,
  CalibrationValues,
  CurveSeries,
  DataPoint,
  ExportOptions,
  ImageData,
  PageSession,
  PlotRegion
} from '../types';
import { formatNumber } from '../utils/coordinate';
import { generateInterpolatedPoints } from '../utils/interpolation';
import { getPointQualityFlags } from './calibration';

export interface ExportDataParams {
  pageNumber?: number;
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  axisConfig: { x: AxisConfig; y: AxisConfig };
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  imageData?: ImageData;
  pageSessions?: PageSession[];
  options: ExportOptions;
}

export type ExportRow = Array<string | number>;

export type ExportPage = Pick<
  PageSession,
  | 'pageNumber'
  | 'dataPoints'
  | 'curves'
  | 'axisConfig'
  | 'calibrationLines'
  | 'calibrationValues'
  | 'plotRegions'
  | 'activePlotId'
  | 'imageData'
>;

export type ExportPlot = {
  pageNumber: number;
  plotId: string;
  plotName: string;
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  axisConfig: { x: AxisConfig; y: AxisConfig };
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  screenshot?: PageSession['plotRegions'][number]['screenshot'];
  sourcePlot?: PlotRegion;
};

export type NameItem = {
  key: string;
  pageNumber: number;
  kind: 'plot' | 'curve' | 'point' | 'screenshot';
  plotId: string;
  targetId: string;
  label: string;
  value: string;
};

export const CANONICAL_EXPORT_COLUMNS = [
  'schema_version',
  'page',
  'plot_id',
  'plot_name',
  'data_type',
  'series_id',
  'series_name',
  'point_id',
  'point_index',
  'label',
  'x_label',
  'x_scale',
  'x_log_input_mode',
  'x_formula',
  'x_value',
  'y_label',
  'y_scale',
  'y_log_input_mode',
  'y_formula',
  'y_value',
  'interpolation',
  'quality_flags'
] as const;

export type CanonicalExportColumn = (typeof CANONICAL_EXPORT_COLUMNS)[number];
export type CanonicalExportRecord = Record<
  CanonicalExportColumn,
  string | number
>;

export function getSelectedExportPages(params: ExportDataParams): ExportPage[] {
  const fallbackPage: ExportPage = {
    pageNumber: params.pageNumber ?? 1,
    imageData: params.imageData ?? {
      src: null,
      naturalWidth: 0,
      naturalHeight: 0
    },
    dataPoints: params.dataPoints,
    curves: params.curves,
    axisConfig: params.axisConfig,
    calibrationLines: params.calibrationLines,
    calibrationValues: params.calibrationValues,
    plotRegions: [],
    activePlotId: ''
  };
  if (!params.pageSessions?.length) return [fallbackPage];
  const selected =
    params.options.pageScope === 'all'
      ? params.pageSessions
      : params.pageSessions.filter(
          (page) => page.pageNumber === (params.pageNumber ?? 1)
        );
  return selected.length ? selected : [fallbackPage];
}

export function buildCanonicalRecords(
  params: ExportDataParams
): CanonicalExportRecord[] {
  const scope = params.options.dataScope ?? 'all';
  const records: CanonicalExportRecord[] = [];
  expandExportPlots(getSelectedExportPages(params)).forEach((plot) => {
    if (scope === 'points' || scope === 'all') {
      plot.dataPoints.forEach((point, index) => {
        records.push(
          buildCanonicalRecord(plot, {
            dataType: 'point',
            seriesId: 'points',
            seriesName: 'Points',
            pointId: point.id,
            pointIndex: index + 1,
            label: point.label,
            realX: point.realX,
            realY: point.realY,
            qualityFlags: point.qualityFlags ?? [],
            interpolation: ''
          })
        );
      });
    }

    plot.curves.forEach((curve) => {
      if (scope === 'curve-controls' || scope === 'all') {
        curve.controlPoints.forEach((point) => {
          records.push(
            buildCanonicalRecord(plot, {
              dataType: 'curve_control',
              seriesId: curve.id,
              seriesName: curve.name,
              pointId: point.id,
              pointIndex: point.order,
              label: point.label,
              realX: point.realX,
              realY: point.realY,
              qualityFlags: point.qualityFlags ?? [],
              interpolation: curve.interpolation
            })
          );
        });
      }
      if (scope === 'curve-interpolated' || scope === 'all') {
        generateInterpolatedPoints(
          curve,
          plot.axisConfig,
          plot.calibrationLines,
          plot.calibrationValues
        ).forEach((point, index) => {
          records.push(
            buildCanonicalRecord(plot, {
              dataType: 'curve_interpolated',
              seriesId: curve.id,
              seriesName: curve.name,
              pointId: point.id,
              pointIndex: index + 1,
              label: `${curve.name} ${index + 1}`,
              realX: point.realX,
              realY: point.realY,
              qualityFlags: getPointQualityFlags(
                point.screenX,
                point.screenY,
                plot.calibrationLines
              ),
              interpolation: curve.interpolation
            })
          );
        });
      }
    });
  });
  return records;
}

interface CanonicalPointInput {
  dataType: string;
  seriesId: string;
  seriesName: string;
  pointId: string;
  pointIndex: number;
  label: string;
  realX: number;
  realY: number;
  qualityFlags: string[];
  interpolation: string;
}

function buildCanonicalRecord(
  plot: ExportPlot,
  point: CanonicalPointInput
): CanonicalExportRecord {
  return {
    schema_version: '2.1',
    page: plot.pageNumber,
    plot_id: plot.plotId,
    plot_name: plot.plotName,
    data_type: point.dataType,
    series_id: point.seriesId,
    series_name: point.seriesName,
    point_id: point.pointId,
    point_index: point.pointIndex,
    label: point.label,
    x_label: plot.axisConfig.x.label,
    x_scale: plot.axisConfig.x.scale,
    x_log_input_mode: logInputMode(plot.axisConfig.x),
    x_formula: plot.axisConfig.x.formula ?? '',
    x_value: point.realX,
    y_label: plot.axisConfig.y.label,
    y_scale: plot.axisConfig.y.scale,
    y_log_input_mode: logInputMode(plot.axisConfig.y),
    y_formula: plot.axisConfig.y.formula ?? '',
    y_value: point.realY,
    interpolation: point.interpolation,
    quality_flags: point.qualityFlags.join(';')
  };
}

function logInputMode(config: AxisConfig): string {
  return ['log', 'log10', 'ln'].includes(config.scale)
    ? config.logInputMode ?? 'value'
    : '';
}

export function buildExportRows({
  pageNumber,
  dataPoints,
  curves,
  axisConfig,
  calibrationLines,
  calibrationValues,
  pageSessions,
  options
}: ExportDataParams): ExportRow[] {
  const scope = options.dataScope ?? 'all';
  const pages = getSelectedExportPages({
    pageNumber,
    dataPoints,
    curves,
    axisConfig,
    calibrationLines,
    calibrationValues,
    pageSessions,
    options
  });
  const rows: ExportRow[] = [];

  expandExportPlots(pages).forEach((plot) => {
    if (scope === 'points' || scope === 'all') {
      plot.dataPoints.forEach((point, index) => {
        rows.push([
          plot.pageNumber,
          plot.plotName,
          'Single Point',
          'Points',
          index + 1,
          point.label,
          formatNumber(point.realX, plot.axisConfig.x.scale, options.precision),
          formatNumber(point.realY, plot.axisConfig.y.scale, options.precision)
        ]);
      });
    }

    plot.curves.forEach((curve) => {
      if (scope === 'curve-controls' || scope === 'all') {
        curve.controlPoints.forEach((point) => {
          rows.push([
            plot.pageNumber,
            plot.plotName,
            'Curve Control',
            curve.name,
            point.order,
            point.label,
            formatNumber(point.realX, plot.axisConfig.x.scale, options.precision),
            formatNumber(point.realY, plot.axisConfig.y.scale, options.precision)
          ]);
        });
      }

      if (scope === 'curve-interpolated' || scope === 'all') {
        const interpolated = generateInterpolatedPoints(
          curve,
          plot.axisConfig,
          plot.calibrationLines,
          plot.calibrationValues
        );

        interpolated.forEach((point, index) => {
          rows.push([
            plot.pageNumber,
            plot.plotName,
            'Curve Interpolated',
            curve.name,
            index + 1,
            `${curve.name} ${index + 1}`,
            formatNumber(point.realX, plot.axisConfig.x.scale, options.precision),
            formatNumber(point.realY, plot.axisConfig.y.scale, options.precision)
          ]);
        });
      }
    });
  });

  return rows;
}

export function expandExportPlots(pages: ExportPage[]): ExportPlot[] {
  return pages.flatMap((page) => {
    if (page.plotRegions?.length) {
      return page.plotRegions
        .map((plot) => ({
          pageNumber: page.pageNumber,
          plotId: plot.id,
          plotName: plot.name,
          dataPoints: plot.dataPoints,
          curves: plot.curves,
          axisConfig: plot.axisConfig,
          calibrationLines: plot.calibrationLines,
          calibrationValues: plot.calibrationValues,
          screenshot: plot.screenshot,
          sourcePlot: plot
        }))
        .filter(hasExportablePlot);
    }

    return [
      {
        pageNumber: page.pageNumber,
        plotId: page.activePlotId || `page-${page.pageNumber}`,
        plotName: 'Figure 1',
        dataPoints: page.dataPoints,
        curves: page.curves,
        axisConfig: page.axisConfig,
        calibrationLines: page.calibrationLines,
        calibrationValues: page.calibrationValues
      }
    ].filter(hasExportablePlot);
  });
}

export function buildNameItems(sessions: PageSession[]): NameItem[] {
  return sessions.flatMap((session) =>
    session.plotRegions.filter(hasPlotOutput).flatMap((plot, plotIndex) => {
      const plotKey = makePlotKey(session.pageNumber, plot.id);
      const plotItems: NameItem[] = [
        {
          key: plotKey,
          pageNumber: session.pageNumber,
          kind: 'plot',
          plotId: plot.id,
          targetId: plot.id,
          label: `\u56fe${plotIndex + 1}`,
          value: plot.name
        }
      ];

      const curveItems = plot.curves.map((curve, curveIndex) => ({
        key: makeCurveKey(session.pageNumber, plot.id, curve.id),
        pageNumber: session.pageNumber,
        kind: 'curve' as const,
        plotId: plot.id,
        targetId: curve.id,
        label: `\u66f2\u7ebf${curveIndex + 1}`,
        value: curve.name
      }));

      const pointItems = plot.dataPoints.map((point, pointIndex) => ({
        key: makePointKey(session.pageNumber, plot.id, point.id),
        pageNumber: session.pageNumber,
        kind: 'point' as const,
        plotId: plot.id,
        targetId: point.id,
        label: `\u5355\u70b9${pointIndex + 1}`,
        value: point.label
      }));
      const screenshotItems = plot.screenshot?.dataUrl
        ? [
            {
              key: makeScreenshotKey(session.pageNumber, plot.id),
              pageNumber: session.pageNumber,
              kind: 'screenshot' as const,
              plotId: plot.id,
              targetId: plot.id,
              label: '截图',
              value: plot.name
            }
          ]
        : [];

      return [...plotItems, ...curveItems, ...pointItems, ...screenshotItems];
    })
  );
}

export function applyNameOverrides(
  sessions: PageSession[],
  overrides: Record<string, string>
): PageSession[] {
  return sessions.map((session) => ({
    ...session,
    plotRegions: session.plotRegions.map((plot) => {
      const plotName =
        cleanName(overrides[makePlotKey(session.pageNumber, plot.id)]) || plot.name;
      return {
        ...plot,
        name: plotName,
        screenshot: plot.screenshot
          ? {
              ...plot.screenshot,
              name: `page-${String(session.pageNumber).padStart(3, '0')}_${plotName}.png`
            }
          : undefined,
        curves: plot.curves.map((curve) => ({
          ...curve,
          name:
            cleanName(
              overrides[makeCurveKey(session.pageNumber, plot.id, curve.id)]
            ) || curve.name
        })),
        dataPoints: plot.dataPoints.map((point) => ({
          ...point,
          label:
            cleanName(
              overrides[makePointKey(session.pageNumber, plot.id, point.id)]
            ) || point.label
        }))
      };
    })
  }));
}

export function filterSessionsForExport(
  sessions: PageSession[],
  excludedKeys: Record<string, boolean>
): PageSession[] {
  return sessions
    .map((session) => ({
      ...session,
      plotRegions: session.plotRegions
        .filter((plot) => hasPlotOutput(plot))
        .filter((plot) => !excludedKeys[makePlotKey(session.pageNumber, plot.id)])
        .map((plot) => ({
          ...plot,
          screenshot: excludedKeys[makeScreenshotKey(session.pageNumber, plot.id)]
            ? undefined
            : plot.screenshot,
          curves: plot.curves.filter(
            (curve) =>
              !excludedKeys[makeCurveKey(session.pageNumber, plot.id, curve.id)]
          ),
          dataPoints: plot.dataPoints.filter(
            (point) =>
              !excludedKeys[makePointKey(session.pageNumber, plot.id, point.id)]
          )
        }))
        .filter(hasPlotOutput)
    }))
    .filter((session) => session.plotRegions.length > 0);
}

export function hasExportablePlot(plot: ExportPlot): boolean {
  return hasPlotOutput(plot);
}

export function hasPlotOutput(plot: {
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  screenshot?: PageSession['plotRegions'][number]['screenshot'];
}): boolean {
  return (
    plot.dataPoints.length > 0 ||
    plot.curves.some((curve) => curve.controlPoints.length > 0) ||
    Boolean(plot.screenshot?.dataUrl)
  );
}

export function makePlotKey(pageNumber: number, plotId: string): string {
  return `page:${pageNumber}:plot:${plotId}`;
}

export function makeCurveKey(
  pageNumber: number,
  plotId: string,
  curveId: string
): string {
  return `page:${pageNumber}:plot:${plotId}:curve:${curveId}`;
}

export function makePointKey(
  pageNumber: number,
  plotId: string,
  pointId: string
): string {
  return `page:${pageNumber}:plot:${plotId}:point:${pointId}`;
}

export function makeScreenshotKey(pageNumber: number, plotId: string): string {
  return `page:${pageNumber}:plot:${plotId}:screenshot`;
}

function cleanName(value: string | undefined): string {
  return value?.trim() ?? '';
}
