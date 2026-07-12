import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { preparePdfPage, prepareSource } from '../services/sourceLoader';
import {
  commitSourceObjectUrl,
  discardPreparedObjectUrl
} from '../services/sourceUrlRegistry';

export function useImageLoader() {
  const {
    setImageData,
    sourceFile,
    sourceKind,
    sourcePageCount,
    currentPageNumber,
    isDirty,
    replaceSource,
    saveCurrentPageSession,
    restorePageSession
  } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskIdRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleImageLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const image = event.target as HTMLImageElement;
      setImageData({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
    },
    [setImageData]
  );

  const loadImageFile = useCallback(
    async (file: File) => {
      if (
        isDirty &&
        !window.confirm('当前项目存在未保存修改，确定要替换原始文件吗？')
      ) {
        return false;
      }

      const taskId = ++taskIdRef.current;
      setError(null);
      setIsLoading(true);
      let prepared: Awaited<ReturnType<typeof prepareSource>> | null = null;

      try {
        prepared = await prepareSource(file);
        if (taskId !== taskIdRef.current) {
          discardPreparedObjectUrl(prepared.objectUrl);
          return false;
        }

        replaceSource(prepared);
        commitSourceObjectUrl(prepared.objectUrl);
        setError(null);
        return true;
      } catch (caught) {
        if (taskId !== taskIdRef.current) return false;
        const message = caught instanceof Error ? caught.message : '文件加载失败';
        setError(message);
        console.error('文件加载错误:', caught);
        return false;
      } finally {
        if (taskId === taskIdRef.current) setIsLoading(false);
      }
    },
    [isDirty, replaceSource]
  );

  const loadPdfPage = useCallback(
    async (pageNumber: number) => {
      if (
        sourceKind !== 'pdf' ||
        !sourceFile ||
        pageNumber < 1 ||
        pageNumber > sourcePageCount ||
        pageNumber === currentPageNumber
      ) {
        return;
      }

      const taskId = ++taskIdRef.current;
      setIsLoading(true);
      try {
        const pageImage = await preparePdfPage(sourceFile, pageNumber);
        if (taskId !== taskIdRef.current) return;

        saveCurrentPageSession(currentPageNumber);
        restorePageSession(pageNumber, pageImage, sourceFile.name);
        setError(null);
      } catch (caught) {
        if (taskId !== taskIdRef.current) return;
        const message = caught instanceof Error ? caught.message : 'PDF 页面加载失败';
        setError(message);
        console.error('PDF 页面加载错误:', caught);
      } finally {
        if (taskId === taskIdRef.current) setIsLoading(false);
      }
    },
    [
      currentPageNumber,
      restorePageSession,
      saveCurrentPageSession,
      sourceFile,
      sourceKind,
      sourcePageCount
    ]
  );

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void loadImageFile(file);
      event.target.value = '';
    },
    [loadImageFile]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    fileInputRef,
    handleImageLoad,
    handleFileChange,
    triggerFileUpload,
    loadImageFile,
    pdfPageCount: sourceKind === 'pdf' ? sourcePageCount : 0,
    currentPdfPage: currentPageNumber,
    isPdf: sourceKind === 'pdf',
    loadPdfPage,
    error,
    isLoading,
    clearError
  };
}
