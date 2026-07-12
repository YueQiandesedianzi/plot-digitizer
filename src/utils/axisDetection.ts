import type { CalibrationLines } from '../types';

type Region = {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
};

type Peak = {
  index: number;
  score: number;
};

type LineCandidate = {
  index: number;
  score: number;
  coverage: number;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for axis detection'));
    image.src = src;
  });

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const luminance = (r: number, g: number, b: number) =>
  0.299 * r + 0.587 * g + 0.114 * b;

const smoothScores = (scores: number[], radius = 1) =>
  scores.map((score, index) => {
    let sum = 0;
    let weightSum = 0;
    for (
      let cursor = Math.max(0, index - radius);
      cursor <= Math.min(scores.length - 1, index + radius);
      cursor += 1
    ) {
      const weight = radius + 1 - Math.abs(cursor - index);
      sum += scores[cursor] * weight;
      weightSum += weight;
    }
    return weightSum ? sum / weightSum : score;
  });

const findPeaks = (scores: number[], minDistance: number) => {
  const smoothed = smoothScores(scores);
  const average =
    smoothed.reduce((sum, score) => sum + score, 0) / Math.max(1, smoothed.length);
  const maxScore = Math.max(...smoothed, 0);
  const threshold = Math.max(average * 1.8, maxScore * 0.22);
  const peaks: Peak[] = [];

  smoothed.forEach((score, index) => {
    if (score < threshold) return;
    if (index > 0 && score < smoothed[index - 1]) return;
    if (index < smoothed.length - 1 && score < smoothed[index + 1]) return;
    peaks.push({ index, score });
  });

  const sorted = peaks.sort((left, right) => right.score - left.score);
  const selected: Peak[] = [];

  sorted.forEach((peak) => {
    if (
      selected.some(
        (existing) => Math.abs(existing.index - peak.index) < minDistance
      )
    ) {
      return;
    }
    selected.push(peak);
  });

  return selected.sort((left, right) => left.index - right.index);
};

const longestRun = (values: boolean[]) => {
  let best = 0;
  let current = 0;

  values.forEach((value) => {
    if (value) {
      current += 1;
      best = Math.max(best, current);
      return;
    }
    current = 0;
  });

  return best;
};

const findLineCandidates = (
  isDarkAt: (majorIndex: number, minorIndex: number) => boolean,
  majorLength: number,
  minorLength: number,
  minCoverage: number
) => {
  const candidates: LineCandidate[] = [];

  for (let major = 0; major < majorLength; major += 1) {
    const darkFlags: boolean[] = [];
    let darkCount = 0;

    for (let minor = 0; minor < minorLength; minor += 1) {
      const isDark = isDarkAt(major, minor);
      darkFlags.push(isDark);
      if (isDark) darkCount += 1;
    }

    const runCoverage = longestRun(darkFlags) / Math.max(1, minorLength);
    const totalCoverage = darkCount / Math.max(1, minorLength);
    const coverage = Math.max(runCoverage, totalCoverage * 0.62);
    if (coverage < minCoverage) continue;

    candidates.push({
      index: major,
      score: coverage * 1000 + darkCount,
      coverage
    });
  }

  return mergeNearbyCandidates(candidates, Math.max(3, Math.round(majorLength * 0.015)));
};

const mergeNearbyCandidates = (
  candidates: LineCandidate[],
  distance: number
) => {
  const sorted = [...candidates].sort((left, right) => left.index - right.index);
  const merged: LineCandidate[] = [];

  sorted.forEach((candidate) => {
    const previous = merged[merged.length - 1];
    if (!previous || candidate.index - previous.index > distance) {
      merged.push(candidate);
      return;
    }

    if (candidate.score > previous.score) {
      merged[merged.length - 1] = candidate;
    }
  });

  return merged;
};

const chooseBoundaryLines = (
  candidates: LineCandidate[],
  length: number
) => {
  if (candidates.length >= 2) {
    const leftCandidates = candidates.filter((candidate) => candidate.index <= length * 0.45);
    const rightCandidates = candidates.filter((candidate) => candidate.index >= length * 0.55);
    const start =
      [...leftCandidates].sort(
        (left, right) =>
          right.score - left.score + (right.index - left.index) * 0.9
      )[0] ?? candidates[0];
    const end =
      [...rightCandidates].sort(
        (left, right) =>
          right.score - left.score + (left.index - right.index) * 0.9
      )[0] ?? candidates[candidates.length - 1];

    if (start.index !== end.index) {
      return [Math.min(start.index, end.index), Math.max(start.index, end.index)] as const;
    }
  }

  return [0, length - 1] as const;
};

