import { create } from 'zustand';
import {
  AppState,
  CalibrationLines,
  CalibrationValues,
  CurveSeries,
  ImageData,
  PageSession,
  PlotRegion,
  ScreenshotAsset
} from '../types';
import { calculateRealValue } from '../utils/coordinate';

const initialImageData: ImageData = {
  src: null,
  naturalWidth: 0,
  naturalHeight: 0
};

const initialCalibrationLines: CalibrationLines = {
  x1: 10,
  x2: 90,
  y1: 90,
  y2: 10
};

const initialCalibrationValues: CalibrationValues = {
  x1: 0,
  x2: 10,
  y1: 0,
  y2: 100
};

const initialAxisConfig = {
  x: { scale: 'linear' as const, label: 'X-Value' },
  y: { scale: 'linear' as const, label: 'Y-Value' }
};

const curveColors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createProjectId = () =>
  globalThis.crypto?.randomUUID?.() ?? createId('project');

const initialProjectCreatedAt = new Date().toISOString();
const initialProjectId = createProjectId();

const getNextCurveName = (curves: CurveSeries[]) => {
  const names = new Set(curves.map((curve) => curve.name.trim()).filter(Boolean));
  let index = 1;
  while (names.has(`Curve ${index}`)) {
    index += 1;
  }
  return `Curve ${index}`;
};

const getNextCurveColor = (curves: CurveSeries[]) => {
  const usedColors = new Set(curves.map((curve) => curve.color));
  const unusedColor = curveColors.find((color) => !usedColors.has(color));
  if (unusedColor) return unusedColor;

  for (let offset = 0; offset < 360; offset += 1) {
    const hue = ((curves.length + offset) * 67) % 360;
    const color = `hsl(${hue}, 72%, 46%)`;
    if (!usedColors.has(color)) return color;
  }

  return `hsl(${Date.now() % 360}, 72%, 46%)`;
};

const cloneCalibrationLines = () => ({ ...initialCalibrationLines });
const cloneCalibrationValues = () => ({ ...initialCalibrationValues });
const cloneAxisConfig = () => ({
  x: { ...initialAxisConfig.x },
  y: { ...initialAxisConfig.y }
});

const cloneCurves = (curves: CurveSeries[]) =>
  curves.map((curve) => ({
    ...curve,
    controlPoints: curve.controlPoints.map((point) => ({ ...point }))
  }));

const cloneScreenshot = (screenshot?: ScreenshotAsset) =>
  screenshot ? { ...screenshot } : undefined;

const createBlankPlotRegion = (index = 1, name?: string): PlotRegion => ({
  id: createId('plot'),
  name: name?.trim() || `Figure ${index}`,
  calibrationLines: cloneCalibrationLines(),
  calibrationValues: cloneCalibrationValues(),
  axisConfig: cloneAxisConfig(),
  dataPoints: [],
  curves: [],
  activeCurveId: null,
  collectionMode: 'point',
  defaultSampleLabel: 'Sample A'
});

const clonePlotRegion = (plot: PlotRegion): PlotRegion => ({
  ...plot,
  calibrationLines: { ...plot.calibrationLines },
  calibrationValues: { ...plot.calibrationValues },
  axisConfig: {
    x: { ...plot.axisConfig.x },
    y: { ...plot.axisConfig.y }
  },
  dataPoints: plot.dataPoints.map((point) => ({ ...point })),
  curves: cloneCurves(plot.curves),
  screenshot: cloneScreenshot(plot.screenshot)
});

const snapshotActivePlot = (state: AppState, plotId = state.activePlotId): PlotRegion => {
  const current =
    state.plotRegions.find((plot) => plot.id === plotId) ??
    createBlankPlotRegion(1);

  return {
    ...current,
    id: plotId || current.id,
    name: current.name,
    calibrationLines: { ...state.calibrationLines },
    calibrationValues: { ...state.calibrationValues },
    axisConfig: {
      x: { ...state.axisConfig.x },
      y: { ...state.axisConfig.y }
    },
    dataPoints: state.dataPoints.map((point) => ({ ...point })),
    curves: cloneCurves(state.curves),
    activeCurveId: state.activeCurveId,
    collectionMode: state.collectionMode,
    defaultSampleLabel: state.defaultSampleLabel,
    screenshot: cloneScreenshot(current.screenshot)
  };
};

