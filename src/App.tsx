import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Pencil, X } from 'lucide-react';
import { BlueprintViewport } from './components/BlueprintViewport';
import { CalculationsModal } from './components/CalculationsModal';
import { ControlDock } from './components/ControlDock';
import { ExportModal } from './components/ExportModal';
import { InspectorPanel } from './components/InspectorPanel';
import { RightViewToggles } from './components/RightViewToggles';
import { TopBar } from './components/TopBar';
import { TouchJoystick } from './components/TouchJoystick';
import { cloneWalls, getTemplateById } from './data/templates';
import {
  bindWirePointsToWalls,
  detectClosedRooms,
  distance2D,
  getJunctionConnectedWireIds,
  getJunctionWorldInfo,
  moveConnectedCorner,
  moveWallWithConnections,
  projectPointOntoWall,
  resizeWallWithConnections,
  subtractCollinearWallOverlaps,
  syncRoutesWithWallsAndTargets,
  syncSecurityDevicesWithWalls,
  syncWallPointsWithWalls,
  wallLength,
} from './geometry/wallDecomposition';
import {
  DEFAULT_OPENING_DIMENSIONS,
  isDoorOpening,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_PIPE_PRESETS,
  WIRE_BREAKER_PRESETS,
  type CableSpec,
  type CeilingMode,
  type ElectricalJunction,
  type ElectricalWire,
  type ExportConfig,
  type FloorStyle,
  type FurnitureItem,
  type FurnitureKind,
  type JunctionKind,
  type OpeningDefaultsMap,
  type OpeningDimensionPreset,
  type OpeningType,
  type PlanSnapshot,
  type PlumbingFixture,
  type PlumbingFixtureKind,
  type PlumbingPipe,
  type PlumbingPipePreset,
  type PlumbingPipeSpec,
  type PlumbingPipeType,
  type Point2D,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type SnapMode,
  type TemplateId,
  type ToolMode,
  type ViewMode,
  type WallOpening,
  type WallSegment,
  type WireBreakerPreset,
  type WireCircuitType,
  type WireMountRef,
  type WirePoint,
  type WorkspaceStep,
} from './types/plan';
import {
  loadWorkspaceFromStorage,
  parseProjectFromJson,
  saveWorkspaceToStorage,
  serializeProjectToJson,
  type SavedProjectSlot,
} from './utils/storage';

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneWires(wires: ElectricalWire[]): ElectricalWire[] {
  return wires.map((w) => ({
    ...w,
    points: w.points.map((p) => ({ ...p })),
  }));
}

function cloneJunctions(junctions: ElectricalJunction[]): ElectricalJunction[] {
  return junctions.map((j) => ({
    ...j,
    connectedWireIds: j.connectedWireIds ? [...j.connectedWireIds] : undefined,
    disconnectedWireIds: j.disconnectedWireIds ? [...j.disconnectedWireIds] : undefined,
    breakerStates: j.breakerStates ? { ...j.breakerStates } : undefined,
  }));
}

function clonePipes(pipes: PlumbingPipe[]): PlumbingPipe[] {
  return pipes.map((p) => ({
    ...p,
    points: p.points.map((pt) => ({ ...pt })),
  }));
}

function cloneFixtures(fixtures: PlumbingFixture[]): PlumbingFixture[] {
  return fixtures.map((f) => ({ ...f }));
}

function cloneSecurityDevices(devices: SecurityDevice[]): SecurityDevice[] {
  return devices.map((d) => ({ ...d }));
}

function cloneFurniture(items: FurnitureItem[]): FurnitureItem[] {
  return items.map((f) => ({ ...f }));
}

interface DragBaseState {
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture?: FurnitureItem[];
}

type ClipboardItem =
  | { kind: 'wall'; length: number; thickness: number; color?: string }
  | { kind: 'opening'; opening: Omit<WallOpening, 'id'> }
  | { kind: 'junction'; junction: Omit<ElectricalJunction, 'id'> }
  | { kind: 'fixture'; fixture: Omit<PlumbingFixture, 'id'> }
  | { kind: 'security'; device: Omit<SecurityDevice, 'id'> }
  | { kind: 'furniture'; item: Omit<FurnitureItem, 'id'> }
  | { kind: 'wire'; wire: Omit<ElectricalWire, 'id'> }
  | { kind: 'pipe'; pipe: Omit<PlumbingPipe, 'id'> };

function cloneOpeningDefaults(defaults: OpeningDefaultsMap): OpeningDefaultsMap {
  return {
    door: { ...defaults.door },
    'double-door': { ...defaults['double-door'] },
    'sliding-door': { ...defaults['sliding-door'] },
    'garage-door': { ...defaults['garage-door'] },
    window: { ...defaults.window },
  };
}

function getTemplateDefaultSignature(templateId: TemplateId): string {
  const tpl = getTemplateById(templateId);
  return JSON.stringify({
    walls: tpl.walls,
    wires: [],
    junctions: [],
    pipes: [],
    fixtures: [],
    securityDevices: [],
    furniture: [],
    customRoomNames: {},
    wallHeight: tpl.wallHeight,
    defaultThickness: tpl.defaultThickness,
    defaultWallColor: tpl.defaultWallColor,
    floorColor: '#ddd7cc',
    floorStyle: 'tile',
    ceilingMode: 'flat',
    openingDefaults: DEFAULT_OPENING_DIMENSIONS,
  });
}

function getSlotSignature(slot: Omit<SavedProjectSlot, 'updatedAt'>): string {
  return JSON.stringify({
    walls: slot.walls,
    wires: slot.wires,
    junctions: slot.junctions,
    pipes: slot.pipes,
    fixtures: slot.fixtures,
    securityDevices: slot.securityDevices,
    furniture: slot.furniture,
    customRoomNames: slot.customRoomNames,
    wallHeight: slot.wallHeight,
    defaultThickness: slot.defaultThickness,
    defaultWallColor: slot.defaultWallColor,
    floorColor: slot.floorColor,
    floorStyle: slot.floorStyle,
    ceilingMode: slot.ceilingMode,
    openingDefaults: slot.openingDefaults,
  });
}

