import { describe, expect, it } from 'vitest';
import type { AxisScale, LogInputMode } from '../types';
import { validateCalibration } from '../domain/calibration';
import { calculateRealValue, calculateScreenValue } from './coordinate';

const lines = { x1: 10, x2: 90, y1: 90, y2: 10 };
const imageData = { naturalWidth: 1000, naturalHeight: 800 };

function calculate(
  screenX: number,
  screenY: number,
  options: {
    values?: { x1: number; x2: number; y1: number; y2: number };
    scales?: { x: AxisScale; y: AxisScale };
    logModes?: { x?: LogInputMode; y?: LogInputMode };
    formulas?: { x?: string; y?: string };
  } = {}
) {
  return calculateRealValue({
    screenX,
    screenY,
    calibrationLines: lines,
    calibrationValues: options.values ?? { x1: 0, x2: 100, y1: 0, y2: 100 },
    axisScales: options.scales ?? { x: 'linear', y: 'linear' },
    axisLogInputModes: options.logModes,
    axisFormulas: options.formulas,
    imageData
  });
}

describe('coordinate conversion', () => {
  it('handles linear and reversed axes', () => {
    const normal = calculate(50, 50);
    expect(normal).toMatchObject({ ok: true, realX: 50, realY: 50 });

    const reversed = calculate(30, 70, {
      values: { x1: 100, x2: 0, y1: 100, y2: 0 }
    });
    expect(reversed).toMatchObject({ ok: true, realX: 75, realY: 75 });
  });

  it.each([
    ['log10 real values', 'log10', 'value', 1, 100, 10],
    ['natural log real values', 'ln', 'value', 1, Math.E ** 2, Math.E],
    ['base-10 exponent ticks', 'log10', 'exponent', 0, 2, 10],
    ['natural exponent ticks', 'ln', 'exponent', 0, 2, Math.E]
  ] as const)('%s', (_name, scale, mode, start, end, expected) => {
    const result = calculate(50, 50, {
      values: { x1: start, x2: end, y1: 0, y2: 100 },
      scales: { x: scale, y: 'linear' },
      logModes: { x: mode }
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.realX).toBeCloseTo(expected, 12);
  });

  it('evaluates a monotonic custom formula without dynamic code execution', () => {
    const result = calculate(50, 50, {
      scales: { x: 'custom', y: 'linear' },
      formulas: { x: 'v1 + (v2 - v1) * t^2' }
    });
    expect(result).toMatchObject({ ok: true, realX: 25 });
  });

  it('allows extrapolation and marks points outside the calibration box', () => {
    const result = calculate(95, 5);
    expect(result).toMatchObject({
      ok: true,
      qualityFlags: ['outside-calibration']
    });
  });

  it('blocks invalid spans, equal values and nonpositive log values', () => {
    const validation = validateCalibration({
      calibrationLines: { ...lines, x2: 10.1 },
      calibrationValues: { x1: 0, x2: 0, y1: 0, y2: 10 },
      axisConfig: {
        x: { label: 'x', scale: 'log10', logInputMode: 'value' },
        y: { label: 'y', scale: 'linear' }
      },
      imageData
    });
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['screen-span-too-small', 'equal-values', 'log-nonpositive'])
    );
  });

  it('warns for a 2-10 px span without rejecting it', () => {
    const validation = validateCalibration({
      calibrationLines: { ...lines, x2: 10.5 },
      calibrationValues: { x1: 0, x2: 1, y1: 0, y2: 1 },
      axisConfig: {
        x: { label: 'x', scale: 'linear' },
        y: { label: 'y', scale: 'linear' }
      },
      imageData
    });
    expect(validation.valid).toBe(true);
    expect(validation.issues).toContainEqual(
      expect.objectContaining({ axis: 'x', severity: 'warning' })
    );
  });

  it('round-trips valid coordinates within 1e-9', () => {
    const values = { x1: 1, x2: 1000, y1: 1, y2: 100 };
    const result = calculate(37.25, 62.75, {
      values,
      scales: { x: 'log10', y: 'log10' },
      logModes: { x: 'value', y: 'value' }
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const screen = calculateScreenValue({
      realX: result.realX,
      realY: result.realY,
      calibrationLines: lines,
      calibrationValues: values,
      axisScales: { x: 'log10', y: 'log10' },
      axisLogInputModes: { x: 'value', y: 'value' }
    });
    expect(screen.screenX).toBeCloseTo(37.25, 9);
    expect(screen.screenY).toBeCloseTo(62.75, 9);
  });
});
