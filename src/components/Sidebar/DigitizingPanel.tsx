import { useMemo, useState } from 'react';
import type { WheelEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  Crosshair,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Lock,
  Plus,
  Trash2
} from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { DataTable } from '../DataTable/DataTable';
import { ExportDialog } from '../Export/ExportDialog';
import {
  generateInterpolatedPoints,
  normalizeOutputCount
} from '../../utils/interpolation';
import { InterpolationMethod } from '../../types';
import { calculateRealValue, formatNumber } from '../../utils/coordinate';
import { createPlotScreenshot } from '../../utils/screenshot';
import { useSavedPresets } from '../../hooks/useSavedPresets';
import {
  traceCurveBySeedColor,
  type TracePoint,
  type TraceResult
} from '../../utils/autoTrace';

const interpolationLabels: Record<InterpolationMethod, string> = {
  linear: '线性',
  smooth: '三次样条'
};

interface DigitizingPanelProps {
  onJumpToPage?: (pageNumber: number) => void | Promise<void>;
  onAutoTracePreviewChange?: (
    preview: {
      curveId: string;
      color: string;
      points: TracePoint[];
      previewPoints: TracePoint[];
    } | null
  ) => void;
}

type CurveQuery = {
  x: string;
  y: string;
};

type LookupPoint = {
  realX: number;
  realY: number;
};

type TraceControls = {
  colorTolerance: number;
  minComponentPixels: number;
  smoothing: number;
};

const defaultTraceControls: TraceControls = {
  colorTolerance: 34,
  minComponentPixels: 24,
  smoothing: 2
};

function parseQueryValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lookupCurveValue(
  points: LookupPoint[],
  axis: 'x' | 'y',
  value: number
) {
  if (points.length === 0) return null;

  const primaryKey = axis === 'x' ? 'realX' : 'realY';
  const outputKey = axis === 'x' ? 'realY' : 'realX';

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    const leftValue = left[primaryKey];
    const rightValue = right[primaryKey];
    const minValue = Math.min(leftValue, rightValue);
    const maxValue = Math.max(leftValue, rightValue);

    if (value >= minValue && value <= maxValue) {
      const span = rightValue - leftValue;
      const ratio = span === 0 ? 0 : (value - leftValue) / span;
      return left[outputKey] + ratio * (right[outputKey] - left[outputKey]);
    }
  }

  const nearest = points.reduce((best, point) =>
    Math.abs(point[primaryKey] - value) < Math.abs(best[primaryKey] - value)
      ? point
      : best
  );
  return nearest[outputKey];
}

