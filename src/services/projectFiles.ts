import JSZip from 'jszip';
import type {
  AppState,
  DataPoint,
  PageSession,
  PlotRegion,
  ProjectDocumentV1,
  ProjectPageV1,
  ProjectPlotV1,
  ProjectReplacement,
  ProjectScreenshotRef,
  ScreenshotAsset
} from '../types';
import { calculateRealValue } from '../utils/coordinate';
import { preparePdfPage, prepareSource } from './sourceLoader';

export const PROJECT_EXTENSION = '.plotdigitizer';
export const PROJECT_APP_VERSION = '2.1.0';

export interface SerializedProject {
  bytes: ArrayBuffer;
  updatedAt: string;
  defaultName: string;
  document: ProjectDocumentV1;
}

export interface LoadedProjectPackage {
  replacement: ProjectReplacement;
  objectUrl: string | null;
  warnings: string[];
  coordinateMismatchCount: number;
}

interface ScreenshotArchiveItem {
  path: string;
  bytes: Uint8Array;
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

export async function serializeProject(state: AppState): Promise<SerializedProject> {
  if (!state.sourceFile || !state.sourceKind || state.sourcePageCount < 1) {
    throw new ProjectFileError('请先导入原始图片或 PDF');
  }

  const sourceBytes = new Uint8Array(await readBlobArrayBuffer(state.sourceFile));
  const sourceHash = await sha256Hex(sourceBytes);
  const sourcePath = `source/${sanitizeArchiveName(state.sourceFile.name)}`;
  const updatedAt = new Date().toISOString();
  const screenshotItems: ScreenshotArchiveItem[] = [];
  const pages = buildProjectPages(state, screenshotItems);
  const document: ProjectDocumentV1 = {
    schemaVersion: 1,
    calculationVersion: 1,
    appVersion: PROJECT_APP_VERSION,
    projectId: state.projectId,
    createdAt: state.projectCreatedAt,
    updatedAt,
    currentPageNumber: state.currentPageNumber,
    source: {
      kind: state.sourceKind,
      originalName: state.sourceFile.name,
      mimeType: state.sourceFile.type || 'application/octet-stream',
      size: sourceBytes.byteLength,
      sha256: sourceHash,
      archivePath: sourcePath,
      pageCount: state.sourcePageCount
    },
    pages,
    preferences: {
      showCoordinateGuide: state.showCoordinateGuide,
      showMagnifierDataOverlay: state.showMagnifierDataOverlay
    }
  };

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(document, null, 2));
  zip.file(sourcePath, sourceBytes);
  screenshotItems.forEach((item) => zip.file(item.path, item.bytes));
  const bytes = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS'
  });

  return {
    bytes,
    updatedAt,
    defaultName:
      state.projectFileName ??
      `${stripExtension(state.sourceFile.name)}${PROJECT_EXTENSION}`,
    document
  };
}

export async function deserializeProject(
  bytes: ArrayBuffer,
  fileName?: string
): Promise<LoadedProjectPackage> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ProjectFileError('项目文件不是有效的 ZIP 容器');
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) throw new ProjectFileError('项目缺少 manifest.json');

  let document: ProjectDocumentV1;
  try {
    document = JSON.parse(await manifestEntry.async('string')) as ProjectDocumentV1;
  } catch {
    throw new ProjectFileError('manifest.json 无法解析');
  }
  validateManifest(document);

  const sourceEntry = zip.file(document.source.archivePath);
  if (!sourceEntry) throw new ProjectFileError('项目缺少原始源文件');
  const sourceBytes = await sourceEntry.async('uint8array');
  if (sourceBytes.byteLength !== document.source.size) {
    throw new ProjectFileError('原始源文件大小与 manifest 不一致');
  }
  const actualHash = await sha256Hex(sourceBytes);
  if (actualHash !== document.source.sha256.toLowerCase()) {
    throw new ProjectFileError('原始源文件 SHA-256 校验失败');
  }

  const ownedSourceBytes = Uint8Array.from(sourceBytes);
  const sourceFile = new File([ownedSourceBytes.buffer], document.source.originalName, {
    type: document.source.mimeType
  });
  const prepared = await prepareSource(sourceFile);
  if (
    prepared.kind !== document.source.kind ||
    prepared.pageCount !== document.source.pageCount
  ) {
    if (prepared.objectUrl) URL.revokeObjectURL(prepared.objectUrl);
    throw new ProjectFileError('原始源文件类型或页数与 manifest 不一致');
  }

  let currentImage = prepared.firstPageImage;
  if (prepared.kind === 'pdf' && document.currentPageNumber !== 1) {
    currentImage = await preparePdfPage(sourceFile, document.currentPageNumber);
  }

  const warnings: string[] = [];
  const pageSessions = await buildPageSessions(
    document,
    zip,
    currentImage,
    warnings
  );
  const replacement: ProjectReplacement = {
    document,
    sourceFile,
    currentImage,
    pageSessions,
    fileName
  };

  return {
    replacement,
    objectUrl: prepared.objectUrl,
    warnings,
    coordinateMismatchCount: countCoordinateMismatches(replacement)
  };
}

