import React, { useEffect, useState } from 'react';
import {
  Armchair,
  ArrowLeftRight,
  ArrowUpDown,
  Building2,
  Calculator,
  Cctv,
  ChevronLeft,
  ChevronRight,
  Columns2,
  DoorOpen,
  Download,
  Droplets,
  Eye,
  Lamp,
  LayoutGrid,
  Lock,
  MousePointer2,
  Palette,
  PanelTop,
  PenTool,
  Plug,
  Radar,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Square,
  Undo2,
  User,
  Warehouse,
  Wrench,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import {
  CABLE_SPEC_INFO,
  CABLE_SPEC_OPTIONS,
  CAMERA_DEVICE_KINDS,
  FLOOR_COLOR_PALETTE,
  FLOOR_STYLE_OPTIONS,
  FURNITURE_KIND_INFO,
  isCameraSecurityDevice,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_PIPE_PRESETS,
  PLUMBING_SPEC_INFO,
  PLUMBING_SPEC_OPTIONS,
  SECURITY_DEVICE_INFO,
  SENSOR_DEVICE_KINDS,
  WALL_COLOR_PALETTE,
  WIRE_BREAKER_PRESETS,
  type CableSpec,
  type CeilingMode,
  type ElectricalJunction,
  type ElectricalWire,
  type FloorStyle,
  type FurnitureItem,
  type FurnitureKind,
  type JunctionKind,
  type OpeningDefaultsMap,
  type OpeningDimensionPreset,
  type OpeningType,
  type PlumbingFixture,
  type PlumbingFixtureKind,
  type PlumbingPipe,
  type PlumbingPipePreset,
  type PlumbingPipeSpec,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type ToolMode,
  type ViewMode,
  type WallOpening,
  type WallSegment,
  type WireBreakerPreset,
  type WireMountRef,
  type WorkspaceStep,
} from '../types/plan';
import { InspectorPanel } from './InspectorPanel';
import { NumericInput } from './NumericInput';

interface ControlDockProps {
  workspaceStep: WorkspaceStep;
  viewMode: ViewMode;
  activeTool: ToolMode;
  activeBreakerPresetId: string;
  activeBreakerLabel: string;
  activeCableSpec: CableSpec;
  activeWireMountRef: WireMountRef;
  activeWireDropFromTop: number;
  activeWireHeight: number;
  activeJunctionKind: JunctionKind;
  activePipePresetId: string;
  activePipeLabel: string;
  activePipeSpec: PlumbingPipeSpec;
  activePipeMountRef: WireMountRef;
  activePipeDropFromTop: number;
  activePipeHeight: number;
  activeFixtureKind: PlumbingFixtureKind;
  activeSecurityKind: SecurityDeviceKind;
  activeFurnitureKind: FurnitureKind;
  activeCameraViewId: string | null;
  testMotionActive: boolean;
  showStructure: boolean;
  showWiring: boolean;
  showPlumbing: boolean;
  showSecurity: boolean;
  showInterior: boolean;
  showSecurityCoverage: boolean;
  showRoomAreas: boolean;
  showCeiling: boolean;
  ceilingMode: CeilingMode;
  showWalkDimensions: boolean;
  walkerHeight: number;
  cameraFov: number;
  cameraZoom: number;
  cameraLocked: boolean;
  xrayWalls: boolean;
  wallHeight: number;
  defaultThickness: number;
  defaultWallColor: string;
  floorColor: string;
  floorStyle: FloorStyle;
  editLocked?: boolean;
  openingDefaults: OpeningDefaultsMap;
  selected: SelectionTarget;
  walls: WallSegment[];
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture: FurnitureItem[];
  canUndo: boolean;
  canRedo: boolean;
  onChangeWorkspaceStep: (step: WorkspaceStep) => void;
  onSelectTool: (tool: ToolMode) => void;
  onSelectBreakerPreset: (preset: WireBreakerPreset) => void;
  onChangeBreakerLabel: (label: string) => void;
  onChangeCableSpec: (spec: CableSpec) => void;
  onChangeWireMountRef: (ref: WireMountRef) => void;
  onChangeWireDropFromTop: (drop: number) => void;
  onChangeWireHeight: (h: number) => void;
  onChangeJunctionKind: (kind: JunctionKind) => void;
  onSelectPipePreset: (preset: PlumbingPipePreset) => void;
  onChangePipeLabel: (label: string) => void;
  onChangePipeSpec: (spec: PlumbingPipeSpec) => void;
  onChangePipeMountRef: (ref: WireMountRef) => void;
  onChangePipeDropFromTop: (drop: number) => void;
  onChangePipeHeight: (h: number) => void;
  onChangeFixtureKind: (kind: PlumbingFixtureKind) => void;
  onChangeSecurityKind: (kind: SecurityDeviceKind) => void;
  onChangeFurnitureKind: (kind: FurnitureKind) => void;
  onToggleTestMotion: () => void;
  onEnterCameraView: (cameraId: string) => void;
  onExitCameraView: () => void;
  onToggleStructure: () => void;
  onToggleWiring: () => void;
  onTogglePlumbing: () => void;
  onToggleSecurity: () => void;
  onToggleInterior: () => void;
  onToggleSecurityCoverage: () => void;
  onToggleRoomAreas: () => void;
  onToggleCeiling: () => void;
  onChangeCeilingMode: (mode: CeilingMode) => void;
  onToggleWalkDimensions: () => void;
  onChangeWalkerHeight: (height: number) => void;
  onChangeCameraFov: (fov: number) => void;
  onChangeCameraZoom: (zoom: number) => void;
  onToggleXrayWalls: () => void;
  onOpenCalculations: () => void;
  onChangeWallHeight: (height: number) => void;
  onChangeDefaultThickness: (thickness: number) => void;
  onChangeDefaultWallColor: (color: string, paintAll?: boolean) => void;
  onChangeFloorColor: (color: string) => void;
  onChangeFloorStyle: (style: FloorStyle) => void;
  onChangeOpeningDefault: (type: OpeningType, patch: Partial<OpeningDimensionPreset>) => void;
  onUpdateWallThickness: (wallId: string, thickness: number) => void;
  onUpdateWallColor: (wallId: string, color: string | undefined) => void;
  onResizeWall: (wallId: string, newLength: number) => void;
  onUpdateOpening: (wallId: string, openingId: string, patch: Partial<WallOpening>) => void;
  onUpdateWire: (wireId: string, patch: Partial<ElectricalWire>) => void;
  onUpdateJunction: (junctionId: string, patch: Partial<ElectricalJunction>) => void;
  onTogglePanelBreaker?: (panelId: string, breakerLabel: string) => void;
  onUpdatePipe: (pipeId: string, patch: Partial<PlumbingPipe>) => void;
  onUpdateFixture: (fixtureId: string, patch: Partial<PlumbingFixture>) => void;
  onUpdateSecurityDevice: (deviceId: string, patch: Partial<SecurityDevice>) => void;
  onUpdateFurniture: (furnitureId: string, patch: Partial<FurnitureItem>) => void;
  onSelectTarget?: (target: SelectionTarget) => void;
  onStartWireFromJunction?: (junctionId: string) => void;
  onToggleJunctionWireConnection?: (junctionId: string, wireId: string) => void;
  onDisconnectWireSplice?: (wireIdA: string, wireIdB: string) => void;
  onDeleteSelected: () => void;
  onCloseSelection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenExport: () => void;
}

interface ToolDef {
  id: ToolMode;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STRUCTURE_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / Drag', shortLabel: 'Select', icon: MousePointer2 },
  { id: 'wall', label: 'Draw Single / Chained Wall', shortLabel: 'Wall', icon: PenTool },
  {
    id: 'wall-rect',
    label: 'Draw Rectangle Room (4 Walls)',
    shortLabel: 'Rectangle',
    icon: RectangleHorizontal,
  },
  { id: 'door', label: 'Door', shortLabel: 'Door', icon: DoorOpen },
  { id: 'double-door', label: 'Double Door', shortLabel: 'Double', icon: Columns2 },
  { id: 'sliding-door', label: 'Sliding Door', shortLabel: 'Sliding', icon: ArrowLeftRight },
  { id: 'garage-door', label: 'Garage Door', shortLabel: 'Garage', icon: Warehouse },
  { id: 'window', label: 'Window', shortLabel: 'Window', icon: Square },
];

const WIRING_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / Drag', shortLabel: 'Select', icon: MousePointer2 },
  { id: 'junction', label: 'Wall Point (Box/Socket/Switch)', shortLabel: 'Box', icon: Plug },
  { id: 'wire', label: 'Draw Electrical Cable', shortLabel: 'Wire', icon: Zap },
  { id: 'security', label: 'Security Camera & Moving Sensor', shortLabel: 'Cam / Sensor', icon: Cctv },
];

