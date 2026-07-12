import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import {
  clearRecoverySnapshot,
  readRecoveryProject,
  writeRecoverySnapshot
} from '../services/recoveryStore';

type ProjectLoader = (name: string, bytes: ArrayBuffer) => Promise<boolean>;

export function useRecovery(loadProjectBytes: ProjectLoader): void {
  const { changeRevision, isDirty, sourceFile, markDirty, setProjectFileName } =
    useAppStore();
  const initializedRef = useRef(false);
  const lastWrittenRevisionRef = useRef(-1);

  const flush = useCallback(async () => {
    const state = useAppStore.getState();
    if (
      !state.isDirty ||
      !state.sourceFile ||
      lastWrittenRevisionRef.current === state.changeRevision
    ) {
      return;
    }
    try {
      await writeRecoverySnapshot(state);
      lastWrittenRevisionRef.current = state.changeRevision;
    } catch (error) {
      console.warn('自动恢复快照写入失败:', error);
    }
  }, []);

  useEffect(() => {
    if (!isDirty || !sourceFile) return;
    const timer = window.setTimeout(() => void flush(), 1500);
    return () => window.clearTimeout(timer);
  }, [changeRevision, flush, isDirty, sourceFile]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [flush]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    void (async () => {
      try {
        const recovery = await readRecoveryProject();
        if (!recovery) return;
        const shouldRestore = window.confirm(
          `检测到 ${new Date(recovery.updatedAt).toLocaleString()} 的自动恢复快照。\n\n` +
            '选择“确定”恢复，选择“取消”丢弃。'
        );
        if (shouldRestore) {
          const restored = await loadProjectBytes(
            'auto-recovery.plotdigitizer',
            recovery.bytes
          );
          if (restored) {
            markDirty();
            setProjectFileName(null);
          }
        }
        await clearRecoverySnapshot();
      } catch (error) {
        console.warn('自动恢复快照读取失败:', error);
      }
    })();
  }, [loadProjectBytes, markDirty, setProjectFileName]);
}
