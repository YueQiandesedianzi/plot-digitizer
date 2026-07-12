import { useMemo, useState } from 'react';
import type { MouseEvent, WheelEvent } from 'react';
import { useAppStore } from '../../store/appStore';
import { useCalibration } from '../../hooks/useCalibration';
import { useCanvasInteraction } from '../../hooks/useCanvasInteraction';
import { useImageLoader } from '../../hooks/useImageLoader';
import { formatNumber } from '../../utils/coordinate';
import { generateInterpolatedPoints } from '../../utils/interpolation';
import type { TracePoint } from '../../utils/autoTrace';

interface MainCanvasProps {
  className?: string;
  zoomScale?: number | 'fit';
  isRegionZoomMode?: boolean;
  onRegionZoom?: (region: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  }) => void;
  isCalibrationBoxMode?: boolean;
  onCalibrationBoxDetect?: (region: {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
  }) => void | Promise<void>;
  autoTracePreview?: {
    curveId: string;
    color: string;
    points: TracePoint[];
    previewPoints: TracePoint[];
  } | null;
}

type SelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
} | null;

export function MainCanvas({
  className = '',
  zoomScale = 'fit',
  isRegionZoomMode = false,
  onRegionZoom,
  isCalibrationBoxMode = false,
  onCalibrationBoxDetect,
  autoTracePreview
}: MainCanvasProps) {
  const {
    imageData,
    dataPoints,
    curves,
    activeCurveId,
    currentStep,
    collectionMode,
    axisConfig,
    calibrationValues,
    showCoordinateGuide,
    showMagnifierDataOverlay
  } = useAppStore();
  const { handleImageLoad } = useImageLoader();
  const {
    calibrationLines,
    setCalibrationLine,
    draggingLine,
    getRealCoordinates,
    handleMouseDown,
    handleMouseMove: handleCalibrationMove,
    handleMouseUp
  } = useCalibration();
  const {
    containerRef,
    magnifier,
    handleMouseMove: handleInteractionMove,
    handleMouseLeave,
    handleDoubleClick
  } = useCanvasInteraction();
  const [selectionBox, setSelectionBox] = useState<SelectionBox>(null);

  const interpolatedCurves = useMemo(
    () =>
      curves.map((curve) => ({
        curve,
        points: generateInterpolatedPoints(
          curve,
          axisConfig,
          calibrationLines,
          calibrationValues
        )
      })),
    [axisConfig, calibrationLines, calibrationValues, curves]
  );

  const combinedMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (selectionBox && (isRegionZoomMode || isCalibrationBoxMode)) {
      const point = getPointerPercent(e);
      setSelectionBox((prev) =>
        prev
          ? {
              ...prev,
              currentX: point.x,
              currentY: point.y
            }
          : prev
      );
      return;
    }
    handleCalibrationMove(e);
    if (!isCalibrationBoxMode) {
      handleInteractionMove(e);
    }
  };

  const handleCanvasMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (
      (!isRegionZoomMode || !onRegionZoom) &&
      (!isCalibrationBoxMode || !onCalibrationBoxDetect)
    ) {
      return;
    }
    e.preventDefault();
    const point = getPointerPercent(e);
    setSelectionBox({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y
    });
  };

  const handleCanvasMouseUp = () => {
    if (selectionBox && isCalibrationBoxMode && onCalibrationBoxDetect) {
      const leftPct = Math.min(selectionBox.startX, selectionBox.currentX);
      const topPct = Math.min(selectionBox.startY, selectionBox.currentY);
      const widthPct = Math.abs(selectionBox.currentX - selectionBox.startX);
      const heightPct = Math.abs(selectionBox.currentY - selectionBox.startY);
      setSelectionBox(null);

      if (widthPct >= 3 && heightPct >= 3) {
        void onCalibrationBoxDetect({ leftPct, topPct, widthPct, heightPct });
      }
      return;
    }

    if (selectionBox && isRegionZoomMode && onRegionZoom) {
      const leftPct = Math.min(selectionBox.startX, selectionBox.currentX);
      const topPct = Math.min(selectionBox.startY, selectionBox.currentY);
      const widthPct = Math.abs(selectionBox.currentX - selectionBox.startX);
      const heightPct = Math.abs(selectionBox.currentY - selectionBox.startY);
      setSelectionBox(null);

      if (widthPct >= 3 && heightPct >= 3) {
        onRegionZoom({ leftPct, topPct, widthPct, heightPct });
      }
      return;
    }

    handleMouseUp();
  };

  const handleCanvasMouseLeave = () => {
    setSelectionBox(null);
    handleMouseLeave();
  };

  const handleCanvasDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isRegionZoomMode) return;
    handleDoubleClick(e);
  };

  const getPointerPercent = (e: MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    };
  };

  const handleCalibrationLineWheel = (
    e: WheelEvent<HTMLDivElement>,
    key: keyof typeof calibrationLines
  ) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const direction = e.deltaY > 0 ? 1 : -1;
    const step = e.altKey ? 0.03 : 0.15;
    setCalibrationLine(
      key,
      Math.max(0, Math.min(100, calibrationLines[key] + direction * step))
    );
  };

  if (!imageData.src) {
    return null;
  }

  const isFitZoom = zoomScale === 'fit';
  const imageStyle = isFitZoom
    ? undefined
    : {
        width: `${imageData.naturalWidth * zoomScale}px`,
        maxWidth: 'none',
        maxHeight: 'none'
      };
  const toMagnifierPosition = (point: { screenX: number; screenY: number }) => ({
    left: 96 + ((point.screenX - magnifier.pctX) / 100) * magnifier.width * 3,
    top: 96 + ((point.screenY - magnifier.pctY) / 100) * magnifier.height * 3
  });

  return (
    <div
      ref={containerRef}
      className={`relative shadow-2xl bg-white ring-1 ring-slate-900/5 ${
        isRegionZoomMode || isCalibrationBoxMode
          ? 'cursor-zoom-in'
          : currentStep === 'digitizing'
          ? 'cursor-crosshair'
          : 'cursor-default'
      } ${className}`}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={combinedMouseMove}
      onMouseLeave={handleCanvasMouseLeave}
      onMouseUp={handleCanvasMouseUp}
      onDoubleClick={handleCanvasDoubleClick}
    >
      <img
        src={imageData.src}
        alt="Chart"
        className={`block object-contain pointer-events-none ${
          isFitZoom ? 'max-w-full max-h-[calc(100vh-160px)]' : ''
        }`}
        style={imageStyle}
        onLoad={handleImageLoad}
      />

      {currentStep === 'calibration' && (
        <>
          <div
            data-wheel-lock="true"
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 hover:bg-blue-600 z-10 group cursor-col-resize shadow-[0_0_8px_rgba(59,130,246,0.6)]"
            style={{ left: `${calibrationLines.x1}%` }}
            onMouseDown={(e) =>
              !isRegionZoomMode && !isCalibrationBoxMode && handleMouseDown(e, 'x1')
            }
            onWheelCapture={(e) => handleCalibrationLineWheel(e, 'x1')}
          >
            <div className="absolute top-2 -left-3 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">
              X1
            </div>
          </div>

          <div
            data-wheel-lock="true"
            className="absolute top-0 bottom-0 w-0.5 bg-blue-500 hover:bg-blue-600 z-10 group cursor-col-resize shadow-[0_0_8px_rgba(59,130,246,0.6)]"
            style={{ left: `${calibrationLines.x2}%` }}
            onMouseDown={(e) =>
              !isRegionZoomMode && !isCalibrationBoxMode && handleMouseDown(e, 'x2')
            }
            onWheelCapture={(e) => handleCalibrationLineWheel(e, 'x2')}
          >
            <div className="absolute top-2 -left-3 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">
              X2
            </div>
          </div>

          <div
            data-wheel-lock="true"
            className="absolute left-0 right-0 h-0.5 bg-red-500 hover:bg-red-600 z-10 group cursor-row-resize shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            style={{ top: `${calibrationLines.y1}%` }}
            onMouseDown={(e) =>
              !isRegionZoomMode && !isCalibrationBoxMode && handleMouseDown(e, 'y1')
            }
            onWheelCapture={(e) => handleCalibrationLineWheel(e, 'y1')}
          >
            <div className="absolute left-2 -top-6 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">
              Y1
            </div>
          </div>

          <div
            data-wheel-lock="true"
            className="absolute left-0 right-0 h-0.5 bg-red-500 hover:bg-red-600 z-10 group cursor-row-resize shadow-[0_0_8px_rgba(239,68,68,0.6)]"
            style={{ top: `${calibrationLines.y2}%` }}
            onMouseDown={(e) =>
              !isRegionZoomMode && !isCalibrationBoxMode && handleMouseDown(e, 'y2')
            }
            onWheelCapture={(e) => handleCalibrationLineWheel(e, 'y2')}
          >
            <div className="absolute left-2 -top-6 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">
              Y2
            </div>
          </div>
        </>
      )}

      {currentStep === 'digitizing' && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {interpolatedCurves.map(({ curve, points }) => {
            if (!curve.visible || points.length < 2) return null;
            const path = points
              .map((point, index) =>
                `${index === 0 ? 'M' : 'L'} ${point.screenX} ${point.screenY}`
              )
              .join(' ');

            return (
              <path
                key={curve.id}
                d={path}
                fill="none"
                stroke={curve.color}
                strokeWidth={curve.id === activeCurveId ? 0.7 : 0.45}
                opacity={curve.id === activeCurveId ? 0.95 : 0.45}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
      )}

      {autoTracePreview && currentStep === 'digitizing' && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {autoTracePreview.previewPoints.map((point, index) => (
            <circle
              key={`trace-mask-${index}`}
              cx={point.screenX}
              cy={point.screenY}
              r={0.16}
              fill={autoTracePreview.color}
              opacity={0.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {autoTracePreview.points.length >= 2 && (
            <path
              d={autoTracePreview.points
                .map(
                  (point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${point.screenX} ${point.screenY}`
                )
                .join(' ')}
              fill="none"
              stroke={autoTracePreview.color}
              strokeDasharray="1.2 0.8"
              strokeWidth={0.85}
              opacity={0.95}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}

      {dataPoints.map((point, index) =>
        point.visible === false ? null : (
        <div
          key={point.id}
          className={`absolute w-3 h-3 bg-green-500 border-2 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center ${
            point.qualityFlags?.includes('outside-calibration')
              ? 'border-amber-400 ring-2 ring-amber-300'
              : 'border-white'
          }`}
          style={{ left: `${point.screenX}%`, top: `${point.screenY}%` }}
        >
          {currentStep === 'digitizing' && collectionMode === 'point' && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
              {index + 1}
            </div>
          )}
        </div>
        )
      )}

      {curves.map((curve) =>
        curve.visible
          ? curve.controlPoints.map((point) => (
              <div
                key={point.id}
                className={`absolute w-3.5 h-3.5 border-2 rounded-full shadow-[0_2px_5px_rgba(0,0,0,0.3)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 ${
                  point.qualityFlags?.includes('outside-calibration')
                    ? 'border-amber-400 ring-2 ring-amber-300'
                    : curve.id === activeCurveId
                      ? 'border-white ring-2 ring-white'
                      : 'border-white opacity-70'
                }`}
                style={{
                  left: `${point.screenX}%`,
                  top: `${point.screenY}%`,
                  backgroundColor: curve.color
                }}
              >
                {currentStep === 'digitizing' && collectionMode === 'curve' && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
                    {point.order}
                  </div>
                )}
              </div>
            ))
          : null
      )}

      {selectionBox && (
        <div
          className={`absolute z-50 border-2 pointer-events-none shadow-[0_0_0_9999px_rgba(15,23,42,0.18)] ${
            isCalibrationBoxMode
              ? 'border-cyan-500 bg-cyan-400/20'
              : 'border-indigo-500 bg-indigo-400/20'
          }`}
          style={{
            left: `${Math.min(selectionBox.startX, selectionBox.currentX)}%`,
            top: `${Math.min(selectionBox.startY, selectionBox.currentY)}%`,
            width: `${Math.abs(selectionBox.currentX - selectionBox.startX)}%`,
            height: `${Math.abs(selectionBox.currentY - selectionBox.startY)}%`
          }}
        >
          {isCalibrationBoxMode && (
            <div className="absolute left-2 top-2 rounded bg-cyan-600 px-2 py-1 text-[11px] font-bold text-white shadow">
              框选图区坐标轴
            </div>
          )}
        </div>
      )}

      {showCoordinateGuide && magnifier.show && currentStep === 'digitizing' && !isRegionZoomMode && (
        <>
          <div
            className="absolute top-0 bottom-0 w-px bg-cyan-500/80 pointer-events-none z-40"
            style={{ left: `${magnifier.pctX}%` }}
          />
          <div
            className="absolute left-0 right-0 h-px bg-cyan-500/80 pointer-events-none z-40"
            style={{ top: `${magnifier.pctY}%` }}
          />
          <div
            className="absolute z-50 rounded bg-slate-900/90 px-2 py-1 text-[11px] font-mono text-white shadow pointer-events-none"
            style={{
              left: `${Math.min(magnifier.pctX + 1.5, 72)}%`,
              top: `${Math.min(magnifier.pctY + 1.5, 88)}%`
            }}
          >
            {(() => {
              const result = getRealCoordinates(magnifier.pctX, magnifier.pctY);
              if (!result.ok) return '校准无效';
              return `${axisConfig.x.label || 'X'}: ${formatNumber(
                result.realX,
                axisConfig.x.scale,
                4
              )}  ${axisConfig.y.label || 'Y'}: ${formatNumber(
                result.realY,
                axisConfig.y.scale,
                4
              )}`;
            })()}
          </div>
        </>
      )}

      {magnifier.show &&
        !draggingLine &&
        !isRegionZoomMode &&
        !isCalibrationBoxMode &&
        !showCoordinateGuide && (
        <div
          className="absolute z-50 w-48 h-48 rounded-full border-[3px] border-white shadow-[0_4px_20px_rgba(0,0,0,0.4)] bg-white overflow-hidden pointer-events-none"
          style={{
            left: magnifier.x + 20,
            top: magnifier.y + 20
          }}
        >
          <div
            className="w-full h-full relative"
            style={{
              backgroundImage: `url(${imageData.src})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${magnifier.width * 3}px ${magnifier.height * 3}px`,
              backgroundPosition: `-${
                (magnifier.pctX / 100) * magnifier.width * 3 - 96
              }px -${(magnifier.pctY / 100) * magnifier.height * 3 - 96}px`
            }}
          >
            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-500/60"></div>
            <div className="absolute left-1/2 top-0 h-full w-[1px] bg-red-500/60"></div>
            {showMagnifierDataOverlay && (
              <>
                {interpolatedCurves.map(({ curve, points }) => {
                  if (!curve.visible || points.length === 0) return null;
                  const sampleStep = Math.max(1, Math.ceil(points.length / 80));
                  return points.map((point, index) => {
                    if (index % sampleStep !== 0) return null;
                    const position = toMagnifierPosition(point);
                    if (
                      position.left < -8 ||
                      position.left > 200 ||
                      position.top < -8 ||
                      position.top > 200
                    ) {
                      return null;
                    }
                    return (
                      <span
                        key={`${curve.id}-${point.id}`}
                        className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white"
                        style={{
                          left: position.left,
                          top: position.top,
                          backgroundColor: curve.color
                        }}
                      />
                    );
                  });
                })}
                {dataPoints.map((point) => {
                  if (point.visible === false) return null;
                  const position = toMagnifierPosition(point);
                  if (
                    position.left < -10 ||
                    position.left > 202 ||
                    position.top < -10 ||
                    position.top > 202
                  ) {
                    return null;
                  }
                  return (
                    <span
                      key={point.id}
                      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-green-500 shadow"
                      style={{
                        left: position.left,
                        top: position.top
                      }}
                    />
                  );
                })}
              </>
            )}
          </div>
          <div className="absolute bottom-0 left-0 w-full text-center text-[10px] font-mono font-medium bg-slate-900/80 text-white py-1 backdrop-blur-sm">
            {currentStep === 'digitizing'
              ? (() => {
                  const result = getRealCoordinates(magnifier.pctX, magnifier.pctY);
                  if (!result.ok) return '校准无效';
                  return `X:${formatNumber(
                    result.realX,
                    axisConfig.x.scale,
                    4
                  )} Y:${formatNumber(result.realY, axisConfig.y.scale, 4)}`;
                })()
              : '校准中...'}
          </div>
        </div>
      )}
    </div>
  );
}
