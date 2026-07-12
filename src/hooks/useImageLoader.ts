import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { pdfToImage, getPDFPageCount } from '../utils/pdfParser';

export function useImageLoader() {
  const {
    setImageData,
    setCurrentStep,
    clearDataPoints,
    clearCurves,
    saveCurrentPageSession,
    restorePageSession,
    resetPageSessions,
    setCurrentPageNumber
  } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageObjectUrlRef = useRef<string | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [currentPdfPage, setCurrentPdfPage] = useState<number>(1);
  const [isPdf, setIsPdf] = useState<boolean>(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const revokeImageObjectUrl = useCallback(() => {
    if (imageObjectUrlRef.current) {
      URL.revokeObjectURL(imageObjectUrlRef.current);
      imageObjectUrlRef.current = null;
    }
  }, []);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.target as HTMLImageElement;
      setImageData({
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      });
    },
    [setImageData]
  );

  const loadImageFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);
      resetPageSessions();
      setCurrentPageNumber(1);
      clearDataPoints();
      clearCurves();
      setCurrentStep('calibration');

      try {
        if (file.type === 'application/pdf') {
          revokeImageObjectUrl();
          setIsPdf(true);
          setPdfFile(file);
          const count = await getPDFPageCount(file);
          setPdfPageCount(count);
          const imgSrc = await pdfToImage(file, 1);
          restorePageSession(1, { src: imgSrc, name: file.name }, file.name);
          setCurrentPageNumber(1);
          setCurrentPdfPage(1);
        } else {
          // 检查文件是否是有效图片
          if (!file.type.startsWith('image/')) {
            throw new Error('请选择有效的图片文件（PNG, JPG, BMP 等）');
          }
          setIsPdf(false);
          setPdfFile(null);
          setPdfPageCount(0);
          setCurrentPdfPage(1);
          setCurrentPageNumber(1);
          revokeImageObjectUrl();
          const imgSrc = URL.createObjectURL(file);
          imageObjectUrlRef.current = imgSrc;
          setImageData({ src: imgSrc, name: file.name });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '文件加载失败';
        setError(errorMsg);
        console.error('文件加载错误:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      clearCurves,
      clearDataPoints,
      resetPageSessions,
      restorePageSession,
      revokeImageObjectUrl,
      setCurrentPageNumber,
      setCurrentStep,
      setImageData
    ]
  );

  useEffect(() => revokeImageObjectUrl, [revokeImageObjectUrl]);

  const loadPdfPage = useCallback(
    async (pageNumber: number) => {
      if (!pdfFile || pageNumber < 1 || pageNumber > pdfPageCount) return;

      setIsLoading(true);
      try {
        saveCurrentPageSession(currentPdfPage);
        const imgSrc = await pdfToImage(pdfFile, pageNumber);
        restorePageSession(
          pageNumber,
          { src: imgSrc, name: pdfFile.name },
          pdfFile.name
        );
        setCurrentPageNumber(pageNumber);
        setCurrentPdfPage(pageNumber);
        setError(null);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'PDF 页面加载失败';
        setError(errorMsg);
        console.error('PDF 页面加载错误:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [
      currentPdfPage,
      pdfFile,
      pdfPageCount,
      restorePageSession,
      saveCurrentPageSession,
      setCurrentPageNumber
    ]
  );

  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        loadImageFile(file);
      }
      e.target.value = '';
    },
    [loadImageFile]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    fileInputRef,
    handleImageLoad,
    handleFileChange,
    triggerFileUpload,
    loadImageFile,
    pdfPageCount,
    currentPdfPage,
    isPdf,
    loadPdfPage,
    error,
    isLoading,
    clearError
  };
}
