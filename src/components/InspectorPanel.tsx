import React, { useEffect, useState } from 'react';
import {
  Armchair,
  ArrowLeftRight,
  Cctv,
  DoorOpen,
  Droplets,
  Eye,
  Lamp,
  Plug,
  Power,
  RotateCcw,
  RotateCw,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  computePipeLengthBreakdown,
  computeSecurityCoverage,
  computeWallOuterExtent,
  computeWireLengthBreakdown,
  doesWireTraverseWall,
  getJunctionConnectedWireIds,
  getPanelBreakerCircuitSummaries,
  getPlumbingDisplayColor,
  getWallOutwardSide,
  getWireConnectedJunctionIds,
  getWireConnectedWireIds,
  getWireDisplayColor,
  isInteriorMergedWall,
  resolveMountElevation,
  wallAngleRad,
  wallLength,
} from '../geometry/wallDecomposition';
import {
  CABLE_SPEC_INFO,
  CABLE_SPEC_OPTIONS,
  FURNITURE_KIND_INFO,
  isCameraSecurityDevice,
  isDoorOpening,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_SPEC_INFO,
  PLUMBING_SPEC_OPTIONS,
  PLUMBING_TYPE_INFO,
  SECURITY_DEVICE_INFO,
  WALL_COLOR_PALETTE,
  WIRE_CIRCUIT_INFO,
  type ElectricalJunction,
  type ElectricalWire,
  type FurnitureItem,
  type FurnitureKind,
  type JunctionKind,
  type OpeningType,
  type PlumbingFixture,
  type PlumbingFixtureKind,
  type PlumbingPipe,
  type PlumbingPipeSpec,
  type PlumbingPipeType,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type WallOpening,
  type WallSegment,
  type WireCircuitType,
} from '../types/plan';
import { NumericInput } from './NumericInput';

interface InspectorPanelProps {
  selected: SelectionTarget;
  walls: WallSegment[];
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture?: FurnitureItem[];
  wallHeight: number;
  defaultWallColor: string;
  activeCameraViewId?: string | null;
  editLocked?: boolean;
  embedded?: boolean;
  rightPanelHidden?: boolean;
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
  onUpdateFurniture?: (furnitureId: string, patch: Partial<FurnitureItem>) => void;
  onEnterCameraView?: (cameraId: string) => void;
  onExitCameraView?: () => void;
  onSelectTarget?: (target: SelectionTarget) => void;
  onStartWireFromJunction?: (junctionId: string) => void;
  onToggleJunctionWireConnection?: (junctionId: string, wireId: string) => void;
  onDisconnectWireSplice?: (wireIdA: string, wireIdB: string) => void;
  onDeleteSelected: () => void;
  onCloseSelection: () => void;
}

const OPENING_TYPE_LABELS: { type: OpeningType; label: string }[] = [
  { type: 'door', label: 'Single' },
  { type: 'double-door', label: 'Double' },
  { type: 'sliding-door', label: 'Sliding' },
  { type: 'garage-door', label: 'Garage' },
  { type: 'window', label: 'Window' },
];

const WIRE_CIRCUIT_OPTIONS: { type: WireCircuitType; label: string }[] = [
  { type: 'power', label: 'Power' },
  { type: 'lighting', label: 'Lighting' },
  { type: 'data', label: 'Data' },
];

const JUNCTION_KIND_OPTIONS: { kind: JunctionKind; label: string }[] = [
  { kind: 'junction-box', label: 'Junction' },
  { kind: 'socket', label: 'Socket' },
  { kind: 'switch', label: 'Switch' },
  { kind: 'panel', label: 'Panel' },
  { kind: 'wall-light', label: 'Wall Light' },
  { kind: 'ceiling-light', label: 'Ceiling Lt' },
];

const FURNITURE_KIND_OPTIONS: { kind: FurnitureKind; label: string }[] = [
  { kind: 'sofa', label: 'Sofa' },
  { kind: 'sofa-table', label: 'Sofa Table' },
  { kind: 'working-table', label: 'Office Desk' },
  { kind: 'workbench', label: 'Work Table' },
  { kind: 'dining-table', label: 'Dining' },
  { kind: 'bed', label: 'Bed' },
  { kind: 'wardrobe', label: 'Wardrobe' },
  { kind: 'toilet', label: 'Toilet' },
];

const PLUMBING_TYPE_OPTIONS: { type: PlumbingPipeType; label: string }[] = [
  { type: 'cold', label: 'Cold' },
  { type: 'hot', label: 'Hot' },
  { type: 'circulation', label: 'Return' },
  { type: 'drain', label: 'Drain' },
];

const FIXTURE_KIND_OPTIONS: { kind: PlumbingFixtureKind; label: string }[] = [
  { kind: 'sink', label: 'Sink' },
  { kind: 'shower', label: 'Shower' },
  { kind: 'wc', label: 'WC' },
  { kind: 'boiler', label: 'Boiler' },
  { kind: 'floor-drain', label: 'Drain' },
];

const SECURITY_KIND_OPTIONS: { kind: SecurityDeviceKind; label: string }[] = [
  { kind: 'bullet-cam', label: 'Bullet Cam' },
  { kind: 'dome-cam', label: 'Dome Cam' },
  { kind: 'ptz-cam', label: 'PTZ Cam' },
  { kind: 'motion-sensor', label: 'Wall PIR' },
  { kind: 'ceiling-pir', label: '360° PIR' },
  { kind: 'curtain-pir', label: 'Beam PIR' },
  { kind: 'door-contact', label: 'Contact' },
  { kind: 'glass-break', label: 'Glass' },
  { kind: 'siren', label: 'Siren' },
  { kind: 'keypad', label: 'Keypad' },
];