const commitActivePlot = (state: AppState) => {
  const activePlot = snapshotActivePlot(state);
  const plotRegions = state.plotRegions.length
    ? state.plotRegions.map((plot) =>
        plot.id === activePlot.id ? activePlot : clonePlotRegion(plot)
      )
    : [activePlot];

  return plotRegions;
};

const restorePlotFields = (plot: PlotRegion) => ({
  calibrationLines: { ...plot.calibrationLines },
  calibrationValues: { ...plot.calibrationValues },
  axisConfig: {
    x: { ...plot.axisConfig.x },
    y: { ...plot.axisConfig.y }
  },
  dataPoints: plot.dataPoints.map((point) => ({ ...point })),
  curves: cloneCurves(plot.curves),
  activeCurveId: plot.activeCurveId,
  collectionMode: plot.collectionMode,
  defaultSampleLabel: plot.defaultSampleLabel
});

const normalizePlotRegions = (session: Partial<Pick<AppState, 'plotRegions' | 'activePlotId'>> & {
  calibrationLines?: CalibrationLines;
  calibrationValues?: CalibrationValues;
  axisConfig?: AppState['axisConfig'];
  dataPoints?: AppState['dataPoints'];
  curves?: AppState['curves'];
  activeCurveId?: string | null;
  collectionMode?: AppState['collectionMode'];
  defaultSampleLabel?: string;
}) => {
  if (session.plotRegions?.length) {
    return session.plotRegions.map(clonePlotRegion);
  }

  const fallback = createBlankPlotRegion(1);
  return [
    {
      ...fallback,
      calibrationLines: { ...(session.calibrationLines ?? initialCalibrationLines) },
      calibrationValues: {
        ...(session.calibrationValues ?? initialCalibrationValues)
      },
      axisConfig: session.axisConfig
        ? {
            x: { ...session.axisConfig.x },
            y: { ...session.axisConfig.y }
          }
        : cloneAxisConfig(),
      dataPoints: (session.dataPoints ?? []).map((point) => ({ ...point })),
      curves: cloneCurves(session.curves ?? []),
      activeCurveId: session.activeCurveId ?? null,
      collectionMode: session.collectionMode ?? 'point',
      defaultSampleLabel: session.defaultSampleLabel ?? 'Sample A'
    }
  ];
};

const hasPlotContent = (plot: PlotRegion) =>
  plot.dataPoints.length > 0 ||
  plot.curves.some((curve) => curve.controlPoints.length > 0) ||
  Boolean(plot.screenshot?.dataUrl);

const clearPlotRegion = (plot: PlotRegion, index: number): PlotRegion => ({
  ...createBlankPlotRegion(index + 1, plot.name),
  id: plot.id
});

const deleteItemFromPlotRegions = (
  plotRegions: PlotRegion[],
  kind: 'plot' | 'curve' | 'point' | 'screenshot',
  plotId: string,
  targetId: string
) => {
  if (kind === 'plot') {
    if (plotRegions.length <= 1) {
      return plotRegions.map((plot, index) =>
        plot.id === plotId ? clearPlotRegion(plot, index) : clonePlotRegion(plot)
      );
    }

    return plotRegions.filter((plot) => plot.id !== plotId).map(clonePlotRegion);
  }

  return plotRegions.map((plot) => {
    if (plot.id !== plotId) return clonePlotRegion(plot);

    if (kind === 'screenshot') {
      return {
        ...clonePlotRegion(plot),
        screenshot: undefined
      };
    }

    if (kind === 'curve') {
      const curves = plot.curves.filter((curve) => curve.id !== targetId);
      return {
        ...clonePlotRegion(plot),
        curves,
        activeCurveId:
          plot.activeCurveId === targetId ? curves[0]?.id ?? null : plot.activeCurveId
      };
    }

    return {
      ...clonePlotRegion(plot),
      dataPoints: plot.dataPoints.filter((point) => point.id !== targetId)
    };
  });
};

const buildPageSessionFromPlotRegions = (
  baseSession: PageSession,
  plotRegions: PlotRegion[],
  activePlotId: string
): PageSession => {
  const activePlot =
    plotRegions.find((plot) => plot.id === activePlotId) ?? plotRegions[0];

  return {
    ...baseSession,
    plotRegions,
    activePlotId: activePlot.id,
    calibrationLines: { ...activePlot.calibrationLines },
    calibrationValues: { ...activePlot.calibrationValues },
    axisConfig: {
      x: { ...activePlot.axisConfig.x },
      y: { ...activePlot.axisConfig.y }
    },
    dataPoints: activePlot.dataPoints.map((point) => ({ ...point })),
    curves: cloneCurves(activePlot.curves),
    activeCurveId: activePlot.activeCurveId,
    currentStep: hasPlotContent(activePlot) ? 'digitizing' : 'calibration',
    collectionMode: activePlot.collectionMode,
    defaultSampleLabel: activePlot.defaultSampleLabel
  };
};