export function DigitizingPanel({
  onJumpToPage,
  onAutoTracePreviewChange
}: DigitizingPanelProps) {
  const {
    currentPageNumber,
    commitHistoryBoundary,
    imageData,
    setCurrentStep,
    dataPoints,
    updateDataPointVisibility,
    defaultSampleLabel,
    setDefaultSampleLabel,
    axisConfig,
    calibrationLines,
    calibrationValues,
    showCoordinateGuide,
    setShowCoordinateGuide,
    showMagnifierDataOverlay,
    setShowMagnifierDataOverlay,
    collectionMode,
    setCollectionMode,
    curves,
    activeCurveId,
    createCurve,
    setActiveCurve,
    updateCurve,
    deleteCurve,
    addCurvePointsToCurve,
    updateCurvePointPosition,
    deleteCurvePoint,
    clearCurvePoints,
    plotRegions,
    activePlotId,
    createPlotRegion,
    setActivePlotRegion,
    updatePlotRegionName,
    deletePlotRegion,
    savePlotScreenshot
  } = useAppStore();
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showReturnToExport, setShowReturnToExport] = useState(false);
  const [curveQueries, setCurveQueries] = useState<Record<string, CurveQuery>>({});
  const [traceStatus, setTraceStatus] = useState<Record<string, string>>({});
  const [traceControls, setTraceControls] = useState<
    Record<string, TraceControls>
  >({});
  const [tracePreviews, setTracePreviews] = useState<Record<string, TraceResult>>(
    {}
  );
  const [screenshotState, setScreenshotState] = useState<'idle' | 'saved' | 'error'>(
    'idle'
  );
  const {
    presets: plotTitlePresets,
    savePreset: savePlotTitle,
    deletePreset: deletePlotTitle
  } = useSavedPresets(
    'plotdigitizer-plot-title-presets',
    ['Figure 1', 'Stress-strain', 'Relaxation', 'Cycle', 'Original']
  );

  const activeCurve = curves.find((curve) => curve.id === activeCurveId) ?? null;
  const activePlot =
    plotRegions.find((plot) => plot.id === activePlotId) ?? plotRegions[0];
  const totalInterpolated = useMemo(
    () =>
      curves.reduce(
        (sum, curve) =>
          sum +
          generateInterpolatedPoints(
            curve,
            axisConfig,
            calibrationLines,
            calibrationValues
          ).length,
        0
      ),
    [axisConfig, calibrationLines, calibrationValues, curves]
  );
  const hasExportableData =
    dataPoints.length > 0 ||
    curves.some(
      (curve) =>
        curve.controlPoints.length > 0 ||
        generateInterpolatedPoints(
          curve,
          axisConfig,
          calibrationLines,
          calibrationValues
        ).length > 0
    );
  const allDataPointsHidden =
    dataPoints.length > 0 &&
    dataPoints.every((point) => point.visible === false);

  const toggleAllDataPointsVisibility = () => {
    const nextVisible = allDataPointsHidden;
    dataPoints.forEach((point) => {
      updateDataPointVisibility(point.id, nextVisible);
    });
  };

  const ensureCurve = () => {
    if (!activeCurve) {
      createCurve();
    }
    setCollectionMode('curve');
  };

  const handleScreenshot = async () => {
    try {
      const screenshot = await createPlotScreenshot({
        imageData,
        pageNumber: currentPageNumber,
        plotName: activePlot?.name ?? 'Figure 1',
        calibrationLines,
        calibrationValues,
        axisConfig,
        dataPoints,
        curves
      });
      savePlotScreenshot(screenshot);
      setScreenshotState('saved');
      setTimeout(() => setScreenshotState('idle'), 2000);
    } catch (error) {
      console.error('Failed to create screenshot:', error);
      setScreenshotState('error');
      setTimeout(() => setScreenshotState('idle'), 2000);
    }
  };

  const handleOpenExportDialog = () => {
    setShowReturnToExport(false);
    setShowExportDialog(true);
  };

  const handleJumpFromExport = async (pageNumber: number) => {
    await onJumpToPage?.(pageNumber);
    setShowExportDialog(false);
    setShowReturnToExport(true);
  };

  const handleCurvePointWheel = (
    event: WheelEvent,
    curveId: string,
    point: { id: string; screenX: number; screenY: number }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const direction = event.deltaY > 0 ? 1 : -1;
    const step = event.altKey ? 0.03 : 0.15;
    updateCurvePointPosition(
      curveId,
      point.id,
      point.screenX + (event.shiftKey ? direction * step : 0),
      point.screenY + (event.shiftKey ? 0 : direction * step)
    );
  };

  const getTraceControls = (curveId: string) =>
    traceControls[curveId] ?? defaultTraceControls;

  const updateTraceControls = (
    curveId: string,
    patch: Partial<TraceControls>
  ) => {
    setTraceControls((previous) => ({
      ...previous,
      [curveId]: {
        ...defaultTraceControls,
        ...previous[curveId],
        ...patch
      }
    }));
  };

  const buildCurvePointsFromTrace = (curveName: string, points: TracePoint[]) =>
    points.flatMap((point) => {
      const result = calculateRealValue({
        screenX: point.screenX,
        screenY: point.screenY,
        calibrationLines,
        calibrationValues,
        axisScales: { x: axisConfig.x.scale, y: axisConfig.y.scale },
        axisFormulas: { x: axisConfig.x.formula, y: axisConfig.y.formula },
        axisLogInputModes: {
          x: axisConfig.x.logInputMode,
          y: axisConfig.y.logInputMode
        },
        imageData
      });
      if (!result.ok) return [];

      return [
        {
          screenX: point.screenX,
          screenY: point.screenY,
          realX: result.realX,
          realY: result.realY,
          label: curveName,
          qualityFlags: result.qualityFlags
        }
      ];
    });

  const clearTracePreview = (curveId: string) => {
    setTracePreviews((previous) => {
      const next = { ...previous };
      delete next[curveId];
      return next;
    });
    onAutoTracePreviewChange?.(null);
  };

  const confirmTracePreview = (curveId: string) => {
    const curve = curves.find((item) => item.id === curveId);
    const preview = tracePreviews[curveId];
    if (!curve || !preview) return;

    const traceQualityFlags =
      preview.confidence < 60
        ? (['auto-traced', 'low-confidence', 'needs-review'] as const)
        : (['auto-traced'] as const);
    const newPoints = preview.points
      .filter(
        (point) =>
          !curve.controlPoints.some(
            (existing) =>
              Math.hypot(
                existing.screenX - point.screenX,
                existing.screenY - point.screenY
              ) < 0.6
          )
      )
      .flatMap((point) =>
        buildCurvePointsFromTrace(curve.name, [point]).map((tracePoint) => ({
          ...tracePoint,
          confidence: preview.confidence,
          qualityFlags: [
            ...new Set([
              ...(tracePoint.qualityFlags ?? []),
              ...traceQualityFlags
            ])
          ]
        }))
      );

    addCurvePointsToCurve(curveId, newPoints);
    setTraceStatus((previous) => ({
      ...previous,
      [curveId]: newPoints.length
        ? `已加入 ${newPoints.length} 个候选点，可继续删除或微调`
        : '没有新的候选点可加入'
    }));
    clearTracePreview(curveId);
  };

  const handleAutoTraceCurve = async (curveId: string) => {
    const curve = curves.find((item) => item.id === curveId);
    const seed = curve?.controlPoints[0];

    if (!imageData.src || !curve || !seed) {
      setTraceStatus((previous) => ({
        ...previous,
        [curveId]: '先在目标曲线上打 1 个控制点作为颜色种子'
      }));
      return;
    }

    setTraceStatus((previous) => ({ ...previous, [curveId]: '正在按颜色识别...' }));

    try {
      const controls = getTraceControls(curveId);
      const traceResult = await traceCurveBySeedColor(imageData.src, {
        calibrationLines,
        seed,
        maxPoints: Math.min(180, Math.max(50, Math.round(curve.outputCount / 8))),
        colorTolerance: controls.colorTolerance,
        minComponentPixels: controls.minComponentPixels,
        smoothing: controls.smoothing
      });
      setTracePreviews((previous) => ({
        ...previous,
        [curveId]: traceResult
      }));
      onAutoTracePreviewChange?.({
        curveId,
        color: curve.color,
        points: traceResult.points,
        previewPoints: traceResult.previewPoints
      });
      setTraceStatus((previous) => ({
        ...previous,
        [curveId]: traceResult.points.length
          ? `预览 ${traceResult.points.length} 点，置信度 ${traceResult.confidence}%`
          : '没有识别到候选点，可换种子点或调高容差'
      }));
      const newPoints: ReturnType<typeof buildCurvePointsFromTrace> = [];
      return;

      addCurvePointsToCurve(curveId, newPoints);
      setTraceStatus((previous) => ({
        ...previous,
        [curveId]: newPoints.length
          ? `已追加 ${newPoints.length} 个候选点，可继续删除或微调`
          : '没有识别到新的候选点，可换一个种子点重试'
      }));
    } catch (error) {
      console.error('Auto trace failed:', error);
      setTraceStatus((previous) => ({
        ...previous,
        [curveId]: '自动识别失败，请换一个种子点重试'
      }));
    }
  };

  return (
    <div
      className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300"
      onBlurCapture={commitHistoryBoundary}
    >
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Lock size={12} />
          坐标轴已锁定
        </div>
        <button
          onClick={() => setCurrentStep('calibration')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-orange-300 hover:text-orange-600 text-slate-600 rounded text-xs font-medium transition-colors shadow-sm"
        >
          <Edit3 size={12} />
          重新校准
        </button>
      </div>

      {showReturnToExport && (
        <div className="border-b border-indigo-100 bg-indigo-50 px-3 py-2">
          <button
            onClick={handleOpenExportDialog}
            className="flex w-full items-center justify-center gap-2 rounded border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
          >
            <ArrowLeft size={13} />
            返回导出确认
          </button>
        </div>
      )}

      <div className="p-3 bg-white border-b border-slate-200 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">
            第 {currentPageNumber} 页图/坐标组
          </span>
          <button
            onClick={() => createPlotRegion()}
            className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200"
          >
            <Plus size={12} />
            新图
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {plotRegions.map((plot, index) => (
            <button
              key={plot.id}
              onClick={() => setActivePlotRegion(plot.id)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold ${
                plot.id === activePlotId
                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {plot.name || `Figure ${index + 1}`}
            </button>
          ))}
        </div>

        {activePlot && (
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div>
              <input
                list="plot-title-presets"
                value={activePlot.name}
                onChange={(event) =>
                  updatePlotRegionName(activePlot.id, event.target.value)
                }
                onBlur={() => savePlotTitle(activePlot.name)}
                className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <datalist id="plot-title-presets">
                {plotTitlePresets.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <div className="mt-1 flex flex-wrap gap-1">
                {plotTitlePresets.map((title) => (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1 rounded border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700"
                  >
                    <button
                      type="button"
                      onClick={() => updatePlotRegionName(activePlot.id, title)}
                      className="max-w-[96px] truncate"
                    >
                      {title}
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePlotTitle(title)}
                      className="text-indigo-300 hover:text-red-500"
                      title="删除常用标题"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={handleScreenshot}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${
                screenshotState === 'saved'
                  ? 'bg-green-600 text-white'
                  : screenshotState === 'error'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <Camera size={12} />
              {screenshotState === 'saved'
                ? '已截图'
                : screenshotState === 'error'
                ? '失败'
                : activePlot.screenshot
                ? '更新截图'
                : '截图'}
            </button>
            <button
              onClick={() => deletePlotRegion(activePlot.id)}
              disabled={plotRegions.length <= 1}
              className="rounded px-2 py-1 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-b border-slate-200 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-800">数据采集</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCoordinateGuide(!showCoordinateGuide)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${
                showCoordinateGuide
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-white border border-slate-200 text-slate-500 hover:text-cyan-700'
              }`}
              title="打开纵横长线并实时显示当前位置坐标"
            >
              <Crosshair size={14} />
              坐标线
            </button>
            <button
              onClick={() => setShowMagnifierDataOverlay(!showMagnifierDataOverlay)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${
                showMagnifierDataOverlay
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-white border border-slate-200 text-slate-500 hover:text-emerald-700'
              }`}
              title="切换放大镜内是否显示采集点和曲线插值点"
            >
              点
            </button>
            <button
              onClick={handleOpenExportDialog}
              disabled={!hasExportableData}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${
                !hasExportableData
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <Download size={14} />
              导出
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-500">
          <div className="rounded border border-slate-200 p-2">
            <div className="font-bold text-slate-800">{dataPoints.length}</div>
            单点
          </div>
          <div className="rounded border border-slate-200 p-2">
            <div className="font-bold text-slate-800">{curves.length}</div>
            曲线
          </div>
          <div className="rounded border border-slate-200 p-2">
            <div className="font-bold text-slate-800">{totalInterpolated}</div>
            整条曲线点
          </div>
        </div>

        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
          <button
            onClick={() => setCollectionMode('point')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md ${
              collectionMode === 'point'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            单点采集
          </button>
          <button
            onClick={ensureCurve}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md ${
              collectionMode === 'curve'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            曲线采集
          </button>
        </div>
      </div>

      {collectionMode === 'point' ? (
        <>
          <div className="p-4 bg-white border-b border-slate-200">
            {dataPoints.length > 0 && (
              <button
                type="button"
                onClick={toggleAllDataPointsVisibility}
                className="mb-2 w-full rounded border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
              >
                {allDataPointsHidden ? '全部显示单点' : '全部隐藏单点'}
              </button>
            )}
            <div className="flex items-center gap-2 bg-green-50/70 p-2 rounded border border-green-100">
              <span className="text-xs font-medium text-green-700">Next:</span>
              <input
                type="text"
                className="flex-1 bg-white border border-green-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                value={defaultSampleLabel}
                onChange={(e) => setDefaultSampleLabel(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1">
            <DataTable />
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/30">
          <div className="p-4 space-y-4">
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-700">
              双击曲线上的少量控制点即可生成整条曲线数据。每条曲线至少 2 个控制点，输出点数可设置为 200-2000。
            </div>

            <button
              onClick={() => createCurve()}
              className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm"
            >
              <Plus size={16} />
              新建曲线
            </button>

            {curves.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-8">
                新建曲线后，双击图片沿曲线添加控制点。
              </div>
            ) : (
              <div className="space-y-3">
                {curves.map((curve) => {
                  const interpolatedPoints = generateInterpolatedPoints(
                    curve,
                    axisConfig,
                    calibrationLines,
                    calibrationValues
                  );
                  const interpolatedCount = interpolatedPoints.length;
                  const canInterpolate = curve.controlPoints.length >= 2;
                  const query = curveQueries[curve.id] ?? { x: '', y: '' };
                  const queryX = parseQueryValue(query.x);
                  const queryY = parseQueryValue(query.y);
                  const lookedUpY =
                    queryX === null
                      ? null
                      : lookupCurveValue(interpolatedPoints, 'x', queryX);
                  const lookedUpX =
                    queryY === null
                      ? null
                      : lookupCurveValue(interpolatedPoints, 'y', queryY);
                  const updateQuery = (patch: Partial<CurveQuery>) =>
                    setCurveQueries((previous) => ({
                      ...previous,
                      [curve.id]: { ...query, ...patch }
                    }));
                  const traceControl = getTraceControls(curve.id);
                  const tracePreview = tracePreviews[curve.id];

                  return (
                    <div
                      key={curve.id}
                      onClick={() => setActiveCurve(curve.id)}
                      className={`rounded-lg border bg-white p-3 space-y-3 ${
                        curve.id === activeCurveId
                          ? 'border-indigo-300 ring-2 ring-indigo-100'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActiveCurve(curve.id)}
                          className="w-5 h-5 rounded-full border border-white shadow-sm"
                          style={{ backgroundColor: curve.color }}
                          title="设为当前曲线"
                        />
                        <input
                          value={curve.name}
                          onFocus={() => setActiveCurve(curve.id)}
                          onChange={(e) =>
                            updateCurve(curve.id, { name: e.target.value })
                          }
                          className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            updateCurve(curve.id, { visible: !curve.visible });
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700"
                        >
                          {curve.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteCurve(curve.id);
                          }}
                          className="p-1 text-slate-300 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                        <label className="text-[11px] text-slate-500">
                          整条曲线输出点数: {curve.outputCount}
                        </label>
                        <span
                          className={`text-[10px] ${
                            canInterpolate ? 'text-indigo-600' : 'text-orange-500'
                          }`}
                        >
                          {canInterpolate
                            ? `将导出 ${interpolatedCount} 点`
                            : '至少需要 2 个控制点'}
                        </span>
                        <input
                          type="range"
                          min="200"
                          max="2000"
                          step="50"
                          value={curve.outputCount}
                          onFocus={() => setActiveCurve(curve.id)}
                          onChange={(e) =>
                            updateCurve(curve.id, {
                              outputCount: normalizeOutputCount(
                                Number(e.target.value)
                              )
                            })
                          }
                          className="col-span-2"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-slate-500">
                          插值方式
                        </label>
                        <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 border border-slate-200">
                          {Object.entries(interpolationLabels).map(
                            ([method, label]) => (
                              <button
                                key={method}
                                onClick={() =>
                                  updateCurve(curve.id, {
                                    interpolation: method as InterpolationMethod
                                  })
                                }
                                className={`py-1.5 rounded text-[11px] font-bold transition-colors ${
                                  curve.interpolation === method
                                    ? 'bg-white text-indigo-700 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div
                        className="rounded-md border border-emerald-100 bg-emerald-50/70 p-2 space-y-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <div className="text-[11px] text-emerald-700">
                            先在目标曲线上打 1 个点，再按该点颜色自动补候选点。
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAutoTraceCurve(curve.id)}
                            disabled={curve.controlPoints.length === 0}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                          >
                            颜色补点
                          </button>
                        </div>
                        <div className="grid grid-cols-[auto_1fr_auto] gap-2 items-center text-[10px] text-emerald-700">
                          <span>容差</span>
                          <input
                            type="range"
                            min="14"
                            max="70"
                            step="1"
                            value={traceControl.colorTolerance}
                            onChange={(event) =>
                              updateTraceControls(curve.id, {
                                colorTolerance: Number(event.target.value)
                              })
                            }
                          />
                          <span className="font-mono">
                            {traceControl.colorTolerance}
                          </span>
                          <span>面积</span>
                          <input
                            type="range"
                            min="8"
                            max="160"
                            step="4"
                            value={traceControl.minComponentPixels}
                            onChange={(event) =>
                              updateTraceControls(curve.id, {
                                minComponentPixels: Number(event.target.value)
                              })
                            }
                          />
                          <span className="font-mono">
                            {traceControl.minComponentPixels}
                          </span>
                          <span>平滑</span>
                          <input
                            type="range"
                            min="0"
                            max="8"
                            step="1"
                            value={traceControl.smoothing}
                            onChange={(event) =>
                              updateTraceControls(curve.id, {
                                smoothing: Number(event.target.value)
                              })
                            }
                          />
                          <span className="font-mono">
                            {traceControl.smoothing}
                          </span>
                        </div>
                        {tracePreview && (
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center rounded border border-emerald-200 bg-white/70 p-2 text-[10px] text-emerald-700">
                            <span>
                              候选 {tracePreview.points.length} 点 / mask{' '}
                              {tracePreview.componentPixels} px / 置信度{' '}
                              {tracePreview.confidence}%
                            </span>
                            <button
                              type="button"
                              onClick={() => confirmTracePreview(curve.id)}
                              disabled={tracePreview.points.length === 0}
                              className="rounded bg-emerald-600 px-2 py-1 font-bold text-white hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                            >
                              确认加入
                            </button>
                            <button
                              type="button"
                              onClick={() => clearTracePreview(curve.id)}
                              className="rounded border border-slate-200 bg-white px-2 py-1 font-bold text-slate-500 hover:text-red-500"
                            >
                              取消
                            </button>
                          </div>
                        )}
                        <details className="rounded border border-emerald-100 bg-white/60 px-2 py-1 text-[10px] text-emerald-700">
                          <summary className="cursor-pointer font-bold">
                            使用说明
                          </summary>
                          <div className="mt-1 space-y-1 leading-relaxed">
                            <p>1. 先在目标曲线上打一个控制点，尽量点在曲线颜色最纯的位置。</p>
                            <p>2. 点“颜色补点”后先看画布上的虚线和半透明 mask，确认无误再加入。</p>
                            <p>3. 漏识别时调高容差；识别到文字/图例时调低容差或调高面积。</p>
                            <p>4. 线条抖动时提高平滑；靠近交叉曲线时建议换一个种子点。</p>
                          </div>
                        </details>
                        {traceStatus[curve.id] && (
                          <div className="text-[10px] text-emerald-700">
                            {traceStatus[curve.id]}
                          </div>
                        )}
                      </div>

                      <div
                        className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="text-[11px] font-bold text-slate-600">
                          曲线取值查询
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <input
                            type="number"
                            value={query.x}
                            onFocus={() => setActiveCurve(curve.id)}
                            onChange={(event) => updateQuery({ x: event.target.value })}
                            placeholder={`输入 ${axisConfig.x.label || 'X'}`}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <div className="min-w-[96px] text-right text-[11px] font-mono text-slate-700">
                            {lookedUpY === null
                              ? 'Y: --'
                              : `Y: ${formatNumber(
                                  lookedUpY,
                                  axisConfig.y.scale,
                                  4
                                )}`}
                          </div>
                          <input
                            type="number"
                            value={query.y}
                            onFocus={() => setActiveCurve(curve.id)}
                            onChange={(event) => updateQuery({ y: event.target.value })}
                            placeholder={`输入 ${axisConfig.y.label || 'Y'}`}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <div className="min-w-[96px] text-right text-[11px] font-mono text-slate-700">
                            {lookedUpX === null
                              ? 'X: --'
                              : `X: ${formatNumber(
                                  lookedUpX,
                                  axisConfig.x.scale,
                                  4
                                )}`}
                          </div>
                        </div>
                        {!canInterpolate && (
                          <div className="text-[10px] text-orange-500">
                            至少需要 2 个控制点后才能查询曲线值。
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-500">
                        <span>控制点 {curve.controlPoints.length}</span>
                        <button
                          onClick={() => clearCurvePoints(curve.id)}
                          disabled={curve.controlPoints.length === 0}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-40"
                        >
                          清空控制点
                        </button>
                      </div>

                      <div className="max-h-40 overflow-auto border border-slate-100 rounded">
                        {curve.controlPoints.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            双击图片添加曲线控制点
                          </div>
                        ) : (
                          <table className="w-full text-[11px]">
                            <tbody>
                              {curve.controlPoints.map((point) => (
                                <tr
                                  key={point.id}
                                  className="border-b border-slate-100 last:border-0"
                                >
                                  <td className="p-1.5 text-slate-400">
                                    {point.order}
                                  </td>
                                  <td className="p-1.5 font-mono">
                                    {formatNumber(point.realX, axisConfig.x.scale, 4)}
                                  </td>
                                  <td className="p-1.5 font-mono">
                                    {formatNumber(point.realY, axisConfig.y.scale, 4)}
                                  </td>
                                  <td className="p-1.5 text-right">
                                    <button
                                      data-wheel-lock="true"
                                      onWheelCapture={(event) =>
                                        handleCurvePointWheel(event, curve.id, point)
                                      }
                                      className="mr-1 rounded border border-slate-200 px-1 text-[10px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                                      title="滚轮上下微调；Shift+滚轮左右微调；Alt 更细"
                                    >
                                      微
                                    </button>
                                    <button
                                      onClick={() =>
                                        deleteCurvePoint(curve.id, point.id)
                                      }
                                      className="text-slate-300 hover:text-red-500"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onJumpToPage={handleJumpFromExport}
      />
    </div>
  );
}
