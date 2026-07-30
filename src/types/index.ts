export type AxisScale = 'linear' | 'log' | 'log10' | 'ln' | 'custom';
export type LogInputMode = 'value' | 'exponent';
export type PointQualityFlag =
  | 'outside-calibration'
  | 'manual-point'
  | 'curve-control'
  | 'curve-interpolated'
  | 'auto-traced'
  | 'low-confidence'
  | 'needs-review'
  | 'extrapolated'
  | 'duplicate-x'
  | 'near-axis'
  | 'near-legend-or-text';
export type ExportSchema = 'v2.1' | 'legacy-v2.0';
export type ExportValueMode = 'full' | 'rounded';

export type CalibrationIssueCode =
  | 'image-not-ready'
  | 'screen-span-too-small'
  | 'screen-span-low-accuracy'
  | 'non-finite-value'
  | 'equal-values'
  | 'log-nonpositive'
  | 'formula-empty'
  | 'formula-syntax'
  | 'formula-nonfinite'
  | 'formula-nonmonotonic'
  | 'non-finite-result';

export interface CalibrationIssue {
  axis: 'x' | 'y';
  severity: 'error' | 'warning';
  code: CalibrationIssueCode;
  message: string;
}

export interface CalibrationValidationResult {
  valid: boolean;
  issues: CalibrationIssue[];
}

export type CoordinateResult =
  | {
      ok: true;
      realX: number;
      realY: number;
      qualityFlags: PointQualityFlag[];
    }
  | {
      ok: false;
      issues: CalibrationIssue[];
    };

export interface CalibrationLines {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface CalibrationValues {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export interface AxisConfig {
  scale: AxisScale;
  label: string;
  formula?: string;
  logInputMode?: LogInputMode;
}

export interface DataPoint {
  id: string;
  screenX: number;
  screenY: number;
  realX: number;
  realY: number;
  label: string;
  visible?: boolean;
  qualityFlags?: PointQualityFlag[];
  confidence?: number;
}

export interface CurvePoint extends DataPoint {
  order: number;
}

export interface InterpolatedPoint {
  id: string;
  curveId: string;
  realX: number;
  realY: number;
  screenX: number;
  screenY: number;
}

export type InterpolationMethod = 'linear' | 'smooth';

export interface CurveSeries {
  id: string;
  name: string;
  color: string;
  outputCount: number;
  interpolation: InterpolationMethod;
  visible: boolean;
  controlPoints: CurvePoint[];
}

export interface ScreenshotAsset {
  name: string;
  dataUrl: string;
  createdAt: string;
}

export interface ImageData {
  src: string | null;
  naturalWidth: number;
  naturalHeight: number;
  name?: string;
}

export type AppStep = 'calibration' | 'digitizing';
export type CollectionMode = 'point' | 'curve';
export type ProjectSourceKind = 'image' | 'pdf';

export interface SourceReplacement {
  file: File;
  kind: ProjectSourceKind;
  pageCount: number;
  firstPageImage: ImageData;
}

export interface ProjectSourceRef {
  kind: ProjectSourceKind;
  originalName: string;
  mimeType: string;
  size: number;
  sha256: string;
  archivePath: string;
  pageCount: number;
}

export interface ProjectScreenshotRef {
  name: string;
  archivePath: string;
  createdAt: string;
  mimeType: string;
}

export interface ProjectPlotV1 {
  id: string;
  name: string;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  activeCurveId: string | null;
  collectionMode: CollectionMode;
  defaultSampleLabel: string;
  screenshot?: ProjectScreenshotRef;
}

export interface ProjectPageV1 {
  pageNumber: number;
  currentStep: AppStep;
  activePlotId: string;
  plots: ProjectPlotV1[];
}

export interface ProjectDocumentV1 {
  schemaVersion: 1;
  calculationVersion: 1;
  appVersion: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  currentPageNumber: number;
  source: ProjectSourceRef;
  pages: ProjectPageV1[];
  preferences: {
    showCoordinateGuide: boolean;
    showMagnifierDataOverlay: boolean;
  };
}

export interface ProjectReplacement {
  document: ProjectDocumentV1;
  sourceFile: File;
  currentImage: ImageData;
  pageSessions: Record<number, PageSession>;
  fileName?: string;
}

export interface ProjectFileBridge {
  openProject(): Promise<{ name: string; bytes: ArrayBuffer } | null>;
  saveProject(input: {
    defaultName: string;
    bytes: ArrayBuffer;
  }): Promise<{ saved: boolean; name?: string }>;
}

export interface PlotRegion {
  id: string;
  name: string;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  activeCurveId: string | null;
  collectionMode: CollectionMode;
  defaultSampleLabel: string;
  screenshot?: ScreenshotAsset;
}

export interface PageSession {
  pageNumber: number;
  imageData: ImageData;
  plotRegions: PlotRegion[];
  activePlotId: string;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  dataPoints: DataPoint[];
  curves: CurveSeries[];
  activeCurveId: string | null;
  currentStep: AppStep;
  collectionMode: CollectionMode;
  defaultSampleLabel: string;
}

export interface AppState {
  // Project lifecycle and per-page history
  isDirty: boolean;
  changeRevision: number;
  projectId: string;
  projectCreatedAt: string;
  projectUpdatedAt: string;
  projectFileName: string | null;
  canUndo: boolean;
  canRedo: boolean;
  markDirty: () => void;
  markSaved: (updatedAt?: string) => void;
  clearHistory: () => void;
  commitHistoryBoundary: () => void;
  undo: () => void;
  redo: () => void;
  setProjectFileName: (name: string | null) => void;
  replaceProject: (replacement: ProjectReplacement) => void;

