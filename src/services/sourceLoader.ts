import type { ImageData, ProjectSourceKind } from '../types';
import { getPDFPageCount, pdfToImage } from '../utils/pdfParser';

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp'
]);

export interface PreparedSource {
  file: File;
  kind: ProjectSourceKind;
  pageCount: number;
  firstPageImage: ImageData;
  objectUrl: string | null;
}

export async function prepareSource(file: File): Promise<PreparedSource> {
  const kind = await detectSourceKind(file);
  if (kind === 'pdf') {
    const pageCount = await getPDFPageCount(file);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new Error('PDF 不包含可读取页面');
    }
    const src = await pdfToImage(file, 1);
    const dimensions = await decodeImage(src);
    return {
      file,
      kind,
      pageCount,
      firstPageImage: { src, name: file.name, ...dimensions },
      objectUrl: null
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await decodeImage(objectUrl);
    return {
      file,
      kind,
      pageCount: 1,
      firstPageImage: { src: objectUrl, name: file.name, ...dimensions },
      objectUrl
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function preparePdfPage(file: File, pageNumber: number): Promise<ImageData> {
  const src = await pdfToImage(file, pageNumber);
  const dimensions = await decodeImage(src);
  return { src, name: file.name, ...dimensions };
}

async function detectSourceKind(file: File): Promise<ProjectSourceKind> {
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdfSignature =
    header.length === 5 && String.fromCharCode(...header) === '%PDF-';
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    if (!isPdfSignature) throw new Error('PDF 文件头无效或文件已损坏');
    return 'pdf';
  }
  if (!SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase())) {
    throw new Error('请选择 PNG、JPEG、WebP、GIF 或 BMP 图片');
  }
  return 'image';
}

function decodeImage(src: string): Promise<Pick<ImageData, 'naturalWidth' | 'naturalHeight'>> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth < 1 || image.naturalHeight < 1) {
        reject(new Error('图片尺寸无效'));
        return;
      }
      resolve({
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight
      });
    };
    image.onerror = () => reject(new Error('图片解码失败，文件可能已损坏'));
    image.src = src;
  });
}
