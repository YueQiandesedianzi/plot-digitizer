import type {
  AxisConfig,
  AxisScale,
  CalibrationIssue,
  CalibrationLines,
  CalibrationValues,
  CoordinateResult,
  ImageData,
  LogInputMode
} from '../types';
import { getPointQualityFlags, validateCalibration } from '../domain/calibration';
import { evaluateAxisFormula } from './formula';

export interface AxisTransformConfig {
  scale: AxisScale;
  formula?: string;
  logInputMode?: LogInputMode;
}

export interface CalculateRealValueParams {
  screenX: number;
  screenY: number;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisScales: { x: AxisScale; y: AxisScale };
  axisFormulas?: { x?: string; y?: string };
  axisLogInputModes?: { x?: LogInputMode; y?: LogInputMode };
  imageData?: Pick<ImageData, 'naturalWidth' | 'naturalHeight'>;
}

export interface CalculateScreenValueParams {
  realX: number;
  realY: number;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisScales: { x: AxisScale; y: AxisScale };
  axisFormulas?: { x?: string; y?: string };
  axisLogInputModes?: { x?: LogInputMode; y?: LogInputMode };
}

export function isLogScale(scale: AxisScale): boolean {
  return scale === 'log' || scale === 'log10' || scale === 'ln';
}

function usesExponentTicks(axis: AxisTransformConfig) {
  return isLogScale(axis.scale) && axis.logInputMode === 'exponent';
}

export function interpolateAxisValue(
  ratio: number,
  axis: AxisTransformConfig,
  value1: number,
  value2: number
) {
  if (axis.scale === 'custom') {
    if (!axis.formula?.trim()) throw new Error('自定义公式不能为空');
    return evaluateAxisFormula(axis.formula, { t: ratio, v1: value1, v2: value2 });
  }

  if (isLogScale(axis.scale)) {
    if (usesExponentTicks(axis)) {
      const exponent = value1 + ratio * (value2 - value1);
      return axis.scale === 'ln' ? Math.exp(exponent) : Math.pow(10, exponent);
    }

    if (value1 <= 0 || value2 <= 0) {
      throw new RangeError('对数轴真实数必须大于 0');
    }
    const logValue = Math.log(value1) + ratio * (Math.log(value2) - Math.log(value1));
    return Math.exp(logValue);
  }

  return value1 + ratio * (value2 - value1);
}

export function resolveAxisRatio(
  value: number,
  axis: AxisTransformConfig,
  value1: number,
  value2: number
) {
  if (axis.scale === 'custom') {
    return solveCustomAxisRatio(value, axis.formula, value1, value2);
  }

  if (isLogScale(axis.scale)) {
    if (value <= 0) throw new RangeError('对数轴坐标必须大于 0');
    if (usesExponentTicks(axis)) {
      const exponent = axis.scale === 'ln' ? Math.log(value) : Math.log10(value);
      return (exponent - value1) / (value2 - value1);
    }

    if (value1 <= 0 || value2 <= 0) {
      throw new RangeError('对数轴真实数必须大于 0');
    }
    return (Math.log(value) - Math.log(value1)) / (Math.log(value2) - Math.log(value1));
  }

  return (value - value1) / (value2 - value1);
}

function solveCustomAxisRatio(
  target: number,
  formula: string | undefined,
  value1: number,
  value2: number
) {
  if (!formula?.trim()) throw new Error('自定义公式不能为空');
  const f0 = evaluateAxisFormula(formula, { t: 0, v1: value1, v2: value2 });
  const f1 = evaluateAxisFormula(formula, { t: 1, v1: value1, v2: value2 });
  const increasing = f1 > f0;
  let low = 0;
  let high = 1;

  for (let index = 0; index < 60; index += 1) {
    const mid = (low + high) / 2;
    const evaluated = evaluateAxisFormula(formula, { t: mid, v1: value1, v2: value2 });
    if ((increasing && evaluated < target) || (!increasing && evaluated > target)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

function toAxisConfig(
  axisScales: CalculateRealValueParams['axisScales'],
  axisFormulas: CalculateRealValueParams['axisFormulas'],
  axisLogInputModes: CalculateRealValueParams['axisLogInputModes']
): { x: AxisConfig; y: AxisConfig } {
  return {
    x: {
      label: '',
      scale: axisScales.x,
      formula: axisFormulas?.x,
      logInputMode: axisLogInputModes?.x
    },
    y: {
      label: '',
      scale: axisScales.y,
      formula: axisFormulas?.y,
      logInputMode: axisLogInputModes?.y
    }
  };
}

export function calculateRealValue({
  screenX,
  screenY,
  calibrationLines,
  calibrationValues,
  axisScales,
  axisFormulas,
  axisLogInputModes,
  imageData
}: CalculateRealValueParams): CoordinateResult {
  const axisConfig = toAxisConfig(axisScales, axisFormulas, axisLogInputModes);
  const validation = validateCalibration({
    calibrationLines,
    calibrationValues,
    axisConfig,
    imageData
  });
  const errors = validation.issues.filter((issue) => issue.severity === 'error');
  if (errors.length > 0) return { ok: false, issues: errors };

  const xRatio =
    (screenX - calibrationLines.x1) / (calibrationLines.x2 - calibrationLines.x1);
  const yRatio =
    (screenY - calibrationLines.y1) / (calibrationLines.y2 - calibrationLines.y1);
  const realX = interpolateAxisValue(
    xRatio,
    axisConfig.x,
    calibrationValues.x1,
    calibrationValues.x2
  );
  const realY = interpolateAxisValue(
    yRatio,
    axisConfig.y,
    calibrationValues.y1,
    calibrationValues.y2
  );

  const issues: CalibrationIssue[] = [];
  if (!Number.isFinite(realX)) {
    issues.push({
      axis: 'x',
      severity: 'error',
      code: 'non-finite-result',
      message: 'X 轴坐标换算产生了非有限值'
    });
  }
  if (!Number.isFinite(realY)) {
    issues.push({
      axis: 'y',
      severity: 'error',
      code: 'non-finite-result',
      message: 'Y 轴坐标换算产生了非有限值'
    });
  }
  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    realX,
    realY,
    qualityFlags: getPointQualityFlags(screenX, screenY, calibrationLines)
  };
}

export function calculateScreenValue({
  realX,
  realY,
  calibrationLines,
  calibrationValues,
  axisScales,
  axisFormulas,
  axisLogInputModes
}: CalculateScreenValueParams): { screenX: number; screenY: number } {
  const axisConfig = toAxisConfig(axisScales, axisFormulas, axisLogInputModes);
  const xRatio = resolveAxisRatio(
    realX,
    axisConfig.x,
    calibrationValues.x1,
    calibrationValues.x2
  );
  const yRatio = resolveAxisRatio(
    realY,
    axisConfig.y,
    calibrationValues.y1,
    calibrationValues.y2
  );
  const screenX =
    calibrationLines.x1 + xRatio * (calibrationLines.x2 - calibrationLines.x1);
  const screenY =
    calibrationLines.y1 + yRatio * (calibrationLines.y2 - calibrationLines.y1);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    throw new RangeError('坐标反算产生了非有限值');
  }
  return { screenX, screenY };
}

export function formatNumber(
  value: number,
  scale: AxisScale,
  precision: number = 4
): string {
  if (isLogScale(scale)) {
    return value.toPrecision(precision);
  }
  return value.toFixed(precision);
}
