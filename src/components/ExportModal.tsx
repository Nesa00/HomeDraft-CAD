import React, { useMemo } from 'react';
import { Download, X } from 'lucide-react';
import { computeExportMetrics, exportFloorPlanModel } from '../export/meshExporter';
import type { ExportConfig, ExportFormat, PrintScale, WallSegment } from '../types/plan';

interface ExportModalProps {
  open: boolean;
  walls: WallSegment[];
  wallHeight: number;
  config: ExportConfig;
  onChangeConfig: (patch: Partial<ExportConfig>) => void;
  onClose: () => void;
}

const SCALE_OPTIONS: { value: PrintScale; label: string; note: string }[] = [
  { value: 50, label: '1 : 50', note: 'Architectural tabletop' },
  { value: 100, label: '1 : 100', note: 'Standard printer bed' },
  { value: 200, label: '1 : 200', note: 'Compact miniature' },
  { value: 1, label: '1 : 1', note: 'Full scale (1m = 1000mm)' },
];

export const ExportModal: React.FC<ExportModalProps> = ({
  open,
  walls,
  wallHeight,
  config,
  onChangeConfig,
  onClose,
}) => {
  const metrics = useMemo(
    () => (open ? computeExportMetrics(walls, wallHeight, config) : null),
    [open, walls, wallHeight, config],
  );

  if (!open) return null;

  const handleDownload = () => {
    const result = exportFloorPlanModel(walls, wallHeight, config);
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = result.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-white border border-slate-200 p-5 pb-safe shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="export-dialog-title" className="text-base font-semibold text-slate-900">
              Export 3D Printable Model
            </h2>
            <p className="text-xs text-slate-500">
              Z-up millimeter mesh with open doorways &amp; windows
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Format */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-700">File Format</span>
          <div className="grid grid-cols-2 gap-2">
            {(['stl', 'obj'] as ExportFormat[]).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => onChangeConfig({ format: fmt })}
                className={`min-h-[44px] rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  config.format === fmt
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                .{fmt.toUpperCase()} {fmt === 'stl' ? '(Binary Slicer)' : '(Wavefront Mesh)'}
              </button>
            ))}
          </div>
        </div>

        {/* Print Scale */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-700">Print Scale</span>
          <div className="grid grid-cols-2 gap-2">
            {SCALE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChangeConfig({ scale: opt.value })}
                className={`min-h-[44px] px-3 py-2 rounded-lg border text-left transition-colors ${
                  config.scale === opt.value
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-semibold font-mono-tabular">{opt.label}</div>
                <div className="text-[11px] text-slate-500">{opt.note}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Base Plate Option */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
          <label className="flex items-center justify-between gap-3 cursor-pointer min-h-[36px]">
            <div>
              <div className="text-xs font-medium text-slate-900">Include Solid Floor Base Plate</div>
              <div className="text-[11px] text-slate-500">
                Anchors interior partition walls into one printable piece
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.includeBasePlate}
              onChange={(e) => onChangeConfig({ includeBasePlate: e.target.checked })}
              className="w-5 h-5 accent-blue-600 rounded shrink-0"
            />
          </label>

          {config.includeBasePlate && (
            <div className="space-y-1 pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Base Thickness (printed)</span>
                <span className="font-mono-tabular font-medium text-slate-900">
                  {config.baseThicknessMm.toFixed(1)} mm
                </span>
              </div>
              <input
                type="range"
                min={1.5}
                max={6.0}
                step={0.5}
                value={config.baseThicknessMm}
                onChange={(e) => onChangeConfig({ baseThicknessMm: Number(e.target.value) })}
                className="cad-slider w-full"
              />
            </div>
          )}
        </div>

        {/* Print Bed Footprint Summary */}
        <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3.5 py-2.5 text-xs">
          <span className="text-slate-600">Output Dimensions</span>
          {metrics?.hasGeometry ? (
            <span className="font-mono-tabular font-semibold text-slate-900">
              {metrics.widthMm} × {metrics.depthMm} × {metrics.heightMm} mm · {metrics.triangleCount} tris
            </span>
          ) : (
            <span className="text-slate-500">Draw at least one wall first</span>
          )}
        </div>

        <button
          type="button"
          disabled={!metrics?.hasGeometry}
          onClick={handleDownload}
          className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Download .{config.format.toUpperCase()} File</span>
        </button>
      </div>
    </div>
  );
};