const chooseTwoBounds = (peaks: Peak[], fallbackStart: number, fallbackEnd: number) => {
  if (peaks.length >= 2) {
    let bestPair: [Peak, Peak] = [peaks[0], peaks[1]];
    let bestScore = -Infinity;

    for (let left = 0; left < peaks.length; left += 1) {
      for (let right = left + 1; right < peaks.length; right += 1) {
        const distance = peaks[right].index - peaks[left].index;
        const score = distance * 0.7 + peaks[left].score + peaks[right].score;
        if (score > bestScore) {
          bestScore = score;
          bestPair = [peaks[left], peaks[right]];
        }
      }
    }

    return [bestPair[0].index, bestPair[1].index] as const;
  }

  if (peaks.length === 1) {
    const peak = peaks[0].index;
    const useStart = Math.abs(peak - fallbackStart) > Math.abs(peak - fallbackEnd);
    return useStart
      ? ([fallbackStart, peak] as const)
      : ([peak, fallbackEnd] as const);
  }

  return [fallbackStart, fallbackEnd] as const;
};

export async function detectCalibrationLinesFromRegion(
  imageSrc: string,
  region: Region
): Promise<CalibrationLines> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Cannot create canvas context for axis detection');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const left = clamp(
    Math.round((region.leftPct / 100) * canvas.width),
    0,
    canvas.width - 1
  );
  const right = clamp(
    Math.round(((region.leftPct + region.widthPct) / 100) * canvas.width),
    left + 1,
    canvas.width - 1
  );
  const top = clamp(
    Math.round((region.topPct / 100) * canvas.height),
    0,
    canvas.height - 1
  );
  const bottom = clamp(
    Math.round(((region.topPct + region.heightPct) / 100) * canvas.height),
    top + 1,
    canvas.height - 1
  );
  const width = right - left + 1;
  const height = bottom - top + 1;
  const darkThreshold = 88;
  const isDark = (x: number, y: number) => {
    const index = (y * canvas.width + x) * 4;
    return (
      255 - luminance(data[index], data[index + 1], data[index + 2]) >=
      darkThreshold
    );
  };

  const verticalLines = findLineCandidates(
    (major, minor) => isDark(left + major, top + minor),
    width,
    height,
    0.42
  );
  const horizontalLines = findLineCandidates(
    (major, minor) => isDark(left + minor, top + major),
    height,
    width,
    0.42
  );

  if (verticalLines.length >= 2 || horizontalLines.length >= 2) {
    const [x1Local, x2Local] = chooseBoundaryLines(verticalLines, width);
    const [yTopLocal, yBottomLocal] = chooseBoundaryLines(horizontalLines, height);

    return {
      x1: ((left + x1Local) / canvas.width) * 100,
      x2: ((left + x2Local) / canvas.width) * 100,
      y1: ((top + yBottomLocal) / canvas.height) * 100,
      y2: ((top + yTopLocal) / canvas.height) * 100
    };
  }

  const columnScores = new Array(width).fill(0);
  const rowScores = new Array(height).fill(0);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const dark = 255 - luminance(data[index], data[index + 1], data[index + 2]);
      if (dark < 42) continue;
      const weight = dark > 95 ? dark : dark * 0.45;
      columnScores[x - left] += weight;
      rowScores[y - top] += weight;
    }
  }

  const verticalPeaks = findPeaks(columnScores, Math.max(6, Math.round(width * 0.08)));
  const horizontalPeaks = findPeaks(rowScores, Math.max(6, Math.round(height * 0.08)));
  const [x1Local, x2Local] = chooseTwoBounds(verticalPeaks, 0, width - 1);
  const [yTopLocal, yBottomLocal] = chooseTwoBounds(horizontalPeaks, 0, height - 1);

  return {
    x1: ((left + x1Local) / canvas.width) * 100,
    x2: ((left + x2Local) / canvas.width) * 100,
    y1: ((top + yBottomLocal) / canvas.height) * 100,
    y2: ((top + yTopLocal) / canvas.height) * 100
  };
}
