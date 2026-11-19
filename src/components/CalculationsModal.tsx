import React, { useEffect, useState } from 'react';
import { Armchair, Building2, Calculator, Cctv, Droplets, Layers, Pencil, X, Zap } from 'lucide-react';
import {
  computePipeLengthBreakdown,
  computeSecurityCoverage,
  computeStructureSummary,
  computeWallOuterExtent,
  computeWireLengthBreakdown,
  getPlumbingDisplayColor,
  getWireDisplayColor,
  wallLength,
} from '../geometry/wallDecomposition';
import {
  CABLE_SPEC_INFO,
  CABLE_SPEC_OPTIONS,
  CAMERA_DEVICE_KINDS,
  DEFAULT_OPENING_DIMENSIONS,
  FURNITURE_KIND_INFO,
  isCameraSecurityDevice,
  isDoorOpening,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_SPEC_INFO,
  PLUMBING_SPEC_OPTIONS,
  SECURITY_DEVICE_INFO,
  SENSOR_DEVICE_KINDS,
  WIRE_CIRCUIT_INFO,
  type CableSpec,
  type ClosedRoomInfo,
  type ElectricalJunction,
  type ElectricalWire,
  type FurnitureItem,
  type FurnitureKind,
  type OpeningType,
  type PlumbingFixture,
  type PlumbingPipe,
  type PlumbingPipeSpec,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type WallOpening,
  type WallSegment,
} from '../types/plan';
import { NumericInput } from './NumericInput';

interface CalculationsModalProps {
  open: boolean;
  walls: WallSegment[];
  rooms: ClosedRoomInfo[];
  wallHeight: number;
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture?: FurnitureItem[];
  editLocked?: boolean;
  onRenameRoom?: (roomId: string, name: string) => void;
  onUpdateFurniture?: (furnitureId: string, patch: Partial<FurnitureItem>) => void;
  onBatchUpdateOpenings: (
    category: 'windows' | 'doors',
    patch: Partial<WallOpening>,
    filterType?: OpeningType,
    targetIds?: string[],
  ) => void;
  onSelectAndClose: (target: SelectionTarget) => void;
  onViewCamera?: (cameraId: string) => void;
  onClose: () => void;
}

type CalcTab = 'all' | 'structure' | 'wiring' | 'plumbing' | 'security' | 'furniture';

