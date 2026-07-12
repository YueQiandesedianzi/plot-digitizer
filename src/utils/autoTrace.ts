import type { CalibrationLines } from '../types';

export type TracePoint = {
  screenX: number;
  screenY: number;
};

export type TraceResult = {
  points: TracePoint[];
  previewPoints: TracePoint[];
  confidence: number;
  componentPixels: number;
  candidatePixels: number;
};

type RGB = {
  r: number;
  g: number;
  b: number;
};

type Lab = {
  l: number;
  a: number;
  b: number;
};

type Hsv = {
  h: number;
  s: number;
  v: number;
};

type ColorModel = {
  lab: Lab;
  hsv: Hsv;
  tolerance: number;
};

type PixelCandidate = {
  x: number;
  y: number;
  score: number;
};

type TraceOptions = {
  calibrationLines: CalibrationLines;
  seed: TracePoint;
  maxPoints?: number;
  colorTolerance?: number;
  minComponentPixels?: number;
  smoothing?: number;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for tracing'));
    image.src = src;
  });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getIndex = (width: number, x: number, y: number) => y * width + x;

const getPixel = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): RGB | null => {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const index = getIndex(width, x, y) * 4;
  return {
    r: data[index],
    g: data[index + 1],
    b: data[index + 2]
  };
};

const rgbDistance = (left: RGB, right: RGB) =>
  Math.sqrt(
    (left.r - right.r) ** 2 + (left.g - right.g) ** 2 + (left.b - right.b) ** 2
  );

const pivotRgb = (value: number) => {
  const normalized = value / 255;
  return normalized > 0.04045
    ? ((normalized + 0.055) / 1.055) ** 2.4
    : normalized / 12.92;
};

const pivotXyz = (value: number) =>
  value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;

const rgbToLab = (rgb: RGB): Lab => {
  const r = pivotRgb(rgb.r);
  const g = pivotRgb(rgb.g);
  const b = pivotRgb(rgb.b);

  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);

  return {
    l: 116 * fy - 16,
    a: 166 * (fx - fy),
    b: 200 * (fy - fz)
  };
};

const rgbToHsv = ({ r, g, b }: RGB): Hsv => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : delta / max,
    v: max
  };
};

const hueDistance = (left: number, right: number) => {
  const diff = Math.abs(left - right);
  return Math.min(diff, 360 - diff) / 180;
};

const colorScore = (rgb: RGB, model: ColorModel) => {
  const lab = rgbToLab(rgb);
  const hsv = rgbToHsv(rgb);
  const chromaDistance = Math.sqrt(
    (lab.a - model.lab.a) ** 2 + (lab.b - model.lab.b) ** 2
  );
  const lightDistance = Math.abs(lab.l - model.lab.l);
  const huePenalty =
    model.hsv.s > 0.16 && hsv.s > 0.08
      ? hueDistance(hsv.h, model.hsv.h) * 36
      : 0;

  return chromaDistance * 0.82 + lightDistance * 0.18 + huePenalty;
};

const buildColorModel = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
  colorTolerance: number
): ColorModel | null => {
  const center = getPixel(data, width, height, seedX, seedY);
  if (!center) return null;

  const samples: RGB[] = [];
  for (let y = seedY - 5; y <= seedY + 5; y += 1) {
    for (let x = seedX - 5; x <= seedX + 5; x += 1) {
      const pixel = getPixel(data, width, height, x, y);
      if (!pixel) continue;
      if (rgbDistance(pixel, center) <= 92) samples.push(pixel);
    }
  }

  const selected = (samples.length ? samples : [center])
    .sort((left, right) => rgbDistance(left, center) - rgbDistance(right, center))
    .slice(0, Math.max(8, Math.ceil(samples.length * 0.55)));
  const average = selected.reduce(
    (sum, pixel) => ({
      r: sum.r + pixel.r / selected.length,
      g: sum.g + pixel.g / selected.length,
      b: sum.b + pixel.b / selected.length
    }),
    { r: 0, g: 0, b: 0 }
  );
  const centerLab = rgbToLab(average);
  const deviations = selected
    .map((pixel) => {
      const lab = rgbToLab(pixel);
      return Math.sqrt(
        (lab.l - centerLab.l) ** 2 +
          (lab.a - centerLab.a) ** 2 +
          (lab.b - centerLab.b) ** 2
      );
    })
    .sort((left, right) => left - right);
  const medianDeviation =
    deviations[Math.floor(deviations.length / 2)] ?? colorTolerance;

  return {
    lab: centerLab,
    hsv: rgbToHsv(average),
    tolerance: clamp(colorTolerance + medianDeviation * 0.45, 12, 78)
  };
};