function openingTitle(type: OpeningType): string {
  switch (type) {
    case 'door':
      return 'Single Door';
    case 'double-door':
      return 'Double Door';
    case 'sliding-door':
      return 'Sliding Door';
    case 'garage-door':
      return 'Garage Door';
    case 'window':
      return 'Window';
  }
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  selected,
  walls,
  wires,
  junctions,
  pipes,
  fixtures,
  securityDevices,
  furniture = [],
  wallHeight,
  defaultWallColor,
  activeCameraViewId = null,
  editLocked = false,
  embedded = false,
  rightPanelHidden = false,
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
  onEnterCameraView,
  onExitCameraView,
  onSelectTarget,
  onStartWireFromJunction,
  onToggleJunctionWireConnection,
  onDisconnectWireSplice,
  onDeleteSelected,
  onCloseSelection,
}) => {
  const selectedWallId =
    selected && (selected.kind === 'wall' || selected.kind === 'opening') ? selected.wallId : null;
  const wall = selectedWallId ? walls.find((w) => w.id === selectedWallId) ?? null : null;
  const selectedWire =
    selected?.kind === 'wire' ? wires.find((w) => w.id === selected.wireId) ?? null : null;
  const selectedJunction =
    selected?.kind === 'junction'
      ? junctions.find((j) => j.id === selected.junctionId) ?? null
      : null;
  const selectedPipe =
    selected?.kind === 'pipe' ? pipes.find((p) => p.id === selected.pipeId) ?? null : null;
  const selectedFixture =
    selected?.kind === 'fixture'
      ? fixtures.find((f) => f.id === selected.fixtureId) ?? null
      : null;
  const selectedSecurity =
    selected?.kind === 'security'
      ? securityDevices.find((s) => s.id === selected.securityId) ?? null
      : null;
  const selectedFurniture =
    selected?.kind === 'furniture'
      ? furniture.find((item) => item.id === selected.furnitureId) ?? null
      : null;
  const len = wall ? wallLength(wall) : 0;
  const isInnerWall = wall ? isInteriorMergedWall(wall, walls) : false;
  const outerExtent = wall && !isInnerWall ? computeWallOuterExtent(wall, walls) : null;
  const outerLen = outerExtent ? outerExtent.outerLength : len;
  const extraOuter = outerExtent ? outerExtent.startExtend + outerExtent.endExtend : 0;

  const [lengthInput, setLengthInput] = useState<string>(() =>
    outerLen > 0 ? outerLen.toFixed(2) : '',
  );

  useEffect(() => {
    if (wall) {
      setLengthInput(outerLen.toFixed(2));
    }
  }, [wall?.id, outerLen]);

  if (!selected) return null;

  const asideClass = `hidden md:block fixed top-16 ${rightPanelHidden ? 'right-16' : 'right-32'} z-20 w-72 rounded-xl bg-white/96 border border-slate-200 p-3.5 shadow-sm max-h-[calc(100vh-5rem)] overflow-y-auto`;

  if (selected.kind === 'wire') {
    if (!selectedWire) return null;
    const breakdown = computeWireLengthBreakdown(selectedWire, junctions, walls, wallHeight);
    const wireColor = getWireDisplayColor(selectedWire.circuit, selectedWire.breakerLabel);
    const wireContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: wireColor }}
            >
              <Zap className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {selectedWire.breakerLabel} · {CABLE_SPEC_INFO[selectedWire.cableSpec].shortLabel}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                Total {breakdown.totalMeters.toFixed(2)} m · @ {breakdown.elevationY.toFixed(2)}m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete electrical wire"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        {/* Breaker / Circuit Label */}
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">Breaker / ID</span>
          <input
            type="text"
            maxLength={22}
            value={selectedWire.breakerLabel}
            onChange={(e) => onUpdateWire(selectedWire.id, { breakerLabel: e.target.value })}
            className="w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-900"
          />
        </label>

        {/* Cable Gauge Spec */}
        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">Cable Spec</span>
          <select
            value={selectedWire.cableSpec}
            onChange={(e) =>
              onUpdateWire(selectedWire.id, { cableSpec: e.target.value as ElectricalWire['cableSpec'] })
            }
            className="w-36 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-900"
          >
            {CABLE_SPEC_OPTIONS.map((spec) => (
              <option key={spec} value={spec}>
                {CABLE_SPEC_INFO[spec].shortLabel} ({CABLE_SPEC_INFO[spec].rating})
              </option>
            ))}
          </select>
        </label>

        {/* Circuit Type */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {WIRE_CIRCUIT_OPTIONS.map((opt) => {
            const info = WIRE_CIRCUIT_INFO[opt.type];
            const active = selectedWire.circuit === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() =>
                  onUpdateWire(selectedWire.id, {
                    circuit: opt.type,
                    dropFromTop: info.defaultDropFromTop,
                    height: info.defaultHeight,
                  })
                }
                className={`min-h-[32px] rounded-md text-[11px] font-medium flex items-center justify-center gap-1 transition-colors ${
                  active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: info.color }}
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* EU Mounting Reference: From Wall Top vs From Floor */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onUpdateWire(selectedWire.id, { mountRef: 'from-top' })}
              className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                selectedWire.mountRef === 'from-top'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              From Wall Top
            </button>
            <button
              type="button"
              onClick={() => onUpdateWire(selectedWire.id, { mountRef: 'from-floor' })}
              className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                selectedWire.mountRef === 'from-floor'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              From Floor
            </button>
          </div>

          {selectedWire.mountRef === 'from-top' ? (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Drop from Top (m)</span>
                <NumericInput
                  min={0.15}
                  max={1.5}
                  step={0.05}
                  value={selectedWire.dropFromTop}
                  onChange={(val) => onUpdateWire(selectedWire.id, { dropFromTop: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.15}
                max={1.5}
                step={0.05}
                value={selectedWire.dropFromTop}
                onChange={(e) =>
                  onUpdateWire(selectedWire.id, { dropFromTop: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Height from Floor (m)</span>
                <NumericInput
                  min={0.15}
                  max={3.5}
                  step={0.05}
                  value={selectedWire.height}
                  onChange={(val) => onUpdateWire(selectedWire.id, { height: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.15}
                max={3.5}
                step={0.05}
                value={selectedWire.height}
                onChange={(e) => onUpdateWire(selectedWire.id, { height: Number(e.target.value) })}
                className="cad-slider w-full"
              />
            </>
          )}
        </div>

        {/* Exact Cable Length Breakdown */}
        <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] font-mono-tabular">
          <div className="flex justify-between text-slate-600">
            <span>Horizontal Run:</span>
            <span>{breakdown.horizontalMeters.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Vertical Drops ({breakdown.dropCount}):</span>
            <span>{breakdown.verticalDropsMeters.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Cable Needed ({CABLE_SPEC_INFO[selectedWire.cableSpec].shortLabel}):</span>
            <span className="text-blue-700">{breakdown.totalMeters.toFixed(2)} m</span>
          </div>
        </div>

        {/* Connected Sockets, Switches, Panels & Junction Boxes */}
        {junctions.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
              <span>Connected Points</span>
              <span className="text-slate-400 font-mono-tabular">
                {getWireConnectedJunctionIds(selectedWire, junctions, walls).length} linked
              </span>
            </div>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {(() => {
                const linkedIds = new Set(
                  getWireConnectedJunctionIds(selectedWire, junctions, walls),
                );
                const candidates = junctions.filter(
                  (j) =>
                    linkedIds.has(j.id) || doesWireTraverseWall(selectedWire, j.wallId, walls),
                );
                if (candidates.length === 0) {
                  return (
                    <p className="text-[11px] text-slate-400">
                      Place a Socket/Switch/Panel on this wall or snap wire vertices to connect.
                    </p>
                  );
                }
                return candidates.map((j) => {
                  const info = JUNCTION_KIND_INFO[j.kind];
                  const isLinked = linkedIds.has(j.id);
                  return (
                    <div
                      key={j.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTarget?.({ kind: 'junction', junctionId: j.id })}
                        className="flex items-center gap-1.5 text-left truncate hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                      >
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="font-medium text-slate-800 truncate">{info.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleJunctionWireConnection?.(j.id, selectedWire.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors shrink-0 ${
                          isLinked
                            ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                            : 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                        }`}
                      >
                        {isLinked ? 'Disconnect' : '+ Connect'}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Wire-to-Wire Splices & Branches */}
        {(() => {
          const connectedWireIds = getWireConnectedWireIds(selectedWire, wires);
          if (connectedWireIds.length === 0) return null;
          return (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
                <span>Spliced Wires</span>
                <span className="text-emerald-700 font-mono-tabular">
                  {connectedWireIds.length} linked
                </span>
              </div>
              <div className="space-y-1">
                {connectedWireIds.map((wId) => {
                  const other = wires.find((w) => w.id === wId);
                  if (!other) return null;
                  const oColor = getWireDisplayColor(other.circuit, other.breakerLabel);
                  return (
                    <div
                      key={other.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTarget?.({ kind: 'wire', wireId: other.id })}
                        className="flex items-center gap-1.5 font-medium text-slate-800 hover:text-blue-600 truncate text-left"
                      >
                        <span
                          className="w-2 h-2 rounded-xs shrink-0"
                          style={{ backgroundColor: oColor }}
                        />
                        <span className="truncate">
                          {other.breakerLabel} · {CABLE_SPEC_INFO[other.cableSpec].shortLabel}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDisconnectWireSplice?.(selectedWire.id, other.id)}
                        className="px-2 py-0.5 rounded bg-white border border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-medium shrink-0 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{wireContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {wireContent}
      </aside>
    );
  }

  if (selected.kind === 'junction') {
    if (!selectedJunction) return null;
    const jInfo = JUNCTION_KIND_INFO[selectedJunction.kind];
    const effElev = resolveMountElevation(
      selectedJunction.mountRef,
      selectedJunction.dropFromTop,
      selectedJunction.height,
      wallHeight,
    );
    const jHostWall =
      selectedJunction.wallId !== 'ceiling'
        ? walls.find((w) => w.id === selectedJunction.wallId) ?? null
        : null;
    const jDefaultInSide: 1 | -1 =
      jHostWall && getWallOutwardSide(jHostWall, walls) === 1 ? -1 : 1;
    const jContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: jInfo.color }}
            >
              <Plug className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">{jInfo.label}</h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                Elev {effElev.toFixed(2)} m · Wall pos {selectedJunction.offset.toFixed(2)} m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete junction point"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Breaker Panel Hinged Door + Automatic MCB Breakers & Connected Sockets */}
        {selectedJunction.kind === 'panel' && (() => {
          const panelBreakers = getPanelBreakerCircuitSummaries(
            selectedJunction,
            wires,
            junctions,
            walls,
          );
          return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-800">
                  Distribution Breakers ({panelBreakers.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateJunction(selectedJunction.id, { isOpen: !selectedJunction.isOpen })
                  }
                  className={`px-2 py-1 rounded-md border text-[10px] font-semibold transition-colors ${
                    selectedJunction.isOpen
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {selectedJunction.isOpen ? 'Close Door' : 'Open Door'}
                </button>
              </div>
              {panelBreakers.length === 0 ? (
                <p className="text-[11px] text-slate-500 leading-snug">
                  Connect wires to sockets/lights and route to this panel to auto-populate MCB breakers.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {panelBreakers.map((brk) => (
                    <div
                      key={brk.breakerLabel}
                      className={`rounded-lg border p-2 space-y-1.5 ${
                        brk.isOn
                          ? 'border-emerald-200 bg-white'
                          : 'border-slate-200 bg-slate-100/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: brk.color }}
                          />
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {brk.breakerLabel}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono-tabular">
                            {brk.wireIds.length}w · {brk.totalMeters.toFixed(1)}m
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={editLocked}
                          onClick={() =>
                            onTogglePanelBreaker?.(selectedJunction.id, brk.breakerLabel)
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                            brk.isOn
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                              : 'bg-slate-600 text-white hover:bg-slate-700'
                          }`}
                        >
                          <Power className="w-2.5 h-2.5" />
                          <span>{brk.isOn ? 'ON' : 'OFF'}</span>
                        </button>
                      </div>
                      {brk.connectedJunctions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {brk.connectedJunctions.map((cj) => {
                            const cjInfo = JUNCTION_KIND_INFO[cj.kind];
                            return (
                              <button
                                key={cj.id}
                                type="button"
                                onClick={() =>
                                  onSelectTarget?.({ kind: 'junction', junctionId: cj.id })
                                }
                                title={`Inspect ${cjInfo.label} @ wall pos ${cj.offset.toFixed(2)}m`}
                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-[10px] font-medium text-slate-700 flex items-center gap-1 transition-colors"
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cjInfo.color }}
                                />
                                <span>
                                  {cjInfo.shortCode} {cj.offset.toFixed(1)}m
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {JUNCTION_KIND_OPTIONS.map((opt) => {
            const info = JUNCTION_KIND_INFO[opt.kind];
            const active = selectedJunction.kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() =>
                  onUpdateJunction(selectedJunction.id, {
                    kind: opt.kind,
                    mountRef: info.mountRef,
                    dropFromTop: info.defaultDropFromTop,
                    height: info.defaultHeight,
                  })
                }
                className={`min-h-[30px] rounded-md text-[10px] font-medium transition-colors ${
                  active ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {(selectedJunction.kind === 'wall-light' ||
          selectedJunction.kind === 'ceiling-light') && (
          <button
            type="button"
            onClick={() =>
              onUpdateJunction(selectedJunction.id, {
                isOn: selectedJunction.isOn === false ? true : false,
              })
            }
            className={`w-full min-h-[36px] rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              selectedJunction.isOn !== false
                ? 'bg-amber-500 text-white border-amber-500 shadow-xs hover:bg-amber-600'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            <Lamp className="w-3.5 h-3.5" />
            <span>
              {selectedJunction.isOn !== false
                ? 'Light Illumination: ON (Click to Turn Off)'
                : 'Light Illumination: OFF (Click to Turn On)'}
            </span>
          </button>
        )}

        <div className="space-y-1.5">
          {selectedJunction.mountRef === 'from-top' ? (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Drop from Top (m)</span>
                <NumericInput
                  min={0.02}
                  max={1.8}
                  step={0.05}
                  value={selectedJunction.dropFromTop}
                  onChange={(val) => onUpdateJunction(selectedJunction.id, { dropFromTop: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.02}
                max={1.8}
                step={0.05}
                value={selectedJunction.dropFromTop}
                onChange={(e) =>
                  onUpdateJunction(selectedJunction.id, { dropFromTop: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Height from Floor (m)</span>
                <NumericInput
                  min={0.15}
                  max={2.6}
                  step={0.05}
                  value={selectedJunction.height}
                  onChange={(val) => onUpdateJunction(selectedJunction.id, { height: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.15}
                max={2.6}
                step={0.05}
                value={selectedJunction.height}
                onChange={(e) =>
                  onUpdateJunction(selectedJunction.id, { height: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
            </>
          )}
        </div>

        {/* Wire Connections */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-700">
            <span>Wire Connections</span>
            <span className="font-mono-tabular text-slate-400">
              {getJunctionConnectedWireIds(selectedJunction, wires, walls).allWireIds.length} linked
            </span>
          </div>

          {onStartWireFromJunction && (
            <button
              type="button"
              onClick={() => onStartWireFromJunction(selectedJunction.id)}
              className="w-full min-h-[34px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Draw Wire From Here</span>
            </button>
          )}

          {(() => {
            const { vertexWireIds, allWireIds } = getJunctionConnectedWireIds(
              selectedJunction,
              wires,
              walls,
            );
            const allSet = new Set(allWireIds);
            const wallWires = wires.filter(
              (w) => !allSet.has(w.id) && doesWireTraverseWall(w, selectedJunction.wallId, walls),
            );
            const otherWires = wires.filter(
              (w) => !allSet.has(w.id) && !doesWireTraverseWall(w, selectedJunction.wallId, walls),
            );

            return (
              <div className="space-y-1.5">
                {allWireIds.map((wId) => {
                  const w = wires.find((item) => item.id === wId);
                  if (!w) return null;
                  const wColor = getWireDisplayColor(w.circuit, w.breakerLabel);
                  return (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1 text-[11px]"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTarget?.({ kind: 'wire', wireId: w.id })}
                        className="flex items-center gap-1.5 truncate text-left hover:text-blue-700"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: wColor }}
                        />
                        <span className="font-semibold text-slate-900">{w.breakerLabel}</span>
                        <span className="text-slate-600">
                          {CABLE_SPEC_INFO[w.cableSpec].shortLabel}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onToggleJunctionWireConnection?.(selectedJunction.id, w.id)
                        }
                        className="px-2 py-0.5 rounded bg-white border border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-medium shrink-0 transition-colors"
                      >
                        Disconnect
                      </button>
                    </div>
                  );
                })}

                {wallWires.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-500">Tap wire passing this wall:</div>
                    <div className="flex flex-wrap gap-1">
                      {wallWires.map((w) => {
                        const wColor = getWireDisplayColor(w.circuit, w.breakerLabel);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() =>
                              onToggleJunctionWireConnection?.(selectedJunction.id, w.id)
                            }
                            className="px-2 py-1 rounded border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-[11px] font-medium text-slate-800 flex items-center gap-1 transition-colors"
                          >
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: wColor }}
                            />
                            <span>
                              + {w.breakerLabel} ({CABLE_SPEC_INFO[w.cableSpec].shortLabel})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {otherWires.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-500">Connect to circuit wire:</div>
                    <div className="flex flex-wrap gap-1">
                      {otherWires.slice(0, 6).map((w) => {
                        const wColor = getWireDisplayColor(w.circuit, w.breakerLabel);
                        return (
                          <button
                            key={w.id}
                            type="button"
                            onClick={() =>
                              onToggleJunctionWireConnection?.(selectedJunction.id, w.id)
                            }
                            className="px-2 py-1 rounded border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50 text-[11px] font-medium text-slate-800 flex items-center gap-1 transition-colors"
                          >
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: wColor }}
                            />
                            <span>
                              + {w.breakerLabel} ({CABLE_SPEC_INFO[w.cableSpec].shortLabel})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {wires.length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    Click &quot;Draw Wire From Here&quot; or switch to Wire tool and click this point.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {selectedJunction.wallId !== 'ceiling' && (
          <button
            type="button"
            onClick={() =>
              onUpdateJunction(selectedJunction.id, {
                faceSide: (selectedJunction.faceSide ?? jDefaultInSide) === 1 ? -1 : 1,
              })
            }
            className="w-full min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Flip Wall Side</span>
          </button>
        )}
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{jContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {jContent}
      </aside>
    );
  }

  if (selected.kind === 'pipe') {
    if (!selectedPipe) return null;
    const breakdown = computePipeLengthBreakdown(selectedPipe, fixtures, walls, wallHeight);
    const pipeColor = getPlumbingDisplayColor(selectedPipe.pipeType, selectedPipe.pipeSpec);
    const pipeContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: pipeColor }}
            >
              <Droplets className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">
                {selectedPipe.lineLabel} · {PLUMBING_SPEC_INFO[selectedPipe.pipeSpec].shortLabel}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                Total {breakdown.totalMeters.toFixed(2)} m · @ {breakdown.elevationY.toFixed(2)}m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete plumbing pipe"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">Line ID</span>
          <input
            type="text"
            maxLength={18}
            value={selectedPipe.lineLabel}
            onChange={(e) => onUpdatePipe(selectedPipe.id, { lineLabel: e.target.value })}
            className="w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-900"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600">Pipe Spec</span>
          <select
            value={selectedPipe.pipeSpec}
            onChange={(e) =>
              onUpdatePipe(selectedPipe.id, { pipeSpec: e.target.value as PlumbingPipeSpec })
            }
            className="w-36 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-900"
          >
            {PLUMBING_SPEC_OPTIONS.map((spec) => (
              <option key={spec} value={spec}>
                {PLUMBING_SPEC_INFO[spec].label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {PLUMBING_TYPE_OPTIONS.map((opt) => {
            const info = PLUMBING_TYPE_INFO[opt.type];
            const active = selectedPipe.pipeType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() =>
                  onUpdatePipe(selectedPipe.id, {
                    pipeType: opt.type,
                    height: info.defaultHeight,
                    dropFromTop: info.defaultDropFromTop,
                  })
                }
                className={`min-h-[30px] rounded-md text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
                  active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-xs shrink-0"
                  style={{ backgroundColor: info.color }}
                />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onUpdatePipe(selectedPipe.id, { mountRef: 'from-floor' })}
              className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                selectedPipe.mountRef === 'from-floor'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              From Floor
            </button>
            <button
              type="button"
              onClick={() => onUpdatePipe(selectedPipe.id, { mountRef: 'from-top' })}
              className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                selectedPipe.mountRef === 'from-top'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              From Wall Top
            </button>
          </div>

          {selectedPipe.mountRef === 'from-floor' ? (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Height from Floor (m)</span>
                <NumericInput
                  min={0.08}
                  max={2.6}
                  step={0.05}
                  value={selectedPipe.height}
                  onChange={(val) => onUpdatePipe(selectedPipe.id, { height: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.08}
                max={2.6}
                step={0.05}
                value={selectedPipe.height}
                onChange={(e) => onUpdatePipe(selectedPipe.id, { height: Number(e.target.value) })}
                className="cad-slider w-full"
              />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Drop from Top (m)</span>
                <NumericInput
                  min={0.15}
                  max={2.5}
                  step={0.05}
                  value={selectedPipe.dropFromTop}
                  onChange={(val) => onUpdatePipe(selectedPipe.id, { dropFromTop: val })}
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.15}
                max={2.5}
                step={0.05}
                value={selectedPipe.dropFromTop}
                onChange={(e) =>
                  onUpdatePipe(selectedPipe.id, { dropFromTop: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
            </>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] font-mono-tabular">
          <div className="flex justify-between text-slate-600">
            <span>Horizontal Run:</span>
            <span>{breakdown.horizontalMeters.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Vertical Risers ({breakdown.dropCount}):</span>
            <span>{breakdown.verticalDropsMeters.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900">
            <span>Pipe Needed ({PLUMBING_SPEC_INFO[selectedPipe.pipeSpec].shortLabel}):</span>
            <span className="text-blue-700">{breakdown.totalMeters.toFixed(2)} m</span>
          </div>
        </div>
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{pipeContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {pipeContent}
      </aside>
    );
  }

  if (selected.kind === 'fixture') {
    if (!selectedFixture) return null;
    const fInfo = PLUMBING_FIXTURE_INFO[selectedFixture.kind];
    const effElev = resolveMountElevation(
      selectedFixture.mountRef,
      selectedFixture.dropFromTop,
      selectedFixture.height,
      wallHeight,
    );
    const fHostWall = walls.find((w) => w.id === selectedFixture.wallId) ?? null;
    const fDefaultInSide: 1 | -1 =
      fHostWall && getWallOutwardSide(fHostWall, walls) === 1 ? -1 : 1;
    const fContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: fInfo.color }}
            >
              <Wrench className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">{fInfo.label}</h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                Elev {effElev.toFixed(2)} m · Wall pos {selectedFixture.offset.toFixed(2)} m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete plumbing fixture"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        <div className="grid grid-cols-5 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {FIXTURE_KIND_OPTIONS.map((opt) => {
            const info = PLUMBING_FIXTURE_INFO[opt.kind];
            const active = selectedFixture.kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() =>
                  onUpdateFixture(selectedFixture.id, {
                    kind: opt.kind,
                    mountRef: info.mountRef,
                    dropFromTop: info.defaultDropFromTop,
                    height: info.defaultHeight,
                  })
                }
                className={`min-h-[30px] rounded-md text-[10px] font-medium transition-colors ${
                  active ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-slate-600">Height from Floor (m)</span>
            <NumericInput
              min={0.08}
              max={2.4}
              step={0.05}
              value={selectedFixture.height}
              onChange={(val) =>
                onUpdateFixture(selectedFixture.id, {
                  mountRef: 'from-floor',
                  height: val,
                })
              }
              className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
            />
          </div>
          <input
            type="range"
            min={0.08}
            max={2.4}
            step={0.05}
            value={selectedFixture.height}
            onChange={(e) =>
              onUpdateFixture(selectedFixture.id, {
                mountRef: 'from-floor',
                height: Number(e.target.value),
              })
            }
            className="cad-slider w-full"
          />
        </div>

        <button
          type="button"
          onClick={() =>
            onUpdateFixture(selectedFixture.id, {
              faceSide: (selectedFixture.faceSide ?? fDefaultInSide) === 1 ? -1 : 1,
            })
          }
          className="w-full min-h-[36px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition-colors"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          <span>Flip Wall Side</span>
        </button>
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{fContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {fContent}
      </aside>
    );
  }

  if (selected.kind === 'security') {
    if (!selectedSecurity) return null;
    const sInfo = SECURITY_DEVICE_INFO[selectedSecurity.kind];
    const coverage = computeSecurityCoverage(selectedSecurity, walls, wallHeight);
    const hostWall = selectedSecurity.wallId
      ? walls.find((w) => w.id === selectedSecurity.wallId) ?? null
      : null;

    const flipSecurityWallSide = () => {
      if (!hostWall) return;
      const wLen = wallLength(hostWall);
      if (wLen < 0.1) return;
      const ang = wallAngleRad(hostWall);
      const ux = Math.cos(ang);
      const uz = Math.sin(ang);
      const nx = -uz;
      const nz = ux;
      const defaultInSide: 1 | -1 = getWallOutwardSide(hostWall, walls) === 1 ? -1 : 1;
      const currentSide: 1 | -1 = selectedSecurity.faceSide ?? defaultInSide;
      const nextSide: 1 | -1 = currentSide === 1 ? -1 : 1;
      const off = Math.max(0.1, Math.min(wLen - 0.1, selectedSecurity.offset ?? wLen * 0.5));
      const faceOff = nextSide * (hostWall.thickness * 0.5 + 0.05);
      const nextX = Number((hostWall.start.x + ux * off + nx * faceOff).toFixed(3));
      const nextZ = Number((hostWall.start.z + uz * off + nz * faceOff).toFixed(3));
      const nextYaw =
        ((Math.round((Math.atan2(nz * nextSide, nx * nextSide) * 180) / Math.PI) % 360) + 360) %
        360;
      onUpdateSecurityDevice(selectedSecurity.id, {
        faceSide: nextSide,
        x: nextX,
        z: nextZ,
        yawDeg: nextYaw,
      });
    };

    const secContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: sInfo.color }}
            >
              <Cctv className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">{sInfo.label}</h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                {hostWall ? 'Wall-mounted' : 'Ceiling / Free'} · H {selectedSecurity.mountHeight.toFixed(2)}m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete security device"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Enter / Exit 3D Camera Feed for optical cameras */}
        {isCameraSecurityDevice(selectedSecurity.kind) && onEnterCameraView && (
          <button
            type="button"
            onClick={() => {
              if (activeCameraViewId === selectedSecurity.id) {
                onExitCameraView?.();
              } else {
                onEnterCameraView(selectedSecurity.id);
              }
            }}
            className={`w-full min-h-[38px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
              activeCameraViewId === selectedSecurity.id
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>
              {activeCameraViewId === selectedSecurity.id
                ? 'Exit Camera 3D View'
                : 'Enter Camera 3D View'}
            </span>
          </button>
        )}

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        {/* Device Type Switcher */}
        <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {SECURITY_KIND_OPTIONS.map((opt) => {
            const info = SECURITY_DEVICE_INFO[opt.kind];
            const active = selectedSecurity.kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() =>
                  onUpdateSecurityDevice(selectedSecurity.id, {
                    kind: opt.kind,
                    fovDeg: info.defaultFovDeg,
                    rangeMeters: info.defaultRangeMeters,
                    mountHeight: info.defaultMountHeight,
                    tiltDeg: info.defaultTiltDeg,
                  })
                }
                className={`min-h-[26px] rounded-md text-[10px] font-medium transition-colors ${
                  active ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Wall-Occluded Coverage Summary */}
        {selectedSecurity.fovDeg > 0 ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-2.5 space-y-1 text-[11px]">
            <div className="flex items-center justify-between font-semibold text-teal-900">
              <span>
                {sInfo.category === 'camera' ? 'Camera Field of View' : 'Detection Zone'}
              </span>
              <span className="font-mono-tabular">
                {coverage.areaSqM.toFixed(1)} m² ({coverage.coveragePct}%)
              </span>
            </div>
            <div className="flex items-center justify-between text-teal-800/80 font-mono-tabular">
              <span>Unobstructed Footprint</span>
              <span>{coverage.unobstructedAreaSqM.toFixed(1)} m²</span>
            </div>
            <p className="text-[10px] text-teal-800/75 pt-0.5">
              {sInfo.seesThroughGlass
                ? 'Walls & closed doors block view · Sees through windows'
                : 'Blocked by walls, windows & closed doors'}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
            {selectedSecurity.kind === 'door-contact'
              ? 'Triggers alert when a nearby door/window opens during Test Motion.'
              : selectedSecurity.kind === 'siren'
                ? 'Audible & strobe deterrent unit triggered by intrusion sensors.'
                : 'Access arming keypad mounted at entry point.'}
          </div>
        )}

        {/* Aim Direction & FOV (for directional cameras & motion sensors) */}
        {selectedSecurity.fovDeg > 0 && (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Aim Angle (°)</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSecurityDevice(selectedSecurity.id, {
                        yawDeg: (selectedSecurity.yawDeg - 45 + 360) % 360,
                      })
                    }
                    className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-700"
                  >
                    -45°
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSecurityDevice(selectedSecurity.id, {
                        yawDeg: (selectedSecurity.yawDeg + 45) % 360,
                      })
                    }
                    className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-700"
                  >
                    +45°
                  </button>
                  <NumericInput
                    min={0}
                    max={360}
                    step={5}
                    decimals={0}
                    value={Math.round(selectedSecurity.yawDeg)}
                    onChange={(val) =>
                      onUpdateSecurityDevice(selectedSecurity.id, {
                        yawDeg: ((val % 360) + 360) % 360,
                      })
                    }
                    className="w-14 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                  />
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={selectedSecurity.yawDeg}
                onChange={(e) =>
                  onUpdateSecurityDevice(selectedSecurity.id, { yawDeg: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
            </div>

            {/* FOV Angle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">FOV Angle (°)</span>
                <NumericInput
                  min={15}
                  max={360}
                  step={5}
                  decimals={0}
                  value={Math.round(selectedSecurity.fovDeg)}
                  onChange={(val) =>
                    onUpdateSecurityDevice(selectedSecurity.id, { fovDeg: val })
                  }
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={15}
                max={360}
                step={5}
                value={selectedSecurity.fovDeg}
                onChange={(e) =>
                  onUpdateSecurityDevice(selectedSecurity.id, { fovDeg: Number(e.target.value) })
                }
                className="cad-slider w-full"
              />
              <div className="grid grid-cols-5 gap-1">
                {[60, 90, 110, 180, 360].map((presetFov) => (
                  <button
                    key={presetFov}
                    type="button"
                    onClick={() =>
                      onUpdateSecurityDevice(selectedSecurity.id, { fovDeg: presetFov })
                    }
                    className={`py-0.5 rounded text-[10px] font-mono-tabular font-medium border transition-colors ${
                      Math.round(selectedSecurity.fovDeg) === presetFov
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {presetFov}°
                  </button>
                ))}
              </div>
            </div>

            {/* Detection Range */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="text-slate-600">Range (m)</span>
                <NumericInput
                  min={0.5}
                  max={25}
                  step={0.5}
                  decimals={1}
                  value={selectedSecurity.rangeMeters}
                  onChange={(val) =>
                    onUpdateSecurityDevice(selectedSecurity.id, { rangeMeters: val })
                  }
                  className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
              </div>
              <input
                type="range"
                min={0.5}
                max={25}
                step={0.5}
                value={selectedSecurity.rangeMeters}
                onChange={(e) =>
                  onUpdateSecurityDevice(selectedSecurity.id, {
                    rangeMeters: Number(e.target.value),
                  })
                }
                className="cad-slider w-full"
              />
            </div>
          </>
        )}

        {/* Mount Height & 3D Downward Tilt */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
          <label className="space-y-1 text-[11px] text-slate-600">
            <span>Mount Height (m)</span>
            <NumericInput
              min={0.3}
              max={4.0}
              step={0.05}
              value={selectedSecurity.mountHeight}
              onChange={(val) =>
                onUpdateSecurityDevice(selectedSecurity.id, { mountHeight: val })
              }
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono-tabular font-medium text-slate-900"
            />
          </label>
          <label className="space-y-1 text-[11px] text-slate-600">
            <span>3D Tilt (°)</span>
            <NumericInput
              min={0}
              max={75}
              step={5}
              decimals={0}
              value={Math.round(selectedSecurity.tiltDeg)}
              onChange={(val) =>
                onUpdateSecurityDevice(selectedSecurity.id, { tiltDeg: val })
              }
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right font-mono-tabular font-medium text-slate-900"
            />
          </label>
        </div>

        {/* Wall Attachment Controls */}
        {hostWall && (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={flipSecurityWallSide}
              className="flex-1 min-h-[34px] rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-medium text-slate-700 flex items-center justify-center gap-1 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Flip Side</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSecurityDevice(selectedSecurity.id, {
                  wallId: undefined,
                  offset: undefined,
                  faceSide: undefined,
                })
              }
              className="min-h-[34px] px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-600"
            >
              Detach
            </button>
          </div>
        )}
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{secContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {secContent}
      </aside>
    );
  }

  if (selected.kind === 'furniture') {
    if (!selectedFurniture) return null;
    const fInfo = FURNITURE_KIND_INFO[selectedFurniture.kind];
    const furnColor = selectedFurniture.color || fInfo.color;

    const furnContent = (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-md flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: furnColor }}
            >
              <Armchair className="w-3.5 h-3.5" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-slate-900">{selectedFurniture.label || fInfo.label}</h3>
              <p className="text-[11px] text-slate-500 font-mono-tabular">
                {selectedFurniture.width.toFixed(2)} × {selectedFurniture.depth.toFixed(2)} m · H{' '}
                {selectedFurniture.height.toFixed(2)} m
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={editLocked}
              aria-label="Delete furniture item"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            {!embedded && (
              <button
                type="button"
                onClick={onCloseSelection}
                aria-label="Deselect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">

        {/* Furniture Kind Switcher */}
        <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
          {FURNITURE_KIND_OPTIONS.map((opt) => {
            const info = FURNITURE_KIND_INFO[opt.kind];
            const active = selectedFurniture.kind === opt.kind;
            return (
              <button
                key={opt.kind}
                type="button"
                onClick={() =>
                  onUpdateFurniture?.(selectedFurniture.id, {
                    kind: opt.kind,
                    label: info.shortLabel,
                    width: info.defaultWidth,
                    depth: info.defaultDepth,
                    height: info.defaultHeight,
                    color: info.color,
                  })
                }
                className={`min-h-[28px] rounded-md text-[10px] font-medium transition-colors ${
                  active ? 'bg-white text-amber-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Custom Furniture Name */}
        <label className="block space-y-1 text-xs">
          <span className="text-slate-600">Furniture Name</span>
          <input
            type="text"
            maxLength={32}
            placeholder={fInfo.label}
            value={selectedFurniture.label}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              onUpdateFurniture?.(selectedFurniture.id, { label: e.target.value })
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-900"
          />
        </label>

        {/* Rotation Controls */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-slate-600">Rotation (°)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onUpdateFurniture?.(selectedFurniture.id, {
                    rotationDeg: (selectedFurniture.rotationDeg - 90 + 360) % 360,
                  })
                }
                title="Rotate 90° counter-clockwise"
                className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-700 flex items-center gap-0.5"
              >
                <RotateCcw className="w-3 h-3" />
                <span>-90°</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onUpdateFurniture?.(selectedFurniture.id, {
                    rotationDeg: (selectedFurniture.rotationDeg + 90) % 360,
                  })
                }
                title="Rotate 90° clockwise"
                className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[10px] font-medium text-slate-700 flex items-center gap-0.5"
              >
                <RotateCw className="w-3 h-3" />
                <span>+90°</span>
              </button>
              <NumericInput
                min={0}
                max={360}
                step={15}
                decimals={0}
                value={Math.round(selectedFurniture.rotationDeg)}
                onChange={(val) =>
                  onUpdateFurniture?.(selectedFurniture.id, {
                    rotationDeg: ((val % 360) + 360) % 360,
                  })
                }
                className="w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-right text-xs font-mono-tabular font-semibold text-slate-900"
              />
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            step={15}
            value={selectedFurniture.rotationDeg}
            onChange={(e) =>
              onUpdateFurniture?.(selectedFurniture.id, {
                rotationDeg: Number(e.target.value),
              })
            }
            className="cad-slider w-full"
          />
        </div>

        {/* Dimensions (Width, Depth, Height — Sliders + Direct Exact Typing; Unlimited custom sizing for Work Table) */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          {(() => {
            const isWorkbench = selectedFurniture.kind === 'workbench';
            const minWD = isWorkbench ? 0.25 : 0.35;
            const maxWDInput = isWorkbench ? undefined : 4.5;
            const maxHInput = isWorkbench ? undefined : 2.6;
            const sliderMaxW = isWorkbench ? Math.max(5.0, Math.ceil(selectedFurniture.width)) : 4.5;
            const sliderMaxD = isWorkbench ? Math.max(5.0, Math.ceil(selectedFurniture.depth)) : 4.5;
            const sliderMaxH = isWorkbench ? Math.max(3.0, Math.ceil(selectedFurniture.height)) : 2.6;

            return (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-600">Width (m)</span>
                    <NumericInput
                      min={minWD}
                      max={maxWDInput}
                      step={0.05}
                      value={selectedFurniture.width}
                      onChange={(val) =>
                        onUpdateFurniture?.(selectedFurniture.id, { width: val })
                      }
                      className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                    />
                  </div>
                  <input
                    type="range"
                    min={minWD}
                    max={sliderMaxW}
                    step={0.05}
                    value={Math.min(sliderMaxW, selectedFurniture.width)}
                    onChange={(e) =>
                      onUpdateFurniture?.(selectedFurniture.id, { width: Number(e.target.value) })
                    }
                    className="cad-slider w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-600">Depth (m)</span>
                    <NumericInput
                      min={minWD}
                      max={maxWDInput}
                      step={0.05}
                      value={selectedFurniture.depth}
                      onChange={(val) =>
                        onUpdateFurniture?.(selectedFurniture.id, { depth: val })
                      }
                      className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                    />
                  </div>
                  <input
                    type="range"
                    min={minWD}
                    max={sliderMaxD}
                    step={0.05}
                    value={Math.min(sliderMaxD, selectedFurniture.depth)}
                    onChange={(e) =>
                      onUpdateFurniture?.(selectedFurniture.id, { depth: Number(e.target.value) })
                    }
                    className="cad-slider w-full"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="text-slate-600">Height (m)</span>
                    <NumericInput
                      min={0.25}
                      max={maxHInput}
                      step={0.05}
                      value={selectedFurniture.height}
                      onChange={(val) =>
                        onUpdateFurniture?.(selectedFurniture.id, { height: val })
                      }
                      className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                    />
                  </div>
                  <input
                    type="range"
                    min={0.25}
                    max={sliderMaxH}
                    step={0.05}
                    value={Math.min(sliderMaxH, selectedFurniture.height)}
                    onChange={(e) =>
                      onUpdateFurniture?.(selectedFurniture.id, { height: Number(e.target.value) })
                    }
                    className="cad-slider w-full"
                  />
                </div>
              </>
            );
          })()}
        </div>
        </fieldset>
      </div>
    );

    if (embedded) {
      return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{furnContent}</div>;
    }

    return (
      <aside
        aria-label="Selection Inspector"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        className={asideClass}
      >
        {furnContent}
      </aside>
    );
  }

  if (!wall) return null;

  const opening =
    selected.kind === 'opening'
      ? wall.openings.find((o) => o.id === selected.openingId) ?? null
      : null;

  const maxOpeningWidth = Math.max(0.7, Math.min(6.0, len - 0.35));
  const activeWallColor = wall.color || defaultWallColor;

  const commitWallLength = () => {
    const parsed = parseFloat(lengthInput.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0.4 + extraOuter) {
      const clampedOuter = Math.min(40 + extraOuter, Math.max(0.4 + extraOuter, parsed));
      const nextCenterLen = Math.max(0.4, clampedOuter - extraOuter);
      onResizeWall(wall.id, nextCenterLen);
      setLengthInput(clampedOuter.toFixed(2));
    } else {
      setLengthInput(outerLen.toFixed(2));
    }
  };

  const content = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-slate-900">
            {opening ? openingTitle(opening.type) : 'Selected Wall'}
          </h3>
          <p className="text-[11px] text-slate-500 font-mono-tabular">
            {opening
              ? `On ${outerLen.toFixed(2)} m wall`
              : isInnerWall
                ? `Inner Wall · Center ${len.toFixed(2)} m`
                : extraOuter > 0.005
                  ? `Outer ${outerLen.toFixed(2)} m · Center ${len.toFixed(2)} m`
                  : `Length ${len.toFixed(2)} m`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={editLocked}
            aria-label="Delete selected element"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {!embedded && (
            <button
              type="button"
              onClick={onCloseSelection}
              aria-label="Deselect"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!opening ? (
        <fieldset disabled={editLocked} className="space-y-3 disabled:opacity-65">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-600">Wall Length (m)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0.4}
                  max={40}
                  step={0.05}
                  value={lengthInput}
                  onChange={(e) => setLengthInput(e.target.value)}
                  onBlur={commitWallLength}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitWallLength();
                    }
                  }}
                  className="w-20 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                />
                <button
                  type="button"
                  onClick={commitWallLength}
                  className="rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                >
                  Apply
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Drag corners to extend joined walls. Hold Shift + drag a corner to disconnect only this wall.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-600">Wall Thickness (m)</span>
              <NumericInput
                min={0.1}
                max={0.5}
                step={0.02}
                value={wall.thickness}
                onChange={(val) => onUpdateWallThickness(wall.id, val)}
                className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
              />
            </div>
            <input
              type="range"
              min={0.1}
              max={0.5}
              step={0.02}
              value={wall.thickness}
              onChange={(e) => onUpdateWallThickness(wall.id, Number(e.target.value))}
              className="cad-slider w-full"
            />
          </div>

          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">Wall Color</span>
              {wall.color && (
                <button
                  type="button"
                  onClick={() => onUpdateWallColor(wall.id, undefined)}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                >
                  Use Default
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {WALL_COLOR_PALETTE.map((swatch) => {
                const isSelectedSwatch = activeWallColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.name}
                    aria-label={swatch.name}
                    onClick={() => onUpdateWallColor(wall.id, swatch.hex)}
                    className={`w-6 h-6 rounded-md border transition-transform ${
                      isSelectedSwatch
                        ? 'border-blue-600 ring-2 ring-blue-300 scale-105'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
              <label
                title="Custom color"
                className="relative w-6 h-6 rounded-md border border-slate-300 overflow-hidden cursor-pointer flex items-center justify-center bg-white"
              >
                <input
                  type="color"
                  aria-label="Custom wall color"
                  value={activeWallColor}
                  onChange={(e) => onUpdateWallColor(wall.id, e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <span
                  className="w-4 h-4 rounded-sm border border-slate-200"
                  style={{ backgroundColor: activeWallColor }}
                />
              </label>
            </div>
          </div>
        </fieldset>
      ) : (
        <div className="space-y-2.5">
          <fieldset disabled={editLocked} className="space-y-2.5 disabled:opacity-65">
          <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
            {OPENING_TYPE_LABELS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => {
                  const nextIsDoor = isDoorOpening(item.type);
                  onUpdateOpening(wall.id, opening.id, {
                    type: item.type,
                    sillHeight: nextIsDoor ? 0 : opening.sillHeight > 0 ? opening.sillHeight : 0.9,
                    width:
                      item.type === 'double-door' && opening.width < 1.3
                        ? Math.min(1.6, maxOpeningWidth)
                        : item.type === 'sliding-door' && opening.width < 1.5
                          ? Math.min(2.0, maxOpeningWidth)
                          : item.type === 'garage-door' && opening.width < 2.2
                            ? Math.min(2.6, maxOpeningWidth)
                            : opening.width,
                  });
                }}
                className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  opening.type === item.type
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-600">Width (m)</span>
              <NumericInput
                min={0.55}
                max={maxOpeningWidth}
                step={0.05}
                value={opening.width}
                onChange={(val) => onUpdateOpening(wall.id, opening.id, { width: val })}
                className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
              />
            </div>
            <input
              type="range"
              min={0.55}
              max={maxOpeningWidth}
              step={0.05}
              value={Math.min(opening.width, maxOpeningWidth)}
              onChange={(e) =>
                onUpdateOpening(wall.id, opening.id, { width: Number(e.target.value) })
              }
              className="cad-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-600">Height (m)</span>
              <NumericInput
                min={0.35}
                max={4.0}
                step={0.05}
                value={opening.height}
                onChange={(val) => onUpdateOpening(wall.id, opening.id, { height: val })}
                className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
              />
            </div>
            <input
              type="range"
              min={0.35}
              max={4.0}
              step={0.05}
              value={Math.min(4.0, opening.height)}
              onChange={(e) =>
                onUpdateOpening(wall.id, opening.id, { height: Number(e.target.value) })
              }
              className="cad-slider w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="text-slate-600">Position (m)</span>
              <span className="font-mono-tabular font-medium text-slate-900">
                {opening.offset.toFixed(2)} m
              </span>
            </div>
            <input
              type="range"
              min={0.45}
              max={Math.max(0.55, len - 0.45)}
              step={0.05}
              value={opening.offset}
              onChange={(e) =>
                onUpdateOpening(wall.id, opening.id, { offset: Number(e.target.value) })
              }
              className="cad-slider w-full"
            />
          </div>

          {opening.type === 'window' ? (
            (() => {
              const maxSill = Math.max(3.6, Number((wallHeight - 0.25).toFixed(2)));
              const winSwing = opening.swingSide ?? 1;
              const winHinge = opening.hingeSide ?? 'both';
              return (
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs gap-2">
                      <span className="text-slate-600">Sill Height (m)</span>
                      <NumericInput
                        min={0.1}
                        max={maxSill}
                        step={0.05}
                        value={opening.sillHeight}
                        onChange={(val) =>
                          onUpdateOpening(wall.id, opening.id, { sillHeight: val })
                        }
                        className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs font-mono-tabular font-medium text-slate-900"
                      />
                    </div>
                    <input
                      type="range"
                      min={0.1}
                      max={maxSill}
                      step={0.05}
                      value={Math.min(maxSill, opening.sillHeight)}
                      onChange={(e) =>
                        onUpdateOpening(wall.id, opening.id, { sillHeight: Number(e.target.value) })
                      }
                      className="cad-slider w-full"
                    />
                  </div>

                  {/* Window Open Side (Inward / Outward) */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-600 block">Window Open Direction</span>
                    <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => onUpdateOpening(wall.id, opening.id, { swingSide: 1 })}
                        className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                          winSwing === 1
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Side A (In)
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateOpening(wall.id, opening.id, { swingSide: -1 })}
                        className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                          winSwing === -1
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Side B (Out)
                      </button>
                    </div>
                  </div>

                  {/* Window Hinge / Casement Side (Both / Left / Right) */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-slate-600 block">Casement Hinge Side</span>
                    <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
                      {(
                        [
                          { id: 'both', label: 'Double' },
                          { id: 'left', label: 'Left' },
                          { id: 'right', label: 'Right' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateOpening(wall.id, opening.id, { hingeSide: opt.id })
                          }
                          className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                            winHinge === opt.id
                              ? 'bg-white text-blue-600 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                <span className="text-[11px] text-slate-600 block">
                  {opening.type === 'sliding-door'
                    ? 'Track Side (In / Out)'
                    : opening.type === 'garage-door'
                      ? 'Ceiling Track Side (In / Out)'
                      : 'Swing Direction (In / Out)'}
                </span>
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onUpdateOpening(wall.id, opening.id, { swingSide: 1 })}
                    className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                      (opening.swingSide ?? 1) === 1
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Side A (In)
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateOpening(wall.id, opening.id, { swingSide: -1 })}
                    className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                      (opening.swingSide ?? 1) === -1
                        ? 'bg-white text-blue-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Side B (Out)
                  </button>
                </div>
              </div>

              {(opening.type === 'door' || opening.type === 'sliding-door') && (
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-600 block">
                    {opening.type === 'sliding-door' ? 'Slide Direction (Left / Right)' : 'Hinge Side (Left / Right)'}
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => onUpdateOpening(wall.id, opening.id, { hingeSide: 'left' })}
                      className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                        (opening.hingeSide ?? 'left') !== 'right'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opening.type === 'sliding-door' ? 'Slide Left' : 'Left Hinge'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateOpening(wall.id, opening.id, { hingeSide: 'right' })}
                      className={`min-h-[30px] rounded-md text-[11px] font-medium transition-colors ${
                        opening.hingeSide === 'right'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opening.type === 'sliding-door' ? 'Slide Right' : 'Right Hinge'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </fieldset>

          <button
            type="button"
            onClick={() =>
              onUpdateOpening(wall.id, opening.id, {
                isOpen: !opening.isOpen,
              })
            }
            className={`w-full min-h-[38px] rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              opening.isOpen
                ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <DoorOpen className="w-3.5 h-3.5" />
            <span>
              {opening.type === 'window'
                ? opening.isOpen
                  ? 'Window Open (Close in 3D)'
                  : 'Window Closed (Open in 3D)'
                : opening.type === 'garage-door'
                  ? opening.isOpen
                    ? 'Garage Door Open (Close in 3D)'
                    : 'Garage Door Closed (Open in 3D)'
                  : opening.isOpen
                    ? 'Door Open (Close in 3D)'
                    : 'Door Closed (Open in 3D)'}
            </span>
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">{content}</div>;
  }

  return (
    <aside
      aria-label="Selection Inspector"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={asideClass}
    >
      {content}
    </aside>
  );
};