  // Image
  imageData: ImageData;
  sourceFile: File | null;
  sourceKind: ProjectSourceKind | null;
  sourcePageCount: number;
  setImageData: (data: Partial<ImageData>) => void;
  resetImage: () => void;
  replaceSource: (replacement: SourceReplacement) => void;

  // Calibration
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  setCalibrationLine: (key: keyof CalibrationLines, value: number) => void;
  setCalibrationValue: (key: keyof CalibrationValues, value: number) => void;
  setAxisScale: (axis: 'x' | 'y', scale: AxisScale) => void;
  setAxisLabel: (axis: 'x' | 'y', label: string) => void;
  setAxisFormula: (axis: 'x' | 'y', formula: string) => void;
  setAxisLogInputMode: (axis: 'x' | 'y', mode: LogInputMode) => void;
  showCoordinateGuide: boolean;
  setShowCoordinateGuide: (visible: boolean) => void;
  showMagnifierDataOverlay: boolean;
  setShowMagnifierDataOverlay: (visible: boolean) => void;

  // Data points
  dataPoints: DataPoint[];
  addDataPoint: (point: Omit<DataPoint, 'id'>) => void;
  deleteDataPoint: (id: string) => void;
  updateDataPointPosition: (id: string, screenX: number, screenY: number) => void;
  updateDataPointLabel: (id: string, label: string) => void;
  updateDataPointVisibility: (id: string, visible: boolean) => void;
  clearDataPoints: () => void;

  // Curve series
  curves: CurveSeries[];
  activeCurveId: string | null;
  createCurve: (name?: string) => string;
  setActiveCurve: (id: string | null) => void;
  updateCurve: (
    id: string,
    patch: Partial<Omit<CurveSeries, 'id' | 'controlPoints'>>
  ) => void;
  deleteCurve: (id: string) => void;
  addCurvePoint: (point: Omit<CurvePoint, 'id' | 'order'>) => void;
  addCurvePointsToCurve: (
    curveId: string,
    points: Array<Omit<CurvePoint, 'id' | 'order'>>
  ) => void;
  updateCurvePointPosition: (
    curveId: string,
    pointId: string,
    screenX: number,
    screenY: number
  ) => void;
  deleteCurvePoint: (curveId: string, pointId: string) => void;
  clearCurvePoints: (curveId: string) => void;
  clearCurves: () => void;

  // Plot regions
  plotRegions: PlotRegion[];
  activePlotId: string;
  createPlotRegion: (name?: string) => string;
  setActivePlotRegion: (id: string) => void;
  updatePlotRegionName: (id: string, name: string) => void;
  deletePlotRegion: (id: string) => void;
  savePlotScreenshot: (screenshot: ScreenshotAsset) => void;
  deletePlotScreenshot: (plotId?: string) => void;

  // Step
  currentStep: AppStep;
  setCurrentStep: (step: AppStep) => void;

  // Collection mode
  collectionMode: CollectionMode;
  setCollectionMode: (mode: CollectionMode) => void;

  // Default label
  defaultSampleLabel: string;
  setDefaultSampleLabel: (label: string) => void;

  // Reset all
  resetApp: () => void;

  // Page sessions for PDF/page-based collection
  currentPageNumber: number;
  setCurrentPageNumber: (pageNumber: number) => void;
  pageSessions: Record<number, PageSession>;
  saveCurrentPageSession: (pageNumber: number) => void;
  restorePageSession: (
    pageNumber: number,
    imageData: Partial<ImageData>,
    fileName?: string
  ) => void;
  deleteExportItem: (
    pageNumber: number,
    kind: 'plot' | 'curve' | 'point' | 'screenshot',
    plotId: string,
    targetId: string
  ) => void;
  resetPageSessions: () => void;
}

export interface ExportOptions {
  format: 'csv' | 'xlsx';
  precision: number;
  schema?: ExportSchema;
  valueMode?: ExportValueMode;
  delimiter?: ',' | '\t' | ' ';
  dataScope?: 'points' | 'curve-controls' | 'curve-interpolated' | 'all';
  pageScope?: 'current' | 'all';
  includeScreenshots?: boolean;
}