const recalculatePoint = (
  point: { screenX: number; screenY: number },
  calibrationLines: CalibrationLines,
  calibrationValues: CalibrationValues,
  axisConfig: AppState['axisConfig'],
  imageData: Pick<ImageData, 'naturalWidth' | 'naturalHeight'>
) => {
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

  return result.ok
    ? {
        realX: result.realX,
        realY: result.realY,
        qualityFlags: result.qualityFlags
      }
    : {};
};

const recalculateCollectedValues = (
  state: AppState,
  calibrationLines = state.calibrationLines,
  calibrationValues = state.calibrationValues,
  axisConfig = state.axisConfig
) => ({
  dataPoints: state.dataPoints.map((point) => ({
    ...point,
    ...recalculatePoint(point, calibrationLines, calibrationValues, axisConfig, state.imageData)
  })),
  curves: state.curves.map((curve) => ({
    ...curve,
    controlPoints: curve.controlPoints.map((point) => ({
      ...point,
      ...recalculatePoint(point, calibrationLines, calibrationValues, axisConfig, state.imageData)
    }))
  }))
});

const movePercentPoint = (
  screenX: number,
  screenY: number,
  nextScreenX: number,
  nextScreenY: number
) => ({
  screenX: Math.max(0, Math.min(100, Number.isFinite(nextScreenX) ? nextScreenX : screenX)),
  screenY: Math.max(0, Math.min(100, Number.isFinite(nextScreenY) ? nextScreenY : screenY))
});

type EditSnapshot = Pick<
  AppState,
  | 'calibrationLines'
  | 'calibrationValues'
  | 'axisConfig'
  | 'dataPoints'
  | 'curves'
  | 'activeCurveId'
  | 'currentStep'
  | 'collectionMode'
  | 'defaultSampleLabel'
  | 'plotRegions'
  | 'activePlotId'
>;

interface PageHistory {
  past: EditSnapshot[];
  future: EditSnapshot[];
  lastGroup?: string;
  lastRecordedAt?: number;
}

interface HistoryOptions {
  group?: string;
  mergeWindowMs?: number;
}

const HISTORY_LIMIT = 50;
const historyByPage = new Map<number, PageHistory>();

const cloneSnapshot = (state: EditSnapshot): EditSnapshot =>
  structuredClone({
    calibrationLines: state.calibrationLines,
    calibrationValues: state.calibrationValues,
    axisConfig: state.axisConfig,
    dataPoints: state.dataPoints,
    curves: state.curves,
    activeCurveId: state.activeCurveId,
    currentStep: state.currentStep,
    collectionMode: state.collectionMode,
    defaultSampleLabel: state.defaultSampleLabel,
    plotRegions: state.plotRegions,
    activePlotId: state.activePlotId
  });

const captureSnapshot = (state: AppState): EditSnapshot => cloneSnapshot(state);

const getPageHistory = (pageNumber: number): PageHistory => {
  const existing = historyByPage.get(pageNumber);
  if (existing) return existing;
  const created: PageHistory = { past: [], future: [] };
  historyByPage.set(pageNumber, created);
  return created;
};

const getHistoryAvailability = (pageNumber: number) => {
  const history = getPageHistory(pageNumber);
  return {
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  };
};

const recordHistory = (state: AppState, options: HistoryOptions = {}) => {
  const history = getPageHistory(state.currentPageNumber);
  const now = Date.now();
  const shouldMerge =
    Boolean(options.group) &&
    history.lastGroup === options.group &&
    history.lastRecordedAt !== undefined &&
    now - history.lastRecordedAt <= (options.mergeWindowMs ?? 0);

  if (!shouldMerge) {
    history.past.push(captureSnapshot(state));
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
  }
  history.future = [];
  history.lastGroup = options.group;
  history.lastRecordedAt = now;
};

const clearAllHistory = () => historyByPage.clear();

const initialPlot = createBlankPlotRegion(1);

