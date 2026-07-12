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
  axisConfig: AppState['axisConfig']
) => {
  const { realX, realY } = calculateRealValue({
    screenX: point.screenX,
    screenY: point.screenY,
    calibrationLines,
    calibrationValues,
    axisScales: { x: axisConfig.x.scale, y: axisConfig.y.scale },
    axisFormulas: { x: axisConfig.x.formula, y: axisConfig.y.formula },
    axisLogInputModes: {
      x: axisConfig.x.logInputMode,
      y: axisConfig.y.logInputMode
    }
  });

  return { realX, realY };
};

const recalculateCollectedValues = (
  state: AppState,
  calibrationLines = state.calibrationLines,
  calibrationValues = state.calibrationValues,
  axisConfig = state.axisConfig
) => ({
  dataPoints: state.dataPoints.map((point) => ({
    ...point,
    ...recalculatePoint(point, calibrationLines, calibrationValues, axisConfig)
  })),
  curves: state.curves.map((curve) => ({
    ...curve,
    controlPoints: curve.controlPoints.map((point) => ({
      ...point,
      ...recalculatePoint(point, calibrationLines, calibrationValues, axisConfig)
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

const initialPlot = createBlankPlotRegion(1);

export const useAppStore = create<AppState>((set) => ({
  // Image
  imageData: initialImageData,
  setImageData: (data) =>
    set((state) => ({
      imageData: { ...state.imageData, ...data }
    })),
  resetImage: () =>
    set(() => ({
      imageData: initialImageData
    })),

  // Calibration
  calibrationLines: initialCalibrationLines,
  calibrationValues: initialCalibrationValues,
  axisConfig: cloneAxisConfig(),

  setCalibrationLine: (key, value) =>
    set((state) => {
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
    }),

  setCalibrationValue: (key, value) =>
    set((state) => {
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
    }),

  setAxisScale: (axis, scale) =>
    set((state) => {
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
    set((state) => ({
      axisConfig: {
        ...state.axisConfig,
        [axis]: { ...state.axisConfig[axis], label }
      }
    })),

  setAxisFormula: (axis, formula) =>
    set((state) => {
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
    }),

  setAxisLogInputMode: (axis, mode) =>
    set((state) => {
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
  setShowCoordinateGuide: (visible) => set(() => ({ showCoordinateGuide: visible })),
  showMagnifierDataOverlay: true,
  setShowMagnifierDataOverlay: (visible) =>
    set(() => ({ showMagnifierDataOverlay: visible })),

  // Data points
  dataPoints: [],
  addDataPoint: (point) =>
    set((state) => ({
      dataPoints: [
        ...state.dataPoints,
        { ...point, id: createId('point'), visible: true }
      ]
    })),
  deleteDataPoint: (id) =>
    set((state) => ({
      dataPoints: state.dataPoints.filter((p) => p.id !== id)
    })),
  updateDataPointPosition: (id, screenX, screenY) =>
    set((state) => ({
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
            state.axisConfig
          )
        };
      })
    })),
  updateDataPointLabel: (id, label) =>
    set((state) => ({
      dataPoints: state.dataPoints.map((p) =>
        p.id === id ? { ...p, label } : p
      )
    })),
  updateDataPointVisibility: (id, visible) =>
    set((state) => ({
      dataPoints: state.dataPoints.map((point) =>
        point.id === id ? { ...point, visible } : point
      )
    })),
  clearDataPoints: () => set(() => ({ dataPoints: [] })),

  // Curve series
  curves: [],
  activeCurveId: null,
  createCurve: (name) => {
    const id = createId('curve');
    set((state) => {
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
  setActiveCurve: (id) => set(() => ({ activeCurveId: id })),
  updateCurve: (id, patch) =>
    set((state) => ({
      curves: state.curves.map((curve) =>
        curve.id === id ? { ...curve, ...patch } : curve
      )
    })),
  deleteCurve: (id) =>
    set((state) => {
      const curves = state.curves.filter((curve) => curve.id !== id);
      const activeCurveId =
        state.activeCurveId === id ? curves[0]?.id ?? null : state.activeCurveId;
      return { curves, activeCurveId };
    }),
  addCurvePoint: (point) =>
    set((state) => {
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
    set((state) => {
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
    set((state) => ({
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
                state.axisConfig
              )
            };
          })
        };
      })
    })),
  deleteCurvePoint: (curveId, pointId) =>
    set((state) => ({
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
    set((state) => ({
      curves: state.curves.map((curve) =>
        curve.id === curveId ? { ...curve, controlPoints: [] } : curve
      )
    })),
  clearCurves: () => set(() => ({ curves: [], activeCurveId: null })),

  // Plot regions
  plotRegions: [initialPlot],
  activePlotId: initialPlot.id,
  createPlotRegion: (name) => {
    const id = createId('plot');
    set((state) => {
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
    set((state) => ({
      plotRegions: state.plotRegions.map((plot) =>
        plot.id === id ? { ...plot, name } : plot
      )
    })),
  deletePlotRegion: (id) =>
    set((state) => {
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
    set((state) => {
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
    set((state) => {
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
  setCurrentStep: (step) => set(() => ({ currentStep: step })),

  // Collection mode
  collectionMode: 'point',
  setCollectionMode: (mode) => set(() => ({ collectionMode: mode })),

  // Default label
  defaultSampleLabel: 'Sample A',
  setDefaultSampleLabel: (label) => set(() => ({ defaultSampleLabel: label })),

  // Reset all
  resetApp: () =>
    set(() => {
      const plot = createBlankPlotRegion(1);

      return {
        imageData: initialImageData,
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
        activePlotId: plot.id
      };
    }),

  // Page sessions for PDF/page-based collection
  currentPageNumber: 1,
  setCurrentPageNumber: (pageNumber) =>
    set(() => ({ currentPageNumber: pageNumber })),
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
          ...restorePlotFields(activePlot)
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
        ...restorePlotFields(plot)
      };
    }),
  deleteExportItem: (pageNumber, kind, plotId, targetId) =>
    set((state) => {
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
  resetPageSessions: () =>
    set(() => {
      const plot = createBlankPlotRegion(1);
      return {
        pageSessions: {},
        plotRegions: [plot],
        activePlotId: plot.id,
        ...restorePlotFields(plot)
      };
    })
}));