function openingTypeLabel(type: OpeningType): string {
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

export const CalculationsModal: React.FC<CalculationsModalProps> = ({
  open,
  walls,
  rooms,
  wallHeight,
  wires,
  junctions,
  pipes,
  fixtures,
  securityDevices,
  furniture = [],
  editLocked = false,
  onRenameRoom,
  onUpdateFurniture,
  onBatchUpdateOpenings,
  onSelectAndClose,
  onViewCamera,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<CalcTab>('all');

  const firstWin = walls.flatMap((w) => w.openings).find((o) => o.type === 'window');
  const firstDoor = walls.flatMap((w) => w.openings).find((o) => isDoorOpening(o.type));

  const [batchWinWidth, setBatchWinWidth] = useState<number>(
    firstWin?.width ?? DEFAULT_OPENING_DIMENSIONS.window.width,
  );
  const [batchWinHeight, setBatchWinHeight] = useState<number>(
    firstWin?.height ?? DEFAULT_OPENING_DIMENSIONS.window.height,
  );
  const [batchWinSill, setBatchWinSill] = useState<number>(
    firstWin?.sillHeight ?? DEFAULT_OPENING_DIMENSIONS.window.sillHeight,
  );

  const [batchDoorFilter, setBatchDoorFilter] = useState<'all' | OpeningType>('all');
  const [batchDoorWidth, setBatchDoorWidth] = useState<number>(
    firstDoor?.width ?? DEFAULT_OPENING_DIMENSIONS.door.width,
  );
  const [batchDoorHeight, setBatchDoorHeight] = useState<number>(
    firstDoor?.height ?? DEFAULT_OPENING_DIMENSIONS.door.height,
  );
  const [selectedWindowIds, setSelectedWindowIds] = useState<string[]>([]);
  const [batchFlash, setBatchFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const structure = computeStructureSummary(walls, wallHeight);
  const totalRoomNetAreaSqM = rooms.reduce((sum, r) => sum + r.netAreaSqM, 0);

  const allOpenings = walls.flatMap((w, wallIndex) =>
    w.openings.map((op, opIdx) => ({
      wall: w,
      wallLabel: `Wall ${wallIndex + 1}`,
      opening: op,
      opIdx,
    })),
  );
  const windowOpenings = allOpenings.filter((item) => item.opening.type === 'window');
  const doorOpenings = allOpenings.filter((item) => isDoorOpening(item.opening.type));
  const validSelectedWindowIds = selectedWindowIds.filter((id) =>
    windowOpenings.some((w) => w.opening.id === id),
  );

  const toggleWindowSelection = (opening: WallOpening) => {
    setSelectedWindowIds((prev) => {
      const exists = prev.includes(opening.id);
      if (exists) {
        return prev.filter((id) => id !== opening.id);
      }
      if (prev.length === 0) {
        setBatchWinWidth(opening.width);
        setBatchWinHeight(opening.height);
        setBatchWinSill(opening.sillHeight);
      }
      return [...prev, opening.id];
    });
  };

  // Electrical totals by CableSpec and per wire
  const cableTotals = new Map<CableSpec, number>();
  for (const spec of CABLE_SPEC_OPTIONS) cableTotals.set(spec, 0);

  let totalElectricalMeters = 0;
  const wireRows = wires.map((wire) => {
    const bd = computeWireLengthBreakdown(wire, junctions, walls, wallHeight);
    totalElectricalMeters += bd.totalMeters;
    const spec: CableSpec = wire.cableSpec || WIRE_CIRCUIT_INFO[wire.circuit].defaultCableSpec;
    cableTotals.set(spec, (cableTotals.get(spec) ?? 0) + bd.totalMeters);
    return {
      wire,
      spec,
      bd,
      color: getWireDisplayColor(wire.circuit, wire.breakerLabel),
    };
  });

  // Plumbing totals by PlumbingPipeSpec and per pipe
  const pipeSpecTotals = new Map<PlumbingPipeSpec, number>();
  for (const spec of PLUMBING_SPEC_OPTIONS) pipeSpecTotals.set(spec, 0);

  let totalPlumbingMeters = 0;
  const pipeRows = pipes.map((pipe) => {
    const bd = computePipeLengthBreakdown(pipe, fixtures, walls, wallHeight);
    totalPlumbingMeters += bd.totalMeters;
    pipeSpecTotals.set(pipe.pipeSpec, (pipeSpecTotals.get(pipe.pipeSpec) ?? 0) + bd.totalMeters);
    return {
      pipe,
      bd,
      color: getPlumbingDisplayColor(pipe.pipeType, pipe.pipeSpec),
    };
  });

  const nonZeroCableSpecs = CABLE_SPEC_OPTIONS.filter((s) => (cableTotals.get(s) ?? 0) > 0);
  const nonZeroPipeSpecs = PLUMBING_SPEC_OPTIONS.filter((s) => (pipeSpecTotals.get(s) ?? 0) > 0);

  const junctionCounts = (
    ['socket', 'switch', 'junction-box', 'panel', 'wall-light', 'ceiling-light'] as const
  )
    .map((kind) => ({
      kind,
      info: JUNCTION_KIND_INFO[kind],
      count: junctions.filter((j) => j.kind === kind).length,
    }))
    .filter((item) => item.count > 0);

  const fixtureCounts = (['sink', 'shower', 'wc', 'boiler', 'floor-drain'] as const)
    .map((kind) => ({
      kind,
      info: PLUMBING_FIXTURE_INFO[kind],
      count: fixtures.filter((f) => f.kind === kind).length,
    }))
    .filter((item) => item.count > 0);

  const securityRows = securityDevices.map((device, index) => {
    const info = SECURITY_DEVICE_INFO[device.kind];
    const cov = computeSecurityCoverage(device, walls, wallHeight);
    return {
      device,
      info,
      cov,
      displayName: device.label || `${info.shortCode}-${index + 1}`,
    };
  });

  const totalSecurityCoverageSqM = securityRows.reduce((sum, r) => sum + r.cov.areaSqM, 0);
  const cameraCount = securityDevices.filter((d) => isCameraSecurityDevice(d.kind)).length;
  const sensorCount = securityDevices.length - cameraCount;
  const allSecurityKinds: SecurityDeviceKind[] = [...CAMERA_DEVICE_KINDS, ...SENSOR_DEVICE_KINDS];
  const securityCounts = allSecurityKinds
    .map((kind) => ({
      kind,
      info: SECURITY_DEVICE_INFO[kind],
      count: securityDevices.filter((d) => d.kind === kind).length,
    }))
    .filter((item) => item.count > 0);

  const furnitureKinds = Object.keys(FURNITURE_KIND_INFO) as FurnitureKind[];
  const furnitureCounts = furnitureKinds
    .map((kind) => ({
      kind,
      info: FURNITURE_KIND_INFO[kind],
      count: furniture.filter((f) => f.kind === kind).length,
    }))
    .filter((entry) => entry.count > 0);
  const totalFurnitureFootprintSqM = furniture.reduce((sum, f) => sum + f.width * f.depth, 0);

  const tabs: { id: CalcTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all', label: 'Overview', icon: Layers },
    { id: 'structure', label: 'Structure', icon: Building2 },
    { id: 'wiring', label: 'Electrical', icon: Zap },
    { id: 'plumbing', label: 'Water & Plumbing', icon: Droplets },
    { id: 'security', label: 'Security', icon: Cctv },
    { id: 'furniture', label: 'Furniture', icon: Armchair },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-slate-900/45 p-0 md:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calc-modal-title"
        className="w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Calculator className="w-4 h-4" />
            </span>
            <div>
              <h2 id="calc-modal-title" className="text-base font-semibold text-slate-900">
                Project Summary &amp; Quantities
              </h2>
              <p className="text-xs text-slate-500">
                Structure, rooms, electrical runs, plumbing lines, security, and interior furniture
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close summary"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-slate-900 border border-slate-200 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {activeTab === 'all' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Structure Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">
                    1. Structure
                  </span>
                  <Building2 className="w-4 h-4 text-slate-700" />
                </div>
                <div className="text-2xl font-semibold text-slate-900 font-mono-tabular">
                  {structure.totalWallMeters.toFixed(2)} m
                </div>
                <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100 font-mono-tabular">
                  <div className="flex justify-between">
                    <span>Closed Room Area</span>
                    <span className="font-medium text-teal-700">
                      {rooms.length > 0
                        ? `${totalRoomNetAreaSqM.toFixed(2)} m² (${rooms.length})`
                        : 'Open'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Wall Area</span>
                    <span className="font-medium text-slate-900">
                      {structure.netWallAreaSqM.toFixed(1)} m²
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Footprint</span>
                    <span className="font-medium text-slate-900">
                      {structure.footprintSqM.toFixed(1)} m²
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Openings</span>
                    <span className="font-medium text-slate-900">
                      {structure.doorCount +
                        structure.doubleDoorCount +
                        structure.slidingDoorCount +
                        structure.garageDoorCount}{' '}
                      doors · {structure.windowCount} win
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('structure')}
                  className="w-full py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Structure Details
                </button>
              </div>

              {/* Electrical Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700">
                    2. Electrical &amp; Data
                  </span>
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-semibold text-slate-900 font-mono-tabular">
                  {totalElectricalMeters.toFixed(2)} m
                </div>
                <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100 font-mono-tabular">
                  {nonZeroCableSpecs.length === 0 ? (
                    <p className="text-slate-400 font-sans">No wire runs drawn yet</p>
                  ) : (
                    nonZeroCableSpecs.map((spec) => (
                      <div key={spec} className="flex justify-between">
                        <span>{CABLE_SPEC_INFO[spec].shortLabel}</span>
                        <span className="font-medium text-slate-900">
                          {(cableTotals.get(spec) ?? 0).toFixed(2)} m
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('wiring')}
                  className="w-full py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Electrical Schedule
                </button>
              </div>

              {/* Water & Plumbing Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-700">
                    3. Water &amp; Drain
                  </span>
                  <Droplets className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-semibold text-slate-900 font-mono-tabular">
                  {totalPlumbingMeters.toFixed(2)} m
                </div>
                <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100 font-mono-tabular">
                  {nonZeroPipeSpecs.length === 0 ? (
                    <p className="text-slate-400 font-sans">No plumbing pipes drawn yet</p>
                  ) : (
                    nonZeroPipeSpecs.map((spec) => (
                      <div key={spec} className="flex justify-between">
                        <span>{PLUMBING_SPEC_INFO[spec].shortLabel}</span>
                        <span className="font-medium text-slate-900">
                          {(pipeSpecTotals.get(spec) ?? 0).toFixed(2)} m
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('plumbing')}
                  className="w-full py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Plumbing Schedule
                </button>
              </div>

              {/* Security & Cameras Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-teal-700">
                    Security &amp; FOV Coverage
                  </span>
                  <Cctv className="w-4 h-4 text-teal-600" />
                </div>
                <div className="text-2xl font-semibold text-slate-900 font-mono-tabular">
                  {totalSecurityCoverageSqM.toFixed(1)} m²
                </div>
                <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100 font-mono-tabular">
                  {securityDevices.length === 0 ? (
                    <p className="text-slate-400 font-sans">No security devices placed yet</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Cameras</span>
                        <span className="font-medium text-slate-900">{cameraCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sensors &amp; Access</span>
                        <span className="font-medium text-slate-900">{sensorCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sum FOV Footprint</span>
                        <span className="font-medium text-slate-900">
                          {totalSecurityCoverageSqM.toFixed(1)} m²
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('security')}
                  className="w-full py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Coverage Schedule
                </button>
              </div>

              {/* Furniture & Interior Card */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-2.5 bg-white md:col-span-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-orange-700">
                    4. Interior &amp; Furniture
                  </span>
                  <Armchair className="w-4 h-4 text-orange-600" />
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-2xl font-semibold text-slate-900 font-mono-tabular">
                    {furniture.length} {furniture.length === 1 ? 'item' : 'items'}
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-500">
                    Footprint {totalFurnitureFootprintSqM.toFixed(2)} m²
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-100 font-mono-tabular">
                  {furnitureCounts.length === 0 ? (
                    <p className="text-slate-400 font-sans">No furniture placed yet</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
                      {furnitureCounts.map(({ kind, info, count }) => (
                        <div key={kind} className="flex justify-between gap-2">
                          <span className="truncate font-sans">{info.label}</span>
                          <span className="font-medium text-slate-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('furniture')}
                  className="w-full py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  View Furniture Schedule
                </button>
              </div>
            </div>
          )}

          {activeTab === 'structure' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Wall Segments</div>
                  <div className="text-lg font-semibold text-slate-900 font-mono-tabular mt-0.5">
                    {structure.wallCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Total Wall Run</div>
                  <div className="text-lg font-semibold text-slate-900 font-mono-tabular mt-0.5">
                    {structure.totalWallMeters.toFixed(2)} m
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Net Surface (1-side)</div>
                  <div className="text-lg font-semibold text-slate-900 font-mono-tabular mt-0.5">
                    {structure.netWallAreaSqM.toFixed(2)} m²
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-[11px] text-slate-500">Plan Footprint</div>
                  <div className="text-lg font-semibold text-slate-900 font-mono-tabular mt-0.5">
                    {structure.footprintSqM.toFixed(2)} m²
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-slate-600">Extruded Wall Height</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {wallHeight.toFixed(2)} m
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-slate-600">Gross Wall Area (1-side / 2-sides)</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {structure.grossWallAreaSqM.toFixed(2)} m² / {(structure.grossWallAreaSqM * 2).toFixed(2)} m²
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-slate-600">Single / Double / Sliding / Garage</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {structure.doorCount} / {structure.doubleDoorCount} / {structure.slidingDoorCount} /{' '}
                    {structure.garageDoorCount}
                  </span>
                </div>
                <div className="px-4 py-2.5 flex justify-between">
                  <span className="text-slate-600">Windows</span>
                  <span className="font-mono-tabular font-semibold text-slate-900">
                    {structure.windowCount}
                  </span>
                </div>
              </div>

              {/* Closed Rooms Surface Area Schedule */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-teal-50/70 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Closed Rooms Surface Area (Click Name to Rename)</span>
                  <span className="font-mono-tabular text-teal-800">
                    {rooms.length > 0 ? `Total: ${totalRoomNetAreaSqM.toFixed(2)} m²` : 'No closed loops'}
                  </span>
                </div>
                {rooms.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    Walls do not yet form a closed loop. Connect corners into a closed room to compute interior surface area.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {rooms.map((room, rIdx) => (
                      <div key={room.id} className="px-4 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Pencil className="w-3 h-3 text-slate-400 shrink-0" />
                            <input
                              type="text"
                              maxLength={28}
                              value={room.name}
                              placeholder={`Room ${rIdx + 1}`}
                              aria-label={`Rename ${room.name}`}
                              onChange={(e) => onRenameRoom?.(room.id, e.target.value)}
                              className="w-44 max-w-full rounded border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white bg-transparent px-1.5 py-0.5 font-semibold text-slate-900 focus:outline-none"
                            />
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-tabular pl-4">
                            Perimeter {room.perimeterM.toFixed(2)} m · Gross {room.grossAreaSqM.toFixed(2)} m²
                          </div>
                        </div>
                        <span className="font-mono-tabular font-semibold text-teal-700 text-sm shrink-0">
                          {room.netAreaSqM.toFixed(2)} m²
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch Resize Controls for Windows & Doors */}
              {(windowOpenings.length > 0 || doorOpenings.length > 0) && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Batch Resize All Elements
                    </span>
                    {batchFlash && (
                      <span className="text-[11px] font-medium text-emerald-700">{batchFlash}</span>
                    )}
                  </div>

                  {windowOpenings.length > 0 && (
                    <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold text-slate-800">
                          Windows ·{' '}
                          {validSelectedWindowIds.length > 0
                            ? `${validSelectedWindowIds.length} of ${windowOpenings.length} selected`
                            : `All (${windowOpenings.length})`}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedWindowIds(windowOpenings.map((w) => w.opening.id))
                            }
                            className="px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            Select All
                          </button>
                          {validSelectedWindowIds.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedWindowIds([])}
                              className="px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {windowOpenings.map((item, wIdx) => {
                          const checked = validSelectedWindowIds.includes(item.opening.id);
                          return (
                            <label
                              key={item.opening.id}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleWindowSelection(item.opening)}
                                className="sr-only"
                              />
                              <span className="font-medium">W{wIdx + 1}</span>
                              <span className={checked ? 'text-blue-100' : 'text-slate-400'}>
                                {item.wallLabel} · {item.opening.width.toFixed(1)}×{item.opening.height.toFixed(1)}m
                              </span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap items-end gap-2 text-xs">
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Width (m)</span>
                          <NumericInput
                            min={0.4}
                            max={6.0}
                            step={0.05}
                            value={batchWinWidth}
                            onChange={setBatchWinWidth}
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono-tabular text-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Height (m)</span>
                          <NumericInput
                            min={0.35}
                            max={4.0}
                            step={0.05}
                            value={batchWinHeight}
                            onChange={setBatchWinHeight}
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono-tabular text-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Sill (m)</span>
                          <NumericInput
                            min={0.1}
                            max={4.0}
                            step={0.05}
                            value={batchWinSill}
                            onChange={setBatchWinSill}
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono-tabular text-slate-900"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const targetIds =
                              validSelectedWindowIds.length > 0
                                ? validSelectedWindowIds
                                : undefined;
                            onBatchUpdateOpenings(
                              'windows',
                              {
                                width: Math.max(0.4, Math.min(6.0, batchWinWidth)),
                                height: Math.max(0.35, Math.min(4.0, batchWinHeight)),
                                sillHeight: Math.max(0.1, Math.min(4.0, batchWinSill)),
                              },
                              undefined,
                              targetIds,
                            );
                            const count = targetIds ? targetIds.length : windowOpenings.length;
                            setBatchFlash(
                              targetIds
                                ? `Updated ${count} selected window${count === 1 ? '' : 's'}`
                                : `Updated all ${count} windows`,
                            );
                            window.setTimeout(() => setBatchFlash(null), 2400);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap"
                        >
                          {validSelectedWindowIds.length > 0
                            ? `Apply to Selected (${validSelectedWindowIds.length})`
                            : `Apply to All Windows (${windowOpenings.length})`}
                        </button>
                      </div>
                    </div>
                  )}

                  {doorOpenings.length > 0 && (
                    <div className="rounded-lg bg-white border border-slate-200 p-2.5 space-y-2">
                      <div className="text-[11px] font-semibold text-slate-800">
                        Doors ({doorOpenings.length})
                      </div>
                      <div className="flex flex-wrap items-end gap-2 text-xs">
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Target</span>
                          <select
                            value={batchDoorFilter}
                            onChange={(e) => setBatchDoorFilter(e.target.value as 'all' | OpeningType)}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900"
                          >
                            <option value="all">All Doors ({doorOpenings.length})</option>
                            <option value="door">Single Doors</option>
                            <option value="double-door">Double Doors</option>
                            <option value="sliding-door">Sliding Doors</option>
                            <option value="garage-door">Garage Doors</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Width (m)</span>
                          <NumericInput
                            min={0.55}
                            max={6.0}
                            step={0.05}
                            value={batchDoorWidth}
                            onChange={setBatchDoorWidth}
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono-tabular text-slate-900"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5 text-[11px] text-slate-600">
                          <span>Height (m)</span>
                          <NumericInput
                            min={0.5}
                            max={4.0}
                            step={0.05}
                            value={batchDoorHeight}
                            onChange={setBatchDoorHeight}
                            className="w-20 rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono-tabular text-slate-900"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            onBatchUpdateOpenings(
                              'doors',
                              {
                                width: Math.max(0.55, Math.min(6.0, batchDoorWidth)),
                                height: Math.max(0.5, Math.min(4.0, batchDoorHeight)),
                              },
                              batchDoorFilter === 'all' ? undefined : batchDoorFilter,
                            );
                            setBatchFlash('Updated doors');
                            window.setTimeout(() => setBatchFlash(null), 2400);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap"
                        >
                          Apply to Doors
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Doors & Windows Element Schedule */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Doors &amp; Windows ({allOpenings.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Click to inspect</span>
                </div>
                {allOpenings.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No doors or windows placed yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
                    {allOpenings.map(({ wall, wallLabel, opening }, idx) => {
                      const isWin = opening.type === 'window';
                      const isChecked = isWin && validSelectedWindowIds.includes(opening.id);
                      return (
                        <div
                          key={opening.id}
                          className="w-full px-4 py-2 flex items-center justify-between gap-2.5 hover:bg-slate-50 transition-colors"
                        >
                          {isWin && (
                            <input
                              type="checkbox"
                              checked={isChecked}
                              aria-label={`Select window ${idx + 1} for batch resize`}
                              onChange={() => toggleWindowSelection(opening)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 cursor-pointer shrink-0"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onSelectAndClose({
                                kind: 'opening',
                                wallId: wall.id,
                                openingId: opening.id,
                              })
                            }
                            className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">
                                {openingTypeLabel(opening.type)} #{idx + 1} ·{' '}
                                <span className="text-slate-500 font-normal">{wallLabel}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular">
                                Offset {opening.offset.toFixed(2)} m
                                {isWin ? ` · Sill ${opening.sillHeight.toFixed(2)} m` : ''}
                                {opening.isOpen ? ' · Open' : ' · Closed'}
                              </div>
                            </div>
                            <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                              {opening.width.toFixed(2)} × {opening.height.toFixed(2)} m
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wall Segments List */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Wall Segments ({walls.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Click to inspect</span>
                </div>
                {walls.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">No walls drawn yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto text-xs">
                    {walls.map((w, idx) => {
                      const cLen = wallLength(w);
                      const ext = computeWallOuterExtent(w, walls);
                      const openingArea = w.openings.reduce(
                        (s, o) => s + o.width * Math.min(wallHeight, o.height),
                        0,
                      );
                      const netWall = Math.max(0, cLen * wallHeight - openingArea);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => onSelectAndClose({ kind: 'wall', wallId: w.id })}
                          className="w-full px-4 py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs border border-slate-300 shrink-0"
                              style={{ backgroundColor: w.color || '#eae6df' }}
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900 truncate">
                                Wall {idx + 1}{' '}
                                <span className="text-[11px] text-slate-500 font-normal">
                                  ({w.openings.length} opening{w.openings.length === 1 ? '' : 's'})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular">
                                Thick {(w.thickness * 100).toFixed(0)} cm · Net {netWall.toFixed(1)} m²
                              </div>
                            </div>
                          </div>
                          <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                            {ext.outerLength.toFixed(2)} m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'wiring' && (
            <div className="space-y-4">
              {/* Cable Specs Totals */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>EU Metric Cable Requirements (with +10% Slack)</span>
                  <span className="font-mono-tabular text-blue-700">
                    {totalElectricalMeters.toFixed(2)} m net
                  </span>
                </div>
                {nonZeroCableSpecs.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No electrical cable runs yet. Switch to Step 2 (Wiring) and trace runs along walls.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {nonZeroCableSpecs.map((spec) => {
                      const net = cableTotals.get(spec) ?? 0;
                      const slack = net * 1.1;
                      const info = CABLE_SPEC_INFO[spec];
                      return (
                        <div key={spec} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-900">{info.label}</div>
                            <div className="text-[11px] text-slate-500">{info.rating}</div>
                          </div>
                          <div className="text-right font-mono-tabular">
                            <div className="font-semibold text-slate-900">{net.toFixed(2)} m</div>
                            <div className="text-[11px] text-slate-500">
                              Order ~{Math.ceil(slack)} m
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Wall Point Counts */}
              {junctionCounts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {junctionCounts.map(({ kind, info, count }) => (
                    <div
                      key={kind}
                      className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-700">{info.shortCode} Points</span>
                      <span className="font-mono-tabular font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per Breaker Run Table */}
              {wireRows.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                    Circuit Runs ({wireRows.length}) — Click to locate
                  </div>
                  <div className="divide-y divide-slate-100">
                    {wireRows.map(({ wire, spec, bd, color }) => (
                      <button
                        key={wire.id}
                        type="button"
                        onClick={() => onSelectAndClose({ kind: 'wire', wireId: wire.id })}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {wire.breakerLabel} · {CABLE_SPEC_INFO[spec].shortLabel}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-tabular">
                              Horiz {bd.horizontalMeters.toFixed(2)}m + Drops {bd.verticalDropsMeters.toFixed(2)}m ({bd.dropCount})
                            </div>
                          </div>
                        </div>
                        <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                          {bd.totalMeters.toFixed(2)} m
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'plumbing' && (
            <div className="space-y-4">
              {/* Pipe Specs Totals */}
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Water &amp; Drain Pipe Requirements (with +10% Allowance)</span>
                  <span className="font-mono-tabular text-blue-700">
                    {totalPlumbingMeters.toFixed(2)} m net
                  </span>
                </div>
                {nonZeroPipeSpecs.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No water or drain pipes drawn yet. Switch to Step 3 (Water) and trace lines along walls.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {nonZeroPipeSpecs.map((spec) => {
                      const net = pipeSpecTotals.get(spec) ?? 0;
                      const info = PLUMBING_SPEC_INFO[spec];
                      return (
                        <div key={spec} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="font-semibold text-slate-900">{info.label}</div>
                          <div className="text-right font-mono-tabular">
                            <div className="font-semibold text-slate-900">{net.toFixed(2)} m</div>
                            <div className="text-[11px] text-slate-500">
                              Order ~{Math.ceil(net * 1.1)} m
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fixture Counts */}
              {fixtureCounts.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {fixtureCounts.map(({ kind, info, count }) => (
                    <div
                      key={kind}
                      className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-slate-700">{info.shortCode}</span>
                      <span className="font-mono-tabular font-semibold text-slate-900">{count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Per Pipe Run Table */}
              {pipeRows.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                    Pipe Lines ({pipeRows.length}) — Click to locate
                  </div>
                  <div className="divide-y divide-slate-100">
                    {pipeRows.map(({ pipe, bd, color }) => (
                      <button
                        key={pipe.id}
                        type="button"
                        onClick={() => onSelectAndClose({ kind: 'pipe', pipeId: pipe.id })}
                        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {pipe.lineLabel} · {PLUMBING_SPEC_INFO[pipe.pipeSpec].shortLabel}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-tabular">
                              Horiz {bd.horizontalMeters.toFixed(2)}m + Risers {bd.verticalDropsMeters.toFixed(2)}m ({bd.dropCount})
                            </div>
                          </div>
                        </div>
                        <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                          {bd.totalMeters.toFixed(2)} m
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Cameras, Sensors &amp; Wall-Occluded FOV Coverage</span>
                  <span className="font-mono-tabular text-teal-700">
                    {securityDevices.length} devices · {totalSecurityCoverageSqM.toFixed(1)} m²
                  </span>
                </div>
                {securityCounts.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No security devices placed yet. Switch to Step 2 (Electrical &amp; Data), select Cam / Sensor, and click a wall or room.
                  </p>
                ) : (
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {securityCounts.map(({ kind, info, count }) => (
                      <div
                        key={kind}
                        className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between text-xs"
                      >
                        <span className="font-medium text-slate-700">{info.shortLabel}</span>
                        <span className="font-mono-tabular font-semibold text-slate-900">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {securityRows.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                    Security Zones ({securityRows.length}) — Click to locate
                  </div>
                  <div className="divide-y divide-slate-100">
                    {securityRows.map(({ device, info, cov, displayName }) => (
                      <div
                        key={device.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectAndClose({ kind: 'security', securityId: device.id })}
                          className="flex-1 flex items-center justify-between text-left min-w-0 gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: info.color }}
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                {displayName} · {info.label}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono-tabular">
                                {device.fovDeg > 0
                                  ? `FOV ${Math.round(device.fovDeg)}° · Range ${device.rangeMeters.toFixed(1)}m · Aim ${Math.round(device.yawDeg)}°`
                                  : `Wall-mounted · H ${device.mountHeight.toFixed(2)}m`}
                              </div>
                            </div>
                          </div>
                          <span className="font-mono-tabular font-semibold text-teal-700 shrink-0">
                            {device.fovDeg > 0 ? `${cov.areaSqM.toFixed(1)} m² (${cov.coveragePct}%)` : 'Perimeter'}
                          </span>
                        </button>
                        {isCameraSecurityDevice(device.kind) && onViewCamera && (
                          <button
                            type="button"
                            onClick={() => {
                              onViewCamera(device.id);
                              onClose();
                            }}
                            className="px-2 py-1 rounded-md bg-slate-900 hover:bg-blue-600 text-white text-[10px] font-semibold shrink-0 transition-colors"
                          >
                            3D Feed
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'furniture' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-800">
                  <span>Interior &amp; Furniture Summary</span>
                  <span className="font-mono-tabular text-orange-700">
                    {furniture.length} items · {totalFurnitureFootprintSqM.toFixed(2)} m² footprint
                  </span>
                </div>
                {furnitureCounts.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">
                    No furniture placed yet. Switch to Step 4 (Interior &amp; Lights), pick a furniture type, and click inside a room to place it.
                  </p>
                ) : (
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {furnitureCounts.map(({ kind, info, count }) => (
                      <div
                        key={kind}
                        className="rounded-lg border border-slate-200 px-3 py-2 flex items-center justify-between text-xs"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0"
                            style={{ backgroundColor: info.color }}
                          />
                          <span className="font-medium text-slate-700 truncate">{info.label}</span>
                        </span>
                        <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                          {count}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {furniture.length > 0 && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                    Placed Furniture ({furniture.length}) — Rename inline or select
                  </div>
                  <div className="divide-y divide-slate-100">
                    {furniture.map((item, idx) => {
                      const info = FURNITURE_KIND_INFO[item.kind];
                      return (
                        <div
                          key={item.id}
                          className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <span
                              className="w-3 h-3 rounded-xs shrink-0 border border-slate-300"
                              style={{ backgroundColor: item.color || info.color }}
                            />
                            <div className="min-w-0 flex-1">
                              <label className="flex items-center gap-1.5">
                                <Pencil className="w-3 h-3 text-slate-400 shrink-0" />
                                <input
                                  type="text"
                                  maxLength={32}
                                  disabled={editLocked || !onUpdateFurniture}
                                  value={item.label}
                                  placeholder={`${info.label} ${idx + 1}`}
                                  aria-label={`Name for ${info.label} ${idx + 1}`}
                                  onChange={(e) =>
                                    onUpdateFurniture?.(item.id, { label: e.target.value })
                                  }
                                  className="w-full max-w-[200px] rounded border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white bg-transparent px-1 py-0.5 font-semibold text-slate-900 focus:outline-none disabled:opacity-70"
                                />
                              </label>
                              <div className="text-[11px] text-slate-500 font-mono-tabular pl-4">
                                {info.label} · {item.width.toFixed(2)}×{item.depth.toFixed(2)}×
                                {item.height.toFixed(2)} m · {Math.round(item.rotationDeg)}°
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onSelectAndClose({ kind: 'furniture', furnitureId: item.id })}
                            className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-[11px] font-medium text-slate-700 shrink-0 transition-colors"
                          >
                            Select
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
