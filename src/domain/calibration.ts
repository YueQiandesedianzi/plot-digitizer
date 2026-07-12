import type {
  AxisConfig,
  CalibrationIssue,
  CalibrationLines,
  CalibrationValidationResult,
  CalibrationValues,
  ImageData,
  PointQualityFlag
} from '../types';
import { compileAxisFormula, evaluateAxisFormula, FormulaSyntaxError } from '../utils/formula';

interface ValidateCalibrationParams {
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  imageData?: Pick<ImageData, 'naturalWidth' | 'naturalHeight'>;
}

const FORMULA_SAMPLE_COUNT = 101;

export function validateCalibration({
  calibrationLines,
  calibrationValues,
  axisConfig,
  imageData
}: ValidateCalibrationParams): CalibrationValidationResult {
  const issues = [
    ...validateAxis(
      'x',
      calibrationLines.x1,
      calibrationLines.x2,
      calibrationValues.x1,
      calibrationValues.x2,
      axisConfig.x,
      imageData?.naturalWidth
    ),
    ...validateAxis(
      'y',
      calibrationLines.y1,
      calibrationLines.y2,
      calibrationValues.y1,
      calibrationValues.y2,
      axisConfig.y,
      imageData?.naturalHeight
    )
  ];

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues
  };
}

export function getPointQualityFlags(
  screenX: number,
  screenY: number,
  calibrationLines: CalibrationLines
): PointQualityFlag[] {
  const minX = Math.min(calibrationLines.x1, calibrationLines.x2);
  const maxX = Math.max(calibrationLines.x1, calibrationLines.x2);
  const minY = Math.min(calibrationLines.y1, calibrationLines.y2);
  const maxY = Math.max(calibrationLines.y1, calibrationLines.y2);
  return screenX < minX || screenX > maxX || screenY < minY || screenY > maxY
    ? ['outside-calibration']
    : [];
}

function validateAxis(
  axis: 'x' | 'y',
  screen1: number,
  screen2: number,
  value1: number,
  value2: number,
  config: AxisConfig,
  imageDimension?: number
): CalibrationIssue[] {
  const issues: CalibrationIssue[] = [];
  const axisLabel = axis.toUpperCase();

  if (![screen1, screen2, value1, value2].every(Number.isFinite)) {
    issues.push({
      axis,
      severity: 'error',
      code: 'non-finite-value',
      message: `${axisLabel} 轴校准值必须是有限数字`
    });
    return issues;
  }

  if (imageDimension !== undefined) {
    if (!Number.isFinite(imageDimension) || imageDimension <= 0) {
      issues.push({
        axis,
        severity: 'error',
        code: 'image-not-ready',
        message: `${axisLabel} 轴图像尺寸尚未就绪`
      });
    } else {
      const spanPixels = (Math.abs(screen2 - screen1) / 100) * imageDimension;
      if (spanPixels < 2) {
        issues.push({
          axis,
          severity: 'error',
          code: 'screen-span-too-small',
          message: `${axisLabel} 轴两条校准线至少需要相距 2 px`
        });
      } else if (spanPixels < 10) {
        issues.push({
          axis,
          severity: 'warning',
          code: 'screen-span-low-accuracy',
          message: `${axisLabel} 轴校准跨度小于 10 px，换算误差可能被放大`
        });
      }
    }
  } else if (screen1 === screen2) {
    issues.push({
      axis,
      severity: 'error',
      code: 'screen-span-too-small',
      message: `${axisLabel} 轴两条校准线不能重合`
    });
  }

  const valueTolerance = Number.EPSILON * Math.max(1, Math.abs(value1), Math.abs(value2)) * 4;
  if (Math.abs(value2 - value1) <= valueTolerance) {
    issues.push({
      axis,
      severity: 'error',
      code: 'equal-values',
      message: `${axisLabel} 轴两个端点值不能相同`
    });
  }

  const isLog = config.scale === 'log' || config.scale === 'log10' || config.scale === 'ln';
  if (isLog && config.logInputMode !== 'exponent' && (value1 <= 0 || value2 <= 0)) {
    issues.push({
      axis,
      severity: 'error',
      code: 'log-nonpositive',
      message: `${axisLabel} 轴对数真实数必须大于 0`
    });
  }

  if (config.scale === 'custom') {
    issues.push(...validateCustomFormula(axis, config.formula, value1, value2));
  }

  return issues;
}

function validateCustomFormula(
  axis: 'x' | 'y',
  formula: string | undefined,
  value1: number,
  value2: number
): CalibrationIssue[] {
  const axisLabel = axis.toUpperCase();
  if (!formula?.trim()) {
    return [
      {
        axis,
        severity: 'error',
        code: 'formula-empty',
        message: `${axisLabel} 轴自定义公式不能为空`
      }
    ];
  }

  try {
    compileAxisFormula(formula);
  } catch (error) {
    return [
      {
        axis,
        severity: 'error',
        code: 'formula-syntax',
        message:
          error instanceof FormulaSyntaxError
            ? `${axisLabel} 轴公式错误：${error.message}`
            : `${axisLabel} 轴公式无法解析`
      }
    ];
  }

  const values = Array.from({ length: FORMULA_SAMPLE_COUNT }, (_, index) =>
    evaluateAxisFormula(formula, {
      t: index / (FORMULA_SAMPLE_COUNT - 1),
      v1: value1,
      v2: value2
    })
  );

  if (!values.every(Number.isFinite)) {
    return [
      {
        axis,
        severity: 'error',
        code: 'formula-nonfinite',
        message: `${axisLabel} 轴公式在 0–1 范围内产生了非有限值`
      }
    ];
  }

  let direction = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const tolerance =
      Number.EPSILON * Math.max(1, Math.abs(values[index]), Math.abs(values[index - 1])) * 16;
    if (Math.abs(delta) <= tolerance) {
      return [
        {
          axis,
          severity: 'error',
          code: 'formula-nonmonotonic',
          message: `${axisLabel} 轴公式必须在 0–1 范围内严格单调`
        }
      ];
    }
    const nextDirection = Math.sign(delta);
    if (direction === 0) direction = nextDirection;
    if (nextDirection !== direction) {
      return [
        {
          axis,
          severity: 'error',
          code: 'formula-nonmonotonic',
          message: `${axisLabel} 轴公式必须在 0–1 范围内保持同一方向`
        }
      ];
    }
  }

  return [];
}
