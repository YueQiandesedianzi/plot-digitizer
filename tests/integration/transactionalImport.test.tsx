import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageLoader } from '../../src/hooks/useImageLoader';
import { useAppStore } from '../../src/store/appStore';
import { prepareSource } from '../../src/services/sourceLoader';

vi.mock('../../src/services/sourceLoader', () => ({
  prepareSource: vi.fn(),
  preparePdfPage: vi.fn()
}));

const mockedPrepareSource = vi.mocked(prepareSource);

describe('transactional source import', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedPrepareSource.mockReset();
    useAppStore.getState().resetApp();
    const original = new File([new Uint8Array([1])], 'original.png', {
      type: 'image/png'
    });
    useAppStore.getState().replaceSource({
      file: original,
      kind: 'image',
      pageCount: 1,
      firstPageImage: {
        src: 'blob:original',
        naturalWidth: 800,
        naturalHeight: 600,
        name: original.name
      }
    });
    useAppStore.getState().addDataPoint({
      screenX: 50,
      screenY: 50,
      realX: 5,
      realY: 50,
      label: 'preserve'
    });
  });

  it('keeps every project field unchanged when decoding fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedPrepareSource.mockRejectedValue(new Error('damaged image'));
    const before = businessSnapshot();
    const { result } = renderHook(() => useImageLoader());

    await act(async () => {
      expect(
        await result.current.loadImageFile(
          new File([new Uint8Array([2])], 'damaged.png', { type: 'image/png' })
        )
      ).toBe(false);
    });
    expect(businessSnapshot()).toEqual(before);
  });

  it('keeps every project field unchanged when replacement is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const before = businessSnapshot();
    const { result } = renderHook(() => useImageLoader());

    await act(async () => {
      expect(
        await result.current.loadImageFile(
          new File([new Uint8Array([2])], 'next.png', { type: 'image/png' })
        )
      ).toBe(false);
    });
    expect(mockedPrepareSource).not.toHaveBeenCalled();
    expect(businessSnapshot()).toEqual(before);
  });
});

function businessSnapshot() {
  const state = useAppStore.getState();
  return structuredClone({
    projectId: state.projectId,
    projectCreatedAt: state.projectCreatedAt,
    projectUpdatedAt: state.projectUpdatedAt,
    sourceName: state.sourceFile?.name,
    sourceKind: state.sourceKind,
    sourcePageCount: state.sourcePageCount,
    imageData: state.imageData,
    currentPageNumber: state.currentPageNumber,
    pageSessions: state.pageSessions,
    plotRegions: state.plotRegions,
    activePlotId: state.activePlotId,
    calibrationLines: state.calibrationLines,
    calibrationValues: state.calibrationValues,
    axisConfig: state.axisConfig,
    dataPoints: state.dataPoints,
    curves: state.curves,
    activeCurveId: state.activeCurveId,
    currentStep: state.currentStep,
    collectionMode: state.collectionMode,
    defaultSampleLabel: state.defaultSampleLabel,
    isDirty: state.isDirty,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    changeRevision: state.changeRevision
  });
}
