import { Eye, EyeOff, Trash2 } from 'lucide-react';
import type { WheelEvent } from 'react';
import { useAppStore } from '../../store/appStore';
import { formatNumber } from '../../utils/coordinate';

interface DataTableProps {
  className?: string;
}

export function DataTable({ className = '' }: DataTableProps) {
  const {
    dataPoints,
    deleteDataPoint,
    updateDataPointPosition,
    updateDataPointLabel,
    updateDataPointVisibility,
    axisConfig
  } = useAppStore();

  const handlePointWheel = (
    event: WheelEvent,
    point: { id: string; screenX: number; screenY: number }
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const direction = event.deltaY > 0 ? 1 : -1;
    const step = event.altKey ? 0.03 : 0.15;
    updateDataPointPosition(
      point.id,
      point.screenX + (event.shiftKey ? direction * step : 0),
      point.screenY + (event.shiftKey ? 0 : direction * step)
    );
  };

  if (dataPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <div className="text-center">
          <p className="text-sm">双击图片开始采集单点</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-auto custom-scrollbar bg-slate-50/30 ${className}`}>
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="bg-slate-100 sticky top-0 z-10 text-xs text-slate-600 shadow-sm">
          <tr>
            <th className="p-2 w-8 text-center border-b">#</th>
            <th className="p-2 w-24 border-b">Sample</th>
            <th className="p-2 border-b">{axisConfig.x.label}</th>
            <th className="p-2 border-b">{axisConfig.y.label}</th>
            <th className="p-2 w-20 border-b"></th>
          </tr>
        </thead>
        <tbody className="text-xs divide-y divide-slate-100 bg-white">
          {dataPoints.map((point, index) => (
            <tr
              key={point.id}
              className={`group hover:bg-blue-50 ${
                point.visible === false ? 'opacity-45' : ''
              }`}
            >
              <td className="p-2 text-center text-slate-400 font-mono">
                {index + 1}
              </td>
              <td className="p-2">
                <input
                  className="w-full bg-transparent outline-none focus:bg-blue-100 rounded px-1"
                  value={point.label}
                  onChange={(e) => updateDataPointLabel(point.id, e.target.value)}
                />
              </td>
              <td className="p-2 font-mono text-slate-600 truncate">
                {formatNumber(point.realX, axisConfig.x.scale, 4)}
              </td>
              <td className="p-2 font-mono text-slate-600 truncate">
                {formatNumber(point.realY, axisConfig.y.scale, 4)}
              </td>
              <td className="p-2 text-right">
                <button
                  data-wheel-lock="true"
                  onWheelCapture={(event) => handlePointWheel(event, point)}
                  className="mr-1 rounded border border-slate-200 px-1 text-[10px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                  title="滚轮上下微调；Shift+滚轮左右微调；Alt 更细"
                >
                  微
                </button>
                <button
                  onClick={() =>
                    updateDataPointVisibility(point.id, point.visible === false)
                  }
                  className="mr-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  title={point.visible === false ? '显示采集点' : '隐藏采集点'}
                >
                  {point.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
                <button
                  onClick={() => deleteDataPoint(point.id)}
                  className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
