import { AxisScale, CalibrationLines, CalibrationValues, LogInputMode } from '../types';

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

function safePositive(value: number) {
  return value > 0 ? value : 1e-9;
}

function usesExponentTicks(axis: AxisTransformConfig) {
  return isLogScale(axis.scale) && axis.logInputMode === 'exponent';
}

function normalizeFormula(formula: string) {
  let expression = formula;

  while (expression.includes('^')) {
    const powerIndex = expression.indexOf('^');
    const left = readPowerOperand(expression, powerIndex - 1, -1);
    const right = readPowerOperand(expression, powerIndex + 1, 1);

    if (!left || !right) break;

    expression =
      expression.slice(0, left.start) +
      `pow(${left.value}, ${right.value})` +
      expression.slice(right.end + 1);
  }

  return expression;
}

function readPowerOperand(
  expression: string,
  startIndex: number,
  direction: 1 | -1
) {
  let index = startIndex;
  while (/\s/.test(expression[index] ?? '')) {
    index += direction;
  }

  if (expression[index] === (direction === -1 ? ')' : '(')) {
    let depth = 0;
    const open = direction === -1 ? '(' : ')';
    const close = direction === -1 ? ')' : '(';
    let cursor = index;

    while (cursor >= 0 && cursor < expression.length) {
      if (expression[cursor] === close) depth += 1;
      if (expression[cursor] === open) depth -= 1;
      if (depth === 0) {
        const start = Math.min(cursor, index);
        const end = Math.max(cursor, index);
        return {
          start,
          end,
          value: expression.slice(start, end + 1)
        };
      }
      cursor += direction;
    }

    return null;
  }

  const tokenPattern = /[A-Za-z0-9_.-]/;
  let cursor = index;
  while (
    cursor >= 0 &&
    cursor < expression.length &&
    tokenPattern.test(expression[cursor])
  ) {
    cursor += direction;
  }

  const start = direction === -1 ? cursor + 1 : index;
  const end = direction === -1 ? index : cursor - 1;
  const value = expression.slice(start, end + 1);
  return value ? { start, end, value } : null;
}

function evaluateCustomFormula(
  formula: string | undefined,
  t: number,
  value1: number,
  value2: number
) {
  if (!formula?.trim()) {
    return value1 + t * (value2 - value1);
  }

  try {
    const expression = normalizeFormula(formula);
    const fn = new Function(
      't',
      'v1',
      'v2',
      'min',
      'max',
      'start',
      'end',
      'Math',
      'log10',
      'ln',
      'log',
      'exp',
      'pow',
      'sqrt',
      'abs',
      `"use strict"; return (${expression});`
    );
    const result = Number(
      fn(
        t,
        value1,
        value2,
        Math.min(value1, value2),
        Math.max(value1, value2),
        value1,
        value2,
        Math,
        Math.log10,
        Math.log,
        Math.log,
        Math.exp,
        Math.pow,
        Math.sqrt,
        Math.abs
      )
    );
    return Number.isFinite(result) ? result : value1 + t * (value2 - value1);
  } catch {
    return value1 + t * (value2 - value1);
  }
}

export function interpolateAxisValue(
  ratio: number,
  axis: AxisTransformConfig,
  value1: number,
  value2: number
) {
  if (axis.scale === 'custom') {
    return evaluateCustomFormula(axis.formula, ratio, value1, value2);
  }

  if (isLogScale(axis.scale)) {
    if (usesExponentTicks(axis)) {
      const exponent = value1 + ratio * (value2 - value1);
      return axis.scale === 'ln' ? Math.exp(exponent) : Math.pow(10, exponent);
    }

    const safeValue1 = safePositive(value1);
    const safeValue2 = safePositive(value2);
    const logValue =
      Math.log(safeValue1) + ratio * (Math.log(safeValue2) - Math.log(safeValue1));
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
    if (usesExponentTicks(axis)) {
      const exponent =
        axis.scale === 'ln'
          ? Math.log(safePositive(value))
          : Math.log10(safePositive(value));
      return (exponent - value1) / (value2 - value1);
    }

    const safeValue = safePositive(value);
    const safeValue1 = safePositive(value1);
    const safeValue2 = safePositive(value2);
    return (
      (Math.log(safeValue) - Math.log(safeValue1)) /
      (Math.log(safeValue2) - Math.log(safeValue1))
    );
  }

  return (value - value1) / (value2 - value1);
}

function solveCustomAxisRatio(
  target: number,
  formula: string | undefined,
  value1: number,
  value2: number
) {
  const f0 = evaluateCustomFormula(formula, 0, value1, value2);
  const f1 = evaluateCustomFormula(formula, 1, value1, value2);
  const increasing = f1 >= f0;
  let low = 0;
  let high = 1;

  for (let index = 0; index < 50; index += 1) {
    const mid = (low + high) / 2;
    const value = evaluateCustomFormula(formula, mid, value1, value2);
    if ((increasing && value < target) || (!increasing && value > target)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

export function calculateRealValue({
  screenX,
  screenY,
  calibrationLines,
  calibrationValues,
  axisScales,
  axisFormulas,
  axisLogInputModes
}: CalculateRealValueParams): { realX: number; realY: number } {
  // X Calculation
  const xRatio = (screenX - calibrationLines.x1) / (calibrationLines.x2 - calibrationLines.x1);
  const realX = interpolateAxisValue(
    xRatio,
    {
      scale: axisScales.x,
      formula: axisFormulas?.x,
      logInputMode: axisLogInputModes?.x
    },
    calibrationValues.x1,
    calibrationValues.x2
  );

  // Y Calculation
  const yRatio = (screenY - calibrationLines.y1) / (calibrationLines.y2 - calibrationLines.y1);
  const realY = interpolateAxisValue(
    yRatio,
    {
      scale: axisScales.y,
      formula: axisFormulas?.y,
      logInputMode: axisLogInputModes?.y
    },
    calibrationValues.y1,
    calibrationValues.y2
  );

  return { realX, realY };
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
  const xRatio = resolveAxisRatio(
    realX,
    {
      scale: axisScales.x,
      formula: axisFormulas?.x,
      logInputMode: axisLogInputModes?.x
    },
    calibrationValues.x1,
    calibrationValues.x2
  );
  const yRatio = resolveAxisRatio(
    realY,
    {
      scale: axisScales.y,
      formula: axisFormulas?.y,
      logInputMode: axisLogInputModes?.y
    },
    calibrationValues.y1,
    calibrationValues.y2
  );

  return {
    screenX:
      calibrationLines.x1 +
      xRatio * (calibrationLines.x2 - calibrationLines.x1),
    screenY:
      calibrationLines.y1 +
      yRatio * (calibrationLines.y2 - calibrationLines.y1)
  };
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
