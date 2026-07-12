import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { calculateRealValue } from '../utils/coordinate';

interface MagnifierState {
  show: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  pctX: number;
  pctY: number;
}

export function useCanvasInteraction() {
  const {
    imageData,
    calibrationLines,
    calibrationValues,
    axisConfig,
    currentStep,
    collectionMode,
    defaultSampleLabel,
    addDataPoint,
    addCurvePoint
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [magnifier, setMagnifier] = useState<MagnifierState>({
    show: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    pctX: 0,
    pctY: 0
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !imageData.src) return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const percentX = Math.max(0, Math.min(100, (clientX / rect.width) * 100));
      const percentY = Math.max(0, Math.min(100, (clientY / rect.height) * 100));

      setMagnifier({
        show: true,
        x: clientX,
        y: clientY,
        width: rect.width,
        height: rect.height,
        pctX: percentX,
        pctY: percentY
      });
    },
    [imageData]
  );

  const handleMouseLeave = useCallback(() => {
    setMagnifier((prev) => ({ ...prev, show: false }));
  }, []);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!imageData.src || !containerRef.current || currentStep !== 'digitizing') return;

      const rect = containerRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const percentX = (clientX / rect.width) * 100;
      const percentY = (clientY / rect.height) * 100;

      const result = calculateRealValue({
        screenX: percentX,
        screenY: percentY,
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
      if (!result.ok) return;

      const point = {
        screenX: percentX,
        screenY: percentY,
        realX: result.realX,
        realY: result.realY,
        label: defaultSampleLabel,
        qualityFlags: result.qualityFlags
      };

      if (collectionMode === 'curve') {
        addCurvePoint(point);
      } else {
        addDataPoint(point);
      }
    },
    [
      imageData,
      currentStep,
      collectionMode,
      calibrationLines,
      calibrationValues,
      axisConfig,
      defaultSampleLabel,
      addDataPoint,
      addCurvePoint
    ]
  );

  return {
    containerRef,
    magnifier,
    handleMouseMove,
    handleMouseLeave,
    handleDoubleClick
  };
}
