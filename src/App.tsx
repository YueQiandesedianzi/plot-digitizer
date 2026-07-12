import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Crosshair,
  FolderOpen,
  Image as ImageIcon,
  Loader,
  Maximize2,
  RefreshCw,
  Redo2,
  RotateCcw,
  Save,
  Undo2,
  Upload,
  XCircle,
  ZoomIn
} from 'lucide-react';
import { useAppStore } from './store/appStore';
import { useImageLoader } from './hooks/useImageLoader';
import { MainCanvas } from './components/Canvas/MainCanvas';
import { CalibrationPanel } from './components/Sidebar/CalibrationPanel';
import { DigitizingPanel } from './components/Sidebar/DigitizingPanel';
import type { TracePoint } from './utils/autoTrace';
import { detectCalibrationLinesFromRegion } from './utils/axisDetection';
import { useProjectFiles } from './hooks/useProjectFiles';
import { useRecovery } from './hooks/useRecovery';

type AutoTracePreview = {
  curveId: string;
  color: string;
  points: TracePoint[];
  previewPoints: TracePoint[];
} | null;

function App() {
  const {
    imageData,
    currentStep,
    resetApp,
    setCalibrationLine,
    isDirty,
    canUndo,
    canRedo,
    undo,
    redo,
    sourceFile
  } = useAppStore();
  const [zoomScale, setZoomScale] = useState<number | 'fit'>('fit');
  const [isRegionZoomMode, setIsRegionZoomMode] = useState(false);
  const [isCalibrationBoxMode, setIsCalibrationBoxMode] = useState(false);
  const [calibrationDetectStatus, setCalibrationDetectStatus] = useState('');
  const [autoTracePreview, setAutoTracePreview] = useState<AutoTracePreview>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const {
    fileInputRef,
    handleFileChange,
    triggerFileUpload,
    isPdf,
    pdfPageCount,
    currentPdfPage,
    loadPdfPage,
    error,
    isLoading,
    clearError
  } = useImageLoader();
  const {
    projectInputRef,
    loadProjectBytes,
    handleProjectFileChange,
    openProject,
    saveProject,
    isProjectBusy,
    projectError,
    clearProjectError
  } = useProjectFiles();
  useRecovery(loadProjectBytes);
  const displayError = error ?? projectError;

  useEffect(() => {
    const blockWheelDefault = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-wheel-lock="true"]')) {
        event.preventDefault();
      }
    };

    document.addEventListener('wheel', blockWheelDefault, {
      capture: true,
      passive: false
    });

    return () => {
      document.removeEventListener('wheel', blockWheelDefault, {
        capture: true
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    setAutoTracePreview(null);
  }, [imageData.src]);

  useEffect(() => {
    if (currentStep !== 'calibration') {
      setIsCalibrationBoxMode(false);
      setCalibrationDetectStatus('');
    }
  }, [currentStep]);

  const handleReset = () => {
    if (!isDirty || window.confirm('存在未保存修改，确定要重置所有内容吗？')) {
      resetApp();
      setZoomScale('fit');
      setIsRegionZoomMode(false);
    }
  };

  const resetZoom = () => {
    setZoomScale('fit');
    setIsRegionZoomMode(false);
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    });
  };

  const handleRegionZoom = (region: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  }) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !imageData.naturalWidth || !imageData.naturalHeight) return;

    const viewportWidth = Math.max(1, scrollContainer.clientWidth - 96);
    const viewportHeight = Math.max(1, scrollContainer.clientHeight - 96);
    const selectedNaturalWidth = Math.max(
      1,
      imageData.naturalWidth * (region.widthPct / 100)
    );
    const selectedNaturalHeight = Math.max(
      1,
      imageData.naturalHeight * (region.heightPct / 100)
    );
    const nextScale = Math.max(
      1,
      Math.min(
        8,
        Math.min(
          viewportWidth / selectedNaturalWidth,
          viewportHeight / selectedNaturalHeight
        )
      )
    );

    setZoomScale(nextScale);
    setIsRegionZoomMode(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nextWidth = imageData.naturalWidth * nextScale;
        const nextHeight = imageData.naturalHeight * nextScale;
        scrollContainer.scrollTo({
          left: Math.max(
            0,
            nextWidth * (region.leftPct / 100) - scrollContainer.clientWidth * 0.12
          ),
          top: Math.max(
            0,
            nextHeight * (region.topPct / 100) - scrollContainer.clientHeight * 0.12
          ),
          behavior: 'smooth'
        });
      });
    });
  };

  const handleCalibrationBoxDetect = async (region: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  }) => {
    if (!imageData.src) return;

    setCalibrationDetectStatus('正在识别框内坐标轴...');
    try {
      const detected = await detectCalibrationLinesFromRegion(imageData.src, region);
      setCalibrationLine('x1', detected.x1);
      setCalibrationLine('x2', detected.x2);
      setCalibrationLine('y1', detected.y1);
      setCalibrationLine('y2', detected.y2);
      setCalibrationDetectStatus('已识别坐标轴，可拖动或滚轮微调');
      setIsCalibrationBoxMode(false);
    } catch (error) {
      console.error('Failed to detect calibration lines:', error);
      setCalibrationDetectStatus('识别失败，请缩小框选范围后重试');
    }
  };

  const zoomLabel =
    zoomScale === 'fit' ? 'Fit' : `${Math.round(zoomScale * 100)}%`;

  return (
    <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden">
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,.pdf"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        type="file"
        ref={projectInputRef}
        accept=".plotdigitizer"
        onChange={handleProjectFileChange}
        className="hidden"
      />

      {displayError && (
        <div className="bg-red-50 border-b border-red-200 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <span className="text-sm text-red-700">{displayError}</span>
          </div>
          <button
            onClick={() => {
              clearError();
              clearProjectError();
            }}
            className="text-red-500 hover:text-red-700"
          >
            <XCircle size={16} />
          </button>
        </div>
      )}

      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm z-20 shrink-0 h-16">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-lg text-white shadow-md">
            <Crosshair size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              PlotDigitizer
            </h1>
            <p className="text-xs text-slate-500">图表数据提取工具</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void openProject()}
            disabled={isProjectBusy}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title="打开 .plotdigitizer 项目"
          >
            <FolderOpen size={15} />
            打开项目
          </button>
          <button
            type="button"
            onClick={() => void saveProject()}
            disabled={!sourceFile || isProjectBusy}
            className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
            title="保存自包含项目"
          >
            <Save size={15} />
            保存项目
          </button>
        </div>

        {(isLoading || isProjectBusy) && (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader size={16} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        )}

        {imageData.src && !isLoading && (
          <div className="flex items-center bg-slate-100 rounded-full p-1 border border-slate-200">
            <div
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                currentStep === 'calibration'
                  ? 'bg-white shadow text-indigo-600'
                  : 'text-slate-400'
              }`}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current text-white text-[10px]">
                1
              </span>
              校准坐标
            </div>
            <ChevronRight size={14} className="text-slate-300 mx-1" />
            <div
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                currentStep === 'digitizing'
                  ? 'bg-white shadow text-green-600'
                  : 'text-slate-400'
              }`}
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current text-white text-[10px]">
                2
              </span>
              采集数据
            </div>
          </div>
        )}

        {imageData.src && !isLoading && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35"
              title="恢复 (Ctrl+Shift+Z)"
            >
              <Redo2 size={16} />
            </button>
            {isDirty && <span className="ml-1 text-[11px] text-amber-600">未保存</span>}
          </div>
        )}

        {isPdf && imageData.src && !isLoading && (
          <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-1.5 border border-slate-200">
            <button
              onClick={() => currentPdfPage > 1 && loadPdfPage(currentPdfPage - 1)}
              disabled={currentPdfPage <= 1}
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} className="rotate-180" />
            </button>
            <span className="text-sm font-medium">
              {currentPdfPage} / {pdfPageCount}
            </span>
            <button
              onClick={() => currentPdfPage < pdfPageCount && loadPdfPage(currentPdfPage + 1)}
              disabled={currentPdfPage >= pdfPageCount}
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          {!imageData.src ? (
            <button
              onClick={triggerFileUpload}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg shadow-md hover:shadow-lg font-medium text-sm transition-all active:scale-[0.98]"
            >
              {isLoading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
              {isLoading ? '处理中...' : '导入图片/PDF'}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={triggerFileUpload}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-md transition-colors text-xs font-semibold"
              >
                <RefreshCw size={14} />
                换图
              </button>
              <button
                onClick={handleReset}
                disabled={isLoading}
                className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-md transition-colors text-xs font-medium"
              >
                <RotateCcw size={14} />
                重置
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-slate-200/60 relative overflow-hidden flex flex-col">
          <div ref={scrollContainerRef} className="flex-1 relative overflow-auto select-none">
            <div
              className={`min-w-full min-h-full flex p-8 ${
                zoomScale === 'fit'
                  ? 'items-center justify-center'
                  : 'items-start justify-start'
              }`}
            >
            {isLoading ? (
              <div className="text-center p-12">
                <Loader className="h-12 w-12 text-indigo-500 mx-auto mb-4 animate-spin" />
                <p className="text-slate-500">正在处理文件...</p>
              </div>
            ) : !imageData.src ? (
              <div className="text-center p-12 border-4 border-dashed border-slate-300 rounded-2xl bg-slate-100/50 max-w-lg">
                <ImageIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-700 mb-2">
                  请先导入图片或 PDF
                </h3>
                <p className="text-slate-500 mb-6">点击右上角按钮开始</p>
                <p className="text-xs text-slate-400">
                  支持 PNG, JPG, BMP, PDF 等格式
                </p>
              </div>
            ) : (
              <MainCanvas
                zoomScale={zoomScale}
                isRegionZoomMode={isRegionZoomMode}
                onRegionZoom={handleRegionZoom}
                autoTracePreview={autoTracePreview}
                isCalibrationBoxMode={isCalibrationBoxMode}
                onCalibrationBoxDetect={handleCalibrationBoxDetect}
              />
            )}
            </div>
          </div>

          <div className="h-8 bg-white border-t border-slate-200 flex items-center justify-between px-4 text-xs text-slate-500 select-none">
            <span className="flex items-center gap-2">
              {imageData.src &&
                (currentStep === 'calibration' ? (
                  <span className="text-orange-500 flex items-center gap-1">
                    <AlertCircle size={12} />
                    请先完成校准
                  </span>
                ) : (
                  <span className="text-green-600 flex items-center gap-1">
                    <CheckCircle size={12} />
                    双击图片采集当前模式的数据
                  </span>
                ))}
            </span>
            {imageData.name && (
              <span className="truncate max-w-md">{imageData.name}</span>
            )}
            {imageData.src && (
              <div className="flex items-center gap-1">
                <button
                  onClick={resetZoom}
                  className="p-1 rounded hover:bg-slate-100 text-slate-500"
                  title="适应窗口"
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  onClick={() => setIsRegionZoomMode((value) => !value)}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-bold ${
                    isRegionZoomMode
                      ? 'bg-indigo-600 text-white'
                      : 'hover:bg-slate-100 text-slate-500'
                  }`}
                  title="框选局部放大"
                >
                  <ZoomIn size={13} />
                  框选放大
                </button>
                <span className="ml-2 min-w-[68px] text-right">
                  Zoom: {zoomLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {imageData.src && !isLoading && (
          <div className="w-[400px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-xl relative transition-all duration-300">
            {currentStep === 'calibration' ? (
              <CalibrationPanel
                isBoxDetectMode={isCalibrationBoxMode}
                detectStatus={calibrationDetectStatus}
                onToggleBoxDetect={() =>
                  setIsCalibrationBoxMode((value) => !value)
                }
              />
            ) : (
              <DigitizingPanel
                onJumpToPage={loadPdfPage}
                onAutoTracePreviewChange={setAutoTracePreview}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