export const useAppStore = create<AppState>((set, get) => {
  type StoreUpdater = (state: AppState) => Partial<AppState> | AppState;
  const setWithHistory = (updater: StoreUpdater, options: HistoryOptions = {}) =>
    set((state) => {
      const next = updater(state);
      if (next === state) return state;
      recordHistory(state, options);
      return {
        ...next,
        isDirty: true,
        changeRevision: state.changeRevision + 1,
        ...getHistoryAvailability(state.currentPageNumber)
      };
    });

  const setDirty = (updater: StoreUpdater) =>
    set((state) => {
      const next = updater(state);
      if (next === state) return state;
      return {
        ...next,
        isDirty: true,
        changeRevision: state.changeRevision + 1
      };
    });

  return ({
  // Project lifecycle and history
  isDirty: false,
  changeRevision: 0,
  projectId: initialProjectId,
  projectCreatedAt: initialProjectCreatedAt,
  projectUpdatedAt: initialProjectCreatedAt,
  projectFileName: null,
  canUndo: false,
  canRedo: false,
  markDirty: () => setDirty(() => ({})),
  markSaved: (updatedAt) =>
    set(() => ({
      isDirty: false,
      projectUpdatedAt: updatedAt ?? new Date().toISOString()
    })),
  setProjectFileName: (name) => set(() => ({ projectFileName: name })),
  clearHistory: () => {
    clearAllHistory();
    set(() => ({ canUndo: false, canRedo: false }));
  },
  commitHistoryBoundary: () => {
    const history = getPageHistory(get().currentPageNumber);
    history.lastGroup = undefined;
    history.lastRecordedAt = undefined;
  },
  undo: () =>
    set((state) => {
      const history = getPageHistory(state.currentPageNumber);
      const previous = history.past.pop();
      if (!previous) return state;
      history.future.push(captureSnapshot(state));
      history.lastGroup = undefined;
      history.lastRecordedAt = undefined;
      return {
        ...cloneSnapshot(previous),
        isDirty: true,
        changeRevision: state.changeRevision + 1,
        ...getHistoryAvailability(state.currentPageNumber)
      };
    }),
  redo: () =>
    set((state) => {
      const history = getPageHistory(state.currentPageNumber);
      const next = history.future.pop();
      if (!next) return state;
      history.past.push(captureSnapshot(state));
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
      history.lastGroup = undefined;
      history.lastRecordedAt = undefined;
      return {
        ...cloneSnapshot(next),
        isDirty: true,
        changeRevision: state.changeRevision + 1,
        ...getHistoryAvailability(state.currentPageNumber)
      };
    }),
  replaceProject: (replacement) => {
    clearAllHistory();
    set((state) => {
      const pageNumber = replacement.document.currentPageNumber;
      const currentSession = replacement.pageSessions[pageNumber];
      if (!currentSession) throw new Error('项目缺少当前页面数据');
      const plotRegions = normalizePlotRegions(currentSession);
      const activePlot =
        plotRegions.find((plot) => plot.id === currentSession.activePlotId) ??
        plotRegions[0];

      return {
        projectId: replacement.document.projectId,
        projectCreatedAt: replacement.document.createdAt,
        projectUpdatedAt: replacement.document.updatedAt,
        projectFileName: replacement.fileName ?? null,
        sourceFile: replacement.sourceFile,
        sourceKind: replacement.document.source.kind,
        sourcePageCount: replacement.document.source.pageCount,
        imageData: { ...replacement.currentImage },
        currentPageNumber: pageNumber,
        pageSessions: replacement.pageSessions,
        plotRegions,
        activePlotId: activePlot.id,
        currentStep: currentSession.currentStep,
        showCoordinateGuide:
          replacement.document.preferences.showCoordinateGuide,
        showMagnifierDataOverlay:
          replacement.document.preferences.showMagnifierDataOverlay,
        ...restorePlotFields(activePlot),
        isDirty: false,
        canUndo: false,
        canRedo: false,
        changeRevision: state.changeRevision + 1
      };
    });
  },

  // Image
  imageData: initialImageData,
  sourceFile: null,
  sourceKind: null,
  sourcePageCount: 0,
  setImageData: (data) =>
    set((state) => ({
      imageData: { ...state.imageData, ...data }
    })),
  resetImage: () =>
    set(() => ({
      imageData: initialImageData
    })),
  replaceSource: (replacement) => {
    clearAllHistory();
    set((state) => {
      const plot = createBlankPlotRegion(1);
      const now = new Date().toISOString();
      return {
        projectId: createProjectId(),
        projectCreatedAt: now,
        projectUpdatedAt: now,
        projectFileName: null,
        imageData: { ...replacement.firstPageImage },
        sourceFile: replacement.file,
        sourceKind: replacement.kind,
        sourcePageCount: replacement.pageCount,
        calibrationLines: cloneCalibrationLines(),
        calibrationValues: cloneCalibrationValues(),
        axisConfig: cloneAxisConfig(),
        dataPoints: [],
        curves: [],
        activeCurveId: null,
        currentStep: 'calibration',
        collectionMode: 'point',
        defaultSampleLabel: 'Sample A',
        currentPageNumber: 1,
        pageSessions: {},
        plotRegions: [plot],
        activePlotId: plot.id,
        isDirty: true,
        canUndo: false,
        canRedo: false,
        changeRevision: state.changeRevision + 1
      };
    });
  },

  // Calibration
  calibrationLines: initialCalibrationLines,
  calibrationValues: initialCalibrationValues,
  axisConfig: cloneAxisConfig(),

  setCalibrationLine: (key, value) =>
    setWithHistory((state) => {
      const calibrationLines = { ...state.calibrationLines, [key]: value };
      return {
        calibrationLines,
        ...recalculateCollectedValues(
          state,
          calibrationLines,
          state.calibrationValues,
          state.axisConfig
        )
      };
    }, { group: `calibration-line:${key}`, mergeWindowMs: 300 }),

  setCalibrationValue: (key, value) =>
    setWithHistory((state) => {
      const calibrationValues = { ...state.calibrationValues, [key]: value };
      return {
        calibrationValues,
        ...recalculateCollectedValues(
          state,
          state.calibrationLines,
          calibrationValues,
          state.axisConfig
        )
      };
    }, { group: `calibration-value:${key}`, mergeWindowMs: Number.POSITIVE_INFINITY }),

  setAxisScale: (axis, scale) =>
    setWithHistory((state) => {
      const axisConfig = {
        ...state.axisConfig,
        [axis]: { ...state.axisConfig[axis], scale }
      };
      return {
        axisConfig,
        ...recalculateCollectedValues(
          state,
          state.calibrationLines,
          state.calibrationValues,
          axisConfig
        )
      };
    }),

  setAxisLabel: (axis, label) =>
    setWithHistory((state) => ({
      axisConfig: {
        ...state.axisConfig,
        [axis]: { ...state.axisConfig[axis], label }
      }
    }), { group: `axis-label:${axis}`, mergeWindowMs: Number.POSITIVE_INFINITY }),

  setAxisFormula: (axis, formula) =>
    setWithHistory((state) => {
      const axisConfig = {
        ...state.axisConfig,
        [axis]: { ...state.axisConfig[axis], formula }
      };
      return {
        axisConfig,
        ...recalculateCollectedValues(
          state,
          state.calibrationLines,
          state.calibrationValues,
          axisConfig
        )
      };
    }, { group: `axis-formula:${axis}`, mergeWindowMs: Number.POSITIVE_INFINITY }),

  setAxisLogInputMode: (axis, mode) =>
    setWithHistory((state) => {
      const axisConfig = {
        ...state.axisConfig,
        [axis]: { ...state.axisConfig[axis], logInputMode: mode }
      };
      return {
        axisConfig,
        ...recalculateCollectedValues(
          state,
          state.calibrationLines,
          state.calibrationValues,
          axisConfig
        )
      };
    }),

  showCoordinateGuide: false,
  setShowCoordinateGuide: (visible) => setDirty(() => ({ showCoordinateGuide: visible })),
  showMagnifierDataOverlay: true,
  setShowMagnifierDataOverlay: (visible) =>
    setDirty(() => ({ showMagnifierDataOverlay: visible })),

  // Data points
  dataPoints: [],
  addDataPoint: (point) =>
    setWithHistory((state) => ({
      dataPoints: [
        ...state.dataPoints,
        { ...point, id: createId('point'), visible: true }
      ]
    })),
  deleteDataPoint: (id) =>
    setWithHistory((state) => ({
      dataPoints: state.dataPoints.filter((p) => p.id !== id)
    })),
  updateDataPointPosition: (id, screenX, screenY) =>
    setWithHistory((state) => ({
      dataPoints: state.dataPoints.map((point) => {
        if (point.id !== id) return point;
        const moved = movePercentPoint(point.screenX, point.screenY, screenX, screenY);
        return {
          ...point,
          ...moved,
          ...recalculatePoint(
            moved,
            state.calibrationLines,
            state.calibrationValues,
            state.axisConfig,
            state.imageData
          )
        };
      })
    }), { group: `data-point-position:${id}`, mergeWindowMs: 300 }),
  updateDataPointLabel: (id, label) =>
    setWithHistory((state) => ({
      dataPoints: state.dataPoints.map((p) =>
        p.id === id ? { ...p, label } : p
      )
    }), { group: `data-point-label:${id}`, mergeWindowMs: Number.POSITIVE_INFINITY }),
  updateDataPointVisibility: (id, visible) =>
    setWithHistory((state) => ({
      dataPoints: state.dataPoints.map((point) =>
        point.id === id ? { ...point, visible } : point
      )
    })),
  clearDataPoints: () => setWithHistory(() => ({ dataPoints: [] })),

  // Curve series
  curves: [],
  activeCurveId: null,
  createCurve: (name) => {
    const id = createId('curve');
    setWithHistory((state) => {
      const curve: CurveSeries = {
        id,
        name: name?.trim() || getNextCurveName(state.curves),
        color: getNextCurveColor(state.curves),
        outputCount: 500,
        interpolation: 'linear',
        visible: true,
        controlPoints: []
      };

      return {
        curves: [...state.curves, curve],
        activeCurveId: id,
        collectionMode: 'curve'
      };
    });
    return id;
  },
  setActiveCurve: (id) => setDirty(() => ({ activeCurveId: id })),
  updateCurve: (id, patch) =>
    setWithHistory((state) => ({
      curves: state.curves.map((curve) =>
        curve.id === id ? { ...curve, ...patch } : curve
      )
    }), { group: `curve-update:${id}`, mergeWindowMs: Number.POSITIVE_INFINITY }),
  deleteCurve: (id) =>
    setWithHistory((state) => {
      const curves = state.curves.filter((curve) => curve.id !== id);
      const activeCurveId =
        state.activeCurveId === id ? curves[0]?.id ?? null : state.activeCurveId;
      return { curves, activeCurveId };
    }),
  addCurvePoint: (point) =>
    setWithHistory((state) => {
      const activeCurveId = state.activeCurveId ?? state.curves[0]?.id ?? null;
      if (!activeCurveId) return state;

      return {
        curves: state.curves.map((curve) => {
          if (curve.id !== activeCurveId) return curve;

          return {
            ...curve,
            controlPoints: [
              ...curve.controlPoints,
              {
                ...point,
                id: createId('curve-point'),
                order: curve.controlPoints.length + 1
              }
            ]
          };
        })
      };
    }),
  addCurvePointsToCurve: (curveId, points) =>
    setWithHistory((state) => {
      if (points.length === 0) return state;

      return {
        curves: state.curves.map((curve) => {
          if (curve.id !== curveId) return curve;

          return {
            ...curve,
            controlPoints: [
              ...curve.controlPoints,
              ...points.map((point, index) => ({
                ...point,
                id: createId('curve-point'),
                order: curve.controlPoints.length + index + 1
              }))
            ]
          };
        }),
        activeCurveId: curveId,
        collectionMode: 'curve'
      };
    }),
  updateCurvePointPosition: (curveId, pointId, screenX, screenY) =>
    setWithHistory((state) => ({
      curves: state.curves.map((curve) => {
        if (curve.id !== curveId) return curve;

        return {
          ...curve,
          controlPoints: curve.controlPoints.map((point) => {
            if (point.id !== pointId) return point;
            const moved = movePercentPoint(
              point.screenX,
              point.screenY,
              screenX,
              screenY
            );
            return {
              ...point,
              ...moved,
              ...recalculatePoint(
                moved,
                state.calibrationLines,
                state.calibrationValues,
                state.axisConfig,
                state.imageData
              )
            };
          })
        };
      })
    }), { group: `curve-point-position:${curveId}:${pointId}`, mergeWindowMs: 300 }),
  deleteCurvePoint: (curveId, pointId) =>
    setWithHistory((state) => ({
      curves: state.curves.map((curve) =>
        curve.id === curveId
          ? {
              ...curve,
              controlPoints: curve.controlPoints
                .filter((point) => point.id !== pointId)
                .map((point, index) => ({ ...point, order: index + 1 }))
            }
          : curve
      )
    })),
  clearCurvePoints: (curveId) =>
    setWithHistory((state) => ({
      curves: state.curves.map((curve) =>
        curve.id === curveId ? { ...curve, controlPoints: [] } : curve
      )
    })),
  clearCurves: () => setWithHistory(() => ({ curves: [], activeCurveId: null })),

  // Plot regions
  plotRegions: [initialPlot],
  activePlotId: initialPlot.id,
  createPlotRegion: (name) => {
    const id = createId('plot');
    setWithHistory((state) => {
      const committed = commitActivePlot(state);
      const nextPlot: PlotRegion = {
        ...createBlankPlotRegion(committed.length + 1, name),
        id
      };

      return {
        plotRegions: [...committed, nextPlot],
        activePlotId: id,
        currentStep: 'calibration',
        ...restorePlotFields(nextPlot)
      };
    });
    return id;
  },
  setActivePlotRegion: (id) =>
    set((state) => {
      if (id === state.activePlotId) return state;
      const committed = commitActivePlot(state);
      const target = committed.find((plot) => plot.id === id);
      if (!target) return state;

      return {
        plotRegions: committed,
        activePlotId: id,
        currentStep: target.curves.length || target.dataPoints.length ? 'digitizing' : 'calibration',
        ...restorePlotFields(target)
      };
    }),
  updatePlotRegionName: (id, name) =>
    setWithHistory((state) => ({
      plotRegions: state.plotRegions.map((plot) =>
        plot.id === id ? { ...plot, name } : plot
      )
    }), { group: `plot-name:${id}`, mergeWindowMs: Number.POSITIVE_INFINITY }),
  deletePlotRegion: (id) =>
    setWithHistory((state) => {
      const committed = commitActivePlot(state);
      if (committed.length <= 1) return state;

      const remaining = committed.filter((plot) => plot.id !== id);
      const nextActive =
        state.activePlotId === id
          ? remaining[0]
          : remaining.find((plot) => plot.id === state.activePlotId) ?? remaining[0];

      return {
        plotRegions: remaining,
        activePlotId: nextActive.id,
        currentStep: nextActive.curves.length || nextActive.dataPoints.length ? 'digitizing' : 'calibration',
        ...restorePlotFields(nextActive)
      };
    }),
  savePlotScreenshot: (screenshot) =>
    setWithHistory((state) => {
      const committed = commitActivePlot(state);
      return {
        plotRegions: committed.map((plot) =>
          plot.id === state.activePlotId
            ? { ...plot, screenshot: { ...screenshot } }
            : plot
        )
      };
    }),
  deletePlotScreenshot: (plotId) =>
    setWithHistory((state) => {
      const targetPlotId = plotId ?? state.activePlotId;
      const committed = commitActivePlot(state);
      return {
        plotRegions: committed.map((plot) =>
          plot.id === targetPlotId ? { ...plot, screenshot: undefined } : plot
        )
      };
    }),

  // Step
  currentStep: 'calibration',
  setCurrentStep: (step) => setDirty(() => ({ currentStep: step })),

  // Collection mode
  collectionMode: 'point',
  setCollectionMode: (mode) => setDirty(() => ({ collectionMode: mode })),

  // Default label
  defaultSampleLabel: 'Sample A',
  setDefaultSampleLabel: (label) =>
    setDirty(() => ({ defaultSampleLabel: label })),

  // Reset all
  resetApp: () => {
    clearAllHistory();
    set((state) => {
      const plot = createBlankPlotRegion(1);
      const now = new Date().toISOString();

      return {
        projectId: createProjectId(),
        projectCreatedAt: now,
        projectUpdatedAt: now,
        projectFileName: null,
        imageData: initialImageData,
        sourceFile: null,
        sourceKind: null,
        sourcePageCount: 0,
        calibrationLines: cloneCalibrationLines(),
        calibrationValues: cloneCalibrationValues(),
        axisConfig: cloneAxisConfig(),
        dataPoints: [],
        curves: [],
        activeCurveId: null,
        currentStep: 'calibration',
        collectionMode: 'point',
        showCoordinateGuide: false,
        showMagnifierDataOverlay: true,
        defaultSampleLabel: 'Sample A',
        currentPageNumber: 1,
        pageSessions: {},
        plotRegions: [plot],
        activePlotId: plot.id,
        isDirty: false,
        canUndo: false,
        canRedo: false,
        changeRevision: state.changeRevision + 1
      };
    });
  },

  // Page sessions for PDF/page-based collection
  currentPageNumber: 1,
  setCurrentPageNumber: (pageNumber) =>
    set(() => ({
      currentPageNumber: pageNumber,
      ...getHistoryAvailability(pageNumber)
    })),
  pageSessions: {},
  saveCurrentPageSession: (pageNumber) =>
    set((state) => {
      const plotRegions = commitActivePlot(state);

      return {
        plotRegions,
        pageSessions: {
          ...state.pageSessions,
          [pageNumber]: {
            pageNumber,
            imageData: { ...state.imageData },
            plotRegions,
            activePlotId: state.activePlotId,
            calibrationLines: { ...state.calibrationLines },
            calibrationValues: { ...state.calibrationValues },
            axisConfig: {
              x: { ...state.axisConfig.x },
              y: { ...state.axisConfig.y }
            },
            dataPoints: state.dataPoints.map((point) => ({ ...point })),
            curves: cloneCurves(state.curves),
            activeCurveId: state.activeCurveId,
            currentStep: state.currentStep,
            collectionMode: state.collectionMode,
            defaultSampleLabel: state.defaultSampleLabel
          }
        }
      };
    }),
  restorePageSession: (pageNumber, imageData, fileName) =>
    set((state) => {
      const saved = state.pageSessions[pageNumber];

      if (saved) {
        const plotRegions = normalizePlotRegions(saved);
        const activePlotId = saved.activePlotId ?? plotRegions[0].id;
        const activePlot =
          plotRegions.find((plot) => plot.id === activePlotId) ?? plotRegions[0];

        return {
          currentPageNumber: pageNumber,
          imageData: {
            ...saved.imageData,
            ...imageData,
            name: fileName ?? saved.imageData.name
          },
          plotRegions,
          activePlotId: activePlot.id,
          currentStep: saved.currentStep,
          ...restorePlotFields(activePlot),
          ...getHistoryAvailability(pageNumber)
        };
      }

      const plot = createBlankPlotRegion(1);

      return {
        currentPageNumber: pageNumber,
        imageData: {
          ...initialImageData,
          ...imageData,
          name: fileName ?? imageData.name
        },
        plotRegions: [plot],
        activePlotId: plot.id,
        currentStep: 'calibration',
        ...restorePlotFields(plot),
        ...getHistoryAvailability(pageNumber)
      };
    }),
  deleteExportItem: (pageNumber, kind, plotId, targetId) =>
    setWithHistory((state) => {
      const committed = commitActivePlot(state);
      const pageSessions = { ...state.pageSessions };

      if (pageNumber === state.currentPageNumber) {
        const plotRegions = deleteItemFromPlotRegions(
          committed,
          kind,
          plotId,
          targetId
        );
        const activePlotId = plotRegions.some(
          (plot) => plot.id === state.activePlotId
        )
          ? state.activePlotId
          : plotRegions[0].id;
        const activePlot =
          plotRegions.find((plot) => plot.id === activePlotId) ?? plotRegions[0];
        const baseSession: PageSession = {
          pageNumber,
          imageData: { ...state.imageData },
          plotRegions,
          activePlotId,
          calibrationLines: { ...state.calibrationLines },
          calibrationValues: { ...state.calibrationValues },
          axisConfig: {
            x: { ...state.axisConfig.x },
            y: { ...state.axisConfig.y }
          },
          dataPoints: state.dataPoints.map((point) => ({ ...point })),
          curves: cloneCurves(state.curves),
          activeCurveId: state.activeCurveId,
          currentStep: state.currentStep,
          collectionMode: state.collectionMode,
          defaultSampleLabel: state.defaultSampleLabel
        };

        pageSessions[pageNumber] = buildPageSessionFromPlotRegions(
          baseSession,
          plotRegions,
          activePlotId
        );

        return {
          plotRegions,
          activePlotId,
          pageSessions,
          currentStep: hasPlotContent(activePlot) ? 'digitizing' : 'calibration',
          ...restorePlotFields(activePlot)
        };
      }

      const saved = state.pageSessions[pageNumber];
      if (!saved) {
        return { plotRegions: committed };
      }

      const savedPlotRegions = normalizePlotRegions(saved);
      const plotRegions = deleteItemFromPlotRegions(
        savedPlotRegions,
        kind,
        plotId,
        targetId
      );
      const activePlotId = plotRegions.some((plot) => plot.id === saved.activePlotId)
        ? saved.activePlotId
        : plotRegions[0].id;

      pageSessions[pageNumber] = buildPageSessionFromPlotRegions(
        saved,
        plotRegions,
        activePlotId
      );

      return {
        plotRegions: committed,
        pageSessions
      };
    }),
  resetPageSessions: () => {
    clearAllHistory();
    set(() => {
      const plot = createBlankPlotRegion(1);
      return {
        pageSessions: {},
        plotRegions: [plot],
        activePlotId: plot.id,
        canUndo: false,
        canRedo: false,
        ...restorePlotFields(plot)
      };
    });
  }
  });
});
