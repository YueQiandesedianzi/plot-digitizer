import {
  AxisConfig,
  CalibrationLines,
  CalibrationValues,
  CurveSeries,
  DataPoint,
  ImageData,
  ScreenshotAsset
} from '../types';
import { generateInterpolatedPoints } from './interpolation';

interface PlotScreenshotParams {
  imageData: ImageData;
  pageNumber: number;
  plotName: string;
  calibrationLines: CalibrationLines;
  calibrationValues: CalibrationValues;
  axisConfig: { x: AxisConfig; y: AxisConfig };
  dataPoints: DataPoint[];
  curves: CurveSeries[];
}

const PADDING = 48;

export async function createPlotScreenshot({
  imageData,
  pageNumber,
  plotName,
  calibrationLines,
  calibrationValues,
  axisConfig,
  dataPoints,
  curves
}: PlotScreenshotParams): Promise<ScreenshotAsset> {
  if (!imageData.src) {
    throw new Error('No image loaded.');
  }

  const image = await loadImage(imageData.src);
  const x1 = percentToPixel(Math.min(calibrationLines.x1, calibrationLines.x2), image.width);
  const x2 = percentToPixel(Math.max(calibrationLines.x1, calibrationLines.x2), image.width);
  const y1 = percentToPixel(Math.min(calibrationLines.y1, calibrationLines.y2), image.height);
  const y2 = percentToPixel(Math.max(calibrationLines.y1, calibrationLines.y2), image.height);

  const cropX = Math.max(0, x1 - PADDING);
  const cropY = Math.max(0, y1 - PADDING);
  const cropRight = Math.min(image.width, x2 + PADDING);
  const cropBottom = Math.min(image.height, y2 + PADDING);
  const cropWidth = Math.max(1, cropRight - cropX);
  const cropHeight = Math.max(1, cropBottom - cropY);

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight + 44;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas is not available.');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  drawCalibrationBox(ctx, calibrationLines, image.width, image.height, cropX, cropY);
  drawCurves(ctx, curves, axisConfig, calibrationLines, calibrationValues, image, cropX, cropY);
  drawPoints(ctx, dataPoints, image, cropX, cropY);
  drawFooter(ctx, canvas.width, cropHeight, pageNumber, plotName);

  return {
    name: `page-${String(pageNumber).padStart(3, '0')}_${plotName}.png`,
    dataUrl: canvas.toDataURL('image/png'),
    createdAt: new Date().toISOString()
  };
}

function drawCalibrationBox(
  ctx: CanvasRenderingContext2D,
  calibrationLines: CalibrationLines,
  imageWidth: number,
  imageHeight: number,
  cropX: number,
  cropY: number
) {
  const x1 = percentToPixel(calibrationLines.x1, imageWidth) - cropX;
  const x2 = percentToPixel(calibrationLines.x2, imageWidth) - cropX;
  const y1 = percentToPixel(calibrationLines.y1, imageHeight) - cropY;
  const y2 = percentToPixel(calibrationLines.y2, imageHeight) - cropY;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(x1, 0);
  ctx.lineTo(x1, ctx.canvas.height);
  ctx.moveTo(x2, 0);
  ctx.lineTo(x2, ctx.canvas.height);
  ctx.stroke();

  ctx.strokeStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(0, y1);
  ctx.lineTo(ctx.canvas.width, y1);
  ctx.moveTo(0, y2);
  ctx.lineTo(ctx.canvas.width, y2);
  ctx.stroke();
  ctx.restore();
}

function drawCurves(
  ctx: CanvasRenderingContext2D,
  curves: CurveSeries[],
  axisConfig: { x: AxisConfig; y: AxisConfig },
  calibrationLines: CalibrationLines,
  calibrationValues: CalibrationValues,
  image: HTMLImageElement,
  cropX: number,
  cropY: number
) {
  curves.forEach((curve) => {
    if (!curve.visible) return;
    const points = generateInterpolatedPoints(
      curve,
      axisConfig,
      calibrationLines,
      calibrationValues
    );

    if (points.length >= 2) {
      ctx.save();
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = percentToPixel(point.screenX, image.width) - cropX;
        const y = percentToPixel(point.screenY, image.height) - cropY;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.restore();
    }

    curve.controlPoints.forEach((point) =>
      drawMarker(ctx, point.screenX, point.screenY, image, cropX, cropY, curve.color)
    );
  });
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  points: DataPoint[],
  image: HTMLImageElement,
  cropX: number,
  cropY: number
) {
  points.forEach((point) =>
    drawMarker(ctx, point.screenX, point.screenY, image, cropX, cropY, '#16a34a')
  );
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  image: HTMLImageElement,
  cropX: number,
  cropY: number,
  color: string
) {
  const x = percentToPixel(screenX, image.width) - cropX;
  const y = percentToPixel(screenY, image.height) - cropY;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  imageHeight: number,
  pageNumber: number,
  plotName: string
) {
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, imageHeight, width, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`Page ${pageNumber} - ${plotName}`, 14, imageHeight + 28);
  ctx.restore();
}

function percentToPixel(value: number, total: number): number {
  return (value / 100) * total;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed.'));
    image.src = src;
  });
}
