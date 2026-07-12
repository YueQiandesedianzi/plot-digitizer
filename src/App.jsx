import React, { useState, useRef, useEffect } from 'react';
import { Upload, Trash2, Copy, Move, Crosshair, ZoomIn, CheckCircle, RotateCcw, ChevronRight, Settings, Edit3, Image as ImageIcon, RefreshCw, Check, AlertCircle, Lock } from 'lucide-react';

const PlotDigitizerWorkflow = () => {
    // --- 状态管理 ---
    const [imageSrc, setImageSrc] = useState(null);
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });

    // 核心流程状态: 'calibration' | 'digitizing'
    const [step, setStep] = useState('calibration');

    const [points, setPoints] = useState([]);

    // 校准线的百分比位置 (0-100%)
    const [calibLines, setCalibLines] = useState({
        x1: 10, x2: 90,
        y1: 90, y2: 10
    });

    // 校准线对应的真实值
    const [calibValues, setCalibValues] = useState({
        x1: 0, x2: 10,
        y1: 0, y2: 100
    });

    // 坐标轴类型
    const [axisScales, setAxisScales] = useState({ x: 'linear', y: 'linear' });
    const [axisLabels, setAxisLabels] = useState({ x: 'X-Value', y: 'Y-Value' });

    // UI 状态
    const [draggingLine, setDraggingLine] = useState(null);
    const [magnifier, setMagnifier] = useState({ show: false, x: 0, y: 0, imgX: 0, imgY: 0 });
    const [defaultSampleName, setDefaultSampleName] = useState("Sample A");
    const [copied, setCopied] = useState(false);

    // Refs
    const containerRef = useRef(null);
    const imageRef = useRef(null);
    const fileInputRef = useRef(null);

    // --- 图像处理 ---
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
            const url = URL.createObjectURL(file);
            setImageSrc(url);

            // 换图时重置流程
            setPoints([]);
            setCalibLines({ x1: 10, x2: 90, y1: 90, y2: 10 });
            setStep('calibration'); // 强制回到第一步
        }
        e.target.value = null;
    };

    const onImageLoad = (e) => {
        setNaturalSize({
            width: e.target.naturalWidth,
            height: e.target.naturalHeight
        });
    };

    const resetApp = () => {
        if (window.confirm("确定要重置所有内容吗？")) {
            if (imageSrc) URL.revokeObjectURL(imageSrc);
            setImageSrc(null);
            setPoints([]);
            setCalibLines({ x1: 10, x2: 90, y1: 90, y2: 10 });
            setCalibValues({ x1: 0, x2: 10, y1: 0, y2: 100 });
            setStep('calibration');
        }
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    // --- 核心算法 ---
    const calculateRealValue = (percentX, percentY) => {
        let realX, realY;

        // X Calculation
        const xRatio = (percentX - calibLines.x1) / (calibLines.x2 - calibLines.x1);
        const vX1 = parseFloat(calibValues.x1);
        const vX2 = parseFloat(calibValues.x2);

        if (axisScales.x === 'log') {
            const safeVX1 = vX1 > 0 ? vX1 : 1e-9;
            const safeVX2 = vX2 > 0 ? vX2 : 1e-9;
            const logX = Math.log10(safeVX1) + xRatio * (Math.log10(safeVX2) - Math.log10(safeVX1));
            realX = Math.pow(10, logX);
        } else {
            realX = vX1 + xRatio * (vX2 - vX1);
        }

        // Y Calculation
        const yRatio = (percentY - calibLines.y1) / (calibLines.y2 - calibLines.y1);
        const vY1 = parseFloat(calibValues.y1);
        const vY2 = parseFloat(calibValues.y2);

        if (axisScales.y === 'log') {
            const safeVY1 = vY1 > 0 ? vY1 : 1e-9;
            const safeVY2 = vY2 > 0 ? vY2 : 1e-9;
            const logY = Math.log10(safeVY1) + yRatio * (Math.log10(safeVY2) - Math.log10(safeVY1));
            realY = Math.pow(10, logY);
        } else {
            realY = vY1 + yRatio * (vY2 - vY1);
        }

        return { x: realX, y: realY };
    };

    // --- 交互处理 ---
    const handleMouseDownLine = (e, lineId) => {
        // 只有在校准模式下允许拖动
        if (step !== 'calibration') return;

        e.stopPropagation();
        setDraggingLine(lineId);
    };

    const handleMouseMove = (e) => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const percentX = Math.max(0, Math.min(100, (clientX / rect.width) * 100));
        const percentY = Math.max(0, Math.min(100, (clientY / rect.height) * 100));

        // 放大镜：任何时候只要有图都显示，方便查看
        if (imageSrc && !draggingLine) {
            setMagnifier({
                show: true,
                x: clientX,
                y: clientY,
                imgX: (clientX / rect.width) * naturalSize.width,
                imgY: (clientY / rect.height) * naturalSize.height,
                pctX: percentX,
                pctY: percentY
            });
        }

        if (draggingLine && step === 'calibration') {
            setCalibLines(prev => ({
                ...prev,
                [draggingLine]: draggingLine.startsWith('x') ? percentX : percentY
            }));
        }
    };

    const handleMouseUp = () => {
        setDraggingLine(null);
    };

    const handleMouseLeave = () => {
        setDraggingLine(null);
        setMagnifier(prev => ({ ...prev, show: false }));
    };

    const handleDoubleClick = (e) => {
        // 只有在采集模式下允许打点
        if (!imageSrc || !containerRef.current || step !== 'digitizing') return;

        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const percentX = (clientX / rect.width) * 100;
        const percentY = (clientY / rect.height) * 100;

        const { x, y } = calculateRealValue(percentX, percentY);

        const newPoint = {
            id: Date.now(),
            screenX: percentX,
            screenY: percentY,
            realX: x,
            realY: y,
            label: defaultSampleName
        };

        setPoints(prev => [...prev, newPoint]);
    };

    // --- 辅助功能 ---
    const deletePoint = (id) => {
        setPoints(prev => prev.filter(p => p.id !== id));
    };

    const updatePointLabel = (id, newLabel) => {
        setPoints(prev => prev.map(p => p.id === id ? { ...p, label: newLabel } : p));
        setDefaultSampleName(newLabel);
    };

    const copyToClipboard = () => {
        const header = `Sample Name\t${axisLabels.x}\t${axisLabels.y}`;
        const rows = points.map(p => {
            const xStr = axisScales.x === 'log' ? p.realX.toExponential(4) : p.realX.toFixed(4);
            const yStr = axisScales.y === 'log' ? p.realY.toExponential(4) : p.realY.toFixed(4);
            return `${p.label}\t${xStr}\t${yStr}`;
        }).join('\n');
        const text = `${header}\n${rows}`;

        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="flex flex-col h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden" onMouseUp={handleMouseUp}>

            <input type="file" ref={fileInputRef} accept="image/*" onChange={handleFileChange} className="hidden" />

            {/* --- Header --- */}
            <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm z-20 shrink-0 h-16">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-lg text-white shadow-md">
                        <Crosshair size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-800 tracking-tight">PlotDigitizer Workflow</h1>
                    </div>
                </div>

                {/* 步骤指示器 */}
                {imageSrc && (
                    <div className="flex items-center bg-slate-100 rounded-full p-1 border border-slate-200">
                        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${step === 'calibration' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current text-white text-[10px]">1</span>
                            校准坐标
                        </div>
                        <ChevronRight size={14} className="text-slate-300 mx-1" />
                        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${step === 'digitizing' ? 'bg-white shadow text-green-600' : 'text-slate-400'}`}>
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-current text-white text-[10px]">2</span>
                            采集数据
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    {!imageSrc ? (
                        <button onClick={triggerFileUpload} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg font-medium text-sm transition-all active:scale-95">
                            <Upload size={16} /> 导入图片
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button onClick={triggerFileUpload} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors text-xs font-semibold">
                                <RefreshCw size={14} /> 换图
                            </button>
                            <button onClick={resetApp} className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors text-xs font-medium">
                                <RotateCcw size={14} /> 重置
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* --- Main Content --- */}
            <div className="flex flex-1 overflow-hidden">

                {/* Left: Canvas */}
                <div className="flex-1 bg-slate-200/60 relative overflow-hidden flex flex-col">
                    <div className="flex-1 relative overflow-auto flex items-center justify-center p-8 select-none">
                        {!imageSrc ? (
                            <div className="text-center p-12 border-4 border-dashed border-slate-300 rounded-2xl bg-slate-100/50 max-w-lg">
                                <ImageIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-lg font-bold text-slate-700 mb-2">请先导入图片</h3>
                                <p className="text-slate-500 mb-6">点击右上角按钮开始</p>
                            </div>
                        ) : (
                            <div
                                ref={containerRef}
                                className={`relative shadow-2xl bg-white ring-1 ring-slate-900/5 ${step === 'digitizing' ? 'cursor-crosshair' : 'cursor-default'}`}
                                style={{ maxWidth: '100%', maxHeight: '100%' }}
                                onMouseMove={handleMouseMove}
                                onMouseLeave={handleMouseLeave}
                                onDoubleClick={handleDoubleClick}
                            >
                                <img
                                    ref={imageRef}
                                    src={imageSrc}
                                    alt="Chart"
                                    className="block max-w-full max-h-[calc(100vh-160px)] object-contain pointer-events-none"
                                    onLoad={onImageLoad}
                                />

                                {/* 校准线 (仅在 calibration 步骤显示) */}
                                {step === 'calibration' && (
                                    <div className="animate-in fade-in duration-300">
                                        {/* X1 */}
                                        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 hover:bg-blue-600 z-10 group cursor-col-resize shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                                            style={{ left: `${calibLines.x1}%` }} onMouseDown={(e) => handleMouseDownLine(e, 'x1')}>
                                            <div className="absolute top-2 -left-3 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">X1</div>
                                        </div>
                                        {/* X2 */}
                                        <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 hover:bg-blue-600 z-10 group cursor-col-resize shadow-[0_0_8px_rgba(59,130,246,0.6)]"
                                            style={{ left: `${calibLines.x2}%` }} onMouseDown={(e) => handleMouseDownLine(e, 'x2')}>
                                            <div className="absolute top-2 -left-3 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">X2</div>
                                        </div>
                                        {/* Y1 */}
                                        <div className="absolute left-0 right-0 h-0.5 bg-red-500 hover:bg-red-600 z-10 group cursor-row-resize shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                            style={{ top: `${calibLines.y1}%` }} onMouseDown={(e) => handleMouseDownLine(e, 'y1')}>
                                            <div className="absolute left-2 -top-6 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">Y1</div>
                                        </div>
                                        {/* Y2 */}
                                        <div className="absolute left-0 right-0 h-0.5 bg-red-500 hover:bg-red-600 z-10 group cursor-row-resize shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                                            style={{ top: `${calibLines.y2}%` }} onMouseDown={(e) => handleMouseDownLine(e, 'y2')}>
                                            <div className="absolute left-2 -top-6 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow group-hover:scale-110">Y2</div>
                                        </div>
                                    </div>
                                )}

                                {/* 数据点 */}
                                {points.map((p, idx) => (
                                    <div
                                        key={p.id}
                                        className="absolute w-3 h-3 bg-green-500 border-2 border-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.2)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0 flex items-center justify-center"
                                        style={{ left: `${p.screenX}%`, top: `${p.screenY}%` }}
                                    >
                                        {step === 'digitizing' && (
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-20">
                                                {idx + 1}
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* 放大镜 */}
                                {magnifier.show && !draggingLine && (
                                    <div
                                        className="absolute z-50 w-48 h-48 rounded-full border-[3px] border-white shadow-[0_4px_20px_rgba(0,0,0,0.4)] bg-white overflow-hidden pointer-events-none"
                                        style={{
                                            left: magnifier.x + 20,
                                            top: magnifier.y + 20,
                                        }}
                                    >
                                        <div
                                            className="w-full h-full relative"
                                            style={{
                                                backgroundImage: `url(${imageSrc})`,
                                                backgroundRepeat: 'no-repeat',
                                                backgroundSize: `${naturalSize.width * 3}px ${naturalSize.height * 3}px`,
                                                backgroundPosition: `-${magnifier.imgX * 3 - 96}px -${magnifier.imgY * 3 - 96}px`
                                            }}
                                        >
                                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-red-500/60"></div>
                                            <div className="absolute left-1/2 top-0 h-full w-[1px] bg-red-500/60"></div>
                                        </div>
                                        <div className="absolute bottom-0 left-0 w-full text-center text-[10px] font-mono font-medium bg-slate-900/80 text-white py-1 backdrop-blur-sm">
                                            {step === 'digitizing' ?
                                                (() => {
                                                    const val = calculateRealValue(magnifier.pctX, magnifier.pctY);
                                                    return `X:${val.x.toPrecision(4)} Y:${val.y.toPrecision(4)}`;
                                                })()
                                                : "校准中..."
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    {/* Canvas Footer */}
                    <div className="h-8 bg-white border-t border-slate-200 flex items-center justify-between px-4 text-xs text-slate-500 select-none">
                        <span className="flex items-center gap-2">
                            {step === 'calibration' ?
                                <span className="text-orange-500 flex items-center gap-1"><AlertCircle size={12} /> 请先完成校准</span> :
                                <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> 双击打点中</span>
                            }
                        </span>
                        <span>Zoom: Fit</span>
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="w-[400px] bg-white border-l border-slate-200 flex flex-col shrink-0 z-10 shadow-xl relative transition-all duration-300">

                    {/* --- STEP 1: CALIBRATION PANEL --- */}
                    {step === 'calibration' && (
                        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                                    <Settings size={16} className="text-indigo-600" />
                                    步骤 1: 坐标轴校准
                                </h3>
                                <p className="text-xs text-slate-500 mb-4 bg-blue-50 text-blue-700 p-2 rounded border border-blue-100">
                                    拖动图中红蓝线对齐刻度，并输入对应数值。
                                </p>

                                <div className="space-y-4">
                                    {/* X Axis */}
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <div className="text-xs font-bold text-blue-600">X 轴 (Horizontal)</div>
                                            <div className="flex bg-white rounded border border-slate-200 p-0.5">
                                                {['linear', 'log'].map(t => (
                                                    <button key={t} onClick={() => setAxisScales(p => ({ ...p, x: t }))}
                                                        className={`text-[10px] px-2 py-0.5 uppercase rounded-sm ${axisScales.x === t ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-400'}`}>
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400">X1 (Left)</label>
                                                <input type="number" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono"
                                                    value={calibValues.x1} onChange={(e) => setCalibValues({ ...calibValues, x1: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400">X2 (Right)</label>
                                                <input type="number" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono"
                                                    value={calibValues.x2} onChange={(e) => setCalibValues({ ...calibValues, x2: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Y Axis */}
                                    <div className="space-y-2 pt-2 border-t border-slate-200">
                                        <div className="flex justify-between items-center">
                                            <div className="text-xs font-bold text-red-600">Y 轴 (Vertical)</div>
                                            <div className="flex bg-white rounded border border-slate-200 p-0.5">
                                                {['linear', 'log'].map(t => (
                                                    <button key={t} onClick={() => setAxisScales(p => ({ ...p, y: t }))}
                                                        className={`text-[10px] px-2 py-0.5 uppercase rounded-sm ${axisScales.y === t ? 'bg-red-100 text-red-700 font-bold' : 'text-slate-400'}`}>
                                                        {t}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400">Y1 (Bottom)</label>
                                                <input type="number" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono"
                                                    value={calibValues.y1} onChange={(e) => setCalibValues({ ...calibValues, y1: e.target.value })} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400">Y2 (Top)</label>
                                                <input type="number" className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded font-mono"
                                                    value={calibValues.y2} onChange={(e) => setCalibValues({ ...calibValues, y2: e.target.value })} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 mt-auto border-t border-slate-200 bg-white">
                                <button
                                    onClick={() => setStep('digitizing')}
                                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-lg shadow-green-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={18} />
                                    确认校准 & 开始打点
                                </button>
                            </div>
                        </div>
                    )}

                    {/* --- STEP 2: DIGITIZING PANEL --- */}
                    {step === 'digitizing' && (
                        <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">

                            {/* 顶部：重新校准入口 */}
                            <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <Lock size={12} /> 坐标轴已锁定
                                </div>
                                <button
                                    onClick={() => setStep('calibration')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-orange-300 hover:text-orange-600 text-slate-600 rounded text-xs font-medium transition-colors shadow-sm"
                                >
                                    <Edit3 size={12} />
                                    重新校准
                                </button>
                            </div>

                            {/* 表格头部 */}
                            <div className="p-4 bg-white border-b border-slate-200">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-slate-800">采集数据 ({points.length})</h3>
                                    <button onClick={copyToClipboard} disabled={points.length === 0}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-sm ${copied ? 'bg-green-500 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                                            }`}>
                                        {copied ? "已复制" : "复制 Excel"}
                                    </button>
                                </div>

                                {/* 默认Label输入 */}
                                <div className="flex items-center gap-2 bg-indigo-50/50 p-2 rounded border border-indigo-100">
                                    <span className="text-xs font-medium text-indigo-600">Next:</span>
                                    <input type="text" className="flex-1 bg-white border border-indigo-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
                                        value={defaultSampleName} onChange={(e) => setDefaultSampleName(e.target.value)} />
                                </div>
                            </div>

                            {/* 表格主体 */}
                            <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/30">
                                <table className="w-full text-left border-collapse table-fixed">
                                    <thead className="bg-slate-100 sticky top-0 z-10 text-xs text-slate-600 shadow-sm">
                                        <tr>
                                            <th className="p-2 w-8 text-center border-b">#</th>
                                            <th className="p-2 w-24 border-b">Sample</th>
                                            <th className="p-2 border-b">
                                                <input className="bg-transparent w-full text-blue-700 font-bold outline-none"
                                                    value={axisLabels.x} onChange={e => setAxisLabels({ ...axisLabels, x: e.target.value })} />
                                            </th>
                                            <th className="p-2 border-b">
                                                <input className="bg-transparent w-full text-red-700 font-bold outline-none"
                                                    value={axisLabels.y} onChange={e => setAxisLabels({ ...axisLabels, y: e.target.value })} />
                                            </th>
                                            <th className="p-2 w-8 border-b"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-xs divide-y divide-slate-100 bg-white">
                                        {points.length === 0 ? (
                                            <tr>
                                                <td colSpan="5" className="p-8 text-center text-slate-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <Crosshair size={20} className="opacity-50" />
                                                        <span>双击图片开始采集</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            points.map((point, index) => (
                                                <tr key={point.id} className="group hover:bg-blue-50">
                                                    <td className="p-2 text-center text-slate-400 font-mono">{index + 1}</td>
                                                    <td className="p-2"><input className="w-full bg-transparent outline-none" value={point.label} onChange={e => updatePointLabel(point.id, e.target.value)} /></td>
                                                    <td className="p-2 font-mono text-slate-600 truncate">{axisScales.x === 'log' ? point.realX.toPrecision(4) : point.realX.toFixed(4)}</td>
                                                    <td className="p-2 font-mono text-slate-600 truncate">{axisScales.y === 'log' ? point.realY.toPrecision(4) : point.realY.toFixed(4)}</td>
                                                    <td className="p-2 text-right">
                                                        <button onClick={() => deletePoint(point.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlotDigitizerWorkflow;