export default function App() {
  const [initialSavedWorkspace] = useState(() => loadWorkspaceFromStorage());
  const startTemplateId: TemplateId = initialSavedWorkspace?.activeTemplate ?? 'cottage';
  const startTemplate = getTemplateById(startTemplateId);
  const startSlot = initialSavedWorkspace?.slots?.[startTemplateId];
  const startPrefs = initialSavedWorkspace?.prefs;

  const [savedSlots, setSavedSlots] = useState<Partial<Record<TemplateId, SavedProjectSlot>>>(
    () => initialSavedWorkspace?.slots ?? {},
  );
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>(startTemplate.id);
  const [walls, setWalls] = useState<WallSegment[]>(() =>
    startSlot ? cloneWalls(startSlot.walls) : cloneWalls(startTemplate.walls),
  );
  const [wires, setWires] = useState<ElectricalWire[]>(() =>
    startSlot ? cloneWires(startSlot.wires) : [],
  );
  const [junctions, setJunctions] = useState<ElectricalJunction[]>(() =>
    startSlot ? cloneJunctions(startSlot.junctions) : [],
  );
  const [pipes, setPipes] = useState<PlumbingPipe[]>(() =>
    startSlot ? clonePipes(startSlot.pipes) : [],
  );
  const [fixtures, setFixtures] = useState<PlumbingFixture[]>(() =>
    startSlot ? cloneFixtures(startSlot.fixtures) : [],
  );
  const [securityDevices, setSecurityDevices] = useState<SecurityDevice[]>(() =>
    startSlot ? cloneSecurityDevices(startSlot.securityDevices) : [],
  );
  const [furniture, setFurniture] = useState<FurnitureItem[]>(() =>
    startSlot ? cloneFurniture(startSlot.furniture) : [],
  );
  const [customRoomNames, setCustomRoomNames] = useState<Record<string, string>>(() =>
    startSlot ? { ...startSlot.customRoomNames } : {},
  );
  const [wallHeight, setWallHeight] = useState<number>(
    startSlot ? startSlot.wallHeight : startTemplate.wallHeight,
  );
  const [defaultThickness, setDefaultThickness] = useState<number>(
    startSlot ? startSlot.defaultThickness : startTemplate.defaultThickness,
  );
  const [defaultWallColor, setDefaultWallColor] = useState<string>(
    startSlot ? startSlot.defaultWallColor : startTemplate.defaultWallColor,
  );
  const [floorColor, setFloorColor] = useState<string>(
    startSlot ? startSlot.floorColor : '#ddd7cc',
  );
  const [floorStyle, setFloorStyle] = useState<FloorStyle>(
    startSlot ? startSlot.floorStyle : 'tile',
  );
  const [editLocked, setEditLocked] = useState<boolean>(startPrefs?.editLocked ?? false);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);
  const [openingDefaults, setOpeningDefaults] = useState<OpeningDefaultsMap>(() =>
    startSlot ? cloneOpeningDefaults(startSlot.openingDefaults) : DEFAULT_OPENING_DIMENSIONS,
  );

  const defaultBreaker = WIRE_BREAKER_PRESETS[0];
  const defaultPipe = PLUMBING_PIPE_PRESETS[0];

  const [workspaceStep, setWorkspaceStep] = useState<WorkspaceStep>(
    startPrefs?.workspaceStep ?? 'structure',
  );
  const [viewMode, setViewMode] = useState<ViewMode>(startPrefs?.viewMode ?? '2d');
  const [activeTool, setActiveTool] = useState<ToolMode>('select');

  // Wiring tool settings
  const [activeBreakerPresetId, setActiveBreakerPresetId] = useState<string>(defaultBreaker.id);
  const [activeWireCircuit, setActiveWireCircuit] = useState<WireCircuitType>(defaultBreaker.circuit);
  const [activeBreakerLabel, setActiveBreakerLabel] = useState<string>(defaultBreaker.breakerLabel);
  const [activeCableSpec, setActiveCableSpec] = useState<CableSpec>(defaultBreaker.cableSpec);
  const [activeWireMountRef, setActiveWireMountRef] = useState<WireMountRef>(defaultBreaker.mountRef);
  const [activeWireDropFromTop, setActiveWireDropFromTop] = useState<number>(defaultBreaker.dropFromTop);
  const [activeWireHeight, setActiveWireHeight] = useState<number>(defaultBreaker.height);
  const [activeJunctionKind, setActiveJunctionKind] = useState<JunctionKind>('junction-box');

  // Plumbing tool settings
  const [activePipePresetId, setActivePipePresetId] = useState<string>(defaultPipe.id);
  const [activePipeType, setActivePipeType] = useState<PlumbingPipeType>(defaultPipe.pipeType);
  const [activePipeSpec, setActivePipeSpec] = useState<PlumbingPipeSpec>(defaultPipe.pipeSpec);
  const [activePipeLabel, setActivePipeLabel] = useState<string>(defaultPipe.lineLabel);
  const [activePipeMountRef, setActivePipeMountRef] = useState<WireMountRef>(defaultPipe.mountRef);
  const [activePipeDropFromTop, setActivePipeDropFromTop] = useState<number>(defaultPipe.dropFromTop);
  const [activePipeHeight, setActivePipeHeight] = useState<number>(defaultPipe.height);
  const [activeFixtureKind, setActiveFixtureKind] = useState<PlumbingFixtureKind>('sink');
  const [activeSecurityKind, setActiveSecurityKind] = useState<SecurityDeviceKind>('bullet-cam');
  const [activeFurnitureKind, setActiveFurnitureKind] = useState<FurnitureKind>('sofa');
  const [activeCameraViewId, setActiveCameraViewId] = useState<string | null>(null);
  const [testMotionActive, setTestMotionActive] = useState<boolean>(false);

  // Layer visibility & modals
  const [showDimensions, setShowDimensions] = useState<boolean>(startPrefs?.showDimensions ?? true);
  const [showInnerDimensions, setShowInnerDimensions] = useState<boolean>(
    startPrefs?.showInnerDimensions ?? true,
  );
  const [showObjectDistances, setShowObjectDistances] = useState<boolean>(
    startPrefs?.showObjectDistances ?? true,
  );
  const [showRoomAreas, setShowRoomAreas] = useState<boolean>(startPrefs?.showRoomAreas ?? true);
  const [showRoomListCard, setShowRoomListCard] = useState<boolean>(false);
  const [rightPanelHidden, setRightPanelHidden] = useState<boolean>(false);
  const [importNotice, setImportNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showCeiling, setShowCeiling] = useState<boolean>(startPrefs?.showCeiling ?? true);
  const [ceilingMode, setCeilingMode] = useState<CeilingMode>(startSlot?.ceilingMode ?? 'flat');
  const [showWalkDimensions, setShowWalkDimensions] = useState<boolean>(
    startPrefs?.showWalkDimensions ?? false,
  );
  const [walkerHeight, setWalkerHeight] = useState<number>(startPrefs?.walkerHeight ?? 1.75);
  const [cameraFov, setCameraFov] = useState<number>(startPrefs?.cameraFov ?? 105);
  const [cameraZoom, setCameraZoom] = useState<number>(startPrefs?.cameraZoom ?? 1.0);
  const [showStructure, setShowStructure] = useState<boolean>(startPrefs?.showStructure ?? true);
  const [showWiring, setShowWiring] = useState<boolean>(startPrefs?.showWiring ?? false);
  const [showPlumbing, setShowPlumbing] = useState<boolean>(startPrefs?.showPlumbing ?? false);
  const [showSecurity, setShowSecurity] = useState<boolean>(startPrefs?.showSecurity ?? true);
  const [showInterior, setShowInterior] = useState<boolean>(startPrefs?.showInterior ?? true);
  const [showSecurityCoverage, setShowSecurityCoverage] = useState<boolean>(
    startPrefs?.showSecurityCoverage ?? true,
  );
  const [xrayWalls, setXrayWalls] = useState<boolean>(startPrefs?.xrayWalls ?? false);
  const [calculationsOpen, setCalculationsOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!importNotice) return;
    const t = window.setTimeout(() => setImportNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [importNotice]);

  const closedRooms = useMemo(
    () => detectClosedRooms(walls, customRoomNames),
    [walls, customRoomNames],
  );
  const totalRoomAreaSqM = useMemo(
    () => closedRooms.reduce((sum, r) => sum + r.netAreaSqM, 0),
    [closedRooms],
  );

  const [snapMode, setSnapMode] = useState<SnapMode>(startPrefs?.snapMode ?? 'grid');
  const [fitViewTrigger, setFitViewTrigger] = useState<number>(0);
  const [cameraLocked, setCameraLocked] = useState<boolean>(true);
  const [resetCameraTrigger, setResetCameraTrigger] = useState<number>(0);
  const [selected, setSelected] = useState<SelectionTarget>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const [exportConfig, setExportConfig] = useState<ExportConfig>(
    () =>
      startPrefs?.exportConfig ?? {
        format: 'stl',
        scale: 100,
        includeBasePlate: true,
        baseThicknessMm: 3.0,
      },
  );

  const [undoStack, setUndoStack] = useState<PlanSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<PlanSnapshot[]>([]);

  const [isTouchViewport, setIsTouchViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
  });

  useEffect(() => {
    const updateTouch = () => {
      setIsTouchViewport(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    };
    window.addEventListener('resize', updateTouch);
    return () => window.removeEventListener('resize', updateTouch);
  }, []);

  const walkMoveRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerLockRequestRef = useRef<(() => void) | null>(null);
  const startWireAtPointRef = useRef<((pt: Point2D) => void) | null>(null);
  const pasteTargetRef = useRef<(() => Point2D | null) | null>(null);
  const dragUndoCommittedRef = useRef<boolean>(false);
  const dragBaseRef = useRef<DragBaseState | null>(null);

  const buildCurrentSlotData = useCallback(
    (): SavedProjectSlot => ({
      updatedAt: Date.now(),
      walls: cloneWalls(walls),
      wires: cloneWires(wires),
      junctions: cloneJunctions(junctions),
      pipes: clonePipes(pipes),
      fixtures: cloneFixtures(fixtures),
      securityDevices: cloneSecurityDevices(securityDevices),
      furniture: cloneFurniture(furniture),
      customRoomNames: { ...customRoomNames },
      wallHeight,
      defaultThickness,
      defaultWallColor,
      floorColor,
      floorStyle,
      ceilingMode,
      openingDefaults: cloneOpeningDefaults(openingDefaults),
    }),
    [
      walls,
      wires,
      junctions,
      pipes,
      fixtures,
      securityDevices,
      furniture,
      customRoomNames,
      wallHeight,
      defaultThickness,
      defaultWallColor,
      floorColor,
      floorStyle,
      ceilingMode,
      openingDefaults,
    ],
  );

  const savedTemplateIds = useMemo(
    () => Object.keys(savedSlots) as TemplateId[],
    [savedSlots],
  );

  const buildWorkspaceEnvelope = useCallback(
    (
      nextActiveTemplate: TemplateId,
      baseSlots: Partial<Record<TemplateId, SavedProjectSlot>>,
      slotOverride?: SavedProjectSlot | null,
    ) => {
      const updatedSlots = { ...baseSlots };
      if (slotOverride !== undefined) {
        if (slotOverride === null) {
          delete updatedSlots[nextActiveTemplate];
        } else {
          updatedSlots[nextActiveTemplate] = slotOverride;
        }
      }
      return {
        version: 1 as const,
        activeTemplate: nextActiveTemplate,
        slots: updatedSlots,
        prefs: {
          viewMode,
          workspaceStep,
          walkerHeight,
          cameraFov,
          cameraZoom,
          snapMode,
          showDimensions,
          showInnerDimensions,
          showObjectDistances,
          showRoomAreas,
          showCeiling,
          showWalkDimensions,
          showStructure,
          showWiring,
          showPlumbing,
          showSecurity,
          showInterior,
          showSecurityCoverage,
          xrayWalls,
          editLocked,
          exportConfig,
        },
      };
    },
    [
      viewMode,
      workspaceStep,
      walkerHeight,
      cameraFov,
      cameraZoom,
      snapMode,
      showDimensions,
      showInnerDimensions,
      showObjectDistances,
      showRoomAreas,
      showCeiling,
      showWalkDimensions,
      showStructure,
      showWiring,
      showPlumbing,
      showSecurity,
      showInterior,
      showSecurityCoverage,
      xrayWalls,
      editLocked,
      exportConfig,
    ],
  );

  const flushWorkspaceToStorageRef = useRef<() => void>(() => {});
  flushWorkspaceToStorageRef.current = () => {
    const curSlot = buildCurrentSlotData();
    const isDirty = getSlotSignature(curSlot) !== getTemplateDefaultSignature(activeTemplate);
    const nextSlots = { ...savedSlots };
    if (isDirty) {
      nextSlots[activeTemplate] = curSlot;
    } else if (nextSlots[activeTemplate]) {
      delete nextSlots[activeTemplate];
    }
    saveWorkspaceToStorage(buildWorkspaceEnvelope(activeTemplate, nextSlots));
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const curSlot = buildCurrentSlotData();
      const isDirty = getSlotSignature(curSlot) !== getTemplateDefaultSignature(activeTemplate);
      setSavedSlots((prev) => {
        const nextSlots = { ...prev };
        if (isDirty) {
          nextSlots[activeTemplate] = curSlot;
        } else if (nextSlots[activeTemplate]) {
          delete nextSlots[activeTemplate];
        } else {
          saveWorkspaceToStorage(buildWorkspaceEnvelope(activeTemplate, prev));
          return prev;
        }
        saveWorkspaceToStorage(buildWorkspaceEnvelope(activeTemplate, nextSlots));
        return nextSlots;
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [activeTemplate, buildCurrentSlotData, buildWorkspaceEnvelope]);

  useEffect(() => {
    const flushNow = () => flushWorkspaceToStorageRef.current();
    window.addEventListener('beforeunload', flushNow);
    window.addEventListener('pagehide', flushNow);
    return () => {
      window.removeEventListener('beforeunload', flushNow);
      window.removeEventListener('pagehide', flushNow);
    };
  }, []);

  const pushUndoSnapshot = useCallback(
    (
      snapshotWalls = walls,
      snapshotWires = wires,
      snapshotJunctions = junctions,
      snapshotPipes = pipes,
      snapshotFixtures = fixtures,
      snapshotSecurity = securityDevices,
      snapshotFurniture = furniture,
      snapshotRoomNames = customRoomNames,
      snapshotHeight = wallHeight,
      snapshotThickness = defaultThickness,
      snapshotColor = defaultWallColor,
      snapshotFloorColor = floorColor,
      snapshotFloorStyle = floorStyle,
      snapshotCeilingMode = ceilingMode,
      snapshotTemplate = activeTemplate,
      snapshotOpeningDefaults = openingDefaults,
    ) => {
      setUndoStack((prev) => [
        ...prev.slice(-29),
        {
          activeTemplate: snapshotTemplate,
          walls: cloneWalls(snapshotWalls),
          wires: cloneWires(snapshotWires),
          junctions: cloneJunctions(snapshotJunctions),
          pipes: clonePipes(snapshotPipes),
          fixtures: cloneFixtures(snapshotFixtures),
          securityDevices: cloneSecurityDevices(snapshotSecurity),
          furniture: cloneFurniture(snapshotFurniture),
          customRoomNames: { ...snapshotRoomNames },
          wallHeight: snapshotHeight,
          defaultThickness: snapshotThickness,
          defaultWallColor: snapshotColor,
          floorColor: snapshotFloorColor,
          floorStyle: snapshotFloorStyle,
          ceilingMode: snapshotCeilingMode,
          openingDefaults: cloneOpeningDefaults(snapshotOpeningDefaults),
        },
      ]);
      setRedoStack([]);
    },
    [
      activeTemplate,
      walls,
      wires,
      junctions,
      pipes,
      fixtures,
      securityDevices,
      furniture,
      customRoomNames,
      wallHeight,
      defaultThickness,
      defaultWallColor,
      floorColor,
      floorStyle,
      ceilingMode,
      openingDefaults,
    ],
  );

  const handleUndo = useCallback(() => {
    if (editLocked) return;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [
        ...r,
        {
          activeTemplate,
          walls: cloneWalls(walls),
          wires: cloneWires(wires),
          junctions: cloneJunctions(junctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(fixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
          furniture: cloneFurniture(furniture),
          customRoomNames: { ...customRoomNames },
          wallHeight,
          defaultThickness,
          defaultWallColor,
          floorColor,
          floorStyle,
          ceilingMode,
          openingDefaults: cloneOpeningDefaults(openingDefaults),
        },
      ]);
      if (last.activeTemplate) setActiveTemplate(last.activeTemplate);
      setWalls(cloneWalls(last.walls));
      setWires(cloneWires(last.wires));
      setJunctions(cloneJunctions(last.junctions));
      setPipes(clonePipes(last.pipes));
      setFixtures(cloneFixtures(last.fixtures));
      setSecurityDevices(cloneSecurityDevices(last.securityDevices ?? []));
      setFurniture(cloneFurniture(last.furniture ?? []));
      setCustomRoomNames({ ...(last.customRoomNames ?? {}) });
      setWallHeight(last.wallHeight);
      setDefaultThickness(last.defaultThickness);
      setDefaultWallColor(last.defaultWallColor);
      if (last.floorColor) setFloorColor(last.floorColor);
      if (last.floorStyle) setFloorStyle(last.floorStyle);
      if (last.ceilingMode) setCeilingMode(last.ceilingMode);
      if (last.openingDefaults) setOpeningDefaults(cloneOpeningDefaults(last.openingDefaults));
      setSelected(null);
      return prev.slice(0, -1);
    });
  }, [
    editLocked,
    activeTemplate,
    walls,
    wires,
    junctions,
    pipes,
    fixtures,
    securityDevices,
    furniture,
    customRoomNames,
    wallHeight,
    defaultThickness,
    defaultWallColor,
    floorColor,
    floorStyle,
    ceilingMode,
    openingDefaults,
  ]);

  const handleRedo = useCallback(() => {
    if (editLocked) return;
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setUndoStack((u) => [
        ...u,
        {
          activeTemplate,
          walls: cloneWalls(walls),
          wires: cloneWires(wires),
          junctions: cloneJunctions(junctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(fixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
          furniture: cloneFurniture(furniture),
          customRoomNames: { ...customRoomNames },
          wallHeight,
          defaultThickness,
          defaultWallColor,
          floorColor,
          floorStyle,
          ceilingMode,
          openingDefaults: cloneOpeningDefaults(openingDefaults),
        },
      ]);
      if (next.activeTemplate) setActiveTemplate(next.activeTemplate);
      setWalls(cloneWalls(next.walls));
      setWires(cloneWires(next.wires));
      setJunctions(cloneJunctions(next.junctions));
      setPipes(clonePipes(next.pipes));
      setFixtures(cloneFixtures(next.fixtures));
      setSecurityDevices(cloneSecurityDevices(next.securityDevices ?? []));
      setFurniture(cloneFurniture(next.furniture ?? []));
      setCustomRoomNames({ ...(next.customRoomNames ?? {}) });
      setWallHeight(next.wallHeight);
      setDefaultThickness(next.defaultThickness);
      setDefaultWallColor(next.defaultWallColor);
      if (next.floorColor) setFloorColor(next.floorColor);
      if (next.floorStyle) setFloorStyle(next.floorStyle);
      if (next.ceilingMode) setCeilingMode(next.ceilingMode);
      if (next.openingDefaults) setOpeningDefaults(cloneOpeningDefaults(next.openingDefaults));
      setSelected(null);
      return prev.slice(0, -1);
    });
  }, [
    editLocked,
    activeTemplate,
    walls,
    wires,
    junctions,
    pipes,
    fixtures,
    securityDevices,
    furniture,
    customRoomNames,
    wallHeight,
    defaultThickness,
    defaultWallColor,
    floorColor,
    floorStyle,
    ceilingMode,
    openingDefaults,
  ]);

  const handleSelectTemplate = useCallback(
    (id: TemplateId) => {
      if (editLocked || id === activeTemplate) return;
      // Persist outgoing project slot into localStorage before switching
      const outgoingSlot = buildCurrentSlotData();
      const outgoingDirty =
        getSlotSignature(outgoingSlot) !== getTemplateDefaultSignature(activeTemplate);
      const nextSlots = { ...savedSlots };
      if (outgoingDirty) {
        nextSlots[activeTemplate] = outgoingSlot;
      } else {
        delete nextSlots[activeTemplate];
      }
      setSavedSlots(nextSlots);

      pushUndoSnapshot();

      const savedTarget = nextSlots[id];
      const tpl = getTemplateById(id);
      setActiveTemplate(tpl.id);
      if (savedTarget) {
        setWalls(cloneWalls(savedTarget.walls));
        setWires(cloneWires(savedTarget.wires));
        setJunctions(cloneJunctions(savedTarget.junctions));
        setPipes(clonePipes(savedTarget.pipes));
        setFixtures(cloneFixtures(savedTarget.fixtures));
        setSecurityDevices(cloneSecurityDevices(savedTarget.securityDevices));
        setFurniture(cloneFurniture(savedTarget.furniture));
        setCustomRoomNames({ ...savedTarget.customRoomNames });
        setWallHeight(savedTarget.wallHeight);
        setDefaultThickness(savedTarget.defaultThickness);
        setDefaultWallColor(savedTarget.defaultWallColor);
        setFloorColor(savedTarget.floorColor);
        setFloorStyle(savedTarget.floorStyle);
        setCeilingMode(savedTarget.ceilingMode);
        setOpeningDefaults(cloneOpeningDefaults(savedTarget.openingDefaults));
      } else {
        setWalls(cloneWalls(tpl.walls));
        setWires([]);
        setJunctions([]);
        setPipes([]);
        setFixtures([]);
        setSecurityDevices([]);
        setFurniture([]);
        setCustomRoomNames({});
        setWallHeight(tpl.wallHeight);
        setDefaultThickness(tpl.defaultThickness);
        setDefaultWallColor(tpl.defaultWallColor);
        setFloorColor('#ddd7cc');
        setFloorStyle('tile');
        setCeilingMode('flat');
        setOpeningDefaults(DEFAULT_OPENING_DIMENSIONS);
        if (tpl.id === 'blank') {
          setViewMode('2d');
          setWorkspaceStep('structure');
          setActiveTool('wall');
        }
      }

      saveWorkspaceToStorage(buildWorkspaceEnvelope(tpl.id, nextSlots));
      setActiveCameraViewId(null);
      setTestMotionActive(false);
      setSelected(null);
      setResetCameraTrigger((n) => n + 1);
    },
    [
      editLocked,
      activeTemplate,
      savedSlots,
      buildCurrentSlotData,
      buildWorkspaceEnvelope,
      pushUndoSnapshot,
    ],
  );

  const handleResetTemplate = useCallback(() => {
    if (editLocked) return;
    pushUndoSnapshot();
    const nextSlots = { ...savedSlots };
    delete nextSlots[activeTemplate];
    setSavedSlots(nextSlots);

    const tpl = getTemplateById(activeTemplate);
    setWalls(cloneWalls(tpl.walls));
    setWires([]);
    setJunctions([]);
    setPipes([]);
    setFixtures([]);
    setSecurityDevices([]);
    setFurniture([]);
    setCustomRoomNames({});
    setWallHeight(tpl.wallHeight);
    setDefaultThickness(tpl.defaultThickness);
    setDefaultWallColor(tpl.defaultWallColor);
    setFloorColor('#ddd7cc');
    setFloorStyle('tile');
    setCeilingMode('flat');
    setOpeningDefaults(DEFAULT_OPENING_DIMENSIONS);
    setActiveCameraViewId(null);
    setTestMotionActive(false);
    setSelected(null);
    setResetCameraTrigger((n) => n + 1);
    if (tpl.id === 'blank') {
      setViewMode('2d');
      setWorkspaceStep('structure');
      setActiveTool('wall');
    }
    saveWorkspaceToStorage(buildWorkspaceEnvelope(tpl.id, nextSlots));
  }, [editLocked, activeTemplate, savedSlots, buildWorkspaceEnvelope, pushUndoSnapshot]);

  const handleRenameRoom = useCallback(
    (roomId: string, name: string) => {
      if (editLocked) return;
      setCustomRoomNames((prev) => ({
        ...prev,
        [roomId]: name,
      }));
    },
    [editLocked],
  );

  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setActiveCameraViewId(null);
    setViewMode(mode);
  }, []);

  const handleToggleEditLocked = useCallback(() => {
    setEditLocked((prev) => {
      const next = !prev;
      if (next) {
        setActiveTool('select');
      }
      return next;
    });
  }, []);

  const handleEnterCameraView = useCallback(
    (cameraId: string) => {
      setShowStructure(true);
      setShowSecurity(true);
      if (wallHeight <= 0.15) {
        setWallHeight(2.6);
      }
      if (viewMode === '2d') {
        setViewMode('3d-orbit');
      }
      setActiveTool('select');
      setSelected({ kind: 'security', securityId: cameraId });
      setActiveCameraViewId(cameraId);
    },
    [wallHeight, viewMode],
  );

  const handleExitCameraView = useCallback(() => {
    setActiveCameraViewId(null);
  }, []);

  const handleChangeWorkspaceStep = useCallback(
    (step: WorkspaceStep) => {
      setWorkspaceStep(step);
      setActiveTool(editLocked ? 'select' : step === 'interior' ? 'furniture' : 'select');
      setSelected(null);
      if (step === 'structure') {
        setShowStructure(true);
      } else if (step === 'wiring') {
        setShowStructure(true);
        setShowWiring(true);
        setShowSecurity(true);
      } else if (step === 'plumbing') {
        setShowStructure(true);
        setShowPlumbing(true);
      } else if (step === 'interior') {
        setShowStructure(true);
        setShowInterior(true);
      }
    },
    [editLocked],
  );

  const handleSelectTool = useCallback(
    (tool: ToolMode) => {
      if (editLocked && tool !== 'select') {
        setActiveTool('select');
        return;
      }
      setActiveTool(tool);
      if (tool !== 'select') {
        setSelected(null);
      }
      if (tool === 'wire') {
        setShowWiring(true);
      } else if (tool === 'junction') {
        if (workspaceStep === 'interior') {
          setShowInterior(true);
          setActiveJunctionKind((prev) =>
            prev === 'ceiling-light' || prev === 'wall-light' ? prev : 'ceiling-light',
          );
        }
        setShowWiring(true);
      } else if (tool === 'pipe' || tool === 'fixture') {
        setShowPlumbing(true);
      } else if (tool === 'security') {
        setShowSecurity(true);
        setShowSecurityCoverage(true);
      } else if (tool === 'furniture') {
        setShowInterior(true);
      }
    },
    [editLocked, workspaceStep],
  );

  const handleSelectBreakerPreset = useCallback((preset: WireBreakerPreset) => {
    setActiveBreakerPresetId(preset.id);
    setActiveWireCircuit(preset.circuit);
    setActiveBreakerLabel(preset.breakerLabel);
    setActiveCableSpec(preset.cableSpec);
    setActiveWireMountRef(preset.mountRef);
    setActiveWireDropFromTop(preset.dropFromTop);
    setActiveWireHeight(preset.height);
  }, []);

  const handleSelectPipePreset = useCallback((preset: PlumbingPipePreset) => {
    setActivePipePresetId(preset.id);
    setActivePipeType(preset.pipeType);
    setActivePipeSpec(preset.pipeSpec);
    setActivePipeLabel(preset.lineLabel);
    setActivePipeMountRef(preset.mountRef);
    setActivePipeDropFromTop(preset.dropFromTop);
    setActivePipeHeight(preset.height);
  }, []);

  const handleCycleSnapMode = useCallback(() => {
    setSnapMode((prev) => (prev === 'grid' ? 'fine' : prev === 'fine' ? 'free' : 'grid'));
  }, []);

  const handleExportJson = useCallback(() => {
    const slot = buildCurrentSlotData();
    const jsonText = serializeProjectToJson(activeTemplate, slot, {
      viewMode,
      workspaceStep,
      walkerHeight,
      cameraFov,
      cameraZoom,
      snapMode,
      showDimensions,
      showInnerDimensions,
      showObjectDistances,
      showRoomAreas,
      showCeiling,
      showWalkDimensions,
      showStructure,
      showWiring,
      showPlumbing,
      showSecurity,
      showInterior,
      showSecurityCoverage,
      xrayWalls,
      editLocked,
      exportConfig,
    });
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `homedraft-cad-${activeTemplate}-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setImportNotice({ type: 'success', message: 'Project exported to JSON.' });
  }, [
    activeTemplate,
    buildCurrentSlotData,
    viewMode,
    workspaceStep,
    walkerHeight,
    cameraFov,
    cameraZoom,
    snapMode,
    showDimensions,
    showInnerDimensions,
    showObjectDistances,
    showRoomAreas,
    showCeiling,
    showWalkDimensions,
    showStructure,
    showWiring,
    showPlumbing,
    showSecurity,
    showInterior,
    showSecurityCoverage,
    xrayWalls,
    editLocked,
    exportConfig,
  ]);

  const handleImportJson = useCallback(
    (fileText: string) => {
      const parsed = parseProjectFromJson(fileText);
      if (!parsed) {
        setImportNotice({
          type: 'error',
          message: 'Invalid JSON file. Choose a HomeDraft-CAD project export.',
        });
        return;
      }
      pushUndoSnapshot();
      const targetTpl = parsed.templateId ?? activeTemplate;
      const slot = parsed.project;
      setActiveTemplate(targetTpl);
      setWalls(cloneWalls(slot.walls));
      setWires(cloneWires(slot.wires));
      setJunctions(cloneJunctions(slot.junctions));
      setPipes(clonePipes(slot.pipes));
      setFixtures(cloneFixtures(slot.fixtures));
      setSecurityDevices(cloneSecurityDevices(slot.securityDevices));
      setFurniture(cloneFurniture(slot.furniture));
      setCustomRoomNames({ ...slot.customRoomNames });
      setWallHeight(slot.wallHeight);
      setDefaultThickness(slot.defaultThickness);
      setDefaultWallColor(slot.defaultWallColor);
      setFloorColor(slot.floorColor);
      setFloorStyle(slot.floorStyle);
      setCeilingMode(slot.ceilingMode);
      setOpeningDefaults(cloneOpeningDefaults(slot.openingDefaults));
      if (parsed.prefs) {
        if (typeof parsed.prefs.showDimensions === 'boolean') setShowDimensions(parsed.prefs.showDimensions);
        if (typeof parsed.prefs.showInnerDimensions === 'boolean') {
          setShowInnerDimensions(parsed.prefs.showInnerDimensions);
        }
        if (typeof parsed.prefs.showObjectDistances === 'boolean') {
          setShowObjectDistances(parsed.prefs.showObjectDistances);
        }
        if (typeof parsed.prefs.showRoomAreas === 'boolean') setShowRoomAreas(parsed.prefs.showRoomAreas);
        if (typeof parsed.prefs.showCeiling === 'boolean') setShowCeiling(parsed.prefs.showCeiling);
        if (typeof parsed.prefs.showWalkDimensions === 'boolean') {
          setShowWalkDimensions(parsed.prefs.showWalkDimensions);
        }
        if (typeof parsed.prefs.showStructure === 'boolean') setShowStructure(parsed.prefs.showStructure);
        if (typeof parsed.prefs.showWiring === 'boolean') setShowWiring(parsed.prefs.showWiring);
        if (typeof parsed.prefs.showPlumbing === 'boolean') setShowPlumbing(parsed.prefs.showPlumbing);
        if (typeof parsed.prefs.showSecurity === 'boolean') setShowSecurity(parsed.prefs.showSecurity);
        if (typeof parsed.prefs.showInterior === 'boolean') setShowInterior(parsed.prefs.showInterior);
      }
      setSelected(null);
      setActiveCameraViewId(null);
      setSavedSlots((prev) => {
        const nextSlots = { ...prev, [targetTpl]: slot };
        saveWorkspaceToStorage(buildWorkspaceEnvelope(targetTpl, nextSlots));
        return nextSlots;
      });
      setFitViewTrigger((n) => n + 1);
      setImportNotice({
        type: 'success',
        message: `Imported ${slot.walls.length} walls and ${slot.furniture.length} furniture items.`,
      });
    },
    [activeTemplate, buildWorkspaceEnvelope, pushUndoSnapshot],
  );

  const handleAddWall = useCallback(
    (start: Point2D, end: Point2D) => {
      if (editLocked) return;
      const trimmed = subtractCollinearWallOverlaps(start, end, walls, defaultThickness);
      if (trimmed.length === 0) return;
      pushUndoSnapshot();
      const added: WallSegment[] = trimmed.map(([a, b]) => ({
        id: makeId('wall'),
        start: { ...a },
        end: { ...b },
        thickness: defaultThickness,
        openings: [],
      }));
      setWalls((prev) => [...prev, ...added]);
    },
    [editLocked, walls, defaultThickness, pushUndoSnapshot],
  );

  const handleAddWallRect = useCallback(
    (cornerA: Point2D, cornerB: Point2D) => {
      if (editLocked) return;
      const minX = Number(Math.min(cornerA.x, cornerB.x).toFixed(3));
      const maxX = Number(Math.max(cornerA.x, cornerB.x).toFixed(3));
      const minZ = Number(Math.min(cornerA.z, cornerB.z).toFixed(3));
      const maxZ = Number(Math.max(cornerA.z, cornerB.z).toFixed(3));
      if (maxX - minX < 0.25 || maxZ - minZ < 0.25) return;

      const p1: Point2D = { x: minX, z: minZ };
      const p2: Point2D = { x: maxX, z: minZ };
      const p3: Point2D = { x: maxX, z: maxZ };
      const p4: Point2D = { x: minX, z: maxZ };
      const edges: Array<[Point2D, Point2D]> = [
        [p1, p2],
        [p2, p3],
        [p3, p4],
        [p4, p1],
      ];

      const trimmedEdges: Array<[Point2D, Point2D]> = [];
      for (const [a, b] of edges) {
        const parts = subtractCollinearWallOverlaps(a, b, walls, defaultThickness);
        for (const part of parts) {
          trimmedEdges.push(part);
        }
      }
      if (trimmedEdges.length === 0) return;

      pushUndoSnapshot();
      const added: WallSegment[] = trimmedEdges.map(([a, b]) => ({
        id: makeId('wall'),
        start: { ...a },
        end: { ...b },
        thickness: defaultThickness,
        openings: [],
      }));
      setWalls((prev) => [...prev, ...added]);
    },
    [editLocked, walls, defaultThickness, pushUndoSnapshot],
  );

  const handleChangeCeilingMode = useCallback(
    (mode: CeilingMode) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setCeilingMode(mode);
      setShowCeiling(true);
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleChangeFloorColor = useCallback(
    (color: string) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setFloorColor(color);
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleChangeFloorStyle = useCallback(
    (style: FloorStyle) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setFloorStyle(style);
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleAddWire = useCallback(
    (points: WirePoint[]) => {
      if (editLocked || points.length < 2) return;
      pushUndoSnapshot();
      const stickyPoints = bindWirePointsToWalls(points, walls, junctions, wires);
      const newWire: ElectricalWire = {
        id: makeId('wire'),
        points: stickyPoints,
        circuit: activeWireCircuit,
        breakerLabel: activeBreakerLabel.trim() || 'B1',
        cableSpec: activeCableSpec,
        mountRef: activeWireMountRef,
        dropFromTop: activeWireDropFromTop,
        height: activeWireHeight,
      };
      setWires((prev) => [...prev, newWire]);
      setShowWiring(true);
      setSelected({ kind: 'wire', wireId: newWire.id });
    },
    [
      editLocked,
      walls,
      junctions,
      wires,
      activeWireCircuit,
      activeBreakerLabel,
      activeCableSpec,
      activeWireMountRef,
      activeWireDropFromTop,
      activeWireHeight,
      pushUndoSnapshot,
    ],
  );

  const handleUpdateWire = useCallback(
    (wireId: string, patch: Partial<ElectricalWire>) => {
      if (editLocked) return;
      setWires((prev) => prev.map((w) => (w.id === wireId ? { ...w, ...patch } : w)));
    },
    [editLocked],
  );

  const handleMoveWireVertex = useCallback(
    (
      baseWires: ElectricalWire[],
      wireId: string,
      vertexIndex: number,
      nextPoint: WirePoint,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(walls, baseWires, junctions, pipes, fixtures, securityDevices);
        dragUndoCommittedRef.current = true;
      }

      const otherWires = baseWires.filter((w) => w.id !== wireId);
      setWires(
        baseWires.map((w) => {
          if (w.id !== wireId) return w;
          const updatedPoints = w.points.map((pt, idx) =>
            idx === vertexIndex ? { ...nextPoint } : pt,
          );
          const rebound = bindWirePointsToWalls(updatedPoints, walls, junctions, otherWires);
          // Explicitly preserve connectedWireId set by snap target on the moved vertex
          if (rebound[vertexIndex]) {
            rebound[vertexIndex] = {
              ...rebound[vertexIndex],
              connectedWireId: nextPoint.connectedWireId,
            };
          }
          return { ...w, points: rebound };
        }),
      );

      if (nextPoint.anchorTargetId) {
        const snapJId = nextPoint.anchorTargetId;
        setJunctions((prev) =>
          prev.map((j) =>
            j.id === snapJId && j.disconnectedWireIds?.includes(wireId)
              ? {
                  ...j,
                  disconnectedWireIds: j.disconnectedWireIds.filter((id) => id !== wireId),
                }
              : j,
          ),
        );
      }

      if (commit) {
        dragUndoCommittedRef.current = false;
      }
    },
    [editLocked, walls, junctions, pipes, fixtures, securityDevices, pushUndoSnapshot],
  );

  const handleAddJunction = useCallback(
    (wallId: string, offset: number, freePos?: Point2D) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const info = JUNCTION_KIND_INFO[activeJunctionKind];
      const newJunction: ElectricalJunction = {
        id: makeId('junc'),
        wallId,
        offset,
        ...(freePos ? { x: freePos.x, z: freePos.z } : {}),
        kind: activeJunctionKind,
        mountRef: info.mountRef,
        dropFromTop: info.defaultDropFromTop,
        height: info.defaultHeight,
        isOn: true,
      };
      setJunctions((prev) => [...prev, newJunction]);
      setShowWiring(true);
      setSelected({ kind: 'junction', junctionId: newJunction.id });
    },
    [editLocked, activeJunctionKind, pushUndoSnapshot],
  );

  const handleUpdateJunction = useCallback(
    (junctionId: string, patch: Partial<ElectricalJunction>) => {
      const isOnlyDoorToggle = 'isOpen' in patch && Object.keys(patch).length === 1;
      if (editLocked && !isOnlyDoorToggle) return;
      setJunctions((prev) => prev.map((j) => (j.id === junctionId ? { ...j, ...patch } : j)));
    },
    [editLocked],
  );

  const handleTogglePanelBreaker = useCallback(
    (panelId: string, breakerLabel: string) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setJunctions((prev) =>
        prev.map((j) => {
          if (j.id !== panelId) return j;
          const prevMap = j.breakerStates ?? {};
          const currentOn = prevMap[breakerLabel] ?? true;
          return {
            ...j,
            breakerStates: {
              ...prevMap,
              [breakerLabel]: !currentOn,
            },
          };
        }),
      );
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleToggleJunctionWireConnection = useCallback(
    (junctionId: string, wireId: string) => {
      if (editLocked) return;
      const targetJunction = junctions.find((j) => j.id === junctionId);
      if (!targetJunction) return;
      const connectedInfo = getJunctionConnectedWireIds(targetJunction, wires, walls);
      const isCurrentlyConnected = connectedInfo.allWireIds.includes(wireId);

      pushUndoSnapshot();
      if (isCurrentlyConnected) {
        setJunctions((prev) =>
          prev.map((j) => {
            if (j.id !== junctionId) return j;
            const nextConnected = (j.connectedWireIds ?? []).filter((id) => id !== wireId);
            const nextDisconnected = Array.from(
              new Set([...(j.disconnectedWireIds ?? []), wireId]),
            );
            return {
              ...j,
              connectedWireIds: nextConnected,
              disconnectedWireIds: nextDisconnected,
            };
          }),
        );
        setWires((prev) =>
          prev.map((w) => {
            if (w.id !== wireId) return w;
            return {
              ...w,
              points: w.points.map((pt) =>
                pt.anchorTargetId === junctionId ? { ...pt, anchorTargetId: undefined } : pt,
              ),
            };
          }),
        );
      } else {
        setJunctions((prev) =>
          prev.map((j) => {
            if (j.id !== junctionId) return j;
            const nextConnected = Array.from(new Set([...(j.connectedWireIds ?? []), wireId]));
            const nextDisconnected = (j.disconnectedWireIds ?? []).filter((id) => id !== wireId);
            return {
              ...j,
              connectedWireIds: nextConnected,
              disconnectedWireIds: nextDisconnected.length > 0 ? nextDisconnected : undefined,
            };
          }),
        );
      }
      setShowWiring(true);
    },
    [editLocked, junctions, wires, walls, pushUndoSnapshot],
  );

  const handleDisconnectWireSplice = useCallback(
    (wireIdA: string, wireIdB: string) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setWires((prev) =>
        prev.map((w) => {
          if (w.id === wireIdA) {
            return {
              ...w,
              points: w.points.map((pt) =>
                pt.connectedWireId === wireIdB ? { ...pt, connectedWireId: undefined } : pt,
              ),
            };
          }
          if (w.id === wireIdB) {
            return {
              ...w,
              points: w.points.map((pt) =>
                pt.connectedWireId === wireIdA ? { ...pt, connectedWireId: undefined } : pt,
              ),
            };
          }
          return w;
        }),
      );
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleStartWireFromJunction = useCallback(
    (junctionId: string) => {
      if (editLocked) return;
      const j = junctions.find((item) => item.id === junctionId);
      if (!j) return;
      const info = getJunctionWorldInfo(j, walls, wallHeight, 0);
      if (!info) return;
      setWorkspaceStep('wiring');
      setShowStructure(true);
      setShowWiring(true);
      setActiveTool('wire');
      setSelected(null);
      startWireAtPointRef.current?.(info.centerPos);
    },
    [editLocked, junctions, walls, wallHeight],
  );

  const handleMoveJunction = useCallback(
    (
      baseJunctions: ElectricalJunction[],
      junctionId: string,
      targetWallId: string,
      newOffset: number,
      commit: boolean,
      freePos?: Point2D,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(walls, wires, baseJunctions, pipes, fixtures, securityDevices);
        dragBaseRef.current = {
          wires: cloneWires(wires),
          junctions: cloneJunctions(baseJunctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(fixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
        };
        dragUndoCommittedRef.current = true;
      }
      const nextJunctions = baseJunctions.map((j) =>
        j.id === junctionId
          ? {
              ...j,
              wallId: targetWallId,
              offset: newOffset,
              ...(freePos
                ? { x: freePos.x, z: freePos.z }
                : targetWallId !== 'ceiling'
                  ? { x: undefined, z: undefined }
                  : {}),
            }
          : j,
      );
      setJunctions(nextJunctions);
      if (dragBaseRef.current) {
        setWires(
          syncRoutesWithWallsAndTargets(dragBaseRef.current.wires, walls, walls, nextJunctions),
        );
      }
      if (commit) {
        dragUndoCommittedRef.current = false;
        dragBaseRef.current = null;
      }
    },
    [editLocked, walls, wires, pipes, fixtures, securityDevices, pushUndoSnapshot],
  );

  const handleAddPipe = useCallback(
    (points: WirePoint[]) => {
      if (editLocked || points.length < 2) return;
      pushUndoSnapshot();
      const stickyPoints = bindWirePointsToWalls(points, walls, fixtures, pipes);
      const newPipe: PlumbingPipe = {
        id: makeId('pipe'),
        points: stickyPoints,
        pipeType: activePipeType,
        pipeSpec: activePipeSpec,
        lineLabel: activePipeLabel.trim() || 'CW-1',
        mountRef: activePipeMountRef,
        dropFromTop: activePipeDropFromTop,
        height: activePipeHeight,
      };
      setPipes((prev) => [...prev, newPipe]);
      setShowPlumbing(true);
      setSelected({ kind: 'pipe', pipeId: newPipe.id });
    },
    [
      editLocked,
      walls,
      fixtures,
      pipes,
      activePipeType,
      activePipeSpec,
      activePipeLabel,
      activePipeMountRef,
      activePipeDropFromTop,
      activePipeHeight,
      pushUndoSnapshot,
    ],
  );

  const handleUpdatePipe = useCallback(
    (pipeId: string, patch: Partial<PlumbingPipe>) => {
      if (editLocked) return;
      setPipes((prev) => prev.map((p) => (p.id === pipeId ? { ...p, ...patch } : p)));
    },
    [editLocked],
  );

  const handleAddFixture = useCallback(
    (wallId: string, offset: number) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const info = PLUMBING_FIXTURE_INFO[activeFixtureKind];
      const newFixture: PlumbingFixture = {
        id: makeId('fix'),
        wallId,
        offset,
        kind: activeFixtureKind,
        mountRef: info.mountRef,
        dropFromTop: info.defaultDropFromTop,
        height: info.defaultHeight,
      };
      setFixtures((prev) => [...prev, newFixture]);
      setShowPlumbing(true);
      setSelected({ kind: 'fixture', fixtureId: newFixture.id });
    },
    [editLocked, activeFixtureKind, pushUndoSnapshot],
  );

  const handleUpdateFixture = useCallback(
    (fixtureId: string, patch: Partial<PlumbingFixture>) => {
      if (editLocked) return;
      setFixtures((prev) => prev.map((f) => (f.id === fixtureId ? { ...f, ...patch } : f)));
    },
    [editLocked],
  );

  const handleMoveFixture = useCallback(
    (
      baseFixtures: PlumbingFixture[],
      fixtureId: string,
      targetWallId: string,
      newOffset: number,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(walls, wires, junctions, pipes, baseFixtures, securityDevices);
        dragBaseRef.current = {
          wires: cloneWires(wires),
          junctions: cloneJunctions(junctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(baseFixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
        };
        dragUndoCommittedRef.current = true;
      }
      const nextFixtures = baseFixtures.map((f) =>
        f.id === fixtureId ? { ...f, wallId: targetWallId, offset: newOffset } : f,
      );
      setFixtures(nextFixtures);
      if (dragBaseRef.current) {
        setPipes(
          syncRoutesWithWallsAndTargets(dragBaseRef.current.pipes, walls, walls, nextFixtures),
        );
      }
      if (commit) {
        dragUndoCommittedRef.current = false;
        dragBaseRef.current = null;
      }
    },
    [editLocked, walls, wires, junctions, pipes, securityDevices, pushUndoSnapshot],
  );

  const handleAddSecurityDevice = useCallback(
    (deviceData: Omit<SecurityDevice, 'id'>) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const newDevice: SecurityDevice = {
        id: makeId('sec'),
        ...deviceData,
      };
      setSecurityDevices((prev) => [...prev, newDevice]);
      setShowSecurity(true);
      setSelected({ kind: 'security', securityId: newDevice.id });
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleUpdateSecurityDevice = useCallback(
    (deviceId: string, patch: Partial<SecurityDevice>) => {
      if (editLocked) return;
      setSecurityDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, ...patch } : d)),
      );
    },
    [editLocked],
  );

  const handleMoveSecurityDevice = useCallback(
    (
      baseDevices: SecurityDevice[],
      deviceId: string,
      nextDevice: SecurityDevice,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(walls, wires, junctions, pipes, fixtures, baseDevices);
        dragUndoCommittedRef.current = true;
      }
      setSecurityDevices(baseDevices.map((d) => (d.id === deviceId ? nextDevice : d)));
      if (commit) {
        dragUndoCommittedRef.current = false;
      }
    },
    [editLocked, walls, wires, junctions, pipes, fixtures, pushUndoSnapshot],
  );

  const handleAddFurniture = useCallback(
    (itemData: Omit<FurnitureItem, 'id'>) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const newItem: FurnitureItem = {
        id: makeId('furn'),
        ...itemData,
      };
      setFurniture((prev) => [...prev, newItem]);
      setShowInterior(true);
      setSelected({ kind: 'furniture', furnitureId: newItem.id });
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleUpdateFurniture = useCallback(
    (furnitureId: string, patch: Partial<FurnitureItem>) => {
      if (editLocked) return;
      setFurniture((prev) =>
        prev.map((item) => (item.id === furnitureId ? { ...item, ...patch } : item)),
      );
    },
    [editLocked],
  );

  const handleMoveFurniture = useCallback(
    (
      baseFurniture: FurnitureItem[],
      furnitureId: string,
      nextItem: FurnitureItem,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(walls, wires, junctions, pipes, fixtures, securityDevices, baseFurniture);
        dragUndoCommittedRef.current = true;
      }
      setFurniture(baseFurniture.map((f) => (f.id === furnitureId ? nextItem : f)));
      if (commit) {
        dragUndoCommittedRef.current = false;
      }
    },
    [editLocked, walls, wires, junctions, pipes, fixtures, securityDevices, pushUndoSnapshot],
  );

  const syncAllStickyElements = useCallback(
    (
      prevWalls: WallSegment[],
      nextWalls: WallSegment[],
      base: DragBaseState,
    ) => {
      const nextJunctions = syncWallPointsWithWalls(base.junctions, prevWalls, nextWalls);
      const nextFixtures = syncWallPointsWithWalls(base.fixtures, prevWalls, nextWalls);
      const nextWires = syncRoutesWithWallsAndTargets(
        base.wires,
        prevWalls,
        nextWalls,
        nextJunctions,
      );
      const nextPipes = syncRoutesWithWallsAndTargets(
        base.pipes,
        prevWalls,
        nextWalls,
        nextFixtures,
      );
      const nextSecurity = syncSecurityDevicesWithWalls(
        base.securityDevices,
        prevWalls,
        nextWalls,
      );
      setJunctions(nextJunctions);
      setFixtures(nextFixtures);
      setWires(nextWires);
      setPipes(nextPipes);
      setSecurityDevices(nextSecurity);
    },
    [],
  );

  const handleMoveCorner = useCallback(
    (
      baseWalls: WallSegment[],
      cornerPos: Point2D,
      nextPos: Point2D,
      onlyWallId: string | null,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(baseWalls, wires, junctions, pipes, fixtures, securityDevices);
        dragBaseRef.current = {
          wires: cloneWires(wires),
          junctions: cloneJunctions(junctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(fixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
        };
        dragUndoCommittedRef.current = true;
      }
      const nextWalls = moveConnectedCorner(baseWalls, cornerPos, nextPos, onlyWallId);
      setWalls(nextWalls);
      if (dragBaseRef.current) {
        syncAllStickyElements(baseWalls, nextWalls, dragBaseRef.current);
      }
      if (commit) {
        dragUndoCommittedRef.current = false;
        dragBaseRef.current = null;
      }
    },
    [
      editLocked,
      wires,
      junctions,
      pipes,
      fixtures,
      securityDevices,
      pushUndoSnapshot,
      syncAllStickyElements,
    ],
  );

  const handleMoveWall = useCallback(
    (wallId: string, baseWalls: WallSegment[], dx: number, dz: number, commit: boolean) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(baseWalls, wires, junctions, pipes, fixtures, securityDevices);
        dragBaseRef.current = {
          wires: cloneWires(wires),
          junctions: cloneJunctions(junctions),
          pipes: clonePipes(pipes),
          fixtures: cloneFixtures(fixtures),
          securityDevices: cloneSecurityDevices(securityDevices),
        };
        dragUndoCommittedRef.current = true;
      }
      const nextWalls = moveWallWithConnections(baseWalls, wallId, dx, dz);
      setWalls(nextWalls);
      if (dragBaseRef.current) {
        syncAllStickyElements(baseWalls, nextWalls, dragBaseRef.current);
      }
      if (commit) {
        dragUndoCommittedRef.current = false;
        dragBaseRef.current = null;
      }
    },
    [
      editLocked,
      wires,
      junctions,
      pipes,
      fixtures,
      securityDevices,
      pushUndoSnapshot,
      syncAllStickyElements,
    ],
  );

  const handleMoveOpening = useCallback(
    (
      baseWalls: WallSegment[],
      sourceWallId: string,
      openingId: string,
      targetWallId: string,
      newOffset: number,
      commit: boolean,
    ) => {
      if (editLocked) return;
      if (!dragUndoCommittedRef.current) {
        pushUndoSnapshot(baseWalls);
        dragUndoCommittedRef.current = true;
      }

      if (sourceWallId === targetWallId) {
        setWalls(
          baseWalls.map((w) =>
            w.id === sourceWallId
              ? {
                  ...w,
                  openings: w.openings.map((o) =>
                    o.id === openingId ? { ...o, offset: newOffset } : o,
                  ),
                }
              : w,
          ),
        );
      } else {
        const srcWall = baseWalls.find((w) => w.id === sourceWallId);
        const movingOp = srcWall?.openings.find((o) => o.id === openingId);
        if (movingOp) {
          setWalls(
            baseWalls.map((w) => {
              if (w.id === sourceWallId) {
                return { ...w, openings: w.openings.filter((o) => o.id !== openingId) };
              }
              if (w.id === targetWallId) {
                return { ...w, openings: [...w.openings, { ...movingOp, offset: newOffset }] };
              }
              return w;
            }),
          );
          if (commit) {
            setSelected({ kind: 'opening', wallId: targetWallId, openingId });
          }
        }
      }

      if (commit) {
        dragUndoCommittedRef.current = false;
      }
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleAddOpening = useCallback(
    (wallId: string, type: OpeningType, offset: number) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const preset = openingDefaults[type];
      const opening: WallOpening = {
        id: makeId(type),
        type,
        offset,
        width: preset.width,
        height: preset.height,
        sillHeight: preset.sillHeight,
        swingSide: 1,
        isOpen: false,
      };
      setWalls((prev) =>
        prev.map((w) => (w.id === wallId ? { ...w, openings: [...w.openings, opening] } : w)),
      );
      setSelected({ kind: 'opening', wallId, openingId: opening.id });
      setActiveTool('select');
    },
    [editLocked, openingDefaults, pushUndoSnapshot],
  );

  const handleChangeOpeningDefault = useCallback(
    (type: OpeningType, patch: Partial<OpeningDimensionPreset>) => {
      if (editLocked) return;
      setOpeningDefaults((prev) => ({
        ...prev,
        [type]: { ...prev[type], ...patch },
      }));
    },
    [editLocked],
  );

  const handleUpdateWallThickness = useCallback(
    (wallId: string, thickness: number) => {
      if (editLocked) return;
      setWalls((prev) => prev.map((w) => (w.id === wallId ? { ...w, thickness } : w)));
    },
    [editLocked],
  );

  const handleUpdateWallColor = useCallback(
    (wallId: string, color: string | undefined) => {
      if (editLocked) return;
      pushUndoSnapshot();
      setWalls((prev) => prev.map((w) => (w.id === wallId ? { ...w, color } : w)));
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleChangeDefaultWallColor = useCallback(
    (color: string, paintAll = false) => {
      if (editLocked) return;
      if (paintAll) {
        pushUndoSnapshot();
        setWalls((prev) => prev.map((w) => ({ ...w, color: undefined })));
      }
      setDefaultWallColor(color);
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleResizeWall = useCallback(
    (wallId: string, newLength: number) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const nextWalls = resizeWallWithConnections(walls, wallId, newLength);
      setWalls(nextWalls);
      syncAllStickyElements(walls, nextWalls, {
        wires,
        junctions,
        pipes,
        fixtures,
        securityDevices,
      });
    },
    [
      editLocked,
      walls,
      wires,
      junctions,
      pipes,
      fixtures,
      securityDevices,
      pushUndoSnapshot,
      syncAllStickyElements,
    ],
  );

  const handleUpdateOpening = useCallback(
    (wallId: string, openingId: string, patch: Partial<WallOpening>) => {
      const isOnlyOpenToggle = 'isOpen' in patch && Object.keys(patch).length === 1;
      if (editLocked && !isOnlyOpenToggle) return;
      setWalls((prev) =>
        prev.map((w) =>
          w.id === wallId
            ? {
                ...w,
                openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
              }
            : w,
        ),
      );
    },
    [editLocked],
  );

  const handleUpdateOpeningWidth = useCallback(
    (wallId: string, openingId: string, newWidth: number) => {
      if (editLocked) return;
      pushUndoSnapshot();
      const targetWall = walls.find((w) => w.id === wallId);
      const maxW = targetWall ? Math.max(0.55, Math.min(6.0, wallLength(targetWall) - 0.35)) : 6.0;
      const clamped = Math.max(0.55, Math.min(maxW, newWidth));
      handleUpdateOpening(wallId, openingId, { width: clamped });
    },
    [editLocked, walls, pushUndoSnapshot, handleUpdateOpening],
  );

  const handleBatchUpdateOpenings = useCallback(
    (
      category: 'windows' | 'doors',
      patch: Partial<WallOpening>,
      filterType?: OpeningType,
      targetIds?: string[],
    ) => {
      if (editLocked) return;
      const idSet = targetIds && targetIds.length > 0 ? new Set(targetIds) : null;
      pushUndoSnapshot();
      setWalls((prev) =>
        prev.map((w) => {
          const maxW = Math.max(0.4, Math.min(6.0, wallLength(w) - 0.35));
          return {
            ...w,
            openings: w.openings.map((o) => {
              const matchesCategory =
                category === 'windows' ? o.type === 'window' : isDoorOpening(o.type);
              const matchesFilter = !filterType || o.type === filterType;
              const matchesTarget = !idSet || idSet.has(o.id);
              if (!matchesCategory || !matchesFilter || !matchesTarget) return o;
              const next = { ...o, ...patch };
              if (patch.width !== undefined) {
                next.width = Math.max(0.4, Math.min(maxW, patch.width));
              }
              return next;
            }),
          };
        }),
      );
    },
    [editLocked, pushUndoSnapshot],
  );

  const handleToggleOpeningOpen = useCallback((wallId: string, openingId: string) => {
    setWalls((prev) =>
      prev.map((w) =>
        w.id === wallId
          ? {
              ...w,
              openings: w.openings.map((o) =>
                o.id === openingId ? { ...o, isOpen: !o.isOpen } : o,
              ),
            }
          : w,
      ),
    );
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (editLocked || !selected) return;
    pushUndoSnapshot();
    if (selected.kind === 'wall') {
      setWalls((prev) => prev.filter((w) => w.id !== selected.wallId));
      setJunctions((prev) => prev.filter((j) => j.wallId !== selected.wallId));
      setFixtures((prev) => prev.filter((f) => f.wallId !== selected.wallId));
      setSecurityDevices((prev) =>
        prev.map((d) =>
          d.wallId === selected.wallId
            ? { ...d, wallId: undefined, offset: undefined, faceSide: undefined }
            : d,
        ),
      );
    } else if (selected.kind === 'wire') {
      const delWireId = selected.wireId;
      setWires((prev) =>
        prev
          .filter((w) => w.id !== delWireId)
          .map((w) => ({
            ...w,
            points: w.points.map((pt) =>
              pt.connectedWireId === delWireId ? { ...pt, connectedWireId: undefined } : pt,
            ),
          })),
      );
      setJunctions((prev) =>
        prev.map((j) =>
          j.connectedWireIds?.includes(delWireId)
            ? { ...j, connectedWireIds: j.connectedWireIds.filter((id) => id !== delWireId) }
            : j,
        ),
      );
    } else if (selected.kind === 'junction') {
      setJunctions((prev) => prev.filter((j) => j.id !== selected.junctionId));
    } else if (selected.kind === 'pipe') {
      setPipes((prev) => prev.filter((p) => p.id !== selected.pipeId));
    } else if (selected.kind === 'fixture') {
      setFixtures((prev) => prev.filter((f) => f.id !== selected.fixtureId));
    } else if (selected.kind === 'security') {
      if (activeCameraViewId === selected.securityId) {
        setActiveCameraViewId(null);
      }
      setSecurityDevices((prev) => prev.filter((d) => d.id !== selected.securityId));
    } else if (selected.kind === 'furniture') {
      setFurniture((prev) => prev.filter((f) => f.id !== selected.furnitureId));
    } else {
      setWalls((prev) =>
        prev.map((w) =>
          w.id === selected.wallId
            ? { ...w, openings: w.openings.filter((o) => o.id !== selected.openingId) }
            : w,
        ),
      );
    }
    setSelected(null);
  }, [editLocked, selected, activeCameraViewId, pushUndoSnapshot]);

  const handleCopySelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === 'wall') {
      const w = walls.find((item) => item.id === selected.wallId);
      if (!w) return;
      setClipboard({
        kind: 'wall',
        length: wallLength(w),
        thickness: w.thickness,
        color: w.color,
      });
    } else if (selected.kind === 'opening') {
      const w = walls.find((item) => item.id === selected.wallId);
      const o = w?.openings.find((item) => item.id === selected.openingId);
      if (!o) return;
      const { id: _id, ...rest } = o;
      void _id;
      setClipboard({ kind: 'opening', opening: { ...rest } });
    } else if (selected.kind === 'junction') {
      const j = junctions.find((item) => item.id === selected.junctionId);
      if (!j) return;
      const { id: _id, ...rest } = j;
      void _id;
      setClipboard({
        kind: 'junction',
        junction: {
          ...rest,
          connectedWireIds: undefined,
          disconnectedWireIds: undefined,
          breakerStates: j.breakerStates ? { ...j.breakerStates } : undefined,
        },
      });
    } else if (selected.kind === 'fixture') {
      const f = fixtures.find((item) => item.id === selected.fixtureId);
      if (!f) return;
      const { id: _id, ...rest } = f;
      void _id;
      setClipboard({ kind: 'fixture', fixture: { ...rest } });
    } else if (selected.kind === 'security') {
      const d = securityDevices.find((item) => item.id === selected.securityId);
      if (!d) return;
      const { id: _id, ...rest } = d;
      void _id;
      setClipboard({ kind: 'security', device: { ...rest } });
    } else if (selected.kind === 'furniture') {
      const f = furniture.find((item) => item.id === selected.furnitureId);
      if (!f) return;
      const { id: _id, ...rest } = f;
      void _id;
      setClipboard({ kind: 'furniture', item: { ...rest } });
    } else if (selected.kind === 'wire') {
      const w = wires.find((item) => item.id === selected.wireId);
      if (!w) return;
      const { id: _id, ...rest } = w;
      void _id;
      setClipboard({
        kind: 'wire',
        wire: { ...rest, points: w.points.map((pt) => ({ ...pt })) },
      });
    } else if (selected.kind === 'pipe') {
      const p = pipes.find((item) => item.id === selected.pipeId);
      if (!p) return;
      const { id: _id, ...rest } = p;
      void _id;
      setClipboard({
        kind: 'pipe',
        pipe: { ...rest, points: p.points.map((pt) => ({ ...pt })) },
      });
    }
  }, [selected, walls, junctions, fixtures, securityDevices, furniture, wires, pipes]);

  const handleCutSelected = useCallback(() => {
    if (editLocked || !selected) return;
    handleCopySelected();
    handleDeleteSelected();
  }, [editLocked, selected, handleCopySelected, handleDeleteSelected]);

  const handlePasteAtTarget = useCallback(() => {
    if (editLocked || !clipboard) return;
    const rawTarget = pasteTargetRef.current?.() ?? { x: 0, z: 0 };
    const targetPt: Point2D = {
      x: Number.isFinite(rawTarget.x) ? Number(rawTarget.x.toFixed(3)) : 0,
      z: Number.isFinite(rawTarget.z) ? Number(rawTarget.z.toFixed(3)) : 0,
    };

    const findNearestWall = (pt: Point2D): { wall: WallSegment; offset: number } | null => {
      let best: { wall: WallSegment; offset: number; dist: number } | null = null;
      for (const w of walls) {
        const proj = projectPointOntoWall(pt, w);
        if (!best || proj.distance < best.dist) {
          best = { wall: w, offset: proj.offset, dist: proj.distance };
        }
      }
      return best ? { wall: best.wall, offset: best.offset } : null;
    };

    if (clipboard.kind === 'wall') {
      pushUndoSnapshot();
      const half = Math.max(0.4, clipboard.length / 2);
      const newWall: WallSegment = {
        id: makeId('wall'),
        start: { x: Number((targetPt.x - half).toFixed(3)), z: targetPt.z },
        end: { x: Number((targetPt.x + half).toFixed(3)), z: targetPt.z },
        thickness: clipboard.thickness,
        color: clipboard.color,
        openings: [],
      };
      setWalls((prev) => [...prev, newWall]);
      setShowStructure(true);
      setSelected({ kind: 'wall', wallId: newWall.id });
    } else if (clipboard.kind === 'opening') {
      const nearest = findNearestWall(targetPt);
      if (!nearest) return;
      const len = wallLength(nearest.wall);
      const wOp = Math.min(clipboard.opening.width, Math.max(0.4, len - 0.25));
      const clampedOffset = Math.max(
        wOp * 0.5 + 0.1,
        Math.min(len - wOp * 0.5 - 0.1, nearest.offset),
      );
      pushUndoSnapshot();
      const newOp: WallOpening = {
        ...clipboard.opening,
        id: makeId(clipboard.opening.type),
        width: wOp,
        offset: clampedOffset,
      };
      setWalls((prev) =>
        prev.map((w) =>
          w.id === nearest.wall.id ? { ...w, openings: [...w.openings, newOp] } : w,
        ),
      );
      setShowStructure(true);
      setSelected({ kind: 'opening', wallId: nearest.wall.id, openingId: newOp.id });
    } else if (clipboard.kind === 'junction') {
      if (clipboard.junction.kind === 'ceiling-light') {
        pushUndoSnapshot();
        const newJ: ElectricalJunction = {
          ...clipboard.junction,
          id: makeId('junc'),
          wallId: 'ceiling',
          offset: 0,
          x: targetPt.x,
          z: targetPt.z,
          breakerStates: clipboard.junction.breakerStates
            ? { ...clipboard.junction.breakerStates }
            : undefined,
        };
        setJunctions((prev) => [...prev, newJ]);
        setShowWiring(true);
        setShowInterior(true);
        setSelected({ kind: 'junction', junctionId: newJ.id });
      } else {
        const nearest = findNearestWall(targetPt);
        if (!nearest) return;
        const len = wallLength(nearest.wall);
        const clampedOffset = Math.max(0.12, Math.min(len - 0.12, nearest.offset));
        pushUndoSnapshot();
        const newJ: ElectricalJunction = {
          ...clipboard.junction,
          id: makeId('junc'),
          wallId: nearest.wall.id,
          offset: clampedOffset,
          x: undefined,
          z: undefined,
          breakerStates: clipboard.junction.breakerStates
            ? { ...clipboard.junction.breakerStates }
            : undefined,
        };
        setJunctions((prev) => [...prev, newJ]);
        setShowWiring(true);
        setSelected({ kind: 'junction', junctionId: newJ.id });
      }
    } else if (clipboard.kind === 'fixture') {
      const nearest = findNearestWall(targetPt);
      if (!nearest) return;
      const len = wallLength(nearest.wall);
      const clampedOffset = Math.max(0.15, Math.min(len - 0.15, nearest.offset));
      pushUndoSnapshot();
      const newFix: PlumbingFixture = {
        ...clipboard.fixture,
        id: makeId('fix'),
        wallId: nearest.wall.id,
        offset: clampedOffset,
      };
      setFixtures((prev) => [...prev, newFix]);
      setShowPlumbing(true);
      setSelected({ kind: 'fixture', fixtureId: newFix.id });
    } else if (clipboard.kind === 'security') {
      pushUndoSnapshot();
      const nearest = clipboard.device.wallId ? findNearestWall(targetPt) : null;
      const newDev: SecurityDevice = nearest
        ? {
            ...clipboard.device,
            id: makeId('sec'),
            wallId: nearest.wall.id,
            offset: Math.max(0.12, Math.min(wallLength(nearest.wall) - 0.12, nearest.offset)),
            x: targetPt.x,
            z: targetPt.z,
          }
        : {
            ...clipboard.device,
            id: makeId('sec'),
            wallId: undefined,
            offset: undefined,
            x: targetPt.x,
            z: targetPt.z,
          };
      setSecurityDevices((prev) => [...prev, newDev]);
      setShowSecurity(true);
      setSelected({ kind: 'security', securityId: newDev.id });
    } else if (clipboard.kind === 'furniture') {
      pushUndoSnapshot();
      const newItem: FurnitureItem = {
        ...clipboard.item,
        id: makeId('furn'),
        x: targetPt.x,
        z: targetPt.z,
      };
      setFurniture((prev) => [...prev, newItem]);
      setShowInterior(true);
      setSelected({ kind: 'furniture', furnitureId: newItem.id });
    } else if (clipboard.kind === 'wire') {
      if (clipboard.wire.points.length < 2) return;
      const cx =
        clipboard.wire.points.reduce((s, pt) => s + pt.x, 0) / clipboard.wire.points.length;
      const cz =
        clipboard.wire.points.reduce((s, pt) => s + pt.z, 0) / clipboard.wire.points.length;
      const dx = targetPt.x - cx;
      const dz = targetPt.z - cz;
      const shiftedPoints = clipboard.wire.points.map((pt) => ({
        x: Number((pt.x + dx).toFixed(3)),
        z: Number((pt.z + dz).toFixed(3)),
      }));
      pushUndoSnapshot();
      const newWire: ElectricalWire = {
        ...clipboard.wire,
        id: makeId('wire'),
        points: bindWirePointsToWalls(shiftedPoints, walls, junctions, wires),
      };
      setWires((prev) => [...prev, newWire]);
      setShowWiring(true);
      setSelected({ kind: 'wire', wireId: newWire.id });
    } else if (clipboard.kind === 'pipe') {
      if (clipboard.pipe.points.length < 2) return;
      const cx =
        clipboard.pipe.points.reduce((s, pt) => s + pt.x, 0) / clipboard.pipe.points.length;
      const cz =
        clipboard.pipe.points.reduce((s, pt) => s + pt.z, 0) / clipboard.pipe.points.length;
      const dx = targetPt.x - cx;
      const dz = targetPt.z - cz;
      const shiftedPoints = clipboard.pipe.points.map((pt) => ({
        x: Number((pt.x + dx).toFixed(3)),
        z: Number((pt.z + dz).toFixed(3)),
      }));
      pushUndoSnapshot();
      const newPipe: PlumbingPipe = {
        ...clipboard.pipe,
        id: makeId('pipe'),
        points: bindWirePointsToWalls(shiftedPoints, walls, fixtures, pipes),
      };
      setPipes((prev) => [...prev, newPipe]);
      setShowPlumbing(true);
      setSelected({ kind: 'pipe', pipeId: newPipe.id });
    }
  }, [editLocked, clipboard, walls, junctions, wires, fixtures, pipes, pushUndoSnapshot]);

  const handleChangeWallHeight = useCallback(
    (nextHeight: number) => {
      if (editLocked) return;
      setWallHeight(nextHeight);
      if (viewMode === '2d' && nextHeight > 0.15) {
        setViewMode('3d-orbit');
      }
    },
    [editLocked, viewMode],
  );

  const handleChangeDefaultThickness = useCallback(
    (nextThickness: number) => {
      if (editLocked) return;
      setDefaultThickness(nextThickness);
      setWalls((prev) => prev.map((w) => ({ ...w, thickness: nextThickness })));
    },
    [editLocked],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (!editLocked) {
          if (e.shiftKey) handleRedo();
          else handleUndo();
        }
      } else if (mod && key === 'y') {
        e.preventDefault();
        if (!editLocked) handleRedo();
      } else if (mod && key === 'c') {
        if (selected) {
          e.preventDefault();
          handleCopySelected();
        }
      } else if (mod && key === 'x') {
        if (selected && !editLocked) {
          e.preventDefault();
          handleCutSelected();
        }
      } else if (mod && key === 'v') {
        if (clipboard && !editLocked) {
          e.preventDefault();
          handlePasteAtTarget();
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        if (!editLocked) handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    editLocked,
    handleUndo,
    handleRedo,
    handleCopySelected,
    handleCutSelected,
    handlePasteAtTarget,
    handleDeleteSelected,
    selected,
    clipboard,
  ]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-slate-100 select-none">
      <BlueprintViewport
        walls={walls}
        wires={wires}
        junctions={junctions}
        pipes={pipes}
        fixtures={fixtures}
        securityDevices={securityDevices}
        furniture={furniture}
        customRoomNames={customRoomNames}
        wallHeight={wallHeight}
        defaultThickness={defaultThickness}
        defaultWallColor={defaultWallColor}
        floorColor={floorColor}
        floorStyle={floorStyle}
        editLocked={editLocked}
        viewMode={viewMode}
        activeTool={activeTool}
        activeWireCircuit={activeWireCircuit}
        activeBreakerLabel={activeBreakerLabel}
        activeCableSpec={activeCableSpec}
        activeWireMountRef={activeWireMountRef}
        activeWireDropFromTop={activeWireDropFromTop}
        activeWireHeight={activeWireHeight}
        activeJunctionKind={activeJunctionKind}
        activePipeType={activePipeType}
        activePipeSpec={activePipeSpec}
        activePipeLabel={activePipeLabel}
        activePipeMountRef={activePipeMountRef}
        activePipeDropFromTop={activePipeDropFromTop}
        activePipeHeight={activePipeHeight}
        activeFixtureKind={activeFixtureKind}
        activeSecurityKind={activeSecurityKind}
        activeFurnitureKind={activeFurnitureKind}
        activeCameraViewId={activeCameraViewId}
        testMotionActive={testMotionActive}
        selected={selected}
        showFloorPlate={exportConfig.includeBasePlate}
        showDimensions={showDimensions}
        showInnerDimensions={showInnerDimensions}
        showObjectDistances={showObjectDistances}
        showRoomAreas={showRoomAreas}
        showCeiling={showCeiling}
        ceilingMode={ceilingMode}
        showWalkDimensions={showWalkDimensions}
        walkerHeight={walkerHeight}
        cameraFov={cameraFov}
        cameraZoom={cameraZoom}
        showStructure={showStructure}
        showWiring={showWiring}
        showPlumbing={showPlumbing}
        showSecurity={showSecurity}
        showInterior={showInterior}
        showSecurityCoverage={showSecurityCoverage}
        xrayWalls={xrayWalls}
        snapMode={snapMode}
        fitViewTrigger={fitViewTrigger}
        cameraLocked={cameraLocked}
        resetCameraTrigger={resetCameraTrigger}
        openingDefaults={openingDefaults}
        isTouchDevice={isTouchViewport}
        walkMoveRef={walkMoveRef}
        onSelect={setSelected}
        onAddWall={handleAddWall}
        onAddWallRect={handleAddWallRect}
        onAddWire={handleAddWire}
        onMoveWireVertex={handleMoveWireVertex}
        onAddJunction={handleAddJunction}
        onUpdateJunction={handleUpdateJunction}
        onTogglePanelBreaker={handleTogglePanelBreaker}
        onMoveJunction={handleMoveJunction}
        onAddPipe={handleAddPipe}
        onAddFixture={handleAddFixture}
        onMoveFixture={handleMoveFixture}
        onAddSecurityDevice={handleAddSecurityDevice}
        onUpdateSecurityDevice={handleUpdateSecurityDevice}
        onMoveSecurityDevice={handleMoveSecurityDevice}
        onAddFurniture={handleAddFurniture}
        onMoveFurniture={handleMoveFurniture}
        onRenameRoom={handleRenameRoom}
        onChangeCameraZoom={setCameraZoom}
        onEnterCameraView={handleEnterCameraView}
        onExitCameraView={handleExitCameraView}
        onMoveCorner={handleMoveCorner}
        onMoveWall={handleMoveWall}
        onMoveOpening={handleMoveOpening}
        onResizeWall={handleResizeWall}
        onAddOpening={handleAddOpening}
        onUpdateOpeningWidth={handleUpdateOpeningWidth}
        onToggleOpeningOpen={handleToggleOpeningOpen}
        pointerLockRequestRef={pointerLockRequestRef}
        startWireAtPointRef={startWireAtPointRef}
        pasteTargetRef={pasteTargetRef}
        onPointerLockChange={setIsPointerLocked}
      />

      <TopBar
        viewMode={viewMode}
        activeCameraViewId={activeCameraViewId}
        activeTemplate={activeTemplate}
        savedTemplateIds={savedTemplateIds}
        snapMode={snapMode}
        cameraLocked={cameraLocked}
        editLocked={editLocked}
        canUndo={undoStack.length > 0 && !editLocked}
        canRedo={redoStack.length > 0 && !editLocked}
        isPointerLocked={isPointerLocked}
        onSetViewMode={handleSetViewMode}
        onOpenSummary={() => setCalculationsOpen(true)}
        onCycleSnapMode={handleCycleSnapMode}
        onFitView={() => setFitViewTrigger((n) => n + 1)}
        onToggleCameraLock={() => setCameraLocked((v) => !v)}
        onResetCamera={() => setResetCameraTrigger((n) => n + 1)}
        onToggleEditLocked={handleToggleEditLocked}
        onSelectTemplate={handleSelectTemplate}
        onResetTemplate={handleResetTemplate}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRequestPointerLock={() => pointerLockRequestRef.current?.()}
      />

      {importNotice && (
        <div
          role="status"
          className={`fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-lg text-xs font-medium shadow-lg border flex items-center gap-2 ${
            importNotice.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-500'
              : 'bg-red-900 text-white border-red-400'
          }`}
        >
          <span>{importNotice.message}</span>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="text-white/80 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <RightViewToggles
        viewMode={viewMode}
        hidden={rightPanelHidden}
        showStructure={showStructure}
        showWiring={showWiring}
        showPlumbing={showPlumbing}
        showSecurity={showSecurity}
        showInterior={showInterior}
        xrayWalls={xrayWalls}
        showRoomAreas={showRoomAreas}
        showRoomListCard={showRoomListCard}
        showCeiling={showCeiling}
        showDimensions={showDimensions}
        showInnerDimensions={showInnerDimensions}
        showWalkDimensions={showWalkDimensions}
        showObjectDistances={showObjectDistances}
        onToggleHidden={() => setRightPanelHidden((v) => !v)}
        onToggleStructure={() => setShowStructure((v) => !v)}
        onToggleWiring={() => setShowWiring((v) => !v)}
        onTogglePlumbing={() => setShowPlumbing((v) => !v)}
        onToggleSecurity={() => setShowSecurity((v) => !v)}
        onToggleInterior={() => setShowInterior((v) => !v)}
        onToggleXrayWalls={() => setXrayWalls((v) => !v)}
        onToggleRoomAreas={() => setShowRoomAreas((v) => !v)}
        onToggleRoomListCard={() => setShowRoomListCard((v) => !v)}
        onToggleCeiling={() => setShowCeiling((v) => !v)}
        onToggleDimensions={() => setShowDimensions((v) => !v)}
        onToggleInnerDimensions={() => setShowInnerDimensions((v) => !v)}
        onToggleWalkDimensions={() => setShowWalkDimensions((v) => !v)}
        onToggleObjectDistances={() => setShowObjectDistances((v) => !v)}
      />

      {/* Side Closed Room Surface Area Summary Card (Optional floating list; decoupled from in-room Areas badges) */}
      {showRoomAreas && showRoomListCard && !activeCameraViewId && !calculationsOpen && (
        <aside
          aria-label="Room surface areas"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="fixed top-16 left-3 md:left-[17.5rem] z-20 w-56 sm:w-60 rounded-xl bg-white/96 border border-slate-200 shadow-md overflow-hidden text-xs"
        >
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <LayoutGrid className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Room Areas</span>
            </div>
            <button
              type="button"
              onClick={() => setShowRoomListCard(false)}
              title="Close room list card (keeps in-room area labels visible)"
              aria-label="Close room list card"
              className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {closedRooms.length === 0 ? (
            <div className="px-3 py-2.5 text-[11px] text-slate-500 leading-snug">
              Connect walls into a closed loop to measure surface area.
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-100 max-h-52 overflow-y-auto">
                {closedRooms.map((room, rIdx) => (
                  <div
                    key={room.id}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-1.5"
                  >
                    <label className="flex items-center gap-1 min-w-0 flex-1">
                      <Pencil className="w-3 h-3 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        maxLength={24}
                        disabled={editLocked}
                        value={room.name}
                        placeholder={`Room ${rIdx + 1}`}
                        aria-label={`Rename ${room.name}`}
                        onChange={(e) => handleRenameRoom(room.id, e.target.value)}
                        className="w-full min-w-0 rounded border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white bg-transparent px-1 py-0.5 font-medium text-slate-800 focus:outline-none truncate disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </label>
                    <span className="font-mono-tabular font-semibold text-slate-900 shrink-0">
                      {room.netAreaSqM.toFixed(2)} m²
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 bg-teal-50/80 border-t border-teal-200 flex items-center justify-between gap-2">
                <span className="font-semibold text-teal-900">Total Area</span>
                <span className="font-mono-tabular font-bold text-teal-800 text-sm">
                  {totalRoomAreaSqM.toFixed(2)} m²
                </span>
              </div>
            </>
          )}
        </aside>
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
        rightPanelHidden={rightPanelHidden}
        onUpdateWallThickness={handleUpdateWallThickness}
        onUpdateWallColor={handleUpdateWallColor}
        onResizeWall={handleResizeWall}
        onUpdateOpening={handleUpdateOpening}
        onUpdateWire={handleUpdateWire}
        onUpdateJunction={handleUpdateJunction}
        onTogglePanelBreaker={handleTogglePanelBreaker}
        onUpdatePipe={handleUpdatePipe}
        onUpdateFixture={handleUpdateFixture}
        onUpdateSecurityDevice={handleUpdateSecurityDevice}
        onUpdateFurniture={handleUpdateFurniture}
        onEnterCameraView={handleEnterCameraView}
        onExitCameraView={handleExitCameraView}
        onSelectTarget={setSelected}
        onStartWireFromJunction={handleStartWireFromJunction}
        onToggleJunctionWireConnection={handleToggleJunctionWireConnection}
        onDisconnectWireSplice={handleDisconnectWireSplice}
        onDeleteSelected={handleDeleteSelected}
        onCloseSelection={() => setSelected(null)}
      />

      {viewMode === '3d-walk' && !activeCameraViewId && isTouchViewport && (
        <div className="fixed bottom-20 left-4 z-30 md:bottom-28 md:left-6">
          <TouchJoystick moveVectorRef={walkMoveRef} />
        </div>
      )}

      <ControlDock
        workspaceStep={workspaceStep}
        viewMode={viewMode}
        activeTool={activeTool}
        activeBreakerPresetId={activeBreakerPresetId}
        activeBreakerLabel={activeBreakerLabel}
        activeCableSpec={activeCableSpec}
        activeWireMountRef={activeWireMountRef}
        activeWireDropFromTop={activeWireDropFromTop}
        activeWireHeight={activeWireHeight}
        activeJunctionKind={activeJunctionKind}
        activePipePresetId={activePipePresetId}
        activePipeLabel={activePipeLabel}
        activePipeSpec={activePipeSpec}
        activePipeMountRef={activePipeMountRef}
        activePipeDropFromTop={activePipeDropFromTop}
        activePipeHeight={activePipeHeight}
        activeFixtureKind={activeFixtureKind}
        activeSecurityKind={activeSecurityKind}
        activeFurnitureKind={activeFurnitureKind}
        activeCameraViewId={activeCameraViewId}
        testMotionActive={testMotionActive}
        showStructure={showStructure}
        showWiring={showWiring}
        showPlumbing={showPlumbing}
        showSecurity={showSecurity}
        showInterior={showInterior}
        showSecurityCoverage={showSecurityCoverage}
        showRoomAreas={showRoomAreas}
        showCeiling={showCeiling}
        ceilingMode={ceilingMode}
        showWalkDimensions={showWalkDimensions}
        walkerHeight={walkerHeight}
        cameraFov={cameraFov}
        cameraZoom={cameraZoom}
        cameraLocked={cameraLocked}
        xrayWalls={xrayWalls}
        wallHeight={wallHeight}
        defaultThickness={defaultThickness}
        defaultWallColor={defaultWallColor}
        floorColor={floorColor}
        floorStyle={floorStyle}
        editLocked={editLocked}
        openingDefaults={openingDefaults}
        selected={selected}
        walls={walls}
        wires={wires}
        junctions={junctions}
        pipes={pipes}
        fixtures={fixtures}
        securityDevices={securityDevices}
        furniture={furniture}
        canUndo={undoStack.length > 0 && !editLocked}
        canRedo={redoStack.length > 0 && !editLocked}
        onChangeWorkspaceStep={handleChangeWorkspaceStep}
        onSelectTool={handleSelectTool}
        onSelectBreakerPreset={handleSelectBreakerPreset}
        onChangeBreakerLabel={setActiveBreakerLabel}
        onChangeCableSpec={setActiveCableSpec}
        onChangeWireMountRef={setActiveWireMountRef}
        onChangeWireDropFromTop={setActiveWireDropFromTop}
        onChangeWireHeight={setActiveWireHeight}
        onChangeJunctionKind={setActiveJunctionKind}
        onSelectPipePreset={handleSelectPipePreset}
        onChangePipeLabel={setActivePipeLabel}
        onChangePipeSpec={setActivePipeSpec}
        onChangePipeMountRef={setActivePipeMountRef}
        onChangePipeDropFromTop={setActivePipeDropFromTop}
        onChangePipeHeight={setActivePipeHeight}
        onChangeFixtureKind={setActiveFixtureKind}
        onChangeSecurityKind={setActiveSecurityKind}
        onChangeFurnitureKind={setActiveFurnitureKind}
        onToggleTestMotion={() => {
          setShowSecurity(true);
          setTestMotionActive((v) => !v);
        }}
        onEnterCameraView={handleEnterCameraView}
        onExitCameraView={handleExitCameraView}
        onToggleStructure={() => setShowStructure((v) => !v)}
        onToggleWiring={() => setShowWiring((v) => !v)}
        onTogglePlumbing={() => setShowPlumbing((v) => !v)}
        onToggleSecurity={() => setShowSecurity((v) => !v)}
        onToggleInterior={() => setShowInterior((v) => !v)}
        onToggleSecurityCoverage={() => setShowSecurityCoverage((v) => !v)}
        onToggleRoomAreas={() => setShowRoomAreas((v) => !v)}
        onToggleCeiling={() => setShowCeiling((v) => !v)}
        onChangeCeilingMode={handleChangeCeilingMode}
        onToggleWalkDimensions={() => setShowWalkDimensions((v) => !v)}
        onChangeWalkerHeight={setWalkerHeight}
        onChangeCameraFov={setCameraFov}
        onChangeCameraZoom={setCameraZoom}
        onToggleXrayWalls={() => setXrayWalls((v) => !v)}
        onOpenCalculations={() => setCalculationsOpen(true)}
        onChangeWallHeight={handleChangeWallHeight}
        onChangeDefaultThickness={handleChangeDefaultThickness}
        onChangeDefaultWallColor={handleChangeDefaultWallColor}
        onChangeFloorColor={handleChangeFloorColor}
        onChangeFloorStyle={handleChangeFloorStyle}
        onChangeOpeningDefault={handleChangeOpeningDefault}
        onUpdateWallThickness={handleUpdateWallThickness}
        onUpdateWallColor={handleUpdateWallColor}
        onResizeWall={handleResizeWall}
        onUpdateOpening={handleUpdateOpening}
        onUpdateWire={handleUpdateWire}
        onUpdateJunction={handleUpdateJunction}
        onTogglePanelBreaker={handleTogglePanelBreaker}
        onUpdatePipe={handleUpdatePipe}
        onUpdateFixture={handleUpdateFixture}
        onUpdateSecurityDevice={handleUpdateSecurityDevice}
        onUpdateFurniture={handleUpdateFurniture}
        onSelectTarget={setSelected}
        onStartWireFromJunction={handleStartWireFromJunction}
        onToggleJunctionWireConnection={handleToggleJunctionWireConnection}
        onDisconnectWireSplice={handleDisconnectWireSplice}
        onDeleteSelected={handleDeleteSelected}
        onCloseSelection={() => setSelected(null)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenExport={() => setExportOpen(true)}
      />

      <CalculationsModal
        open={calculationsOpen}
        walls={walls}
        rooms={closedRooms}
        wallHeight={wallHeight}
        wires={wires}
        junctions={junctions}
        pipes={pipes}
        fixtures={fixtures}
        securityDevices={securityDevices}
        furniture={furniture}
        editLocked={editLocked}
        onRenameRoom={handleRenameRoom}
        onUpdateFurniture={handleUpdateFurniture}
        onBatchUpdateOpenings={handleBatchUpdateOpenings}
        onSelectAndClose={(target) => {
          setSelected(target);
          if (target?.kind === 'wire' || target?.kind === 'junction') setShowWiring(true);
          if (target?.kind === 'pipe' || target?.kind === 'fixture') setShowPlumbing(true);
          if (target?.kind === 'security') setShowSecurity(true);
          if (target?.kind === 'furniture') setShowInterior(true);
          setCalculationsOpen(false);
        }}
        onViewCamera={handleEnterCameraView}
        onClose={() => setCalculationsOpen(false)}
      />

      <ExportModal
        open={exportOpen}
        walls={walls}
        wallHeight={wallHeight}
        config={exportConfig}
        onChangeConfig={(patch) => setExportConfig((prev) => ({ ...prev, ...patch }))}
        onClose={() => setExportOpen(false)}
      />
    </main>
  );
}