const getRoi = (
  calibrationLines: CalibrationLines,
  width: number,
  height: number
) => {
  const left = clamp(
    Math.round((Math.min(calibrationLines.x1, calibrationLines.x2) / 100) * width),
    0,
    width - 1
  );
  const right = clamp(
    Math.round((Math.max(calibrationLines.x1, calibrationLines.x2) / 100) * width),
    0,
    width - 1
  );
  const top = clamp(
    Math.round((Math.min(calibrationLines.y1, calibrationLines.y2) / 100) * height),
    0,
    height - 1
  );
  const bottom = clamp(
    Math.round((Math.max(calibrationLines.y1, calibrationLines.y2) / 100) * height),
    0,
    height - 1
  );

  return { left, right, top, bottom };
};

const buildMask = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  roi: ReturnType<typeof getRoi>,
  model: ColorModel
) => {
  const mask = new Uint8Array(width * height);
  const scores = new Float32Array(width * height);
  let candidatePixels = 0;

  for (let y = roi.top; y <= roi.bottom; y += 1) {
    for (let x = roi.left; x <= roi.right; x += 1) {
      const pixel = getPixel(data, width, height, x, y);
      if (!pixel) continue;
      const score = colorScore(pixel, model);
      const index = getIndex(width, x, y);
      scores[index] = score;
      if (score <= model.tolerance) {
        mask[index] = 1;
        candidatePixels += 1;
      }
    }
  }

  return { mask: bridgeSmallGaps(mask, width, height, roi), scores, candidatePixels };
};

const bridgeSmallGaps = (
  mask: Uint8Array,
  width: number,
  _height: number,
  roi: ReturnType<typeof getRoi>
) => {
  const bridged = new Uint8Array(mask);

  for (let y = roi.top + 1; y < roi.bottom; y += 1) {
    for (let x = roi.left + 1; x < roi.right; x += 1) {
      const index = getIndex(width, x, y);
      if (mask[index]) continue;

      const horizontal =
        mask[getIndex(width, x - 1, y)] && mask[getIndex(width, x + 1, y)];
      const vertical =
        mask[getIndex(width, x, y - 1)] && mask[getIndex(width, x, y + 1)];
      const diagonalA =
        mask[getIndex(width, x - 1, y - 1)] && mask[getIndex(width, x + 1, y + 1)];
      const diagonalB =
        mask[getIndex(width, x - 1, y + 1)] && mask[getIndex(width, x + 1, y - 1)];

      if (horizontal || vertical || diagonalA || diagonalB) {
        bridged[index] = 1;
      }
    }
  }

  return bridged;
};

const collectComponent = (
  mask: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
) => {
  const queue = [getIndex(width, startX, startY)];
  const pixels: number[] = [];
  visited[queue[0]] = 1;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    pixels.push(index);

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nextIndex = getIndex(width, nx, ny);
        if (!mask[nextIndex] || visited[nextIndex]) continue;
        visited[nextIndex] = 1;
        queue.push(nextIndex);
      }
    }
  }

  return pixels;
};

const selectComponent = (
  mask: Uint8Array,
  width: number,
  height: number,
  roi: ReturnType<typeof getRoi>,
  seedX: number,
  seedY: number,
  minComponentPixels: number
) => {
  const visited = new Uint8Array(width * height);
  let best: { pixels: number[]; score: number } | null = null;

  for (let y = roi.top; y <= roi.bottom; y += 1) {
    for (let x = roi.left; x <= roi.right; x += 1) {
      const index = getIndex(width, x, y);
      if (!mask[index] || visited[index]) continue;
      const pixels = collectComponent(mask, visited, width, height, x, y);
      if (pixels.length < minComponentPixels) continue;

      let minSeedDistance = Number.POSITIVE_INFINITY;
      for (const pixelIndex of pixels) {
        const px = pixelIndex % width;
        const py = Math.floor(pixelIndex / width);
        minSeedDistance = Math.min(
          minSeedDistance,
          Math.hypot(px - seedX, py - seedY)
        );
      }

      const score = minSeedDistance - Math.log(pixels.length) * 3;
      if (!best || score < best.score) {
        best = { pixels, score };
      }
    }
  }

  return best?.pixels ?? [];
};

const extractCenterline = (
  component: number[],
  width: number,
  scores: Float32Array,
  model: ColorModel,
  smoothing: number
) => {
  const byX = new Map<number, PixelCandidate[]>();

  component.forEach((index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const candidates = byX.get(x) ?? [];
    candidates.push({ x, y, score: scores[index] || model.tolerance });
    byX.set(x, candidates);
  });

  const centerline = [...byX.entries()]
    .sort(([left], [right]) => left - right)
    .map(([x, candidates]) => {
      let weightedY = 0;
      let weightSum = 0;
      candidates.forEach((candidate) => {
        const weight = Math.max(1, model.tolerance - candidate.score + 1);
        weightedY += candidate.y * weight;
        weightSum += weight;
      });
      return {
        x,
        y: weightSum ? weightedY / weightSum : candidates[0].y
      };
    });

  const smoothed = smoothCenterline(centerline, smoothing);
  return removeLargeJumps(smoothed);
};

