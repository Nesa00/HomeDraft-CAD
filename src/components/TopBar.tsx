import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Calculator,
  Cctv,
  Compass,
  Download,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  PenOff,
  PenTool,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Unlock,
  Upload,
} from 'lucide-react';
import { PLAN_TEMPLATES } from '../data/templates';
import type { SnapMode, TemplateId, ViewMode } from '../types/plan';

interface TopBarProps {
  viewMode: ViewMode;
  activeCameraViewId?: string | null;
  activeTemplate: TemplateId;
  savedTemplateIds?: TemplateId[];
  snapMode: SnapMode;
  cameraLocked: boolean;
  editLocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isPointerLocked: boolean;
  onSetViewMode: (mode: ViewMode) => void;
  onOpenSummary: () => void;
  onCycleSnapMode: () => void;
  onFitView: () => void;
  onToggleCameraLock: () => void;
  onResetCamera: () => void;
  onToggleEditLocked: () => void;
  onSelectTemplate: (id: TemplateId) => void;
  onResetTemplate?: () => void;
  onExportJson: () => void;
  onImportJson: (fileText: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRequestPointerLock: () => void;
}

function snapLabel(mode: SnapMode): string {
  switch (mode) {
    case 'grid':
      return '0.25m';
    case 'fine':
      return '0.05m';
    case 'free':
      return 'Free';
  }
}

export const TopBar: React.FC<TopBarProps> = ({
  viewMode,
  activeCameraViewId = null,
  activeTemplate,
  savedTemplateIds = [],
  snapMode,
  cameraLocked,
  editLocked,
  canUndo,
  canRedo,
  isPointerLocked,
  onSetViewMode,
  onOpenSummary,
  onCycleSnapMode,
  onFitView,
  onToggleCameraLock,
  onResetCamera,
  onToggleEditLocked,
  onSelectTemplate,
  onResetTemplate,
  onExportJson,
  onImportJson,
  onUndo,
  onRedo,
  onRequestPointerLock,
}) => {
  const isWalkthrough = viewMode === '3d-walk' && !activeCameraViewId;
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setConfirmingReset(false);
  }, [activeTemplate, editLocked]);

  useEffect(() => {
    if (!confirmingReset) return;
    const timer = window.setTimeout(() => setConfirmingReset(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmingReset]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <header className="pointer-events-none fixed top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-3 py-2 md:px-5 md:py-3 pt-safe">
      {/* Brand + Camera View Switch */}
      <div className="pointer-events-auto flex items-center gap-2 md:gap-2.5 bg-white/96 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-sm">
        <span className="text-sm md:text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0 pl-1">
          HomeDraft-CAD
        </span>

        <div className="h-5 w-px bg-slate-200 shrink-0" aria-hidden="true" />

        {/* Primary 2D Drafting <-> 3D Walkthrough Switch */}
        <div
          className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg"
          role="group"
          aria-label="Camera view mode"
        >
          <button
            type="button"
            onClick={() => onSetViewMode('2d')}
            className={`min-h-[38px] md:min-h-[36px] px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              viewMode === '2d' && !activeCameraViewId
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>2D Plan</span>
          </button>

          <button
            type="button"
            onClick={() => onSetViewMode('3d-walk')}
            className={`min-h-[38px] md:min-h-[36px] px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              isWalkthrough
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>3D Walk</span>
          </button>

          <button
            type="button"
            onClick={() => onSetViewMode('3d-orbit')}
            title="360° 3D Orbit Inspect"
            className={`min-h-[38px] md:min-h-[36px] px-2.5 md:px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              viewMode === '3d-orbit' && !activeCameraViewId
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
            }`}
          >
            <Box className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Orbit</span>
          </button>

          {activeCameraViewId && (
            <span className="px-2 py-1 rounded-md bg-blue-600 text-white text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0">
              <Cctv className="w-3.5 h-3.5 shrink-0" />
              <span>Cam 3D</span>
            </span>
          )}
        </div>
      </div>

      {/* Right Utility Cluster: Edit Lock, Summary, Snap, Camera Controls, Templates, JSON Export/Import, Undo/Redo */}
      <div className="pointer-events-auto flex items-center gap-1 md:gap-1.5 bg-white/96 border border-slate-200 rounded-xl px-2 py-1.5 shadow-sm overflow-x-auto max-w-[60vw] sm:max-w-[68vw] lg:max-w-none">
        <button
          type="button"
          onClick={onToggleEditLocked}
          aria-pressed={editLocked}
          title={
            editLocked
              ? 'Editing Locked (View-Only Mode) · Click to unlock editing'
              : 'Editing Unlocked · Click to lock plan against accidental changes'
          }
          className={`min-h-[38px] md:min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
            editLocked
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs hover:bg-amber-700'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {editLocked ? (
            <PenOff className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <PenTool className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          )}
          <span className="hidden sm:inline">{editLocked ? 'Locked' : 'Editable'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenSummary}
          title="View project summary, quantities, rooms, and furniture"
          className="min-h-[38px] md:min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <Calculator className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="hidden sm:inline">Summary</span>
        </button>

        {viewMode === '2d' && (
          <button
            type="button"
            onClick={onCycleSnapMode}
            title="Cycle snap precision (Grid 0.25m / Fine 0.05m / Free align)"
            className={`min-h-[38px] md:min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors whitespace-nowrap shrink-0 ${
              snapMode === 'free'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Magnet className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono-tabular">{snapLabel(snapMode)}</span>
          </button>
        )}

        {viewMode !== '3d-walk' && !activeCameraViewId && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onToggleCameraLock}
              aria-pressed={cameraLocked}
              title={
                cameraLocked
                  ? 'Camera locked at current focus · Click to unlock for Free-Fly (Orbit) or Pan (2D)'
                  : 'Free-Fly / Unlocked · Orbit: Drag look + WASD fly + Q/E up/down · 2D: Drag to pan'
              }
              className={`min-h-[38px] md:min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 border transition-colors whitespace-nowrap shrink-0 ${
                cameraLocked
                  ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200/70'
                  : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-xs'
              }`}
            >
              {cameraLocked ? (
                <Lock className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Unlock className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden sm:inline">{cameraLocked ? 'Cam Lock' : 'Cam Free'}</span>
            </button>

            <button
              type="button"
              onClick={onResetCamera}
              title="Reset camera to starting origin (0, 0, 0)"
              aria-label="Reset camera to origin"
              className="min-h-[38px] md:min-h-[36px] min-w-[36px] px-1.5 flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onFitView}
              title="Fit floor plan in view"
              aria-label="Fit floor plan in view"
              className="hidden sm:flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <label htmlFor="template-select" className="sr-only">
          House template
        </label>
        <div className="flex items-center gap-1 shrink-0">
          <select
            id="template-select"
            disabled={editLocked}
            value={activeTemplate}
            onChange={(e) => onSelectTemplate(e.target.value as TemplateId)}
            title={
              editLocked
                ? 'Unlock editing to switch project/template'
                : 'Switch project / template (your changes per template auto-save locally)'
            }
            className="min-h-[38px] md:min-h-[36px] max-w-[110px] sm:max-w-[155px] truncate rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {PLAN_TEMPLATES.map((tpl) => {
              const hasSaved = savedTemplateIds.includes(tpl.id);
              return (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                  {hasSaved ? ' (Saved)' : ''}
                </option>
              );
            })}
          </select>

          <button
            type="button"
            onClick={onExportJson}
            title="Export project data as JSON file"
            aria-label="Export project JSON"
            className="min-h-[38px] md:min-h-[36px] px-2 flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">JSON</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
            aria-hidden="true"
          />
          <button
            type="button"
            disabled={editLocked}
            onClick={() => fileInputRef.current?.click()}
            title={editLocked ? 'Unlock editing to import JSON project' : 'Import project from JSON file'}
            aria-label="Import project JSON"
            className="min-h-[38px] md:min-h-[36px] px-2 flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">Import</span>
          </button>

          {onResetTemplate && !editLocked && (
            <button
              type="button"
              onClick={() => {
                if (!confirmingReset) {
                  setConfirmingReset(true);
                } else {
                  setConfirmingReset(false);
                  onResetTemplate();
                }
              }}
              title={
                confirmingReset
                  ? 'Click again to confirm resetting this project to default'
                  : 'Reset current template/project back to factory default'
              }
              aria-label="Reset current template"
              className={`min-h-[38px] md:min-h-[36px] px-2 flex items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                confirmingReset
                  ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              {confirmingReset && <span>Reset?</span>}
            </button>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || editLocked}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo || editLocked}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {isWalkthrough && (
          <button
            type="button"
            onClick={onRequestPointerLock}
            className="hidden md:inline-flex items-center min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {isPointerLocked ? 'Esc to Unlock' : 'Lock Mouse'}
          </button>
        )}
      </div>
    </header>
  );
};
