import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  deserializeProject,
  PROJECT_EXTENSION,
  recalculateProjectCoordinates,
  serializeProject
} from '../services/projectFiles';
import {
  commitSourceObjectUrl,
  discardPreparedObjectUrl
} from '../services/sourceUrlRegistry';
import { clearRecoverySnapshot } from '../services/recoveryStore';

export function useProjectFiles() {
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [isProjectBusy, setIsProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const {
    isDirty,
    sourceFile,
    replaceProject,
    markSaved,
    setProjectFileName
  } = useAppStore();

  const loadBytes = useCallback(
    async (name: string, bytes: ArrayBuffer) => {
      setIsProjectBusy(true);
      setProjectError(null);
      let objectUrl: string | null = null;
      try {
        const loaded = await deserializeProject(bytes, name);
        objectUrl = loaded.objectUrl;
        const replacement =
          loaded.coordinateMismatchCount > 0 &&
          window.confirm(
            `检测到 ${loaded.coordinateMismatchCount} 个已存真实坐标与当前计算结果不一致。` +
              '是否按 v2.1 规则统一重新计算？\n\n取消将保留项目中的已存坐标。'
          )
            ? recalculateProjectCoordinates(loaded.replacement)
            : loaded.replacement;

        replaceProject(replacement);
        commitSourceObjectUrl(objectUrl);
        objectUrl = null;
        if (loaded.warnings.length > 0) {
          window.alert(`项目已打开，但有以下警告：\n${loaded.warnings.join('\n')}`);
        }
        return true;
      } catch (caught) {
        discardPreparedObjectUrl(objectUrl);
        const message = caught instanceof Error ? caught.message : '项目打开失败';
        setProjectError(message);
        return false;
      } finally {
        setIsProjectBusy(false);
      }
    },
    [replaceProject]
  );

  const openProject = useCallback(async () => {
    if (
      isDirty &&
      !window.confirm('当前项目存在未保存修改，确定要打开其他项目吗？')
    ) {
      return;
    }
    if (window.plotDigitizer) {
      setIsProjectBusy(true);
      try {
        const selected = await window.plotDigitizer.openProject();
        if (selected) await loadBytes(selected.name, selected.bytes);
      } catch (caught) {
        setProjectError(caught instanceof Error ? caught.message : '项目打开失败');
      } finally {
        setIsProjectBusy(false);
      }
      return;
    }
    projectInputRef.current?.click();
  }, [isDirty, loadBytes]);

  const handleProjectFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(PROJECT_EXTENSION)) {
        setProjectError(`请选择 ${PROJECT_EXTENSION} 项目文件`);
        return;
      }
      void file.arrayBuffer().then((bytes) => loadBytes(file.name, bytes));
    },
    [loadBytes]
  );

  const saveProject = useCallback(async () => {
    if (!sourceFile) {
      setProjectError('请先导入原始图片或 PDF');
      return false;
    }
    setIsProjectBusy(true);
    setProjectError(null);
    try {
      const serialized = await serializeProject(useAppStore.getState());
      let savedName = serialized.defaultName;
      if (window.plotDigitizer) {
        const result = await window.plotDigitizer.saveProject({
          defaultName: serialized.defaultName,
          bytes: serialized.bytes
        });
        if (!result.saved) return false;
        savedName = result.name ?? savedName;
      } else {
        downloadProject(serialized.bytes, serialized.defaultName);
      }
      setProjectFileName(savedName);
      markSaved(serialized.updatedAt);
      await clearRecoverySnapshot().catch((error) =>
        console.warn('自动恢复快照清理失败:', error)
      );
      return true;
    } catch (caught) {
      setProjectError(caught instanceof Error ? caught.message : '项目保存失败');
      return false;
    } finally {
      setIsProjectBusy(false);
    }
  }, [markSaved, setProjectFileName, sourceFile]);

  return {
    projectInputRef,
    loadProjectBytes: loadBytes,
    handleProjectFileChange,
    openProject,
    saveProject,
    isProjectBusy,
    projectError,
    clearProjectError: () => setProjectError(null)
  };
}

function downloadProject(bytes: ArrayBuffer, name: string): void {
  const blob = new Blob([bytes], { type: 'application/x-plotdigitizer' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