export function recalculateProjectCoordinates(
  replacement: ProjectReplacement
): ProjectReplacement {
  const next = structuredClone({
    document: replacement.document,
    currentImage: replacement.currentImage,
    pageSessions: replacement.pageSessions,
    fileName: replacement.fileName
  }) as Omit<ProjectReplacement, 'sourceFile'>;

  Object.values(next.pageSessions).forEach((session) => {
    session.plotRegions = session.plotRegions.map((plot) => recalculatePlot(plot));
    const active =
      session.plotRegions.find((plot) => plot.id === session.activePlotId) ??
      session.plotRegions[0];
    Object.assign(session, activePlotFields(active));
  });

  return { ...next, sourceFile: replacement.sourceFile };
}

export async function sha256Hex(input: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new ProjectFileError('当前环境不支持 SHA-256 校验');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    Uint8Array.from(input).buffer
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildProjectPages(
  state: AppState,
  screenshotItems: ScreenshotArchiveItem[]
): ProjectPageV1[] {
  const pageNumbers = new Set<number>([
    state.currentPageNumber,
    ...Object.keys(state.pageSessions).map(Number)
  ]);

  return [...pageNumbers]
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1)
    .sort((left, right) => left - right)
    .map((pageNumber) => {
      const isCurrent = pageNumber === state.currentPageNumber;
      const saved = state.pageSessions[pageNumber];
      const plots = isCurrent
        ? materializeCurrentPlots(state)
        : saved?.plotRegions ?? [];
      if (plots.length === 0) {
        throw new ProjectFileError(`第 ${pageNumber} 页缺少图组数据`);
      }
      const activePlotId = isCurrent
        ? state.activePlotId
        : saved?.activePlotId ?? plots[0].id;
      return {
        pageNumber,
        currentStep: isCurrent
          ? state.currentStep
          : saved?.currentStep ?? 'calibration',
        activePlotId,
        plots: plots.map((plot) =>
          toProjectPlot(pageNumber, plot, screenshotItems)
        )
      };
    });
}

function materializeCurrentPlots(state: AppState): PlotRegion[] {
  return state.plotRegions.map((plot) =>
    plot.id === state.activePlotId
      ? {
          ...plot,
          calibrationLines: { ...state.calibrationLines },
          calibrationValues: { ...state.calibrationValues },
          axisConfig: {
            x: { ...state.axisConfig.x },
            y: { ...state.axisConfig.y }
          },
          dataPoints: state.dataPoints.map((point) => ({ ...point })),
          curves: structuredClone(state.curves),
          activeCurveId: state.activeCurveId,
          collectionMode: state.collectionMode,
          defaultSampleLabel: state.defaultSampleLabel
        }
      : structuredClone(plot)
  );
}

function toProjectPlot(
  pageNumber: number,
  plot: PlotRegion,
  screenshotItems: ScreenshotArchiveItem[]
): ProjectPlotV1 {
  let screenshot: ProjectScreenshotRef | undefined;
  if (plot.screenshot) {
    const decoded = decodeDataUrl(plot.screenshot.dataUrl);
    const extension = extensionForMime(decoded.mimeType);
    const path = `screenshots/page-${pageNumber}/${sanitizeArchiveName(plot.id)}.${extension}`;
    screenshotItems.push({ path, bytes: decoded.bytes });
    screenshot = {
      name: plot.screenshot.name,
      archivePath: path,
      createdAt: plot.screenshot.createdAt,
      mimeType: decoded.mimeType
    };
  }

  return {
    id: plot.id,
    name: plot.name,
    calibrationLines: structuredClone(plot.calibrationLines),
    calibrationValues: structuredClone(plot.calibrationValues),
    axisConfig: structuredClone(plot.axisConfig),
    dataPoints: structuredClone(plot.dataPoints),
    curves: structuredClone(plot.curves),
    activeCurveId: plot.activeCurveId,
    collectionMode: plot.collectionMode,
    defaultSampleLabel: plot.defaultSampleLabel,
    screenshot
  };
}

