import { useEffect, useState } from 'react';
import { CheckCircle, Settings, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useCalibration } from '../../hooks/useCalibration';
import { useSavedPresets } from '../../hooks/useSavedPresets';
import type { AxisScale } from '../../types';

const scaleOptions: Array<{ value: AxisScale; label: string }> = [
  { value: 'linear', label: 'LINEAR' },
  { value: 'log10', label: 'LOG10' },
  { value: 'ln', label: 'LN' },
  { value: 'custom', label: '公式' }
];

interface CalibrationPanelProps {
  isBoxDetectMode?: boolean;
  detectStatus?: string;
  onToggleBoxDetect?: () => void;
}

export function CalibrationPanel({
  isBoxDetectMode = false,
  detectStatus = '',
  onToggleBoxDetect
}: CalibrationPanelProps) {
  const { setCurrentStep } = useAppStore();
  const {
    presets: xTitlePresets,
    savePreset: saveXTitle,
    deletePreset: deleteXTitle
  } = useSavedPresets(
    'plotdigitizer-axis-x-presets',
    ['X-Value', 'Time (s)', 'Strain (%)', 'Temperature (C)', 'Diameter (nm)']
  );
  const {
    presets: yTitlePresets,
    savePreset: saveYTitle,
    deletePreset: deleteYTitle
  } = useSavedPresets(
    'plotdigitizer-axis-y-presets',
    ['Y-Value', 'Stress (MPa)', 'Intensity (%)', 'Force (N)', 'Viscosity (Pa.s)']
  );
  const {
    calibrationValues,
    axisConfig,
    setCalibrationValue,
    setAxisScale,
    setAxisLabel,
    setAxisFormula,
    setAxisLogInputMode
  } = useCalibration();
  const [valueInputs, setValueInputs] = useState({
    x1: String(calibrationValues.x1),
    x2: String(calibrationValues.x2),
    y1: String(calibrationValues.y1),
    y2: String(calibrationValues.y2)
  });

  useEffect(() => {
    setValueInputs({
      x1: String(calibrationValues.x1),
      x2: String(calibrationValues.x2),
      y1: String(calibrationValues.y1),
      y2: String(calibrationValues.y2)
    });
  }, [
    calibrationValues.x1,
    calibrationValues.x2,
    calibrationValues.y1,
    calibrationValues.y2
  ]);

  const updateCalibrationInput = (
    key: keyof typeof valueInputs,
    value: string
  ) => {
    setValueInputs((previous) => ({ ...previous, [key]: value }));
    const parsed = Number(value);
    const completeNumberPattern =
      /^[+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:e[+-]?\d+)?$/i;
    if (completeNumberPattern.test(value.trim()) && Number.isFinite(parsed)) {
      setCalibrationValue(key, parsed);
    }
  };

  const commitCalibrationInput = (key: keyof typeof valueInputs) => {
    const parsed = Number(valueInputs[key]);
    if (Number.isFinite(parsed)) {
      setCalibrationValue(key, parsed);
      setValueInputs((previous) => ({ ...previous, [key]: String(parsed) }));
      return;
    }

    setValueInputs((previous) => ({
      ...previous,
      [key]: String(calibrationValues[key])
    }));
  };

  const renderLogInputMode = (axis: 'x' | 'y') => {
    const config = axisConfig[axis];
    if (config.scale !== 'log' && config.scale !== 'log10' && config.scale !== 'ln') {
      return null;
    }

    const activeMode = config.logInputMode ?? 'value';
    return (
      <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 border border-slate-200">
        {[
          ['value', '真实数'],
          ['exponent', '指数刻度']
        ].map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setAxisLogInputMode(axis, mode as 'value' | 'exponent')}
            className={`rounded py-1 text-[11px] font-bold ${
              activeMode === mode
                ? axis === 'x'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'bg-white text-red-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <div className="p-5 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
          <Settings size={16} className="text-indigo-600" />
          步骤 1: 坐标轴校准
        </h3>
        <p className="text-xs text-blue-700 mb-4 bg-blue-50 p-2 rounded border border-blue-100">
          拖动画布中的蓝色 X 线和红色 Y 线对齐刻度，然后输入对应的真实坐标值。
        </p>

        <div className="mb-4 rounded border border-cyan-100 bg-cyan-50 p-2 text-xs text-cyan-800">
          <div className="flex items-center justify-between gap-2">
            <span>
              先框选完整图区，系统会自动寻找矩形内最明显的横纵坐标轴。
            </span>
            <button
              type="button"
              onClick={onToggleBoxDetect}
              className={`shrink-0 rounded px-2 py-1 text-[11px] font-bold ${
                isBoxDetectMode
                  ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                  : 'bg-white text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
              }`}
            >
              {isBoxDetectMode ? '正在框选' : '框选识别'}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-cyan-700">
            {detectStatus || '识别后仍可拖动蓝色/红色线，或用滚轮做微调。'}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="text-xs font-bold text-blue-600">X 轴 (Horizontal)</div>
              <div className="flex bg-white rounded border border-slate-200 p-0.5">
                {scaleOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setAxisScale('x', option.value)}
                    className={`text-[10px] px-2 py-0.5 uppercase rounded-sm transition-colors ${
                      axisConfig.x.scale === option.value ||
                      (axisConfig.x.scale === 'log' && option.value === 'log10')
                        ? 'bg-blue-100 text-blue-700 font-bold'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {renderLogInputMode('x')}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400">X1 (Left)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={valueInputs.x1}
                  onChange={(e) => updateCalibrationInput('x1', e.target.value)}
                  onBlur={() => commitCalibrationInput('x1')}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400">X2 (Right)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={valueInputs.x2}
                  onChange={(e) => updateCalibrationInput('x2', e.target.value)}
                  onBlur={() => commitCalibrationInput('x2')}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">轴标题</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                list="x-axis-title-presets"
                value={axisConfig.x.label}
                onChange={(e) => setAxisLabel('x', e.target.value)}
                onBlur={() => saveXTitle(axisConfig.x.label)}
              />
              <datalist id="x-axis-title-presets">
                {xTitlePresets.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => saveXTitle(axisConfig.x.label)}
                className="mt-1 text-[10px] font-bold text-blue-600 hover:text-blue-700"
              >
                保存为常用标题
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {xTitlePresets.map((title) => (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1 rounded border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700"
                  >
                    <button
                      type="button"
                      onClick={() => setAxisLabel('x', title)}
                      className="max-w-[120px] truncate"
                    >
                      {title}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteXTitle(title)}
                      className="text-blue-300 hover:text-red-500"
                      title="删除常用标题"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            {axisConfig.x.scale === 'custom' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400">
                  X 轴公式（用 t 表示 0-1 位置）
                </label>
                <input
                  type="text"
                  placeholder="例如：v1 + t * (v2 - v1)"
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={axisConfig.x.formula ?? ''}
                  onChange={(e) => setAxisFormula('x', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex justify-between items-center">
              <div className="text-xs font-bold text-red-600">Y 轴 (Vertical)</div>
              <div className="flex bg-white rounded border border-slate-200 p-0.5">
                {scaleOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setAxisScale('y', option.value)}
                    className={`text-[10px] px-2 py-0.5 uppercase rounded-sm transition-colors ${
                      axisConfig.y.scale === option.value ||
                      (axisConfig.y.scale === 'log' && option.value === 'log10')
                        ? 'bg-red-100 text-red-700 font-bold'
                        : 'text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {renderLogInputMode('y')}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400">Y1 (Bottom)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={valueInputs.y1}
                  onChange={(e) => updateCalibrationInput('y1', e.target.value)}
                  onBlur={() => commitCalibrationInput('y1')}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400">Y2 (Top)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={valueInputs.y2}
                  onChange={(e) => updateCalibrationInput('y2', e.target.value)}
                  onBlur={() => commitCalibrationInput('y2')}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">轴标题</label>
              <input
                type="text"
                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-red-500"
                list="y-axis-title-presets"
                value={axisConfig.y.label}
                onChange={(e) => setAxisLabel('y', e.target.value)}
                onBlur={() => saveYTitle(axisConfig.y.label)}
              />
              <datalist id="y-axis-title-presets">
                {yTitlePresets.map((title) => (
                  <option key={title} value={title} />
                ))}
              </datalist>
              <button
                type="button"
                onClick={() => saveYTitle(axisConfig.y.label)}
                className="mt-1 text-[10px] font-bold text-red-600 hover:text-red-700"
              >
                保存为常用标题
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {yTitlePresets.map((title) => (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700"
                  >
                    <button
                      type="button"
                      onClick={() => setAxisLabel('y', title)}
                      className="max-w-[120px] truncate"
                    >
                      {title}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteYTitle(title)}
                      className="text-red-300 hover:text-red-600"
                      title="删除常用标题"
                    >
                      <Trash2 size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            {axisConfig.y.scale === 'custom' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400">
                  Y 轴公式（用 t 表示 0-1 位置）
                </label>
                <input
                  type="text"
                  placeholder="例如：v1 + t * (v2 - v1)"
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={axisConfig.y.formula ?? ''}
                  onChange={(e) => setAxisFormula('y', e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 mt-auto border-t border-slate-200 bg-white">
        <button
          onClick={() => setCurrentStep('digitizing')}
          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg shadow-green-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <CheckCircle size={18} />
          确认校准 & 开始采集
        </button>
      </div>
    </div>
  );
}