const smoothCenterline = (
  points: Array<{ x: number; y: number }>,
  smoothing: number
) => {
  const radius = Math.max(0, Math.round(smoothing));
  if (radius === 0 || points.length < 3) return points;

  return points.map((point, index) => {
    let weightedY = 0;
    let weightSum = 0;
    for (
      let cursor = Math.max(0, index - radius);
      cursor <= Math.min(points.length - 1, index + radius);
      cursor += 1
    ) {
      const distance = Math.abs(cursor - index);
      const weight = radius + 1 - distance;
      weightedY += points[cursor].y * weight;
      weightSum += weight;
    }
    return {
      ...point,
      y: weightSum ? weightedY / weightSum : point.y
    };
  });
};

const removeLargeJumps = (points: Array<{ x: number; y: number }>) => {
  if (points.length < 5) return points;

  const deltas = points
    .slice(1)
    .map((point, index) => Math.abs(point.y - points[index].y))
    .sort((left, right) => left - right);
  const median = deltas[Math.floor(deltas.length / 2)] || 1;
  const maxAllowed = Math.max(12, median * 8);

  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    return (
      Math.abs(point.y - points[index - 1].y) <= maxAllowed ||
      Math.abs(point.y - points[index + 1].y) <= maxAllowed
    );
  });
};

const sampleCenterline = (
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  count: number
): TracePoint[] => {
  if (points.length === 0) return [];
  const normalizedCount = Math.max(2, Math.min(260, count));
  const step = Math.max(1, Math.ceil(points.length / normalizedCount));

  return points
    .filter((_, index) => index % step === 0)
    .slice(0, normalizedCount)
    .map((point) => ({
      screenX: (point.x / width) * 100,
      screenY: (point.y / height) * 100
    }));
};

const samplePreviewPoints = (
  component: number[],
  width: number,
  height: number
): TracePoint[] => {
  const limit = 700;
  const step = Math.max(1, Math.ceil(component.length / limit));

  return component
    .filter((_, index) => index % step === 0)
    .map((pixelIndex) => ({
      screenX: ((pixelIndex % width) / width) * 100,
      screenY: (Math.floor(pixelIndex / width) / height) * 100
    }));
};

export async function traceCurveBySeedColor(
  imageSrc: string,
  {
    calibrationLines,
    seed,
    maxPoints = 80,
    colorTolerance = 34,
    minComponentPixels = 24,
    smoothing = 2
  }: TraceOptions
): Promise<TraceResult> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    return {
      points: [],
      previewPoints: [],
      confidence: 0,
      componentPixels: 0,
      candidatePixels: 0
    };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const seedX = clamp(Math.round((seed.screenX / 100) * canvas.width), 0, canvas.width - 1);
  const seedY = clamp(Math.round((seed.screenY / 100) * canvas.height), 0, canvas.height - 1);
  const model = buildColorModel(
    data,
    canvas.width,
    canvas.height,
    seedX,
    seedY,
    colorTolerance
  );

  if (!model) {
    return {
      points: [],
      previewPoints: [],
      confidence: 0,
      componentPixels: 0,
      candidatePixels: 0
    };
  }

  const roi = getRoi(calibrationLines, canvas.width, canvas.height);
  const { mask, scores, candidatePixels } = buildMask(
    data,
    canvas.width,
    canvas.height,
    roi,
    model
  );
  const component = selectComponent(
    mask,
    canvas.width,
    canvas.height,
    roi,
    seedX,
    seedY,
    minComponentPixels
  );
  const centerline = extractCenterline(
    component,
    canvas.width,
    scores,
    model,
    smoothing
  );
  const points = sampleCenterline(
    centerline,
    canvas.width,
    canvas.height,
    maxPoints
  );
  const roiWidth = Math.max(1, roi.right - roi.left + 1);
  const coverage = clamp(centerline.length / roiWidth, 0, 1);
  const densityPenalty =
    candidatePixels > 0 ? clamp(component.length / candidatePixels, 0, 1) : 0;
  const confidence = Math.round(
    clamp((coverage * 0.72 + densityPenalty * 0.28) * 100, 0, 99)
  );

  return {
    points,
    previewPoints: samplePreviewPoints(component, canvas.width, canvas.height),
    confidence,
    componentPixels: component.length,
    candidatePixels
  };
}