const PLUMBING_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / Drag', shortLabel: 'Select', icon: MousePointer2 },
  { id: 'fixture', label: 'Plumbing Fixture', shortLabel: 'Fixture', icon: Wrench },
  { id: 'pipe', label: 'Draw Water / Drain Pipe', shortLabel: 'Pipe', icon: Droplets },
];

const INTERIOR_TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select / Move / Rotate', shortLabel: 'Select', icon: MousePointer2 },
  {
    id: 'furniture',
    label: 'Place Sofa, Office Desk, Workbench, Bed or Wardrobe',
    shortLabel: 'Furniture',
    icon: Armchair,
  },
  { id: 'junction', label: 'Place Ceiling or Wall Light', shortLabel: 'Light', icon: Lamp },
];

const STEP_TABS: {
  id: WorkspaceStep;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'structure', label: '1. Structure', shortLabel: '1. Structure', icon: Building2 },
  { id: 'wiring', label: '2. Electrical & Data', shortLabel: '2. Electrical', icon: Zap },
  { id: 'plumbing', label: '3. Water & Drain', shortLabel: '3. Water', icon: Droplets },
  { id: 'interior', label: '4. Interior & Lights', shortLabel: '4. Interior', icon: Armchair },
];

const ELECTRICAL_JUNCTION_KINDS: JunctionKind[] = [
  'junction-box',
  'socket',
  'switch',
  'panel',
];
const FIXTURE_KINDS: PlumbingFixtureKind[] = ['sink', 'shower', 'wc', 'boiler', 'floor-drain'];
const FURNITURE_KINDS: FurnitureKind[] = [
  'sofa',
  'sofa-table',
  'working-table',
  'workbench',
  'dining-table',
  'bed',
  'wardrobe',
  'toilet',
];

function isOpeningTool(t: ToolMode): t is OpeningType {
  return (
    t === 'door' ||
    t === 'double-door' ||
    t === 'sliding-door' ||
    t === 'garage-door' ||
    t === 'window'
  );
}

