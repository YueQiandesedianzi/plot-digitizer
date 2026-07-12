import JSZip from 'jszip';
import type { AppState } from '../types';
import { serializeProject } from './projectFiles';

const DATABASE_NAME = 'plotdigitizer-recovery-v1';
const DATABASE_VERSION = 1;
const SNAPSHOT_KEY = 'latest';

interface RecoveryRecord {
  id: typeof SNAPSHOT_KEY;
  projectId: string;
  updatedAt: string;
  sourceSha256: string;
  sourceArchivePath: string;
  packageWithoutSource: Uint8Array;
}

export interface RecoveryProject {
  bytes: ArrayBuffer;
  updatedAt: string;
}

let writeQueue = Promise.resolve();

export function writeRecoverySnapshot(state: AppState): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(() => writeSnapshot(state));
  return writeQueue;
}

export async function readRecoveryProject(): Promise<RecoveryProject | null> {
  const database = await openDatabase();
  const record = await getRecord<RecoveryRecord>(database, 'snapshots', SNAPSHOT_KEY);
  if (!record) return null;
  const source = await getRecord<Blob>(database, 'sources', record.sourceSha256);
  if (!source) {
    await deleteRecord(database, 'snapshots', SNAPSHOT_KEY);
    return null;
  }

  const zip = await JSZip.loadAsync(Uint8Array.from(record.packageWithoutSource));
  zip.file(record.sourceArchivePath, await readBlobArrayBuffer(source));
  return {
    bytes: await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' }),
    updatedAt: record.updatedAt
  };
}

export async function clearRecoverySnapshot(): Promise<void> {
  await writeQueue.catch(() => undefined);
  const database = await openDatabase();
  const record = await getRecord<RecoveryRecord>(database, 'snapshots', SNAPSHOT_KEY);
  await deleteRecord(database, 'snapshots', SNAPSHOT_KEY);
  if (record) await deleteRecord(database, 'sources', record.sourceSha256);
}

async function writeSnapshot(state: AppState): Promise<void> {
  if (!state.isDirty || !state.sourceFile) return;
  const serialized = await serializeProject(state);
  const zip = await JSZip.loadAsync(serialized.bytes);
  zip.remove(serialized.document.source.archivePath);
  const packageWithoutSource = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 }
  });
  const record: RecoveryRecord = {
    id: SNAPSHOT_KEY,
    projectId: state.projectId,
    updatedAt: serialized.updatedAt,
    sourceSha256: serialized.document.source.sha256,
    sourceArchivePath: serialized.document.source.archivePath,
    packageWithoutSource: new Uint8Array(packageWithoutSource)
  };

  const database = await openDatabase();
  const existingSource = await getRecord<Blob>(
    database,
    'sources',
    record.sourceSha256
  );
  if (!existingSource) {
    await putRecord(database, 'sources', state.sourceFile, record.sourceSha256);
  }
  await putRecord(database, 'snapshots', record);
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('当前环境不支持 IndexedDB 自动恢复'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('snapshots')) {
        database.createObjectStore('snapshots', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('sources')) {
        database.createObjectStore('sources');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
  });
}

function getRecord<T>(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 读取失败'));
  });
}

function putRecord(
  database: IDBDatabase,
  storeName: string,
  value: unknown,
  key?: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
    const request = key === undefined ? store.put(value) : store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 写入失败'));
  });
}

function deleteRecord(
  database: IDBDatabase,
  storeName: string,
  key: IDBValidKey
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 删除失败'));
  });
}

function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(reader.result)
        : reject(new Error('恢复源文件读取失败'));
    reader.onerror = () => reject(reader.error ?? new Error('恢复源文件读取失败'));
    reader.readAsArrayBuffer(blob);
  });
}