async function buildPageSessions(
  document: ProjectDocumentV1,
  zip: JSZip,
  currentImage: AppState['imageData'],
  warnings: string[]
): Promise<Record<number, PageSession>> {
  const sessions: Record<number, PageSession> = {};
  for (const page of document.pages) {
    const plots: PlotRegion[] = [];
    for (const plot of page.plots) {
      plots.push(await fromProjectPlot(plot, zip, warnings));
    }
    const active = plots.find((plot) => plot.id === page.activePlotId) ?? plots[0];
    const imageData =
      page.pageNumber === document.currentPageNumber
        ? { ...currentImage }
        : {
            src: null,
            naturalWidth: 0,
            naturalHeight: 0,
            name: document.source.originalName
          };
    sessions[page.pageNumber] = {
      pageNumber: page.pageNumber,
      imageData,
      plotRegions: plots,
      activePlotId: active.id,
      currentStep: page.currentStep,
      ...activePlotFields(active)
    };
  }
  return sessions;
}

async function fromProjectPlot(
  plot: ProjectPlotV1,
  zip: JSZip,
  warnings: string[]
): Promise<PlotRegion> {
  let screenshot: ScreenshotAsset | undefined;
  if (plot.screenshot) {
    try {
      const entry = zip.file(plot.screenshot.archivePath);
      if (!entry) throw new Error('资源不存在');
      const bytes = await entry.async('uint8array');
      if (!hasImageSignature(bytes, plot.screenshot.mimeType)) {
        throw new Error('图片签名无效');
      }
      screenshot = {
        name: plot.screenshot.name,
        createdAt: plot.screenshot.createdAt,
        dataUrl: encodeDataUrl(bytes, plot.screenshot.mimeType)
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : '无法读取';
      warnings.push(`截图 ${plot.screenshot.name} 已跳过：${reason}`);
    }
  }
  return {
    id: plot.id,
    name: plot.name,
    calibrationLines: structuredClone(plot.calibrationLines),
    calibrationValues: structuredClone(plot.calibrationValues),
    axisConfig: structuredClone(plot.axisConfig),
    dataPoints: structuredClone(plot.dataPoints),
    curves: structuredClone(plot.curves),
    activeCurveId: plot.activeCurveId,
    collectionMode: plot.collectionMode,
    defaultSampleLabel: plot.defaultSampleLabel,
    screenshot
  };
}

function activePlotFields(plot: PlotRegion) {
  return {
    calibrationLines: structuredClone(plot.calibrationLines),
    calibrationValues: structuredClone(plot.calibrationValues),
    axisConfig: structuredClone(plot.axisConfig),
    dataPoints: structuredClone(plot.dataPoints),
    curves: structuredClone(plot.curves),
    activeCurveId: plot.activeCurveId,
    collectionMode: plot.collectionMode,
    defaultSampleLabel: plot.defaultSampleLabel
  };
}

function countCoordinateMismatches(replacement: ProjectReplacement): number {
  let count = 0;
  Object.values(replacement.pageSessions).forEach((session) => {
    session.plotRegions.forEach((plot) => {
      allPlotPoints(plot).forEach((point) => {
        const result = calculatePoint(point, plot);
        if (
          result &&
          (!nearlyEqual(result.realX, point.realX) ||
            !nearlyEqual(result.realY, point.realY))
        ) {
          count += 1;
        }
      });
    });
  });
  return count;
}

function recalculatePlot(plot: PlotRegion): PlotRegion {
  const update = <T extends DataPoint>(point: T): T => {
    const result = calculatePoint(point, plot);
    return result
      ? ({
          ...point,
          realX: result.realX,
          realY: result.realY,
          qualityFlags: result.qualityFlags
        } as T)
      : point;
  };
  return {
    ...plot,
    dataPoints: plot.dataPoints.map(update),
    curves: plot.curves.map((curve) => ({
      ...curve,
      controlPoints: curve.controlPoints.map(update)
    }))
  };
}

function calculatePoint(point: DataPoint, plot: PlotRegion) {
  const result = calculateRealValue({
    screenX: point.screenX,
    screenY: point.screenY,
    calibrationLines: plot.calibrationLines,
    calibrationValues: plot.calibrationValues,
    axisScales: { x: plot.axisConfig.x.scale, y: plot.axisConfig.y.scale },
    axisFormulas: {
      x: plot.axisConfig.x.formula,
      y: plot.axisConfig.y.formula
    },
    axisLogInputModes: {
      x: plot.axisConfig.x.logInputMode,
      y: plot.axisConfig.y.logInputMode
    }
  });
  return result.ok ? result : null;
}

function allPlotPoints(plot: PlotRegion): DataPoint[] {
  return [
    ...plot.dataPoints,
    ...plot.curves.flatMap((curve) => curve.controlPoints)
  ];
}

function nearlyEqual(left: number, right: number): boolean {
  const tolerance = 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance;
}

function validateManifest(value: ProjectDocumentV1): void {
  if (!value || typeof value !== 'object') throw new ProjectFileError('manifest 根节点无效');
  if (value.schemaVersion !== 1 || value.calculationVersion !== 1) {
    throw new ProjectFileError('不支持的项目格式版本');
  }
  if (
    typeof value.projectId !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new ProjectFileError('manifest 项目元数据无效');
  }
  if (!value.source || !['image', 'pdf'].includes(value.source.kind)) {
    throw new ProjectFileError('manifest 源文件信息无效');
  }
  assertSafeArchivePath(value.source.archivePath, '源文件');
  if (!/^[0-9a-f]{64}$/i.test(value.source.sha256)) {
    throw new ProjectFileError('manifest SHA-256 格式无效');
  }
  if (!Number.isInteger(value.source.pageCount) || value.source.pageCount < 1) {
    throw new ProjectFileError('manifest 页数无效');
  }
  if (!Array.isArray(value.pages) || value.pages.length < 1) {
    throw new ProjectFileError('manifest 不包含页面');
  }
  const pageNumbers = new Set<number>();
  value.pages.forEach((page) => {
    if (
      !Number.isInteger(page.pageNumber) ||
      page.pageNumber < 1 ||
      page.pageNumber > value.source.pageCount ||
      pageNumbers.has(page.pageNumber)
    ) {
      throw new ProjectFileError('manifest 页面编号无效或重复');
    }
    pageNumbers.add(page.pageNumber);
    if (!Array.isArray(page.plots) || page.plots.length < 1) {
      throw new ProjectFileError(`第 ${page.pageNumber} 页缺少图组`);
    }
    const plotIds = new Set(page.plots.map((plot) => plot.id));
    if (!plotIds.has(page.activePlotId)) {
      throw new ProjectFileError(`第 ${page.pageNumber} 页活动图组不存在`);
    }
    page.plots.forEach((plot) => {
      if (!plot.id || !plot.axisConfig || !Array.isArray(plot.dataPoints) || !Array.isArray(plot.curves)) {
        throw new ProjectFileError(`第 ${page.pageNumber} 页图组结构无效`);
      }
      if (plot.screenshot) assertSafeArchivePath(plot.screenshot.archivePath, '截图');
    });
  });
  if (!pageNumbers.has(value.currentPageNumber)) {
    throw new ProjectFileError('manifest 当前页面不存在');
  }
}

function assertSafeArchivePath(path: string, label: string): void {
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.split(/[\\/]/).includes('..')
  ) {
    throw new ProjectFileError(`${label}归档路径不安全`);
  }
}

function sanitizeArchiveName(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return sanitized || 'source.bin';
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'project';
}

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new ProjectFileError('截图不是有效的 base64 data URL');
  const binary = atob(match[2]);
  return {
    mimeType: match[1],
    bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0))
  };
}

function encodeDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'png';
}

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mimeType === 'image/gif') {
    return String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a' || String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a';
  }
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return bytes.length > 0;
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new ProjectFileError('无法读取源文件字节'));
    };
    reader.onerror = () => reject(reader.error ?? new ProjectFileError('无法读取源文件'));
    reader.readAsArrayBuffer(blob);
  });
}
