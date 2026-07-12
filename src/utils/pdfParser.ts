import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';

// 简化的 PDF 处理，确保最大兼容性
export async function pdfToImage(pdfFile: File, pageNumber: number = 1): Promise<string> {
  try {
    // 尝试初始化 worker
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      // 使用随应用打包的本地 worker，确保 Electron 离线可用。
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);

    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Could not get canvas context');
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderTask = page.render({
      canvasContext: context,
      viewport: viewport
    });

    await renderTask.promise;

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('PDF 处理失败:', error);
    throw new Error('PDF 文件解析失败，请使用图片格式。');
  }
}

export async function getPDFPageCount(pdfFile: File): Promise<number> {
  try {
    if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false
    });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error) {
    console.error('PDF 页数获取失败:', error);
    return 1; // 失败时返回 1 页作为默认
  }
}
