// @vitest-environment node
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store/appStore';
import {
  clearRecoverySnapshot,
  readRecoveryProject,
  writeRecoverySnapshot
} from '../../src/services/recoveryStore';

describe('IndexedDB recovery snapshots', () => {
  beforeEach(async () => {
    await clearRecoverySnapshot();
    useAppStore.getState().resetApp();
  });

  it('stores the source once by hash and rebuilds a complete project package', async () => {
    const source = new File([new Uint8Array([137, 80, 78, 71, 9])], 'figure.png', {
      type: 'image/png'
    });
    useAppStore.getState().replaceSource({
      file: source,
      kind: 'image',
      pageCount: 1,
      firstPageImage: {
        src: 'blob:figure',
        naturalWidth: 100,
        naturalHeight: 100,
        name: source.name
      }
    });
    await writeRecoverySnapshot(useAppStore.getState());
    useAppStore.getState().setAxisLabel('x', 'Changed X');
    await writeRecoverySnapshot(useAppStore.getState());

    const recovery = await readRecoveryProject();
    expect(recovery).not.toBeNull();
    const zip = await JSZip.loadAsync(recovery!.bytes);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(zip.file(manifest.source.archivePath)).not.toBeNull();
    expect(manifest.pages[0].plots[0].axisConfig.x.label).toBe('Changed X');
    expect(await indexedDbCount('sources')).toBe(1);

    await clearRecoverySnapshot();
    expect(await readRecoveryProject()).toBeNull();
  });
});

function indexedDbCount(storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('plotdigitizer-recovery-v1', 1);
    open.onsuccess = () => {
      const request = open.result
        .transaction(storeName, 'readonly')
        .objectStore(storeName)
        .count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
    open.onerror = () => reject(open.error);
  });
}
