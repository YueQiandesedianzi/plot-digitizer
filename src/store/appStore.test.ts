import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './appStore';

describe('per-page undo history', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useAppStore.getState().resetApp();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('merges repeated wheel/drag-like edits inside 300 ms', () => {
    const store = useAppStore.getState();
    store.setCalibrationLine('x1', 11);
    vi.advanceTimersByTime(100);
    useAppStore.getState().setCalibrationLine('x1', 12);
    vi.advanceTimersByTime(100);
    useAppStore.getState().setCalibrationLine('x1', 13);

    expect(useAppStore.getState().calibrationLines.x1).toBe(13);
    useAppStore.getState().undo();
    expect(useAppStore.getState().calibrationLines.x1).toBe(10);
    expect(useAppStore.getState().canUndo).toBe(false);
  });

  it('keeps page histories independent', () => {
    useAppStore.getState().setCalibrationValue('x2', 20);
    useAppStore.getState().setCurrentPageNumber(2);
    useAppStore.getState().setCalibrationValue('y2', 200);

    useAppStore.getState().undo();
    expect(useAppStore.getState().calibrationValues).toMatchObject({ x2: 20, y2: 100 });

    useAppStore.getState().setCurrentPageNumber(1);
    expect(useAppStore.getState().canUndo).toBe(true);
    useAppStore.getState().undo();
    expect(useAppStore.getState().calibrationValues.x2).toBe(10);
  });

  it('supports redo and clears redo after a new edit', () => {
    useAppStore.getState().setCalibrationValue('x2', 20);
    useAppStore.getState().undo();
    expect(useAppStore.getState().canRedo).toBe(true);
    useAppStore.getState().redo();
    expect(useAppStore.getState().calibrationValues.x2).toBe(20);

    useAppStore.getState().undo();
    vi.advanceTimersByTime(1500);
    useAppStore.getState().setCalibrationValue('y2', 50);
    expect(useAppStore.getState().canRedo).toBe(false);
  });

  it('commits text edits as one step when the field loses focus', () => {
    useAppStore.getState().setAxisLabel('x', 'T');
    vi.advanceTimersByTime(5000);
    useAppStore.getState().setAxisLabel('x', 'Time');
    useAppStore.getState().commitHistoryBoundary();
    useAppStore.getState().setAxisLabel('x', 'Time (s)');

    useAppStore.getState().undo();
    expect(useAppStore.getState().axisConfig.x.label).toBe('Time');
    useAppStore.getState().undo();
    expect(useAppStore.getState().axisConfig.x.label).toBe('X-Value');
  });
});