export const ControlDock: React.FC<ControlDockProps> = ({
  workspaceStep,
  viewMode,
  activeTool,
  activeBreakerPresetId,
  activeBreakerLabel,
  activeCableSpec,
  activeWireMountRef,
  activeWireDropFromTop,
  activeWireHeight,
  activeJunctionKind,
  activePipePresetId,
  activePipeLabel,
  activePipeSpec,
  activePipeMountRef,
  activePipeDropFromTop,
  activePipeHeight,
  activeFixtureKind,
  activeSecurityKind,
  activeFurnitureKind,
  activeCameraViewId,
  testMotionActive,
  showStructure,
  showWiring,
  showPlumbing,
  showSecurity,
  showInterior,
  showSecurityCoverage,
  showRoomAreas,
  showCeiling,
  ceilingMode,
  showWalkDimensions,
  walkerHeight,
  cameraFov,
  cameraZoom,
  cameraLocked,
  xrayWalls,
  wallHeight,
  defaultThickness,
  defaultWallColor,
  floorColor,
  floorStyle,
  editLocked = false,
  openingDefaults,
  selected,
  walls,
  wires,
  junctions,
  pipes,
  fixtures,
  securityDevices,
  furniture,
  canUndo,
  canRedo,
  onChangeWorkspaceStep,
  onSelectTool,
  onSelectBreakerPreset,
  onChangeBreakerLabel,
  onChangeCableSpec,
  onChangeWireMountRef,
  onChangeWireDropFromTop,
  onChangeWireHeight,
  onChangeJunctionKind,
  onSelectPipePreset,
  onChangePipeLabel,
  onChangePipeSpec,
  onChangePipeMountRef,
  onChangePipeDropFromTop,
  onChangePipeHeight,
  onChangeFixtureKind,
  onChangeSecurityKind,
  onChangeFurnitureKind,
  onToggleTestMotion,
  onEnterCameraView,
  onExitCameraView,
  onToggleStructure,
  onToggleWiring,
  onTogglePlumbing,
  onToggleSecurity,
  onToggleInterior,
  onToggleSecurityCoverage,
  onToggleRoomAreas,
  onToggleCeiling,
  onChangeCeilingMode,
  onToggleWalkDimensions,
  onChangeWalkerHeight,
  onChangeCameraFov,
  onChangeCameraZoom,
  onToggleXrayWalls,
  onOpenCalculations,
  onChangeWallHeight,
  onChangeDefaultThickness,
  onChangeDefaultWallColor,
  onChangeFloorColor,
  onChangeFloorStyle,
  onChangeOpeningDefault,
  onUpdateWallThickness,
  onUpdateWallColor,
  onResizeWall,
  onUpdateOpening,
  onUpdateWire,
  onUpdateJunction,
  onTogglePanelBreaker,
  onUpdatePipe,
  onUpdateFixture,
  onUpdateSecurityDevice,
  onUpdateFurniture,
  onSelectTarget,
  onStartWireFromJunction,
  onToggleJunctionWireConnection,
  onDisconnectWireSplice,
  onDeleteSelected,
  onCloseSelection,
  onUndo,
  onRedo,
  onOpenExport,
}) => {
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setDesktopCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const isWalkthrough = viewMode === '3d-walk';
  const is3dViewport = viewMode === '3d-walk' || viewMode === '3d-orbit';
  const activeOpeningTool = isOpeningTool(activeTool) ? activeTool : null;
  const activePreset = activeOpeningTool ? openingDefaults[activeOpeningTool] : null;
  const currentStepTools =
    workspaceStep === 'structure'
      ? STRUCTURE_TOOLS
      : workspaceStep === 'wiring'
        ? WIRING_TOOLS
        : workspaceStep === 'plumbing'
          ? PLUMBING_TOOLS
          : INTERIOR_TOOLS;

  if (activeCameraViewId) {
    return null;
  }

  return (
    <>
      {/* DESKTOP 3D VIEWPORT LENS & DIMENSION HUD (Compact bottom center) */}
      {is3dViewport && (
        <div className="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex-wrap items-center justify-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/92 border border-white/15 text-white text-[11px] shadow-md max-w-[90vw]">
          <span className="whitespace-nowrap text-slate-200">
            {isWalkthrough
              ? 'WASD walk · Click / E doors · Ctrl+Click edit'
              : cameraLocked
                ? 'Drag orbit · Scroll zoom · Click select'
                : 'Free-Fly: Drag look · WASD fly · Q/E down/up · Scroll dolly'}
          </span>
          {isWalkthrough && (
            <>
              <span className="h-3.5 w-px bg-white/15" aria-hidden="true" />
              <label className="flex items-center gap-1.5 whitespace-nowrap">
                <User className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-slate-300">Height</span>
                <input
                  type="range"
                  min={1.4}
                  max={2.1}
                  step={0.05}
                  value={walkerHeight}
                  onChange={(e) => onChangeWalkerHeight(Number(e.target.value))}
                  className="cad-slider w-16"
                />
                <span className="font-mono-tabular font-semibold w-10 text-right">
                  {walkerHeight.toFixed(2)}m
                </span>
              </label>
            </>
          )}
          <span className="h-3.5 w-px bg-white/15" aria-hidden="true" />
          <label
            title="Total Horizontal FOV (Human binocular vision spans ~200°–220°; 105°–125° looks spacious indoors)"
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <span className="text-amber-300 font-semibold">H-FOV</span>
            <input
              type="range"
              min={50}
              max={170}
              step={1}
              value={cameraFov}
              onChange={(e) => onChangeCameraFov(Number(e.target.value))}
              className="cad-slider w-16"
            />
            <span className="font-mono-tabular font-semibold w-9 text-right">
              {Math.round(cameraFov)}°
            </span>
          </label>
          <span className="h-3.5 w-px bg-white/15" aria-hidden="true" />
          <label
            title="Camera Depth / Zoom (0.5× wide room depth .. 2.5× telephoto zoom)"
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <ZoomIn className="w-3.5 h-3.5 text-sky-300" />
            <span className="text-slate-300">Depth</span>
            <input
              type="range"
              min={0.5}
              max={2.5}
              step={0.05}
              value={cameraZoom}
              onChange={(e) => onChangeCameraZoom(Number(e.target.value))}
              className="cad-slider w-16"
            />
            <span className="font-mono-tabular font-semibold w-9 text-right">
              {cameraZoom.toFixed(2)}×
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              onChangeCameraFov(105);
              onChangeCameraZoom(1.0);
            }}
            title="Reset to spacious 105° Horizontal FOV & 1.00× depth"
            className="px-2 py-0.5 rounded-md border border-white/15 bg-white/10 hover:bg-white/20 text-slate-100 text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>Natural 105°</span>
          </button>
          <button
            type="button"
            onClick={onToggleWalkDimensions}
            aria-pressed={showWalkDimensions}
            title="Show measured 3D CAD dimension lines from wall corners, heights, and openings"
            className={`px-2 py-0.5 rounded-md border text-[11px] font-medium flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              showWalkDimensions
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
            }`}
          >
            <Ruler className="w-3 h-3 shrink-0" />
            <span>{showWalkDimensions ? 'Dimensions: ON' : 'Dimensions: OFF'}</span>
          </button>
        </div>
      )}

      {/* DESKTOP LEFT-SIDE VERTICAL DESIGN RAIL (Top-to-Bottom: Steps -> Tools -> Active Options -> Export) */}
      <aside
        aria-label="Design and Editing Tools"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={`hidden md:flex flex-col fixed top-16 left-3 z-20 max-h-[calc(100vh-5rem)] rounded-2xl bg-white/96 border border-slate-200 shadow-md overflow-hidden transition-all ${
          desktopCollapsed ? 'w-14' : 'w-64'
        }`}
      >
        {/* Rail Header & Collapse Handle */}
        <div className="px-2.5 py-2 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-1 shrink-0">
          {!desktopCollapsed && (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 truncate">
              Design Controls
            </span>
          )}
          <button
            type="button"
            onClick={() => setDesktopCollapsed((v) => !v)}
            title={desktopCollapsed ? 'Expand controls (H)' : 'Collapse controls (H)'}
            aria-label={desktopCollapsed ? 'Expand design controls' : 'Collapse design controls'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors ml-auto"
          >
            {desktopCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Read-Only Lock Banner when locked */}
        {editLocked && !desktopCollapsed && (
          <div className="px-2.5 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-[11px] font-medium text-amber-800 shrink-0">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Edit Lock ON · View Only</span>
          </div>
        )}

        {/* Section 1: Workflow Steps */}
        <div
          className={`p-1.5 border-b border-slate-200 shrink-0 ${
            desktopCollapsed ? 'flex flex-col items-center gap-1' : 'grid grid-cols-2 gap-1'
          }`}
        >
          {STEP_TABS.map((step) => {
            const Icon = step.icon;
            const active = workspaceStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                title={step.label}
                onClick={() => onChangeWorkspaceStep(step.id)}
                className={`${
                  desktopCollapsed
                    ? 'w-10 h-9 justify-center'
                    : 'px-2 py-1.5 justify-start text-[11px]'
                } rounded-lg font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!desktopCollapsed && <span className="truncate">{step.shortLabel}</span>}
              </button>
            );
          })}
        </div>

        {/* Section 2: Active Step Tools */}
        <div
          className={`p-1.5 border-b border-slate-200 shrink-0 ${
            desktopCollapsed
              ? 'flex flex-col items-center gap-1 overflow-y-auto'
              : 'grid grid-cols-2 gap-1 bg-slate-50/60'
          }`}
        >
          {currentStepTools.map((item) => {
            const Icon = item.icon;
            const active = activeTool === item.id;
            const toolDisabled = editLocked && item.id !== 'select';
            return (
              <button
                key={item.id}
                type="button"
                title={toolDisabled ? 'Unlock editing to use placement tools' : item.label}
                disabled={toolDisabled}
                onClick={() => onSelectTool(item.id)}
                className={`${
                  desktopCollapsed
                    ? 'w-10 h-9 justify-center'
                    : 'min-h-[34px] px-2 py-1 justify-start text-[11px]'
                } rounded-lg font-medium flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {!desktopCollapsed && <span className="truncate">{item.shortLabel}</span>}
              </button>
            );
          })}
        </div>

        {/* Section 3: Scrollable Step & Tool Properties */}
        {!desktopCollapsed && (
          <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-3 text-xs">
            {/* Active Door/Window Preset Dimensions */}
            {activeOpeningTool && activePreset && (
              <fieldset
                disabled={editLocked}
                className="rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 space-y-2 disabled:opacity-60"
              >
                <div className="text-[11px] font-semibold text-slate-900">
                  Next {STRUCTURE_TOOLS.find((t) => t.id === activeOpeningTool)?.label} Size
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="space-y-0.5 text-[11px] text-slate-600">
                    <span>Width (m)</span>
                    <NumericInput
                      min={0.55}
                      max={6.0}
                      step={0.05}
                      value={activePreset.width}
                      onChange={(val) => onChangeOpeningDefault(activeOpeningTool, { width: val })}
                      className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                    />
                  </label>
                  <label className="space-y-0.5 text-[11px] text-slate-600">
                    <span>Height (m)</span>
                    <NumericInput
                      min={0.35}
                      max={4.0}
                      step={0.05}
                      value={activePreset.height}
                      onChange={(val) => onChangeOpeningDefault(activeOpeningTool, { height: val })}
                      className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                    />
                  </label>
                  {activeOpeningTool === 'window' && (
                    <label className="space-y-0.5 text-[11px] text-slate-600 col-span-2">
                      <span>Sill Height (m)</span>
                      <NumericInput
                        min={0.1}
                        max={4.0}
                        step={0.05}
                        value={activePreset.sillHeight}
                        onChange={(val) =>
                          onChangeOpeningDefault(activeOpeningTool, { sillHeight: val })
                        }
                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                      />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">Click any wall to place</p>
              </fieldset>
            )}

            {/* Structure Step Options */}
            {workspaceStep === 'structure' && (
              <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-60">
                {/* Wall Color Picker */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">Wall Color</span>
                    <button
                      type="button"
                      onClick={() => setColorMenuOpen((v) => !v)}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      {colorMenuOpen ? 'Hide' : 'Palette'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {WALL_COLOR_PALETTE.map((swatch) => {
                      const active = defaultWallColor.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={swatch.name}
                          aria-label={swatch.name}
                          onClick={() => onChangeDefaultWallColor(swatch.hex, false)}
                          className={`w-6 h-6 rounded-md border transition-transform ${
                            active
                              ? 'border-blue-600 ring-2 ring-blue-300 scale-105'
                              : 'border-slate-300 hover:scale-105'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      );
                    })}
                    <label
                      title="Custom wall color"
                      className="relative w-6 h-6 rounded-md border border-slate-300 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden"
                    >
                      <input
                        type="color"
                        aria-label="Custom default wall color"
                        value={defaultWallColor}
                        onChange={(e) => onChangeDefaultWallColor(e.target.value, false)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Palette className="w-3.5 h-3.5 text-slate-700" />
                    </label>
                  </div>
                  {colorMenuOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeDefaultWallColor(defaultWallColor, true);
                        setColorMenuOpen(false);
                      }}
                      className="w-full py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium transition-colors"
                    >
                      Apply Color to All Walls
                    </button>
                  )}
                </div>

                {/* Floor Pattern & Color */}
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-700">Floor Style &amp; Color</span>
                    <span className="text-[10px] font-mono-tabular text-slate-400">
                      {floorColor}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100">
                    {FLOOR_STYLE_OPTIONS.map((opt) => {
                      const active = floorStyle === opt.style;
                      return (
                        <button
                          key={opt.style}
                          type="button"
                          onClick={() => onChangeFloorStyle(opt.style)}
                          className={`py-1 rounded-md text-[10px] font-medium transition-colors ${
                            active
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {FLOOR_COLOR_PALETTE.map((swatch) => {
                      const active = floorColor.toLowerCase() === swatch.hex.toLowerCase();
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={swatch.name}
                          aria-label={`Floor ${swatch.name}`}
                          onClick={() => onChangeFloorColor(swatch.hex)}
                          className={`w-6 h-6 rounded-md border transition-transform ${
                            active
                              ? 'border-blue-600 ring-2 ring-blue-300 scale-105'
                              : 'border-slate-300 hover:scale-105'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      );
                    })}
                    <label
                      title="Custom floor color"
                      className="relative w-6 h-6 rounded-md border border-slate-300 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden"
                    >
                      <input
                        type="color"
                        aria-label="Custom floor color"
                        value={floorColor}
                        onChange={(e) => onChangeFloorColor(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Palette className="w-3.5 h-3.5 text-slate-700" />
                    </label>
                  </div>
                </div>

                {/* Wall Thickness */}
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-600 font-medium">Wall Thickness</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {defaultThickness.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Default wall thickness"
                    min={0.1}
                    max={0.5}
                    step={0.02}
                    value={defaultThickness}
                    onChange={(e) => onChangeDefaultThickness(Number(e.target.value))}
                    className="cad-slider w-full"
                  />
                </div>

                {/* Ceiling / Roof Style */}
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <span className="text-[11px] text-slate-600 font-medium block">
                    Ceiling / Roof Style
                  </span>
                  <div
                    className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-slate-100"
                    role="group"
                    aria-label="Ceiling and roof style"
                  >
                    {(
                      [
                        { id: 'flat', label: 'Flat', tip: 'Flat interior ceiling slab' },
                        {
                          id: 'gable',
                          label: 'Triangle',
                          tip: 'Triangular pitched roof with flat interior ceiling',
                        },
                        {
                          id: 'open-gable',
                          label: 'Open',
                          tip: 'Open cathedral triangle roof (no flat ceiling, extra top space)',
                        },
                      ] as const
                    ).map((opt) => {
                      const active = showCeiling && ceilingMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          title={opt.tip}
                          onClick={() => onChangeCeilingMode(opt.id)}
                          className={`py-1 rounded-md text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-slate-700 hover:text-slate-900 hover:bg-white/70'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </fieldset>
            )}

            {/* Wiring Step Options */}
            {workspaceStep === 'wiring' && (
              <div className="space-y-3">
                {activeTool === 'wire' && (
                  <fieldset
                    disabled={editLocked}
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 space-y-2 disabled:opacity-60"
                  >
                    <div className="text-[11px] font-semibold text-slate-900">
                      Breaker &amp; Cable Settings
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {WIRE_BREAKER_PRESETS.map((preset) => {
                        const active = activeBreakerPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => onSelectBreakerPreset(preset)}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 border transition-colors ${
                              active
                                ? 'bg-white border-blue-500 text-slate-900 shadow-xs'
                                : 'bg-white/70 border-slate-200 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: preset.color }}
                            />
                            <span className="truncate">{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5 text-[10px] text-slate-600">
                        <span>Spec</span>
                        <select
                          value={activeCableSpec}
                          onChange={(e) => onChangeCableSpec(e.target.value as CableSpec)}
                          className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-medium text-slate-900"
                        >
                          {CABLE_SPEC_OPTIONS.map((spec) => (
                            <option key={spec} value={spec}>
                              {CABLE_SPEC_INFO[spec].shortLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-0.5 text-[10px] text-slate-600">
                        <span>Breaker ID</span>
                        <input
                          type="text"
                          maxLength={18}
                          value={activeBreakerLabel}
                          onChange={(e) => onChangeBreakerLabel(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-900"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white/80 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => onChangeWireMountRef('from-top')}
                        className={`py-0.5 rounded text-[10px] font-medium ${
                          activeWireMountRef === 'from-top'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        EU Top
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeWireMountRef('from-floor')}
                        className={`py-0.5 rounded text-[10px] font-medium ${
                          activeWireMountRef === 'from-floor'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        Floor
                      </button>
                    </div>
                    {activeWireMountRef === 'from-top' ? (
                      <label className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Drop from Top</span>
                        <NumericInput
                          min={0.15}
                          max={1.5}
                          step={0.05}
                          value={activeWireDropFromTop}
                          onChange={onChangeWireDropFromTop}
                          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                        />
                      </label>
                    ) : (
                      <label className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Height (m)</span>
                        <NumericInput
                          min={0.15}
                          max={3.5}
                          step={0.05}
                          value={activeWireHeight}
                          onChange={onChangeWireHeight}
                          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                        />
                      </label>
                    )}
                  </fieldset>
                )}

                {activeTool === 'junction' && (
                  <fieldset
                    disabled={editLocked}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2 disabled:opacity-60"
                  >
                    <div className="text-[11px] font-semibold text-slate-800">Wall Point Type</div>
                    <div className="grid grid-cols-2 gap-1">
                      {ELECTRICAL_JUNCTION_KINDS.map((kind) => {
                        const info = JUNCTION_KIND_INFO[kind];
                        const active = activeJunctionKind === kind;
                        return (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => onChangeJunctionKind(kind)}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 border transition-colors ${
                              active
                                ? 'bg-white border-blue-500 text-slate-900 shadow-xs'
                                : 'bg-white/60 border-slate-200 text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: info.color }}
                            />
                            <span className="truncate">{info.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {(activeTool === 'security' || selected?.kind === 'security') && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-800">
                      Cameras &amp; Sensors
                    </div>
                    <fieldset disabled={editLocked} className="space-y-1.5 disabled:opacity-60">
                      <div className="text-[10px] font-semibold text-slate-500">Cameras</div>
                      <div className="grid grid-cols-2 gap-1">
                        {CAMERA_DEVICE_KINDS.map((kind) => {
                          const info = SECURITY_DEVICE_INFO[kind];
                          const active = activeSecurityKind === kind;
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => {
                                onChangeSecurityKind(kind);
                                if (activeTool !== 'security') onSelectTool('security');
                              }}
                              className={`px-1.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 border ${
                                active
                                  ? 'bg-white border-teal-600 text-slate-900 shadow-xs'
                                  : 'bg-white/70 border-slate-200 text-slate-600'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: info.color }}
                              />
                              <span className="truncate">{info.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="text-[10px] font-semibold text-amber-800">Sensors</div>
                      <div className="grid grid-cols-2 gap-1">
                        {SENSOR_DEVICE_KINDS.map((kind) => {
                          const info = SECURITY_DEVICE_INFO[kind];
                          const active = activeSecurityKind === kind;
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => {
                                onChangeSecurityKind(kind);
                                if (activeTool !== 'security') onSelectTool('security');
                              }}
                              className={`px-1.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 border ${
                                active
                                  ? 'bg-white border-amber-600 text-slate-900 shadow-xs'
                                  : 'bg-white/70 border-slate-200 text-slate-600'
                              }`}
                            >
                              <span
                                className="w-2 h-2 rounded-xs shrink-0"
                                style={{ backgroundColor: info.color }}
                              />
                              <span className="truncate">{info.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-1 pt-1 border-t border-teal-200/70">
                      <button
                        type="button"
                        onClick={onToggleSecurityCoverage}
                        aria-pressed={showSecurityCoverage}
                        className={`px-2 py-1 rounded-md border text-[10px] font-medium flex items-center justify-center gap-1 ${
                          showSecurityCoverage
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        <Radar className="w-3 h-3" />
                        <span>{showSecurityCoverage ? 'Cones ON' : 'Cones'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onToggleTestMotion}
                        aria-pressed={testMotionActive}
                        className={`px-2 py-1 rounded-md border text-[10px] font-semibold ${
                          testMotionActive
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {testMotionActive ? 'Motion ON' : 'Test Motion'}
                      </button>
                    </div>
                    {securityDevices.some((d) => isCameraSecurityDevice(d.kind)) && (
                      <button
                        type="button"
                        onClick={() => {
                          const selCam =
                            selected?.kind === 'security'
                              ? securityDevices.find(
                                  (d) =>
                                    d.id === selected.securityId && isCameraSecurityDevice(d.kind),
                                )
                              : null;
                          const firstCam =
                            selCam ?? securityDevices.find((d) => isCameraSecurityDevice(d.kind));
                          if (firstCam) onEnterCameraView(firstCam.id);
                        }}
                        className="w-full py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium flex items-center justify-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Camera 3D Feed</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Plumbing Step Options */}
            {workspaceStep === 'plumbing' && (
              <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-60">
                {activeTool === 'pipe' && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-900">
                      Pipe Line &amp; Diameter
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {PLUMBING_PIPE_PRESETS.map((preset) => {
                        const active = activePipePresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => onSelectPipePreset(preset)}
                            className={`px-1.5 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 border ${
                              active
                                ? 'bg-white border-blue-500 text-slate-900 shadow-xs'
                                : 'bg-white/70 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: preset.color }}
                            />
                            <span className="truncate">{preset.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="space-y-0.5 text-[10px] text-slate-600">
                        <span>Diameter</span>
                        <select
                          value={activePipeSpec}
                          onChange={(e) => onChangePipeSpec(e.target.value as PlumbingPipeSpec)}
                          className="w-full rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-medium text-slate-900"
                        >
                          {PLUMBING_SPEC_OPTIONS.map((spec) => (
                            <option key={spec} value={spec}>
                              {PLUMBING_SPEC_INFO[spec].shortLabel}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-0.5 text-[10px] text-slate-600">
                        <span>Line ID</span>
                        <input
                          type="text"
                          maxLength={16}
                          value={activePipeLabel}
                          onChange={(e) => onChangePipeLabel(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-900"
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-white/80 border border-slate-200">
                      <button
                        type="button"
                        onClick={() => onChangePipeMountRef('from-floor')}
                        className={`py-0.5 rounded text-[10px] font-medium ${
                          activePipeMountRef === 'from-floor'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        Floor
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangePipeMountRef('from-top')}
                        className={`py-0.5 rounded text-[10px] font-medium ${
                          activePipeMountRef === 'from-top'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600'
                        }`}
                      >
                        EU Top
                      </button>
                    </div>
                    {activePipeMountRef === 'from-floor' ? (
                      <label className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Height (m)</span>
                        <NumericInput
                          min={0.08}
                          max={2.6}
                          step={0.05}
                          value={activePipeHeight}
                          onChange={onChangePipeHeight}
                          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                        />
                      </label>
                    ) : (
                      <label className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Drop (m)</span>
                        <NumericInput
                          min={0.15}
                          max={2.5}
                          step={0.05}
                          value={activePipeDropFromTop}
                          onChange={onChangePipeDropFromTop}
                          className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right font-mono-tabular font-medium text-slate-900"
                        />
                      </label>
                    )}
                  </div>
                )}

                {activeTool === 'fixture' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-800">Water Point</div>
                    <div className="grid grid-cols-2 gap-1">
                      {FIXTURE_KINDS.map((kind) => {
                        const info = PLUMBING_FIXTURE_INFO[kind];
                        const active = activeFixtureKind === kind;
                        return (
                          <button
                            key={kind}
                            type="button"
                            onClick={() => onChangeFixtureKind(kind)}
                            className={`px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 border ${
                              active
                                ? 'bg-white border-blue-500 text-slate-900 shadow-xs'
                                : 'bg-white/70 border-slate-200 text-slate-600'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: info.color }}
                            />
                            <span className="truncate">{info.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            {/* Interior & Lights Step Options */}
            {workspaceStep === 'interior' && (
              <fieldset disabled={editLocked} className="space-y-2.5 disabled:opacity-60">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-700">Furniture &amp; WC</div>
                  <div className="grid grid-cols-2 gap-1">
                    {FURNITURE_KINDS.map((kind) => {
                      const info = FURNITURE_KIND_INFO[kind];
                      const active = activeTool === 'furniture' && activeFurnitureKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => {
                            onChangeFurnitureKind(kind);
                            if (activeTool !== 'furniture') onSelectTool('furniture');
                          }}
                          className={`px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 border transition-colors ${
                            active
                              ? 'bg-amber-50 border-amber-500 text-slate-900 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: info.color }}
                          />
                          <span className="truncate">{info.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="text-[11px] font-semibold text-amber-900">Lights</div>
                  <div className="grid grid-cols-2 gap-1">
                    {(['ceiling-light', 'wall-light'] as JunctionKind[]).map((lKind) => {
                      const info = JUNCTION_KIND_INFO[lKind];
                      const active = activeTool === 'junction' && activeJunctionKind === lKind;
                      return (
                        <button
                          key={lKind}
                          type="button"
                          onClick={() => {
                            onChangeJunctionKind(lKind);
                            if (activeTool !== 'junction') onSelectTool('junction');
                          }}
                          className={`px-2 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 border transition-colors ${
                            active
                              ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs'
                              : 'bg-slate-50 border-slate-200 text-amber-800 hover:bg-white'
                          }`}
                        >
                          <Lamp className="w-3 h-3 shrink-0" />
                          <span className="truncate">{info.label.replace(/\s*\(.*?\)/, '')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </fieldset>
            )}

            {/* Global Push Up Height Control */}
            <fieldset
              disabled={editLocked}
              className="pt-2 border-t border-slate-200 space-y-1 disabled:opacity-60"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-medium flex items-center gap-1">
                  <ArrowUpDown className="w-3 h-3 text-blue-600" />
                  <span>Push Up (Wall H)</span>
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {wallHeight.toFixed(2)} m
                </span>
              </div>
              <input
                type="range"
                aria-label="Wall push up height"
                min={0}
                max={6.0}
                step={0.05}
                value={wallHeight}
                onChange={(e) => onChangeWallHeight(Number(e.target.value))}
                className="cad-slider w-full"
              />
            </fieldset>
          </div>
        )}

        {/* Section 4: Pinned Footer Export */}
        <div className="p-2 border-t border-slate-200 bg-slate-50/80 shrink-0">
          <button
            type="button"
            onClick={onOpenExport}
            title="Export STL / OBJ for 3D Printing"
            className={`w-full min-h-[36px] rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              desktopCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            {!desktopCollapsed && <span>Export STL / OBJ</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE THUMB-ZONE BOTTOM BAR (<= 15% height) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/96 border-t border-slate-200 px-1.5 pt-1 pb-safe">
        <div className="flex items-center gap-1">
          {/* Quick step cycle switcher on left */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 shrink-0">
            {STEP_TABS.map((step) => {
              const Icon = step.icon;
              const active = workspaceStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  title={step.label}
                  onClick={() => onChangeWorkspaceStep(step.id)}
                  className={`min-h-[40px] px-2 rounded-md text-[10px] font-medium flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    active ? 'bg-blue-600 text-white' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5 overflow-x-auto flex-1">
            {currentStepTools.map((item) => {
              const Icon = item.icon;
              const active = activeTool === item.id;
              const toolDisabled = editLocked && item.id !== 'select';
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={toolDisabled}
                  onClick={() => onSelectTool(item.id)}
                  className={`min-h-[42px] min-w-[46px] px-1 flex flex-col items-center justify-center rounded-lg text-[9px] font-medium transition-colors shrink-0 disabled:opacity-40 ${
                    active ? 'bg-blue-50 text-blue-600' : 'text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4 mb-0.5" />
                  <span className="whitespace-nowrap">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            className="min-h-[42px] min-w-[48px] px-2 flex flex-col items-center justify-center rounded-lg bg-slate-900 text-white text-[9px] font-medium shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4 mb-0.5" />
            <span className="whitespace-nowrap">More</span>
          </button>
        </div>
      </div>

      {/* MOBILE SLIDE-UP SHEET */}
      {mobileSheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 flex items-end bg-slate-900/40"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white border-t border-slate-200 p-4 pb-safe shadow-2xl space-y-4 max-h-[82vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Layers, Steps &amp; Summary
              </h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo || editLocked}
                  aria-label="Undo"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-700 disabled:opacity-35"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo || editLocked}
                  aria-label="Redo"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-700 disabled:opacity-35"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileSheetOpen(false)}
                  aria-label="Close panel"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mobile Step Switcher */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100">
              {STEP_TABS.map((step) => {
                const Icon = step.icon;
                const active = workspaceStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onChangeWorkspaceStep(step.id)}
                    className={`min-h-[40px] rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 whitespace-nowrap ${
                      active ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{step.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile Section Visibility & X-Ray Toggles */}
            <div className="grid grid-cols-5 gap-1 text-xs">
              <button
                type="button"
                onClick={onToggleStructure}
                className={`min-h-[40px] rounded-lg border font-medium flex flex-col items-center justify-center gap-0.5 ${
                  showStructure
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span className="text-[10px]">Structure</span>
              </button>
              <button
                type="button"
                onClick={onToggleWiring}
                className={`min-h-[40px] rounded-lg border font-medium flex flex-col items-center justify-center gap-0.5 ${
                  showWiring
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="text-[10px]">Wires</span>
              </button>
              <button
                type="button"
                onClick={onTogglePlumbing}
                className={`min-h-[40px] rounded-lg border font-medium flex flex-col items-center justify-center gap-0.5 ${
                  showPlumbing
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                <Droplets className="w-3.5 h-3.5" />
                <span className="text-[10px]">Water</span>
              </button>
              <button
                type="button"
                onClick={onToggleSecurity}
                className={`min-h-[40px] rounded-lg border font-medium flex flex-col items-center justify-center gap-0.5 ${
                  showSecurity
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : 'bg-white text-slate-500 border-slate-200'
                }`}
              >
                <Cctv className="w-3.5 h-3.5" />
                <span className="text-[10px]">Guard</span>
              </button>
              <button
                type="button"
                onClick={onToggleXrayWalls}
                className={`min-h-[40px] rounded-lg border font-medium flex flex-col items-center justify-center gap-0.5 ${
                  xrayWalls
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="text-[10px]">X-Ray</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-xs">
              <button
                type="button"
                onClick={onToggleRoomAreas}
                className={`min-h-[40px] px-2 rounded-lg border font-medium flex items-center justify-center gap-1.5 ${
                  showRoomAreas
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{showRoomAreas ? 'Areas: ON' : 'Areas'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleCeiling}
                className={`min-h-[40px] px-2 rounded-lg border font-medium flex items-center justify-center gap-1.5 ${
                  showCeiling
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <PanelTop className="w-3.5 h-3.5" />
                <span>{showCeiling ? 'Ceiling: ON' : 'Ceiling'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleInterior}
                className={`min-h-[40px] px-2 rounded-lg border font-medium flex items-center justify-center gap-1.5 ${
                  showInterior
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                <Armchair className="w-3.5 h-3.5" />
                <span>{showInterior ? 'Interior: ON' : 'Interior'}</span>
              </button>
            </div>

            {viewMode !== '2d' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">3D View &amp; Dimensions</span>
                  <button
                    type="button"
                    onClick={onToggleWalkDimensions}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 ${
                      showWalkDimensions
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <Ruler className="w-3 h-3" />
                    <span>{showWalkDimensions ? 'Dimensions ON' : 'Dimensions OFF'}</span>
                  </button>
                </div>

                {isWalkthrough && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-600" />
                        <span>Walker Height</span>
                      </span>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {walkerHeight.toFixed(2)} m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1.4}
                      max={2.1}
                      step={0.05}
                      value={walkerHeight}
                      onChange={(e) => onChangeWalkerHeight(Number(e.target.value))}
                      className="cad-slider w-full"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">Horizontal FOV (H-FOV)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onChangeCameraFov(105);
                          onChangeCameraZoom(1.0);
                        }}
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                      >
                        Reset 105°
                      </button>
                      <span className="font-mono-tabular font-semibold text-slate-900">
                        {Math.round(cameraFov)}°
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={170}
                    step={1}
                    value={cameraFov}
                    onChange={(e) => onChangeCameraFov(Number(e.target.value))}
                    className="cad-slider w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-700">Camera Depth / Zoom</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {cameraZoom.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.05}
                    value={cameraZoom}
                    onChange={(e) => onChangeCameraZoom(Number(e.target.value))}
                    className="cad-slider w-full"
                  />
                </div>
              </div>
            )}

            {/* Mobile Ceiling / Roof Mode */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Ceiling &amp; Roof Style</span>
                <span className="text-[11px] text-slate-500">
                  {showCeiling ? 'Visible in 3D' : 'Hidden'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'flat', label: 'Flat Slab' },
                    { id: 'gable', label: 'Triangle Roof' },
                    { id: 'open-gable', label: 'Open Vault' },
                  ] as const
                ).map((opt) => {
                  const active = showCeiling && ceilingMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChangeCeilingMode(opt.id)}
                      className={`min-h-[38px] px-2 rounded-lg border font-medium text-[11px] ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileSheetOpen(false);
                onOpenCalculations();
              }}
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-medium flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4 text-blue-600" />
              <span>Open Project Summary</span>
            </button>

            {/* Active Electrical Breaker Picker on Mobile */}
            {activeTool === 'wire' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">EU Breaker &amp; Cable</span>
                  <select
                    value={activeCableSpec}
                    onChange={(e) => onChangeCableSpec(e.target.value as CableSpec)}
                    className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-900"
                  >
                    {CABLE_SPEC_OPTIONS.map((spec) => (
                      <option key={spec} value={spec}>
                        {CABLE_SPEC_INFO[spec].shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WIRE_BREAKER_PRESETS.map((preset) => {
                    const active = activeBreakerPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectBreakerPreset(preset)}
                        className={`min-h-[40px] px-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-blue-600 bg-white text-slate-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Junction Box Type on Mobile */}
            {activeTool === 'junction' && workspaceStep !== 'interior' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-900">Wall Junction / Outlet Type</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ELECTRICAL_JUNCTION_KINDS.map((kind) => {
                    const info = JUNCTION_KIND_INFO[kind];
                    const active = activeJunctionKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onChangeJunctionKind(kind)}
                        className={`min-h-[40px] px-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-blue-600 bg-white text-slate-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="truncate">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Pipe Preset on Mobile */}
            {activeTool === 'pipe' && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">Pipe Line &amp; Diameter</span>
                  <select
                    value={activePipeSpec}
                    onChange={(e) => onChangePipeSpec(e.target.value as PlumbingPipeSpec)}
                    className="rounded border border-sky-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-900"
                  >
                    {PLUMBING_SPEC_OPTIONS.map((spec) => (
                      <option key={spec} value={spec}>
                        {PLUMBING_SPEC_INFO[spec].shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PLUMBING_PIPE_PRESETS.map((preset) => {
                    const active = activePipePresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectPipePreset(preset)}
                        className={`min-h-[40px] px-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-blue-600 bg-white text-slate-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: preset.color }}
                        />
                        <span className="truncate">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Fixture Type on Mobile */}
            {activeTool === 'fixture' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-900">Plumbing Fixture Point</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FIXTURE_KINDS.map((kind) => {
                    const info = PLUMBING_FIXTURE_INFO[kind];
                    const active = activeFixtureKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => onChangeFixtureKind(kind)}
                        className={`min-h-[40px] px-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-blue-600 bg-white text-slate-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="truncate">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Security Device Type on Mobile */}
            {(activeTool === 'security' || (workspaceStep === 'wiring' && selected?.kind === 'security')) && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    Cameras &amp; Moving Sensors
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onToggleSecurityCoverage}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        showSecurityCoverage
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {showSecurityCoverage ? 'Cones ON' : 'Cones OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleTestMotion}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        testMotionActive
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {testMotionActive ? 'Motion ON' : 'Test Motion'}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-600">
                    Optical Cameras
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CAMERA_DEVICE_KINDS.map((kind) => {
                      const info = SECURITY_DEVICE_INFO[kind];
                      const active = activeSecurityKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => {
                            onChangeSecurityKind(kind);
                            onSelectTool('security');
                          }}
                          className={`min-h-[38px] px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                            active
                              ? 'border-teal-600 bg-white text-slate-900 shadow-xs'
                              : 'border-slate-200 bg-white/70 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: info.color }}
                          />
                          <span className="truncate">{info.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-amber-800">
                    Moving &amp; Intrusion Sensors
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SENSOR_DEVICE_KINDS.map((kind) => {
                      const info = SECURITY_DEVICE_INFO[kind];
                      const active = activeSecurityKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => {
                            onChangeSecurityKind(kind);
                            onSelectTool('security');
                          }}
                          className={`min-h-[38px] px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                            active
                              ? 'border-amber-600 bg-white text-slate-900 shadow-xs'
                              : 'border-slate-200 bg-white/70 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: info.color }}
                          />
                          <span className="truncate">{info.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Active Opening Tool Size on Mobile */}
            {activeOpeningTool && activePreset && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-900">
                  Next {STRUCTURE_TOOLS.find((t) => t.id === activeOpeningTool)?.label} Dimensions
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs text-slate-700">
                    <span>Width (m)</span>
                    <NumericInput
                      min={0.55}
                      max={6.0}
                      step={0.05}
                      value={activePreset.width}
                      onChange={(val) => onChangeOpeningDefault(activeOpeningTool, { width: val })}
                      className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono-tabular font-medium text-slate-900"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-slate-700">
                    <span>Height (m)</span>
                    <NumericInput
                      min={0.35}
                      max={4.0}
                      step={0.05}
                      value={activePreset.height}
                      onChange={(val) => onChangeOpeningDefault(activeOpeningTool, { height: val })}
                      className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono-tabular font-medium text-slate-900"
                    />
                  </label>
                  {activeOpeningTool === 'window' && (
                    <label className="space-y-1 text-xs text-slate-700 col-span-2">
                      <span>Sill Height (m)</span>
                      <NumericInput
                        min={0.1}
                        max={4.0}
                        step={0.05}
                        value={activePreset.sillHeight}
                        onChange={(val) =>
                          onChangeOpeningDefault(activeOpeningTool, { sillHeight: val })
                        }
                        className="w-full min-h-[40px] rounded-lg border border-slate-200 bg-white px-2.5 font-mono-tabular font-medium text-slate-900"
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* Mobile Wall & Floor Style Pickers */}
            <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-60">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Default Wall Color</span>
                  <button
                    type="button"
                    onClick={() => onChangeDefaultWallColor(defaultWallColor, true)}
                    className="text-[11px] font-medium text-blue-600"
                  >
                    Apply to All
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {WALL_COLOR_PALETTE.map((swatch) => {
                    const active = defaultWallColor.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        aria-label={swatch.name}
                        onClick={() => onChangeDefaultWallColor(swatch.hex, false)}
                        className={`w-8 h-8 rounded-lg border ${
                          active ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      />
                    );
                  })}
                  <label className="relative w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center overflow-hidden">
                    <input
                      type="color"
                      aria-label="Custom default wall color"
                      value={defaultWallColor}
                      onChange={(e) => onChangeDefaultWallColor(e.target.value, false)}
                      className="absolute inset-0 w-full h-full opacity-0"
                    />
                    <Palette className="w-4 h-4 text-slate-700" />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Floor Style &amp; Color</span>
                  <span className="text-[11px] font-mono-tabular text-slate-500">{floorColor}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {FLOOR_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.style}
                      type="button"
                      onClick={() => onChangeFloorStyle(opt.style)}
                      className={`min-h-[34px] rounded-lg border text-[11px] font-medium ${
                        floorStyle === opt.style
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {FLOOR_COLOR_PALETTE.map((swatch) => {
                    const active = floorColor.toLowerCase() === swatch.hex.toLowerCase();
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        aria-label={`Floor ${swatch.name}`}
                        onClick={() => onChangeFloorColor(swatch.hex)}
                        className={`w-8 h-8 rounded-lg border ${
                          active ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-300'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      />
                    );
                  })}
                  <label className="relative w-8 h-8 rounded-lg border border-slate-300 bg-white flex items-center justify-center overflow-hidden">
                    <input
                      type="color"
                      aria-label="Custom floor color"
                      value={floorColor}
                      onChange={(e) => onChangeFloorColor(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0"
                    />
                    <Palette className="w-4 h-4 text-slate-700" />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">Push Up (Wall Height)</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {wallHeight.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={6.0}
                    step={0.05}
                    value={wallHeight}
                    onChange={(e) => onChangeWallHeight(Number(e.target.value))}
                    className="cad-slider w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700">Wall Thickness</span>
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {defaultThickness.toFixed(2)} m
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={0.5}
                    step={0.02}
                    value={defaultThickness}
                    onChange={(e) => onChangeDefaultThickness(Number(e.target.value))}
                    className="cad-slider w-full"
                  />
                </div>
              </div>
            </fieldset>

            {/* Active Interior Furniture & Lights on Mobile */}
            {(activeTool === 'furniture' || workspaceStep === 'interior') && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2.5">
                <div className="text-xs font-semibold text-slate-900">
                  Interior Furniture &amp; Lighting
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {FURNITURE_KINDS.map((kind) => {
                    const info = FURNITURE_KIND_INFO[kind];
                    const active = activeTool === 'furniture' && activeFurnitureKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          onChangeFurnitureKind(kind);
                          onSelectTool('furniture');
                        }}
                        className={`min-h-[38px] px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-amber-600 bg-white text-slate-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="truncate">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-amber-200/70">
                  {(['ceiling-light', 'wall-light'] as JunctionKind[]).map((lKind) => {
                    const info = JUNCTION_KIND_INFO[lKind];
                    const active = activeTool === 'junction' && activeJunctionKind === lKind;
                    return (
                      <button
                        key={lKind}
                        type="button"
                        onClick={() => {
                          onChangeJunctionKind(lKind);
                          onSelectTool('junction');
                        }}
                        className={`min-h-[38px] px-2 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 ${
                          active
                            ? 'border-amber-600 bg-white text-amber-900 shadow-xs'
                            : 'border-slate-200 bg-white/70 text-slate-700'
                        }`}
                      >
                        <Lamp className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                        <span className="truncate">{info.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <InspectorPanel
              selected={selected}
              walls={walls}
              wires={wires}
              junctions={junctions}
              pipes={pipes}
              fixtures={fixtures}
              securityDevices={securityDevices}
              furniture={furniture}
              wallHeight={wallHeight}
              defaultWallColor={defaultWallColor}
              activeCameraViewId={activeCameraViewId}
              editLocked={editLocked}
              embedded
              onUpdateWallThickness={onUpdateWallThickness}
              onUpdateWallColor={onUpdateWallColor}
              onResizeWall={onResizeWall}
              onUpdateOpening={onUpdateOpening}
              onUpdateWire={onUpdateWire}
              onUpdateJunction={onUpdateJunction}
              onTogglePanelBreaker={onTogglePanelBreaker}
              onUpdatePipe={onUpdatePipe}
              onUpdateFixture={onUpdateFixture}
              onUpdateSecurityDevice={onUpdateSecurityDevice}
              onUpdateFurniture={onUpdateFurniture}
              onEnterCameraView={(camId) => {
                setMobileSheetOpen(false);
                onEnterCameraView(camId);
              }}
              onExitCameraView={onExitCameraView}
              onSelectTarget={(target) => {
                onSelectTarget?.(target);
              }}
              onStartWireFromJunction={(junctionId) => {
                setMobileSheetOpen(false);
                onStartWireFromJunction?.(junctionId);
              }}
              onToggleJunctionWireConnection={onToggleJunctionWireConnection}
              onDisconnectWireSplice={onDisconnectWireSplice}
              onDeleteSelected={onDeleteSelected}
              onCloseSelection={onCloseSelection}
            />

            <button
              type="button"
              onClick={() => {
                setMobileSheetOpen(false);
                onOpenExport();
              }}
              className="w-full min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Export STL / OBJ for 3D Printing</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
