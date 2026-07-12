import {
  AxisConfig,
  CalibrationLines,
  CalibrationValues,
  CurveSeries,
  InterpolatedPoint
} from '../types';
import { calculateScreenValue, isLogScale } from './coordinate';

const clampOutputCount = (value: number) =>
  Math.max(200, Math.min(2000, Math.round(value)));

export function normalizeOutputCount(value: number): number {
  return clampOutputCount(Number.isFinite(value) ? value : 500);
}

export function generateInterpolatedPoints(
  curve: CurveSeries,
  axisConfig: { x: AxisConfig; y: AxisConfig },
  calibrationLines: CalibrationLines,
  calibrationValues: CalibrationValues
): InterpolatedPoint[] {
  const sorted = [...curve.controlPoints]
    .filter((point) => Number.isFinite(point.realX) && Number.isFinite(point.realY))
    .sort((a, b) => a.realX - b.realX);

  const unique = sorted.filter(
    (point, index) => index === 0 || point.realX !== sorted[index - 1].realX
  );

  if (unique.length < 2) return [];

  const outputCount = normalizeOutputCount(curve.outputCount);
  const first = unique[0];
  const last = unique[unique.length - 1];
  const useLogX =
    isLogScale(axisConfig.x.scale) && unique.every((point) => point.realX > 0);
  const useLogY =
    isLogScale(axisConfig.y.scale) && unique.every((point) => point.realY > 0);
  const transformedPoints = unique.map((point) => ({
    point,
    x: useLogX ? Math.log10(point.realX) : point.realX,
    y: useLogY ? Math.log10(point.realY) : point.realY
  }));

  const xStart = useLogX ? Math.log10(first.realX) : first.realX;
  const xEnd = useLogX ? Math.log10(last.realX) : last.realX;
  const axisScales = { x: axisConfig.x.scale, y: axisConfig.y.scale };
  const smoothInterpolator =
    curve.interpolation === 'smooth'
      ? createNaturalCubicInterpolator(
          transformedPoints.map((point) => point.x),
          transformedPoints.map((point) => point.y)
        )
      : null;

  return Array.from({ length: outputCount }, (_, index) => {
    const t = outputCount === 1 ? 0 : index / (outputCount - 1);
    const sampledX = xStart + t * (xEnd - xStart);
    const realX = useLogX ? Math.pow(10, sampledX) : sampledX;
    const sampledY =
      smoothInterpolator?.(sampledX) ??
      interpolateLinearY(transformedPoints, sampledX);
    const realY = useLogY ? Math.pow(10, sampledY) : sampledY;
    const screen = calculateScreenValue({
      realX,
      realY,
      calibrationLines,
      calibrationValues,
      axisScales,
      axisFormulas: { x: axisConfig.x.formula, y: axisConfig.y.formula },
      axisLogInputModes: {
        x: axisConfig.x.logInputMode,
        y: axisConfig.y.logInputMode
      }
    });

    return {
      id: `${curve.id}-interp-${index + 1}`,
      curveId: curve.id,
      realX,
      realY,
      screenX: screen.screenX,
      screenY: screen.screenY
    };
  });
}

type InterpolationPoint = {
  point: CurveSeries['controlPoints'][number];
  x: number;
  y: number;
};

function findSegment(points: InterpolationPoint[], x: number) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (x >= left.x && x <= right.x) {
      return { left, right };
    }
  }

  return {
    left: points[points.length - 2],
    right: points[points.length - 1]
  };
}

function interpolateLinearY(points: InterpolationPoint[], x: number): number {
  const segment = findSegment(points, x);
  const span = segment.right.x - segment.left.x;
  const ratio = span === 0 ? 0 : (x - segment.left.x) / span;

  return segment.left.y + ratio * (segment.right.y - segment.left.y);
}

function createNaturalCubicInterpolator(
  xs: number[],
  ys: number[]
): ((x: number) => number) | null {
  const n = xs.length;

  if (n < 3) return null;

  const y2 = new Array(n).fill(0);
  const u = new Array(n - 1).fill(0);

  for (let i = 1; i < n - 1; i += 1) {
    const previousSpan = xs[i] - xs[i - 1];
    const nextSpan = xs[i + 1] - xs[i];
    const totalSpan = xs[i + 1] - xs[i - 1];

    if (previousSpan === 0 || nextSpan === 0 || totalSpan === 0) {
      return null;
    }

    const sig = previousSpan / totalSpan;
    const p = sig * y2[i - 1] + 2;
    y2[i] = (sig - 1) / p;
    u[i] =
      (6 *
        ((ys[i + 1] - ys[i]) / nextSpan -
          (ys[i] - ys[i - 1]) / previousSpan)) /
        totalSpan -
      sig * u[i - 1];
    u[i] /= p;
  }

  for (let k = n - 2; k >= 0; k -= 1) {
    y2[k] = y2[k] * y2[k + 1] + u[k];
  }

  return (x: number) => {
    let low = 0;
    let high = n - 1;

    while (high - low > 1) {
      const mid = Math.floor((high + low) / 2);
      if (xs[mid] > x) {
        high = mid;
      } else {
        low = mid;
      }
    }

    const h = xs[high] - xs[low];
    if (h === 0) return ys[low];

    const a = (xs[high] - x) / h;
    const b = (x - xs[low]) / h;

    return (
      a * ys[low] +
      b * ys[high] +
      (((a * a * a - a) * y2[low] + (b * b * b - b) * y2[high]) * h * h) /
        6
    );
  };
}
