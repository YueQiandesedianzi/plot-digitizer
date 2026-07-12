import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Copy, Download, Trash2, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import {
  applyNameOverrides,
  buildExportRows,
  buildNameItems,
  expandExportPlots,
  filterSessionsForExport,
  type NameItem
} from '../../domain/exportModel';
import {
  copyToClipboard,
  downloadFile,
  exportBundle,
  exportToCSV,
  exportToXLSX,
  revokeDownloadUrl
} from '../../services/exportFiles';
import { ExportOptions, PageSession } from '../../types';
import { generateInterpolatedPoints } from '../../utils/interpolation';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJumpToPage?: (pageNumber: number) => void | Promise<void>;
}

type ExportStatus = {
  type: 'success' | 'error';
  message: string;
} | null;

type DownloadLink = {
  url: string;
  filename: string;
} | null;

const scopeLabels: Record<NonNullable<ExportOptions['dataScope']>, string> = {
  'curve-interpolated': '整条曲线插值点',
  all: '全部数据',
  points: '单点数据',
  'curve-controls': '曲线控制点'
};

const pageScopeLabels: Record<NonNullable<ExportOptions['pageScope']>, string> = {
  current: '当前页',
  all: '全部页'
};

export function ExportDialog({ isOpen, onClose, onJumpToPage }: ExportDialogProps) {
  const {
    currentPageNumber,
    pageSessions,
    imageData,
    dataPoints,
    curves,
    axisConfig,
    calibrationLines,
    calibrationValues,
    activeCurveId,
    activePlotId,
    currentStep,
    collectionMode,
    defaultSampleLabel,
    plotRegions,
    deleteExportItem
  } = useAppStore();
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'csv',
    precision: 4,
    delimiter: ',',
    dataScope: 'curve-interpolated',
    pageScope: 'current'
  });
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<ExportStatus>(null);
  const [downloadLink, setDownloadLink] = useState<DownloadLink>(null);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [excludedKeys, setExcludedKeys] = useState<Record<string, boolean>>({});

  const currentPlotRegions = useMemo(() => {
    const activePlot =
      plotRegions.find((plot) => plot.id === activePlotId) ?? plotRegions[0];

    if (!activePlot) return plotRegions;

    return plotRegions.map((plot) =>
      plot.id === activePlot.id
        ? {
            ...plot,
            calibrationLines,
            calibrationValues,
            axisConfig,
            dataPoints,
            curves,
            activeCurveId,
            collectionMode,
            defaultSampleLabel
          }
        : plot
    );
  }, [
    activeCurveId,
    activePlotId,
    axisConfig,
    calibrationLines,
    calibrationValues,
    collectionMode,
    curves,
    dataPoints,
    defaultSampleLabel,
    plotRegions
  ]);

  const currentSession: PageSession = useMemo(
    () => ({
      pageNumber: currentPageNumber,
      imageData,
      plotRegions: currentPlotRegions,
      activePlotId,
      calibrationLines,
      calibrationValues,
      axisConfig,
      dataPoints,
      curves,
      activeCurveId,
      currentStep,
      collectionMode,
      defaultSampleLabel
    }),
    [
      activeCurveId,
      activePlotId,
      axisConfig,
      calibrationLines,
      calibrationValues,
      collectionMode,
      currentPageNumber,
      currentPlotRegions,
      currentStep,
      curves,
      dataPoints,
      defaultSampleLabel,
      imageData
    ]
  );

  const mergedPageSessions = useMemo(() => {
    const merged = new Map<number, PageSession>();
    Object.values(pageSessions).forEach((session) => {
      merged.set(session.pageNumber, session);
    });
    merged.set(currentPageNumber, currentSession);
    return [...merged.values()].sort((a, b) => a.pageNumber - b.pageNumber);
  }, [currentPageNumber, currentSession, pageSessions]);

  const nameItems = useMemo(
    () => buildNameItems(mergedPageSessions),
    [mergedPageSessions]
  );
  const renamedPageSessions = useMemo(
    () =>
      filterSessionsForExport(
        applyNameOverrides(mergedPageSessions, nameOverrides),
        excludedKeys
      ),
    [excludedKeys, mergedPageSessions, nameOverrides]
  );

  const activePages =
    exportOptions.pageScope === 'all'
      ? renamedPageSessions
      : renamedPageSessions.filter((page) => page.pageNumber === currentPageNumber);
  const activePlots = expandExportPlots(activePages);

  const pointCount = activePlots.reduce(
    (sum, plot) => sum + plot.dataPoints.length,
    0
  );
  const controlCount = activePlots.reduce(
    (sum, plot) =>
      sum +
      plot.curves.reduce(
        (curveSum, curve) => curveSum + curve.controlPoints.length,
        0
      ),
    0
  );
  const interpolatedCount = activePlots.reduce(
    (sum, plot) =>
      sum +
      plot.curves.reduce(
        (curveSum, curve) =>
          curveSum +
          generateInterpolatedPoints(
            curve,
            plot.axisConfig,
            plot.calibrationLines,
            plot.calibrationValues
          ).length,
        0
      ),
    0
  );
  const screenshotCount = activePlots.filter(
    (plot) => plot.screenshot?.dataUrl
  ).length;

  const params = useMemo(
    () => ({
      pageNumber: currentPageNumber,
      dataPoints,
      curves,
      axisConfig,
      calibrationLines,
      calibrationValues,
      pageSessions: renamedPageSessions,
      options: exportOptions
    }),
    [
      axisConfig,
      calibrationLines,
      calibrationValues,
      currentPageNumber,
      curves,
      dataPoints,
      exportOptions,
      renamedPageSessions
    ]
  );
  const selectedRowCount = useMemo(() => buildExportRows(params).length, [params]);
  const hasExportableData = selectedRowCount > 0;

  useEffect(() => {
    if (!isOpen && downloadLink) {
      revokeDownloadUrl(downloadLink.url);
      setDownloadLink(null);
    }
  }, [downloadLink, isOpen]);

  if (!isOpen) return null;

  const setOption = (patch: Partial<ExportOptions>) => {
    setStatus(null);
    if (downloadLink) {
      revokeDownloadUrl(downloadLink.url);
      setDownloadLink(null);
    }
    setExportOptions((prev) => ({ ...prev, ...patch }));
  };

  const replaceDownloadLink = (nextLink: Exclude<DownloadLink, null>) => {
    if (downloadLink) {
      revokeDownloadUrl(downloadLink.url);
    }
    setDownloadLink(nextLink);
  };

  const handleExport = () => {
    try {
      if (!hasExportableData) {
        setStatus({
          type: 'error',
          message: '当前选择的数据范围没有可导出的数据。'
        });
        return;
      }

      if (exportOptions.format === 'csv') {
        const csvContent = exportToCSV(params);
        const filename = imageData.name
          ? `${imageData.name.replace(/\.[^/.]+$/, '')}.csv`
          : 'data.csv';
        const url = downloadFile(
          `\ufeff${csvContent}`,
          filename,
          'text/csv;charset=utf-8'
        );
        replaceDownloadLink({ url, filename });
        setStatus({
          type: 'success',
          message: `已生成 ${filename}，共 ${selectedRowCount} 行数据。`
        });
      } else {
        const filename = imageData.name
          ? imageData.name.replace(/\.[^/.]+$/, '')
          : 'data';
        const url = exportToXLSX(params, filename);
        replaceDownloadLink({ url, filename: `${filename}.xlsx` });
        setStatus({
          type: 'success',
          message: `已生成 ${filename}.xlsx，共 ${selectedRowCount} 行数据。`
        });
      }
    } catch (error) {
      console.error('Failed to export:', error);
      setStatus({
        type: 'error',
        message: '导出失败，请先复制到剪贴板作为备用。'
      });
    }
  };

  const handleCopy = async () => {
    try {
      if (!hasExportableData) {
        setStatus({
          type: 'error',
          message: '当前选择的数据范围没有可复制的数据。'
        });
        return;
      }

      await copyToClipboard(params);
      setCopied(true);
      setStatus({
        type: 'success',
        message: `已复制 ${selectedRowCount} 行数据，可直接粘贴到 Excel。`
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      setStatus({
        type: 'error',
        message: '复制失败，请检查浏览器剪贴板权限后重试。'
      });
    }
  };

  const handleBundleExport = async () => {
    try {
      if (!hasExportableData && screenshotCount === 0) {
        setStatus({
          type: 'error',
          message: '当前没有可打包的数据或截图。'
        });
        return;
      }

      const filename = imageData.name
        ? imageData.name.replace(/\.[^/.]+$/, '')
        : 'plotdigitizer_export';
      const url = await exportBundle(
        {
          ...params,
          options: { ...exportOptions, pageScope: 'all', dataScope: 'all' }
        },
        filename
      );
      replaceDownloadLink({ url, filename: `${filename}.zip` });
      setStatus({
        type: 'success',
        message: `已生成跨页数据包，包含 ${selectedRowCount} 行当前选择数据和 ${screenshotCount} 张截图。`
      });
    } catch (error) {
      console.error('Failed to export bundle:', error);
      setStatus({
        type: 'error',
        message: '打包导出失败，请先确认截图和采集数据后重试。'
      });
    }
  };

  const handleJumpToItem = async (pageNumber: number) => {
    await onJumpToPage?.(pageNumber);
    onClose();
  };

  const handleDeleteNameItem = (item: NameItem) => {
    deleteExportItem(item.pageNumber, item.kind, item.plotId, item.targetId);
    setExcludedKeys((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    setNameOverrides((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    setStatus(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[calc(100vh-32px)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-800">导出数据</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="关闭导出窗口"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto min-h-0">
          <div className="grid grid-cols-4 gap-2 text-[11px] text-slate-500">
            <div className="rounded border border-slate-200 p-2">
              <div className="font-bold text-slate-800">{pointCount}</div>
              单点
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="font-bold text-slate-800">{controlCount}</div>
              控制点
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="font-bold text-slate-800">{interpolatedCount}</div>
              曲线插值点
            </div>
            <div className="rounded border border-slate-200 p-2">
              <div className="font-bold text-slate-800">{screenshotCount}</div>
              截图
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              导出页码
            </label>
            <div className="flex gap-2">
              {Object.entries(pageScopeLabels).map(([scope, label]) => (
                <button
                  key={scope}
                  onClick={() =>
                    setOption({ pageScope: scope as ExportOptions['pageScope'] })
                  }
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    exportOptions.pageScope === scope
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              数据范围
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(scopeLabels).map(([scope, label]) => (
                <button
                  key={scope}
                  onClick={() =>
                    setOption({ dataScope: scope as ExportOptions['dataScope'] })
                  }
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    exportOptions.dataScope === scope
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              小数位数: {exportOptions.precision}
            </label>
            <input
              type="range"
              min="0"
              max="10"
              value={exportOptions.precision}
              onChange={(event) =>
                setOption({ precision: parseInt(event.target.value) })
              }
              className="w-full"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <span className="text-xs font-bold text-slate-700">
                导出命名确认
              </span>
              <span className="text-[11px] text-slate-400">
                {nameItems.length} 项
              </span>
            </div>
            <div className="max-h-40 overflow-auto p-2 space-y-1">
              {nameItems.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-slate-400">
                  暂无可命名的数据。
                </div>
              ) : (
                nameItems.map((item) => (
                  <div
                    key={item.key}
                    onDoubleClick={() => handleJumpToItem(item.pageNumber)}
                    title="双击跳转到该页"
                    className="grid grid-cols-[18px_72px_1fr_24px] items-center gap-2 rounded px-1 py-0.5 hover:bg-indigo-50"
                  >
                    <input
                      type="checkbox"
                      checked={!excludedKeys[item.key]}
                      onChange={(event) =>
                        setExcludedKeys((prev) => ({
                          ...prev,
                          [item.key]: !event.target.checked
                        }))
                      }
                      onDoubleClick={(event) => event.stopPropagation()}
                    />
                    <label className="text-[11px] text-slate-500 truncate">
                      P{item.pageNumber} {item.label}
                    </label>
                    <input
                      value={nameOverrides[item.key] ?? item.value}
                      onDoubleClick={(event) => event.stopPropagation()}
                      onChange={(event) =>
                        setNameOverrides((prev) => ({
                          ...prev,
                          [item.key]: event.target.value
                        }))
                      }
                      className="rounded border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteNameItem(item);
                      }}
                      onDoubleClick={(event) => event.stopPropagation()}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-300 hover:bg-red-50 hover:text-red-500"
                      title="删除数据"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            当前选择将导出 <span className="font-bold">{selectedRowCount}</span> 行数据。
          </div>

          {status && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                status.type === 'success'
                  ? 'border border-green-200 bg-green-50 text-green-700'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {status.type === 'success' ? (
                <Check size={15} className="mt-0.5 shrink-0" />
              ) : (
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
              )}
              <span>{status.message}</span>
            </div>
          )}

          {downloadLink && (
            <a
              href={downloadLink.url}
              download={downloadLink.filename}
              className="flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              <Download size={15} />
              再次下载 {downloadLink.filename}
            </a>
          )}
        </div>

        <div className="flex gap-3 p-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <button
            onClick={handleCopy}
            disabled={!hasExportableData}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              copied
                ? 'bg-green-600 text-white'
                : !hasExportableData
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            {copied ? '已复制' : '复制到剪贴板'}
          </button>
          <button
            onClick={handleExport}
            disabled={!hasExportableData}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              !hasExportableData
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
            }`}
          >
            <Download size={18} />
            导出文件
          </button>
        </div>

        <div className="px-4 pb-4 bg-slate-50 shrink-0">
          <button
            onClick={handleBundleExport}
            disabled={!hasExportableData && screenshotCount === 0}
            className={`w-full py-2.5 px-4 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
              !hasExportableData && screenshotCount === 0
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            <Download size={18} />
            打包导出全部页数据 + 截图
          </button>
        </div>
      </div>
    </div>
  );
}
