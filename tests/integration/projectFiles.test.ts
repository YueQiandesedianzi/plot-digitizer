import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../src/store/appStore';
import {
  deserializeProject,
  serializeProject
} from '../../src/services/projectFiles';

vi.mock('../../src/services/sourceLoader', () => ({
  prepareSource: vi.fn(async (file: File) => ({
    file,
    kind: 'image',
    pageCount: 1,
    firstPageImage: {
      src: 'blob:restored-image',
      naturalWidth: 640,
      naturalHeight: 480,
      name: file.name
    },
    objectUrl: null
  })),
  preparePdfPage: vi.fn()
}));

const pixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('self-contained project package', () => {
  beforeEach(() => {
    useAppStore.getState().resetApp();
  });

  it('round-trips source, plots, points, quality flags and screenshots', async () => {
    const source = new File([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], 'figure.png', {
      type: 'image/png'
    });
    useAppStore.getState().replaceSource({
      file: source,
      kind: 'image',
      pageCount: 1,
      firstPageImage: {
        src: 'blob:source-image',
        naturalWidth: 640,
        naturalHeight: 480,
        name: source.name
      }
    });
    useAppStore.getState().addDataPoint({
      screenX: 95,
      screenY: 50,
      realX: 10.625,
      realY: 50,
      label: 'outside',
      qualityFlags: ['outside-calibration']
    });
    useAppStore.getState().savePlotScreenshot({
      name: 'plot.png',
      dataUrl: pixelPng,
      createdAt: '2026-01-01T00:00:00.000Z'
    });

    const serialized = await serializeProject(useAppStore.getState());
    const zip = await JSZip.loadAsync(serialized.bytes);
    const manifestText = await zip.file('manifest.json')?.async('string');
    expect(manifestText).not.toContain('blob:');
    expect(manifestText).not.toContain('data:image');

    const loaded = await deserializeProject(serialized.bytes, 'roundtrip.plotdigitizer');
    const session = loaded.replacement.pageSessions[1];
    const plot = session.plotRegions[0];
    expect(plot.dataPoints[0]).toMatchObject({
      label: 'outside',
      qualityFlags: ['outside-calibration']
    });
    expect(plot.screenshot?.dataUrl).toBe(pixelPng);
    expect(loaded.warnings).toEqual([]);
  });

  it('treats a source hash mismatch as fatal', async () => {
    const serialized = await createMinimalProject();
    const zip = await JSZip.loadAsync(serialized.bytes);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    manifest.source.sha256 = '0'.repeat(64);
    zip.file('manifest.json', JSON.stringify(manifest));
    const damaged = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(deserializeProject(damaged)).rejects.toThrow('SHA-256');
  });

  it('warns and continues when one screenshot is damaged', async () => {
    const serialized = await createMinimalProject(true);
    const zip = await JSZip.loadAsync(serialized.bytes);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const screenshotPath = manifest.pages[0].plots[0].screenshot.archivePath;
    zip.file(screenshotPath, new Uint8Array([1, 2, 3, 4]));
    const damaged = await zip.generateAsync({ type: 'arraybuffer' });

    const loaded = await deserializeProject(damaged);
    expect(loaded.warnings).toHaveLength(1);
    expect(loaded.replacement.pageSessions[1].plotRegions[0].screenshot).toBeUndefined();
  });
});

async function createMinimalProject(withScreenshot = false) {
  const source = new File([new Uint8Array([137, 80, 78, 71, 1])], 'figure.png', {
    type: 'image/png'
  });
  useAppStore.getState().replaceSource({
    file: source,
    kind: 'image',
    pageCount: 1,
    firstPageImage: {
      src: 'blob:source-image',
      naturalWidth: 10,
      naturalHeight: 10,
      name: source.name
    }
  });
  if (withScreenshot) {
    useAppStore.getState().savePlotScreenshot({
      name: 'plot.png',
      dataUrl: pixelPng,
      createdAt: '2026-01-01T00:00:00.000Z'
    });
  }
  return serializeProject(useAppStore.getState());
}
