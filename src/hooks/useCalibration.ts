import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { calculateRealValue } from '../utils/coordinate';

export function useCalibration() {
  const {
    calibrationLines,
    calibrationValues,
    axisConfig,
    setCalibrationLine,
    setCalibrationValue,
    setAxisScale,
    setAxisLabel,
    setAxisFormula,
    setAxisLogInputMode
  } = useAppStore();

  const [draggingLine, setDraggingLine] = useState<string | null>(null);

  const getRealCoordinates = useCallback(
    (screenX: number, screenY: number) => {
      return calculateRealValue({
        screenX,
        screenY,
        calibrationLines,
        calibrationValues,
        axisScales: { x: axisConfig.x.scale, y: axisConfig.y.scale },
        axisFormulas: { x: axisConfig.x.formula, y: axisConfig.y.formula },
        axisLogInputModes: {
          x: axisConfig.x.logInputMode,
          y: axisConfig.y.logInputMode
        }
      });
    },
    [calibrationLines, calibrationValues, axisConfig]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, lineKey: string) => {
      e.stopPropagation();
      setDraggingLine(lineKey);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!draggingLine) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      const percentX = Math.max(0, Math.min(100, (clientX / rect.width) * 100));
      const percentY = Math.max(0, Math.min(100, (clientY / rect.height) * 100));

      if (draggingLine.startsWith('x')) {
        setCalibrationLine(draggingLine as any, percentX);
      } else {
        setCalibrationLine(draggingLine as any, percentY);
      }
    },
    [draggingLine, setCalibrationLine]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingLine(null);
  }, []);

  return {
    calibrationLines,
    calibrationValues,
    axisConfig,
    setCalibrationLine,
    setCalibrationValue,
    setAxisScale,
    setAxisLabel,
    setAxisFormula,
    setAxisLogInputMode,
    draggingLine,
    getRealCoordinates,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  };
}
