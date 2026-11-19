import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { cloneWalls, findWalkthroughSpawn } from '../data/templates';
import {
  buildClipped2DWallOutlineVertices,
  computeAllPlumbingRenderData,
  computeAllWireRenderData,
  computeDraftRouteLength,
  computeDraftWireLength,
  computeFloorBounds,
  computeObjectClearances,
  computeSecurityCoverage,
  computeWallInnerDimensions,
  computeWallOuterDimensions,
  decomposeWallIntoBoxes,
  detectClosedRooms,
  distance2D,
  evaluateSecurityTriggers,
  getFixtureWorldInfo,
  getGridStepForSnapMode,
  getJunctionWorldInfo,
  getPanelBreakerCircuitSummaries,
  getPlumbingDisplayColor,
  getSecurityDeviceWorldInfo,
  getSecurityPlacementSnap,
  getWallEndpointExtensions,
  getWallOutwardSide,
  getWireDisplayColor,
  isInteriorMergedWall,
  isJunctionPoweredByBreaker,
  projectPointOntoWall,
  resolveEffectiveSnapMode,
  resolveMountElevation,
  resolveWalkthroughCollision,
  snapPointToGridAndEndpoints,
  wallAngleRad,
  wallLength,
  type WireSnapTarget,
} from '../geometry/wallDecomposition';
import {
  CABLE_SPEC_INFO,
  FURNITURE_KIND_INFO,
  isCameraSecurityDevice,
  isDoorOpening,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_SPEC_INFO,
  SECURITY_DEVICE_INFO,
  type CableSpec,
  type CeilingMode,
  type ElectricalJunction,
  type ElectricalWire,
  type FloorStyle,
  type FurnitureItem,
  type FurnitureKind,
  type JunctionKind,
  type OpeningDefaultsMap,
  type OpeningType,
  type PlumbingFixture,
  type PlumbingFixtureKind,
  type PlumbingPipe,
  type PlumbingPipeSpec,
  type PlumbingPipeType,
  type Point2D,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type SnapMode,
  type ToolMode,
  type ViewMode,
  type WallSegment,
  type WireCircuitType,
  type WireMountRef,
  type WirePoint,
} from '../types/plan';

function horizontalToVerticalFov(hFovDeg: number, aspect: number): number {
  const hRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(hFovDeg, 40, 172));
  const safeAspect = Math.max(0.45, aspect);
  const vRad = 2 * Math.atan(Math.tan(hRad * 0.5) / safeAspect);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vRad), 24, 152);
}

interface BlueprintViewportProps {
  walls: WallSegment[];
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture: FurnitureItem[];
  customRoomNames: Record<string, string>;
  wallHeight: number;
  defaultThickness: number;
  defaultWallColor: string;
  floorColor: string;
  floorStyle: FloorStyle;
  editLocked?: boolean;
  viewMode: ViewMode;
  activeTool: ToolMode;
  activeWireCircuit: WireCircuitType;
  activeBreakerLabel: string;
  activeCableSpec: CableSpec;
  activeWireMountRef: WireMountRef;
  activeWireDropFromTop: number;
  activeWireHeight: number;
  activeJunctionKind: JunctionKind;
  activePipeType: PlumbingPipeType;
  activePipeSpec: PlumbingPipeSpec;
  activePipeLabel: string;
  activePipeMountRef: WireMountRef;
  activePipeDropFromTop: number;
  activePipeHeight: number;
  activeFixtureKind: PlumbingFixtureKind;
  activeSecurityKind: SecurityDeviceKind;
  activeFurnitureKind: FurnitureKind;
  activeCameraViewId: string | null;
  testMotionActive: boolean;
  selected: SelectionTarget;
  showFloorPlate: boolean;
  showDimensions: boolean;
  showInnerDimensions: boolean;
  showObjectDistances: boolean;
  showRoomAreas: boolean;
  showCeiling: boolean;
  ceilingMode: CeilingMode;
  showWalkDimensions: boolean;
  walkerHeight: number;
  cameraFov: number;
  cameraZoom: number;
  showStructure: boolean;
  showWiring: boolean;
  showPlumbing: boolean;
  showSecurity: boolean;
  showSecurityCoverage: boolean;
  showInterior: boolean;
  xrayWalls: boolean;
  snapMode: SnapMode;
  fitViewTrigger: number;
  cameraLocked: boolean;
  resetCameraTrigger: number;
  openingDefaults: OpeningDefaultsMap;
  isTouchDevice: boolean;
  walkMoveRef: React.MutableRefObject<{ x: number; y: number }>;
  onSelect: (target: SelectionTarget) => void;
  onAddWall: (start: Point2D, end: Point2D) => void;
  onAddWallRect: (cornerA: Point2D, cornerB: Point2D) => void;
  onAddWire: (points: WirePoint[]) => void;
  onMoveWireVertex: (
    baseWires: ElectricalWire[],
    wireId: string,
    vertexIndex: number,
    nextPoint: WirePoint,
    commit: boolean,
  ) => void;
  onAddJunction: (wallId: string, offset: number, freePos?: Point2D) => void;
  onUpdateJunction: (junctionId: string, patch: Partial<ElectricalJunction>) => void;
  onTogglePanelBreaker?: (panelId: string, breakerLabel: string) => void;
  onMoveJunction: (
    baseJunctions: ElectricalJunction[],
    junctionId: string,
    targetWallId: string,
    newOffset: number,
    commit: boolean,
    freePos?: Point2D,
  ) => void;
  onAddPipe: (points: WirePoint[]) => void;
  onAddFixture: (wallId: string, offset: number) => void;
  onMoveFixture: (
    baseFixtures: PlumbingFixture[],
    fixtureId: string,
    targetWallId: string,
    newOffset: number,
    commit: boolean,
  ) => void;
  onAddSecurityDevice: (device: Omit<SecurityDevice, 'id'>) => void;
  onUpdateSecurityDevice: (deviceId: string, patch: Partial<SecurityDevice>) => void;
  onMoveSecurityDevice: (
    baseDevices: SecurityDevice[],
    deviceId: string,
    nextDevice: SecurityDevice,
    commit: boolean,
  ) => void;
  onAddFurniture: (itemData: Omit<FurnitureItem, 'id'>) => void;
  onMoveFurniture: (
    baseFurniture: FurnitureItem[],
    furnitureId: string,
    nextItem: FurnitureItem,
    commit: boolean,
  ) => void;
  onRenameRoom: (roomId: string, newName: string) => void;
  onChangeCameraZoom?: (zoom: number) => void;
  onEnterCameraView: (cameraId: string) => void;
  onExitCameraView: () => void;
  onMoveCorner: (
    baseWalls: WallSegment[],
    cornerPos: Point2D,
    nextPos: Point2D,
    onlyWallId: string | null,
    commit: boolean,
  ) => void;
  onMoveWall: (wallId: string, baseWalls: WallSegment[], dx: number, dz: number, commit: boolean) => void;
  onMoveOpening: (
    baseWalls: WallSegment[],
    sourceWallId: string,
    openingId: string,
    targetWallId: string,
    newOffset: number,
    commit: boolean,
  ) => void;
  onResizeWall: (wallId: string, newLength: number) => void;
  onAddOpening: (wallId: string, type: OpeningType, offset: number) => void;
  onUpdateOpeningWidth: (wallId: string, openingId: string, newWidth: number) => void;
  onToggleOpeningOpen: (wallId: string, openingId: string) => void;
  pointerLockRequestRef: React.MutableRefObject<(() => void) | null>;
  startWireAtPointRef?: React.MutableRefObject<((pt: Point2D) => void) | null>;
  pasteTargetRef?: React.MutableRefObject<(() => Point2D | null) | null>;
  onPointerLockChange?: (locked: boolean) => void;
}

interface LiveDimensionOverlay {
  screenX: number;
  screenY: number;
  label: string;
}

interface DimensionAnchor {
  id: string;
  worldPos: THREE.Vector3;
  text: string;
  numericValue: number;
  kind: 'wall' | 'opening' | 'inner';
  wallId: string;
  openingId?: string;
  extraOuterLength?: number;
  selected: boolean;
  minFrustum?: number;
}

interface ProjectedDimensionLabel {
  id: string;
  screenX: number;
  screenY: number;
  text: string;
  numericValue: number;
  kind: 'wall' | 'opening' | 'inner';
  wallId: string;
  openingId?: string;
  extraOuterLength?: number;
  selected: boolean;
}

interface EditingDimensionState {
  id: string;
  kind: 'wall' | 'opening' | 'inner';
  wallId: string;
  openingId?: string;
  originalClearValue?: number;
  extraOuterLength?: number;
  screenX: number;
  screenY: number;
  valueStr: string;
}

interface SecurityAnchor {
  id: string;
  securityId: string;
  worldPos: THREE.Vector3;
  text: string;
  selected: boolean;
  triggered: boolean;
  isCamera: boolean;
  color: string;
}

interface ProjectedSecurityLabel {
  id: string;
  securityId: string;
  screenX: number;
  screenY: number;
  text: string;
  selected: boolean;
  triggered: boolean;
  isCamera: boolean;
  color: string;
}

interface RoomAreaAnchor {
  id: string;
  roomId: string;
  worldPos: THREE.Vector3;
  name: string;
  areaSqM: number;
}

interface ProjectedRoomLabel {
  id: string;
  roomId: string;
  screenX: number;
  screenY: number;
  name: string;
  areaSqM: number;
}

interface WalkDimAnchor {
  id: string;
  worldPos: THREE.Vector3;
  text: string;
  badgeKind: 'wall' | 'opening' | 'room';
}

interface ClearanceAnchor {
  id: string;
  worldPos: THREE.Vector3;
  shortLabel: 'F' | 'B' | 'L' | 'R';
  text: string;
  targetLabel?: string;
}

interface ProjectedClearanceLabel {
  id: string;
  screenX: number;
  screenY: number;
  shortLabel: 'F' | 'B' | 'L' | 'R';
  text: string;
  targetLabel?: string;
}

interface FurnitureAnchor {
  id: string;
  furnitureId: string;
  worldPos: THREE.Vector3;
  text: string;
  selected: boolean;
}

interface ProjectedFurnitureLabel {
  id: string;
  furnitureId: string;
  screenX: number;
  screenY: number;
  text: string;
  selected: boolean;
}

interface ProjectedWalkDimLabel {
  id: string;
  screenX: number;
  screenY: number;
  text: string;
  badgeKind: 'wall' | 'opening' | 'room';
}

interface OpeningInteractMeta {
  wallId: string;
  openingId: string;
  type: OpeningType;
  isOpen: boolean;
}

interface OpeningAnimController {
  openingId: string;
  currentProgress: number;
  targetProgress: number;
  apply: (progress: number) => void;
}

function createArchitecturalGridTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, size, size);

  const step = size / 4;
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 16, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.22)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.08)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFloorTexture(
  style: FloorStyle,
  baseHex: string,
  anisotropy: number,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const baseColor = new THREE.Color(/^#[0-9a-f]{6}$/i.test(baseHex) ? baseHex : '#ddd7cc');
  const lum = baseColor.r * 0.299 + baseColor.g * 0.587 + baseColor.b * 0.114;
  const darkTint = baseColor.clone().multiplyScalar(0.8);
  const lightTint = baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.22);
  const groutColor =
    lum > 0.45 ? 'rgba(51, 65, 85, 0.28)' : 'rgba(226, 232, 240, 0.24)';
  const subtleColor =
    lum > 0.45 ? 'rgba(71, 85, 105, 0.14)' : 'rgba(203, 213, 225, 0.14)';

  ctx.fillStyle = `#${baseColor.getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  if (style === 'tile') {
    ctx.strokeStyle = subtleColor;
    ctx.lineWidth = 1.5;
    const half = size / 2;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, size);
    ctx.moveTo(0, half);
    ctx.lineTo(size, half);
    ctx.stroke();

    ctx.strokeStyle = groutColor;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, size, size);
  } else if (style === 'wood-parquet') {
    const plankCount = 4;
    const plankH = size / plankCount;
    for (let i = 0; i < plankCount; i++) {
      ctx.fillStyle = i % 2 === 0 ? `#${baseColor.getHexString()}` : `#${darkTint.getHexString()}`;
      ctx.fillRect(0, i * plankH, size, plankH);

      ctx.strokeStyle = subtleColor;
      ctx.lineWidth = 1;
      for (let g = 1; g <= 3; g++) {
        const y = i * plankH + (plankH * g) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }

      const jointX = i % 2 === 0 ? size * 0.5 : size * 0.25;
      ctx.strokeStyle = groutColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(jointX, i * plankH);
      ctx.lineTo(jointX, (i + 1) * plankH);
      ctx.moveTo(0, i * plankH);
      ctx.lineTo(size, i * plankH);
      ctx.stroke();
    }
  } else if (style === 'concrete') {
    for (let y = 0; y < size; y += 8) {
      for (let x = 0; x < size; x += 8) {
        const hash = ((x * 73856093) ^ (y * 19349663)) & 255;
        if (hash < 48) {
          ctx.fillStyle = subtleColor;
          ctx.fillRect(x, y, 4, 4);
        } else if (hash > 224) {
          ctx.fillStyle = `#${lightTint.getHexString()}22`;
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.strokeStyle = subtleColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, size, size);
  } else if (style === 'terrazzo') {
    for (let i = 0; i < 65; i++) {
      const rx = ((i * 53 + 17) % 244) + 6;
      const ry = ((i * 97 + 41) % 244) + 6;
      const rad = (i % 4) + 2;
      ctx.fillStyle =
        i % 3 === 0
          ? `#${darkTint.getHexString()}`
          : i % 3 === 1
            ? `#${lightTint.getHexString()}`
            : groutColor;
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'checker') {
    const half = size / 2;
    ctx.fillStyle = `#${darkTint.getHexString()}`;
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    ctx.strokeStyle = groutColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
      const mat = (obj as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat && !(mat as THREE.Material).userData?.shared) {
        mat.dispose();
      }
    });
  }
}

function openingShortCode(type: OpeningType): string {
  switch (type) {
    case 'door':
      return 'D';
    case 'double-door':
      return '2D';
    case 'sliding-door':
      return 'SD';
    case 'garage-door':
      return 'GD';
    case 'window':
      return 'W';
  }
}

function openingPreviewLabel(type: OpeningType, width: number): string {
  switch (type) {
    case 'door':
      return `Single Door (${width.toFixed(2)} m)`;
    case 'double-door':
      return `Double Door (${width.toFixed(2)} m)`;
    case 'sliding-door':
      return `Sliding Door (${width.toFixed(2)} m)`;
    case 'garage-door':
      return `Garage Door (${width.toFixed(2)} m)`;
    case 'window':
      return `Window (${width.toFixed(2)} m)`;
  }
}

function openingActionPrompt(meta: OpeningInteractMeta): string {
  const verb = meta.isOpen ? 'Close' : 'Open';
  switch (meta.type) {
    case 'door':
      return `${verb} Door`;
    case 'double-door':
      return `${verb} Double Door`;
    case 'sliding-door':
      return `${verb} Sliding Door`;
    case 'garage-door':
      return `${verb} Garage Door`;
    case 'window':
      return `${verb} Window`;
  }
}

export const BlueprintViewport: React.FC<BlueprintViewportProps> = ({
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
  editLocked = false,
  viewMode,
  activeTool,
  activeWireCircuit,
  activeBreakerLabel,
  activeCableSpec,
  activeWireMountRef,
  activeWireDropFromTop,
  activeWireHeight,
  activeJunctionKind,
  activePipeType,
  activePipeSpec,
  activePipeLabel,
  activePipeMountRef,
  activePipeDropFromTop,
  activePipeHeight,
  activeFixtureKind,
  activeSecurityKind,
  activeFurnitureKind,
  activeCameraViewId,
  testMotionActive,
  selected,
  showFloorPlate,
  showDimensions,
  showInnerDimensions,
  showObjectDistances,
  showRoomAreas,
  showCeiling,
  ceilingMode,
  showWalkDimensions,
  walkerHeight,
  cameraFov,
  cameraZoom,
  showStructure,
  showWiring,
  showPlumbing,
  showSecurity,
  showSecurityCoverage,
  showInterior,
  xrayWalls,
  snapMode,
  fitViewTrigger,
  cameraLocked,
  resetCameraTrigger,
  openingDefaults,
  isTouchDevice,
  walkMoveRef,
  onSelect,
  onAddWall,
  onAddWallRect,
  onAddWire,
  onMoveWireVertex,
  onAddJunction,
  onUpdateJunction,
  onTogglePanelBreaker,
  onMoveJunction,
  onAddPipe,
  onAddFixture,
  onMoveFixture,
  onAddSecurityDevice,
  onUpdateSecurityDevice,
  onMoveSecurityDevice,
  onAddFurniture,
  onMoveFurniture,
  onRenameRoom,
  onChangeCameraZoom,
  onEnterCameraView,
  onExitCameraView,
  onMoveCorner,
  onMoveWall,
  onMoveOpening,
  onResizeWall,
  onAddOpening,
  onUpdateOpeningWidth,
  onToggleOpeningOpen,
  pointerLockRequestRef,
  startWireAtPointRef,
  pasteTargetRef,
  onPointerLockChange,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [liveOverlay, setLiveOverlay] = useState<LiveDimensionOverlay | null>(null);
  const [dimLabels, setDimLabels] = useState<ProjectedDimensionLabel[]>([]);
  const [roomLabels, setRoomLabels] = useState<ProjectedRoomLabel[]>([]);
  const [walkDimLabels, setWalkDimLabels] = useState<ProjectedWalkDimLabel[]>([]);
  const [clearanceLabels, setClearanceLabels] = useState<ProjectedClearanceLabel[]>([]);
  const [furnitureLabels, setFurnitureLabels] = useState<ProjectedFurnitureLabel[]>([]);
  const [securityLabels, setSecurityLabels] = useState<ProjectedSecurityLabel[]>([]);
  const [editingDim, setEditingDim] = useState<EditingDimensionState | null>(null);
  const [editingRoom, setEditingRoom] = useState<{
    roomId: string;
    screenX: number;
    screenY: number;
    nameStr: string;
  } | null>(null);
  const [chainActive, setChainActive] = useState(false);
  const [wireChainActive, setWireChainActive] = useState(false);
  const [pipeChainActive, setPipeChainActive] = useState(false);
  const [touchReticle, setTouchReticle] = useState<{ x: number; y: number } | null>(null);
  const [pointerLockedState, setPointerLockedState] = useState(false);
  const [aimPrompt, setAimPrompt] = useState<string | null>(null);
  const [triggeredSummary, setTriggeredSummary] = useState<string[]>([]);

  const stateRef = useRef({
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
    editLocked,
    viewMode,
    activeTool,
    activeWireCircuit,
    activeBreakerLabel,
    activeCableSpec,
    activeWireMountRef,
    activeWireDropFromTop,
    activeWireHeight,
    activeJunctionKind,
    activePipeType,
    activePipeSpec,
    activePipeLabel,
    activePipeMountRef,
    activePipeDropFromTop,
    activePipeHeight,
    activeFixtureKind,
    activeSecurityKind,
    activeFurnitureKind,
    activeCameraViewId,
    testMotionActive,
    selected,
    showFloorPlate,
    showDimensions,
    showInnerDimensions,
    showObjectDistances,
    showRoomAreas,
    showCeiling,
    ceilingMode,
    showWalkDimensions,
    walkerHeight,
    cameraFov,
    cameraZoom,
    showStructure,
    showWiring,
    showPlumbing,
    showSecurity,
    showSecurityCoverage,
    showInterior,
    xrayWalls,
    snapMode,
    cameraLocked,
    openingDefaults,
    isTouchDevice,
  });
  stateRef.current = {
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
    editLocked,
    viewMode,
    activeTool,
    activeWireCircuit,
    activeBreakerLabel,
    activeCableSpec,
    activeWireMountRef,
    activeWireDropFromTop,
    activeWireHeight,
    activeJunctionKind,
    activePipeType,
    activePipeSpec,
    activePipeLabel,
    activePipeMountRef,
    activePipeDropFromTop,
    activePipeHeight,
    activeFixtureKind,
    activeSecurityKind,
    activeFurnitureKind,
    activeCameraViewId,
    testMotionActive,
    selected,
    showFloorPlate,
    showDimensions,
    showInnerDimensions,
    showObjectDistances,
    showRoomAreas,
    showCeiling,
    ceilingMode,
    showWalkDimensions,
    walkerHeight,
    cameraFov,
    cameraZoom,
    showStructure,
    showWiring,
    showPlumbing,
    showSecurity,
    showSecurityCoverage,
    showInterior,
    xrayWalls,
    snapMode,
    cameraLocked,
    openingDefaults,
    isTouchDevice,
  };

  const callbacksRef = useRef({
    onSelect,
    onAddWall,
    onAddWallRect,
    onAddWire,
    onMoveWireVertex,
    onAddJunction,
    onUpdateJunction,
    onTogglePanelBreaker,
    onMoveJunction,
    onAddPipe,
    onAddFixture,
    onMoveFixture,
    onAddSecurityDevice,
    onUpdateSecurityDevice,
    onMoveSecurityDevice,
    onAddFurniture,
    onMoveFurniture,
    onRenameRoom,
    onChangeCameraZoom,
    onEnterCameraView,
    onExitCameraView,
    onMoveCorner,
    onMoveWall,
    onMoveOpening,
    onResizeWall,
    onAddOpening,
    onUpdateOpeningWidth,
    onToggleOpeningOpen,
    onPointerLockChange,
  });
  callbacksRef.current = {
    onSelect,
    onAddWall,
    onAddWallRect,
    onAddWire,
    onMoveWireVertex,
    onAddJunction,
    onUpdateJunction,
    onTogglePanelBreaker,
    onMoveJunction,
    onAddPipe,
    onAddFixture,
    onMoveFixture,
    onAddSecurityDevice,
    onUpdateSecurityDevice,
    onMoveSecurityDevice,
    onAddFurniture,
    onMoveFurniture,
    onRenameRoom,
    onChangeCameraZoom,
    onEnterCameraView,
    onExitCameraView,
    onMoveCorner,
    onMoveWall,
    onMoveOpening,
    onResizeWall,
    onAddOpening,
    onUpdateOpeningWidth,
    onToggleOpeningOpen,
    onPointerLockChange,
  };

  const cancelDraftChainRef = useRef<(() => void) | null>(null);
  const commitWireDraftRef = useRef<(() => void) | null>(null);
  const commitPipeDraftRef = useRef<(() => void) | null>(null);
  const seedWireStartRef = useRef<((pt: Point2D) => void) | null>(null);
  const pendingWireStartRef = useRef<Point2D | null>(null);
  const rebuildHouseRef = useRef<(() => void) | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const switchViewModeRef = useRef<((mode: ViewMode, modeOpts?: { resetToOrigin?: boolean; fitPlan?: boolean }) => void) | null>(null);
  const syncCameraLockRef = useRef<((locked: boolean) => void) | null>(null);
  const syncWalkerHeightRef = useRef<((height: number) => void) | null>(null);
  const syncCameraLensRef = useRef<((fov: number, zoom: number) => void) | null>(null);
  const syncFloorTextureRef = useRef<((style: FloorStyle, color: string) => void) | null>(null);
  const cameraAnchorRef = useRef<Point2D>({ x: 0, z: 0 });
  const applyCameraViewRef = useRef<(() => void) | null>(null);
  const toggleCenterOpeningRef = useRef<(() => void) | null>(null);
  const openingProgressCacheRef = useRef<Map<string, number>>(new Map());
  const triggeredIdsRef = useRef<Set<string>>(new Set());
  const testMotionPosRef = useRef<Point2D | null>(null);

  useEffect(() => {
    if (!startWireAtPointRef) return;
    startWireAtPointRef.current = (pt: Point2D) => {
      pendingWireStartRef.current = { ...pt };
      seedWireStartRef.current?.(pt);
    };
  }, [startWireAtPointRef]);

  useEffect(() => {
    rebuildHouseRef.current?.();
    if (stateRef.current.activeCameraViewId) {
      applyCameraViewRef.current?.();
    }
    requestRenderRef.current?.();
  }, [
    walls,
    wires,
    junctions,
    pipes,
    fixtures,
    securityDevices,
    furniture,
    customRoomNames,
    wallHeight,
    defaultWallColor,
    floorColor,
    floorStyle,
    selected,
    showFloorPlate,
    showDimensions,
    showInnerDimensions,
    showObjectDistances,
    showRoomAreas,
    showCeiling,
    ceilingMode,
    showWalkDimensions,
    showStructure,
    showWiring,
    showPlumbing,
    showSecurity,
    showSecurityCoverage,
    showInterior,
    xrayWalls,
    viewMode,
    activeTool,
    activeCameraViewId,
    testMotionActive,
  ]);

  useEffect(() => {
    syncFloorTextureRef.current?.(floorStyle, floorColor);
  }, [floorStyle, floorColor]);

  useEffect(() => {
    syncWalkerHeightRef.current?.(walkerHeight);
  }, [walkerHeight]);

  useEffect(() => {
    syncCameraLensRef.current?.(cameraFov, cameraZoom);
  }, [cameraFov, cameraZoom]);

  useEffect(() => {
    setEditingDim(null);
    setEditingRoom(null);
    setAimPrompt(null);
    commitWireDraftRef.current?.();
    commitPipeDraftRef.current?.();
    cancelDraftChainRef.current?.();
    if (stateRef.current.activeCameraViewId) {
      applyCameraViewRef.current?.();
    } else {
      switchViewModeRef.current?.(viewMode);
    }
    if (pendingWireStartRef.current && stateRef.current.activeTool === 'wire') {
      const pt = pendingWireStartRef.current;
      pendingWireStartRef.current = null;
      seedWireStartRef.current?.(pt);
    }
    rebuildHouseRef.current?.();
    requestRenderRef.current?.();
  }, [viewMode, activeCameraViewId]);

  useEffect(() => {
    if (testMotionActive && !testMotionPosRef.current && walls.length > 0) {
      const bounds = computeFloorBounds(walls, 0);
      testMotionPosRef.current = {
        x: Number(bounds.centerX.toFixed(2)),
        z: Number(bounds.centerZ.toFixed(2)),
      };
    } else if (!testMotionActive) {
      testMotionPosRef.current = null;
    }
    rebuildHouseRef.current?.();
    requestRenderRef.current?.();
  }, [testMotionActive, walls]);

  useEffect(() => {
    if (fitViewTrigger > 0 && !stateRef.current.activeCameraViewId) {
      switchViewModeRef.current?.(stateRef.current.viewMode, { fitPlan: true });
      requestRenderRef.current?.();
    }
  }, [fitViewTrigger]);

  useEffect(() => {
    syncCameraLockRef.current?.(cameraLocked);
  }, [cameraLocked]);

  useEffect(() => {
    if (resetCameraTrigger > 0 && !stateRef.current.activeCameraViewId) {
      switchViewModeRef.current?.(stateRef.current.viewMode, { resetToOrigin: true, fitPlan: true });
      requestRenderRef.current?.();
    }
  }, [resetCameraTrigger]);

  useEffect(() => {
    if (
      activeTool !== 'wall' &&
      activeTool !== 'wall-rect' &&
      activeTool !== 'wire' &&
      activeTool !== 'pipe'
    ) {
      commitWireDraftRef.current?.();
      commitPipeDraftRef.current?.();
      cancelDraftChainRef.current?.();
    } else if (activeTool === 'wire' && pendingWireStartRef.current) {
      const pt = pendingWireStartRef.current;
      pendingWireStartRef.current = null;
      seedWireStartRef.current?.(pt);
    }
    requestRenderRef.current?.();
  }, [activeTool]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL is unavailable on this browser.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    container.appendChild(renderer.domElement);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / Math.max(1, height);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f6f8);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Cameras
    let orthoFrustum = 14;
    const orthoCenter = new THREE.Vector2(0, 0);
    const orthoCamera = new THREE.OrthographicCamera(
      (-orthoFrustum * aspect) / 2,
      (orthoFrustum * aspect) / 2,
      orthoFrustum / 2,
      -orthoFrustum / 2,
      0.1,
      120,
    );
    orthoCamera.position.set(0, 32, 0);
    orthoCamera.up.set(0, 0, -1);
    orthoCamera.lookAt(0, 0, 0);

    const perspCamera = new THREE.PerspectiveCamera(60, aspect, 0.05, 160);
    perspCamera.position.set(8, 7.5, 10.5);

    const orbitControls = new OrbitControls(perspCamera, renderer.domElement);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.08;
    orbitControls.screenSpacePanning = false;
    orbitControls.enablePan = !stateRef.current.cameraLocked;
    orbitControls.maxPolarAngle = Math.PI * 0.485;
    orbitControls.minDistance = 2;
    orbitControls.maxDistance = 42;
    orbitControls.target.set(0, 1.2, 0);
    orbitControls.enabled = false;

    // Studio Daylight Rig (calibrated 3-point bounce so indoor depth & contrast read naturally)
    const hemiLight = new THREE.HemisphereLight(0xeef4ff, 0xd4cdc0, 1.2);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.85);
    keyLight.position.set(11, 18, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.48);
    rimLight.position.set(-10, 9, -11);
    scene.add(rimLight);

    // Architectural Grid & Ground Plane
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const gridTex = createArchitecturalGridTexture(maxAniso);
    let currentFloorTex = createFloorTexture(
      stateRef.current.floorStyle,
      stateRef.current.floorColor,
      maxAniso,
    );
    const groundMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.96,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.004;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const contactShadowTex = createContactShadowTexture();
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const contactShadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), contactShadowMat);
    contactShadowPlane.rotation.x = -Math.PI / 2;
    contactShadowPlane.position.y = 0.001;
    scene.add(contactShadowPlane);

    // Shared materials
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xeae6df,
      roughness: 0.86,
      metalness: 0.02,
    });
    wallMat.userData.shared = true;

    const wall2DPocheMat = new THREE.MeshBasicMaterial({ color: 0xd6d1c7 });
    wall2DPocheMat.userData.shared = true;

    const wallSelectedMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.72,
      metalness: 0.05,
    });
    wallSelectedMat.userData.shared = true;

    const wallCapLineMat = new THREE.LineBasicMaterial({ color: 0x1e293b });
    wallCapLineMat.userData.shared = true;

    const floorSlabMat = new THREE.MeshStandardMaterial({
      map: currentFloorTex,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.0,
    });
    floorSlabMat.userData.shared = true;

    syncFloorTextureRef.current = (style, hex) => {
      const next = createFloorTexture(style, hex, maxAniso);
      floorSlabMat.map = next;
      floorSlabMat.needsUpdate = true;
      currentFloorTex.dispose();
      currentFloorTex = next;
      rebuildHouseRef.current?.();
      requestRenderRef.current?.();
    };

    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.9,
      metalness: 0.0,
    });
    ceilingMat.userData.shared = true;

    const ceilingXrayMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.85,
      metalness: 0.0,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    ceilingXrayMat.userData.shared = true;

    const roofExteriorMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.72,
      metalness: 0.08,
    });
    roofExteriorMat.userData.shared = true;

    const roofRidgeMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.65,
      metalness: 0.12,
    });
    roofRidgeMat.userData.shared = true;

    const rafterWoodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5e34,
      roughness: 0.72,
      metalness: 0.04,
    });
    rafterWoodMat.userData.shared = true;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.42,
      metalness: 0.35,
    });
    frameMat.userData.shared = true;

    const frameSelectedMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.3,
    });
    frameSelectedMat.userData.shared = true;

    const sashFrameMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.55,
      metalness: 0.08,
    });
    sashFrameMat.userData.shared = true;

    const doorLeafMat = new THREE.MeshStandardMaterial({
      color: 0x9a6b43,
      roughness: 0.65,
      metalness: 0.05,
    });
    doorLeafMat.userData.shared = true;

    const garagePanelMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.45,
      metalness: 0.25,
    });
    garagePanelMat.userData.shared = true;

    const garageSeamMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.45,
    });
    garageSeamMat.userData.shared = true;

    const garageTrackMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.35,
      metalness: 0.72,
    });
    garageTrackMat.userData.shared = true;

    const handleBrassMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.3,
      metalness: 0.75,
    });
    handleBrassMat.userData.shared = true;

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: isSoftwareGl ? 0.32 : 0.24,
      roughness: 0.08,
      metalness: 0.05,
      ior: 1.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    glassMat.userData.shared = true;

    const cadDarkMat = new THREE.LineBasicMaterial({ color: 0x0f172a });
    cadDarkMat.userData.shared = true;

    const cadDoorArcMat = new THREE.LineBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.85,
    });
    cadDoorArcMat.userData.shared = true;

    const cadSelectedSymbolMat = new THREE.LineBasicMaterial({ color: 0xd97706 });
    cadSelectedSymbolMat.userData.shared = true;

    const cadWindowMat = new THREE.LineBasicMaterial({ color: 0x0284c7 });
    cadWindowMat.userData.shared = true;

    const dimLineMat = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.85,
    });
    dimLineMat.userData.shared = true;

    const dimTickMat = new THREE.LineBasicMaterial({ color: 0x1e293b });
    dimTickMat.userData.shared = true;

    const clearanceLineMat = new THREE.LineBasicMaterial({
      color: 0x7c3aed,
      transparent: true,
      opacity: 0.95,
    });
    clearanceLineMat.userData.shared = true;

    const clearanceTickMat = new THREE.LineBasicMaterial({ color: 0x5b21b6 });
    clearanceTickMat.userData.shared = true;

    const innerDimLineMat = new THREE.LineBasicMaterial({
      color: 0x0f766e,
      transparent: true,
      opacity: 0.9,
    });
    innerDimLineMat.userData.shared = true;

    const innerDimTickMat = new THREE.LineBasicMaterial({ color: 0x115e59 });
    innerDimTickMat.userData.shared = true;

    const openingDimLineMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.92,
    });
    openingDimLineMat.userData.shared = true;

    const openingDimTickMat = new THREE.LineBasicMaterial({ color: 0x0369a1 });
    openingDimTickMat.userData.shared = true;

    const guideLineMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.85,
    });
    guideLineMat.userData.shared = true;

    const handleMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });
    handleMat.userData.shared = true;

    const cornerNodeMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
    cornerNodeMat.userData.shared = true;

    const wallColorMats3D = new Map<string, THREE.MeshStandardMaterial>();
    const wallColorMatsXray3D = new Map<string, THREE.MeshStandardMaterial>();
    const wallColorMats2D = new Map<string, THREE.MeshBasicMaterial>();
    const wallColorMatsXray2D = new Map<string, THREE.MeshBasicMaterial>();
    const wireColorMats = new Map<string, THREE.MeshStandardMaterial>();

    const wallXraySelectedMat = new THREE.MeshStandardMaterial({
      color: 0xfde68a,
      roughness: 0.72,
      metalness: 0.05,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    });
    wallXraySelectedMat.userData.shared = true;

    const wallXrayEdgeMat = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.55,
    });
    wallXrayEdgeMat.userData.shared = true;

    const wireSelectedMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0x78350f,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.25,
    });
    wireSelectedMat.userData.shared = true;

    const getWireMaterial = (hex: string): THREE.MeshStandardMaterial => {
      const key = hex.toLowerCase();
      let mat = wireColorMats.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          roughness: 0.42,
          metalness: 0.2,
        });
        mat.userData.shared = true;
        wireColorMats.set(key, mat);
      }
      return mat;
    };

    const getWall3DMaterial = (hex: string, xray = false): THREE.MeshStandardMaterial => {
      const key = hex.toLowerCase();
      const map = xray ? wallColorMatsXray3D : wallColorMats3D;
      let mat = map.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          roughness: 0.86,
          metalness: 0.02,
          ...(xray ? { transparent: true, opacity: 0.24, depthWrite: false } : {}),
        });
        mat.userData.shared = true;
        map.set(key, mat);
      }
      return mat;
    };

    const getWall2DMaterial = (hex: string, xray = false): THREE.MeshBasicMaterial => {
      const key = hex.toLowerCase();
      const map = xray ? wallColorMatsXray2D : wallColorMats2D;
      let mat = map.get(key);
      if (!mat) {
        const tinted = new THREE.Color(hex).lerp(new THREE.Color('#e2e8f0'), 0.22);
        mat = new THREE.MeshBasicMaterial({
          color: tinted,
          ...(xray ? { transparent: true, opacity: 0.28, depthWrite: false } : {}),
        });
        mat.userData.shared = true;
        map.set(key, mat);
      }
      return mat;
    };

    // Scene groups
    const houseGroup = new THREE.Group();
    scene.add(houseGroup);

    const wireGroup = new THREE.Group();
    scene.add(wireGroup);

    const plumbingGroup = new THREE.Group();
    scene.add(plumbingGroup);

    const securityGroup = new THREE.Group();
    scene.add(securityGroup);

    const furnitureGroup = new THREE.Group();
    scene.add(furnitureGroup);

    const dimensionGroup = new THREE.Group();
    scene.add(dimensionGroup);

    const clearanceGroup = new THREE.Group();
    scene.add(clearanceGroup);

    const handleGroup = new THREE.Group();
    scene.add(handleGroup);

    const previewGroup = new THREE.Group();
    scene.add(previewGroup);

    const dimensionAnchorsRef: { current: DimensionAnchor[] } = { current: [] };
    const roomAnchorsRef: { current: RoomAreaAnchor[] } = { current: [] };
    const walkDimAnchorsRef: { current: WalkDimAnchor[] } = { current: [] };
    const clearanceAnchorsRef: { current: ClearanceAnchor[] } = { current: [] };
    const furnitureAnchorsRef: { current: FurnitureAnchor[] } = { current: [] };
    const opaqueWallMeshesRef: { current: THREE.Object3D[] } = { current: [] };
    const securityAnchorsRef: { current: SecurityAnchor[] } = { current: [] };
    const openingAnimControllersRef: { current: OpeningAnimController[] } = { current: [] };

    const _projVec = new THREE.Vector3();
    const _occRayOrigin = new THREE.Vector3();
    const _occRayDir = new THREE.Vector3();
    const _occRaycaster = new THREE.Raycaster();
    let lastWalkProjKey = '';
    let lastRoomProjKey = '';
    let lastClearanceProjKey = '';
    let lastFurnitureProjKey = '';

    const updateRoomProjectedLabels = () => {
      const {
        viewMode: curView,
        showRoomAreas: curShowRoomAreas,
        showStructure: curShowStructure,
        activeCameraViewId: curCamViewId,
        xrayWalls: curXray,
      } = stateRef.current;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      if (!curShowRoomAreas || !curShowStructure || curCamViewId) {
        if (lastRoomProjKey !== '') {
          lastRoomProjKey = '';
          setRoomLabels([]);
        }
        return;
      }

      if (curView === '2d') {
        if (orthoFrustum > 42) {
          if (lastRoomProjKey !== '') {
            lastRoomProjKey = '';
            setRoomLabels([]);
          }
          return;
        }
        const roomProj: ProjectedRoomLabel[] = [];
        for (const ra of roomAnchorsRef.current) {
          const v = ra.worldPos.clone().project(orthoCamera);
          if (v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
          roomProj.push({
            id: ra.id,
            roomId: ra.roomId,
            screenX: Math.round(((v.x + 1) * 0.5) * rect.width),
            screenY: Math.round((-(v.y - 1) * 0.5) * rect.height),
            name: ra.name,
            areaSqM: ra.areaSqM,
          });
        }
        const nextKey = roomProj.map((r) => `${r.id}:${r.screenX},${r.screenY}:${r.name}:${r.areaSqM}`).join('|');
        if (nextKey !== lastRoomProjKey) {
          lastRoomProjKey = nextKey;
          setRoomLabels(roomProj);
        }
        return;
      }

      if (curView === '3d-walk' || curView === '3d-orbit') {
        perspCamera.updateMatrixWorld(true);
        const isOrbit = curView === '3d-orbit';
        const wallObjs = !curXray && !isOrbit ? opaqueWallMeshesRef.current : [];
        const maxDist = isOrbit ? 42 : 24;
        const roomProj: ProjectedRoomLabel[] = [];

        for (const ra of roomAnchorsRef.current) {
          const dist = perspCamera.position.distanceTo(ra.worldPos);
          if (dist < 0.75 || dist > maxDist) continue;
          _projVec.copy(ra.worldPos).project(perspCamera);
          if (_projVec.z <= 0 || _projVec.z >= 1) continue;
          if (_projVec.x < -0.92 || _projVec.x > 0.92 || _projVec.y < -0.88 || _projVec.y > 0.88) {
            continue;
          }
          if (wallObjs.length > 0) {
            _occRayOrigin.copy(perspCamera.position);
            _occRayDir.copy(ra.worldPos).sub(_occRayOrigin).normalize();
            _occRaycaster.set(_occRayOrigin, _occRayDir);
            _occRaycaster.far = Math.max(0.1, dist - 0.35);
            if (_occRaycaster.intersectObjects(wallObjs, false).length > 0) continue;
          }
          roomProj.push({
            id: ra.id,
            roomId: ra.roomId,
            screenX: Math.round(((_projVec.x + 1) * 0.5) * rect.width),
            screenY: Math.round((-(_projVec.y - 1) * 0.5) * rect.height),
            name: ra.name,
            areaSqM: ra.areaSqM,
          });
        }

        const nextKey = roomProj.map((r) => `${r.id}:${r.screenX},${r.screenY}:${r.name}:${r.areaSqM}`).join('|');
        if (nextKey !== lastRoomProjKey) {
          lastRoomProjKey = nextKey;
          setRoomLabels(roomProj);
        }
      }
    };

    const updateClearanceAndFurnitureLabels = () => {
      const {
        viewMode: curView,
        showObjectDistances: curShowDistances,
        showInterior: curShowInterior,
        activeCameraViewId: curCamViewId,
      } = stateRef.current;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      if (!curShowDistances || curCamViewId || clearanceAnchorsRef.current.length === 0) {
        if (lastClearanceProjKey !== '') {
          lastClearanceProjKey = '';
          setClearanceLabels([]);
        }
      } else {
        const cam = curView === '2d' ? orthoCamera : perspCamera;
        if (curView !== '2d') perspCamera.updateMatrixWorld(true);
        const clrProj: ProjectedClearanceLabel[] = [];
        for (const ca of clearanceAnchorsRef.current) {
          _projVec.copy(ca.worldPos).project(cam);
          if (curView !== '2d' && (_projVec.z <= 0 || _projVec.z >= 1)) continue;
          if (_projVec.x < -0.98 || _projVec.x > 0.98 || _projVec.y < -0.96 || _projVec.y > 0.96) {
            continue;
          }
          clrProj.push({
            id: ca.id,
            screenX: Math.round(((_projVec.x + 1) * 0.5) * rect.width),
            screenY: Math.round((-(_projVec.y - 1) * 0.5) * rect.height),
            shortLabel: ca.shortLabel,
            text: ca.text,
            targetLabel: ca.targetLabel,
          });
        }
        const nextKey = clrProj.map((c) => `${c.id}:${c.screenX},${c.screenY}:${c.text}`).join('|');
        if (nextKey !== lastClearanceProjKey) {
          lastClearanceProjKey = nextKey;
          setClearanceLabels(clrProj);
        }
      }

      if (
        !curShowInterior ||
        curCamViewId ||
        furnitureAnchorsRef.current.length === 0 ||
        (curView === '2d' && orthoFrustum > 28)
      ) {
        if (lastFurnitureProjKey !== '') {
          lastFurnitureProjKey = '';
          setFurnitureLabels([]);
        }
      } else {
        const cam = curView === '2d' ? orthoCamera : perspCamera;
        if (curView !== '2d') perspCamera.updateMatrixWorld(true);
        const furnProj: ProjectedFurnitureLabel[] = [];
        for (const fa of furnitureAnchorsRef.current) {
          if (curView !== '2d' && !fa.selected) continue;
          _projVec.copy(fa.worldPos).project(cam);
          if (curView !== '2d' && (_projVec.z <= 0 || _projVec.z >= 1)) continue;
          if (_projVec.x < -0.96 || _projVec.x > 0.96 || _projVec.y < -0.94 || _projVec.y > 0.94) {
            continue;
          }
          furnProj.push({
            id: fa.id,
            furnitureId: fa.furnitureId,
            screenX: Math.round(((_projVec.x + 1) * 0.5) * rect.width),
            screenY: Math.round((-(_projVec.y - 1) * 0.5) * rect.height),
            text: fa.text,
            selected: fa.selected,
          });
        }
        const nextKey = furnProj
          .map((f) => `${f.id}:${f.screenX},${f.screenY}:${f.text}:${f.selected ? 1 : 0}`)
          .join('|');
        if (nextKey !== lastFurnitureProjKey) {
          lastFurnitureProjKey = nextKey;
          setFurnitureLabels(furnProj);
        }
      }
    };

    const updateWalkProjectedDimensions = () => {
      const {
        viewMode: curView,
        showWalkDimensions: curShowWalkDims,
        showStructure: curShowStructure,
        activeCameraViewId: curCamViewId,
        xrayWalls: curXray,
      } = stateRef.current;

      updateRoomProjectedLabels();
      updateClearanceAndFurnitureLabels();

      const is3DMode = curView === '3d-walk' || curView === '3d-orbit';
      if (!is3DMode || !curShowWalkDims || !curShowStructure || curCamViewId) {
        if (lastWalkProjKey !== '') {
          lastWalkProjKey = '';
          setWalkDimLabels([]);
        }
        return;
      }

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      perspCamera.updateMatrixWorld(true);
      const isOrbit = curView === '3d-orbit';
      const wallObjs = !curXray && !isOrbit ? opaqueWallMeshesRef.current : [];
      const maxDist = isOrbit ? 38 : 12.5;
      const candidates: Array<ProjectedWalkDimLabel & { dist: number }> = [];

      for (const anchor of walkDimAnchorsRef.current) {
        const dist = perspCamera.position.distanceTo(anchor.worldPos);
        if (dist < 0.6 || dist > maxDist) continue;

        _projVec.copy(anchor.worldPos).project(perspCamera);
        if (_projVec.z <= 0 || _projVec.z >= 1) continue;
        if (_projVec.x < -0.94 || _projVec.x > 0.94 || _projVec.y < -0.9 || _projVec.y > 0.9) {
          continue;
        }

        if (wallObjs.length > 0) {
          _occRayOrigin.copy(perspCamera.position);
          _occRayDir.copy(anchor.worldPos).sub(_occRayOrigin).normalize();
          _occRaycaster.set(_occRayOrigin, _occRayDir);
          _occRaycaster.far = Math.max(0.1, dist - 0.35);
          const hits = _occRaycaster.intersectObjects(wallObjs, false);
          if (hits.length > 0) continue;
        }

        candidates.push({
          id: anchor.id,
          screenX: Math.round(((_projVec.x + 1) * 0.5) * rect.width),
          screenY: Math.round((-(_projVec.y - 1) * 0.5) * rect.height),
          text: anchor.text,
          badgeKind: anchor.badgeKind,
          dist,
        });
      }

      candidates.sort((a, b) => a.dist - b.dist);
      // Light screen-space decluttering so labels near overlapping corners never pile up
      const kept: ProjectedWalkDimLabel[] = [];
      const limit = isOrbit ? 22 : 16;
      for (const cand of candidates) {
        if (kept.length >= limit) break;
        const collides = kept.some(
          (k) => Math.abs(k.screenX - cand.screenX) < 76 && Math.abs(k.screenY - cand.screenY) < 22,
        );
        if (!collides) {
          kept.push({
            id: cand.id,
            screenX: cand.screenX,
            screenY: cand.screenY,
            text: cand.text,
            badgeKind: cand.badgeKind,
          });
        }
      }
      const nextKey = kept.map((l) => `${l.id}:${l.screenX},${l.screenY}:${l.text}`).join('|');
      if (nextKey !== lastWalkProjKey) {
        lastWalkProjKey = nextKey;
        setWalkDimLabels(kept);
      }
    };

    const updateProjectedDimensions = () => {
      const {
        viewMode: curView,
        showDimensions: showDims,
        showStructure: curShowStructure,
        showSecurity: curShowSecurity,
        showSecurityCoverage: curShowCov,
      } = stateRef.current;

      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;

      if (curView !== '2d' || !showDims || !curShowStructure) {
        setDimLabels([]);
      } else {
        const projected: ProjectedDimensionLabel[] = [];
        for (const anchor of dimensionAnchorsRef.current) {
          if (anchor.minFrustum !== undefined && orthoFrustum > anchor.minFrustum && !anchor.selected) {
            continue;
          }
          const v = anchor.worldPos.clone().project(orthoCamera);
          if (v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
          projected.push({
            id: anchor.id,
            screenX: ((v.x + 1) * 0.5) * rect.width,
            screenY: (-(v.y - 1) * 0.5) * rect.height,
            text: anchor.text,
            numericValue: anchor.numericValue,
            kind: anchor.kind,
            wallId: anchor.wallId,
            openingId: anchor.openingId,
            extraOuterLength: anchor.extraOuterLength,
            selected: anchor.selected,
          });
        }
        setDimLabels(projected);
      }

      updateRoomProjectedLabels();

      if (curView !== '2d' || !curShowSecurity || !curShowCov || orthoFrustum > 30) {
        setSecurityLabels([]);
      } else {
        const secProj: ProjectedSecurityLabel[] = [];
        for (const sa of securityAnchorsRef.current) {
          const v = sa.worldPos.clone().project(orthoCamera);
          if (v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) continue;
          secProj.push({
            id: sa.id,
            securityId: sa.securityId,
            screenX: ((v.x + 1) * 0.5) * rect.width,
            screenY: (-(v.y - 1) * 0.5) * rect.height,
            text: sa.text,
            selected: sa.selected,
            triggered: sa.triggered,
            isCamera: sa.isCamera,
            color: sa.color,
          });
        }
        setSecurityLabels(secProj);
      }

      updateWalkProjectedDimensions();
    };

    const walkState = {
      position: new THREE.Vector3(0, 1.65, 2.5),
      yaw: 0,
      pitch: -0.05,
    };

    const freeFlyState = {
      yaw: 0,
      pitch: -0.35,
    };
    let flyDragLook = false;
    const _flyEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const _flyForward = new THREE.Vector3();
    const _flyRight = new THREE.Vector3();

    const syncFreeFlyFromCamera = () => {
      _flyEuler.setFromQuaternion(perspCamera.quaternion, 'YXZ');
      freeFlyState.yaw = _flyEuler.y;
      freeFlyState.pitch = THREE.MathUtils.clamp(_flyEuler.x, -1.42, 1.42);
    };

    let orbitTargetGoal: THREE.Vector3 | null = null;
    let orbitCamGoal: THREE.Vector3 | null = null;

    const tagOpeningHierarchy = (
      obj: THREE.Object3D,
      pickTarget: SelectionTarget,
      interactMeta: OpeningInteractMeta,
    ) => {
      obj.traverse((child) => {
        child.userData.pickTarget = pickTarget;
        child.userData.openingInteract = interactMeta;
      });
    };

    const add2DArchitecturalSymbol = (
      wallGroup: THREE.Group,
      wallId: string,
      wallThick: number,
      opening: WallSegment['openings'][number],
      clampedOffset: number,
      clampedWidth: number,
      symY: number,
      isOpSelected: boolean,
    ) => {
      const swing = opening.swingSide ?? 1;
      const halfW = clampedWidth * 0.5;
      const halfT = wallThick * 0.5;
      const symMat = isOpSelected ? cadSelectedSymbolMat : cadDarkMat;
      const arcMat = isOpSelected ? cadSelectedSymbolMat : cadDoorArcMat;

      const pickProxy = new THREE.Mesh(
        new THREE.BoxGeometry(clampedWidth, 0.16, Math.max(wallThick + 0.12, 0.4)),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      pickProxy.position.set(clampedOffset, symY * 0.5, 0);
      pickProxy.userData.pickTarget = {
        kind: 'opening',
        wallId,
        openingId: opening.id,
      } satisfies SelectionTarget;
      wallGroup.add(pickProxy);

      const jambVerts = new Float32Array([
        clampedOffset - halfW, symY, -halfT,
        clampedOffset - halfW, symY, halfT,
        clampedOffset + halfW, symY, -halfT,
        clampedOffset + halfW, symY, halfT,
      ]);
      const jambGeo = new THREE.BufferGeometry();
      jambGeo.setAttribute('position', new THREE.BufferAttribute(jambVerts, 3));
      wallGroup.add(new THREE.LineSegments(jambGeo, symMat));

      if (opening.type === 'door') {
        const hingeDir = opening.hingeSide === 'right' ? 1 : -1;
        const hingeX = clampedOffset + hingeDir * halfW;
        const hingeZ = swing * halfT;
        const leafThickness = 0.045;

        const leafBar = new THREE.Mesh(
          new THREE.BoxGeometry(leafThickness, 0.04, clampedWidth),
          new THREE.MeshBasicMaterial({ color: isOpSelected ? 0xd97706 : 0x1e293b }),
        );
        leafBar.position.set(
          hingeX - hingeDir * leafThickness * 0.5,
          symY,
          hingeZ + swing * halfW,
        );
        wallGroup.add(leafBar);

        const arcPts: THREE.Vector3[] = [];
        const segs = 22;
        for (let s = 0; s <= segs; s++) {
          const theta = (Math.PI / 2) * (1 - s / segs);
          arcPts.push(
            new THREE.Vector3(
              hingeX - hingeDir * Math.cos(theta) * clampedWidth,
              symY,
              hingeZ + swing * Math.sin(theta) * clampedWidth,
            ),
          );
        }
        wallGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), arcMat));
      } else if (opening.type === 'double-door') {
        const leafLen = halfW;
        const leafThickness = 0.042;
        const hingeZ = swing * halfT;

        for (const side of [-1, 1] as const) {
          const hingeX = clampedOffset + side * halfW;
          const leafBar = new THREE.Mesh(
            new THREE.BoxGeometry(leafThickness, 0.04, leafLen),
            new THREE.MeshBasicMaterial({ color: isOpSelected ? 0xd97706 : 0x1e293b }),
          );
          leafBar.position.set(hingeX - side * leafThickness * 0.5, symY, hingeZ + swing * (leafLen * 0.5));
          wallGroup.add(leafBar);

          const arcPts: THREE.Vector3[] = [];
          const segs = 18;
          for (let s = 0; s <= segs; s++) {
            const theta = (Math.PI / 2) * (1 - s / segs);
            arcPts.push(
              new THREE.Vector3(
                hingeX - side * Math.cos(theta) * leafLen,
                symY,
                hingeZ + swing * Math.sin(theta) * leafLen,
              ),
            );
          }
          wallGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts), arcMat));
        }
      } else if (opening.type === 'sliding-door') {
        const slideDir = opening.hingeSide === 'right' ? -1 : 1;
        const panelLen = clampedWidth * 0.55;
        const panelThick = 0.036;
        const trackOffset = Math.min(0.045, wallThick * 0.22);

        const panelA = new THREE.Mesh(
          new THREE.BoxGeometry(panelLen, 0.035, panelThick),
          new THREE.MeshBasicMaterial({ color: isOpSelected ? 0xd97706 : 0x1e293b }),
        );
        panelA.position.set(
          clampedOffset - slideDir * (halfW - panelLen * 0.5),
          symY,
          -swing * trackOffset,
        );
        wallGroup.add(panelA);

        const panelB = new THREE.Mesh(
          new THREE.BoxGeometry(panelLen, 0.035, panelThick),
          new THREE.MeshBasicMaterial({ color: isOpSelected ? 0xd97706 : 0x2563eb }),
        );
        panelB.position.set(
          clampedOffset + slideDir * (halfW - panelLen * 0.5),
          symY,
          swing * trackOffset,
        );
        wallGroup.add(panelB);

        const arrowZ = swing * (trackOffset + 0.08);
        const arrowTip = clampedOffset + slideDir * (halfW - panelLen * 0.78);
        const arrowTail = clampedOffset + slideDir * (halfW - panelLen * 0.22);
        const arrowVerts = new Float32Array([
          clampedOffset - halfW, symY, -halfT,
          clampedOffset + halfW, symY, -halfT,
          clampedOffset - halfW, symY, halfT,
          clampedOffset + halfW, symY, halfT,
          arrowTip, symY, arrowZ,
          arrowTail, symY, arrowZ,
          arrowTip, symY, arrowZ,
          arrowTip + slideDir * 0.09, symY, arrowZ + 0.05,
          arrowTip, symY, arrowZ,
          arrowTip + slideDir * 0.09, symY, arrowZ - 0.05,
        ]);
        const arrowGeo = new THREE.BufferGeometry();
        arrowGeo.setAttribute('position', new THREE.BufferAttribute(arrowVerts, 3));
        wallGroup.add(new THREE.LineSegments(arrowGeo, arcMat));
      } else if (opening.type === 'garage-door') {
        const panelBar = new THREE.Mesh(
          new THREE.BoxGeometry(clampedWidth, 0.04, 0.058),
          new THREE.MeshBasicMaterial({ color: isOpSelected ? 0xd97706 : 0x334155 }),
        );
        panelBar.position.set(clampedOffset, symY, 0);
        wallGroup.add(panelBar);

        // Overhead ceiling track footprint extending inside along swingSide
        const trackDepth = Math.min(2.15, Math.max(1.25, opening.height * 0.88));
        const z0 = swing * halfT;
        const zEnd = swing * (halfT + trackDepth);
        const zMid1 = swing * (halfT + trackDepth * 0.34);
        const zMid2 = swing * (halfT + trackDepth * 0.68);
        const arrowTipZ = swing * (halfT + trackDepth * 0.82);
        const arrowBaseZ = swing * (halfT + trackDepth * 0.18);
        const trackVerts = new Float32Array([
          // Left & right ceiling rails + outer ceiling bar
          clampedOffset - halfW, symY, z0,
          clampedOffset - halfW, symY, zEnd,
          clampedOffset + halfW, symY, z0,
          clampedOffset + halfW, symY, zEnd,
          clampedOffset - halfW, symY, zEnd,
          clampedOffset + halfW, symY, zEnd,
          // Sectional panel dashed guides inside track footprint
          clampedOffset - halfW, symY, zMid1,
          clampedOffset + halfW, symY, zMid1,
          clampedOffset - halfW, symY, zMid2,
          clampedOffset + halfW, symY, zMid2,
          // Retraction direction centerline arrow toward ceiling
          clampedOffset, symY, arrowBaseZ,
          clampedOffset, symY, arrowTipZ,
          clampedOffset, symY, arrowTipZ,
          clampedOffset - 0.14, symY, arrowTipZ - swing * 0.16,
          clampedOffset, symY, arrowTipZ,
          clampedOffset + 0.14, symY, arrowTipZ - swing * 0.16,
        ]);
        const trackGeo = new THREE.BufferGeometry();
        trackGeo.setAttribute('position', new THREE.BufferAttribute(trackVerts, 3));
        wallGroup.add(new THREE.LineSegments(trackGeo, arcMat));
      } else {
        const glassSep = Math.min(0.032, wallThick * 0.18);
        const sillVerts = new Float32Array([
          clampedOffset - halfW, symY, -halfT,
          clampedOffset + halfW, symY, -halfT,
          clampedOffset - halfW, symY, halfT,
          clampedOffset + halfW, symY, halfT,
        ]);
        const sillGeo = new THREE.BufferGeometry();
        sillGeo.setAttribute('position', new THREE.BufferAttribute(sillVerts, 3));
        wallGroup.add(new THREE.LineSegments(sillGeo, symMat));

        const glassVerts = new Float32Array([
          clampedOffset - halfW, symY, -glassSep,
          clampedOffset + halfW, symY, -glassSep,
          clampedOffset - halfW, symY, glassSep,
          clampedOffset + halfW, symY, glassSep,
        ]);
        const glassGeo = new THREE.BufferGeometry();
        glassGeo.setAttribute('position', new THREE.BufferAttribute(glassVerts, 3));
        const winLineMat = isOpSelected ? cadSelectedSymbolMat : cadWindowMat;
        wallGroup.add(new THREE.LineSegments(glassGeo, winLineMat));

        // Subtle 2D casement open-side & hinge indicator
        const winHinge = opening.hingeSide ?? 'both';
        const zBase = swing * halfT;
        const zTip = swing * (halfT + Math.min(0.24, clampedWidth * 0.24));
        const casementVerts =
          winHinge === 'left'
            ? new Float32Array([
                clampedOffset - halfW, symY, zBase,
                clampedOffset + halfW * 0.75, symY, zTip,
                clampedOffset + halfW * 0.75, symY, zTip,
                clampedOffset + halfW, symY, zBase,
              ])
            : winHinge === 'right'
              ? new Float32Array([
                  clampedOffset + halfW, symY, zBase,
                  clampedOffset - halfW * 0.75, symY, zTip,
                  clampedOffset - halfW * 0.75, symY, zTip,
                  clampedOffset - halfW, symY, zBase,
                ])
              : new Float32Array([
                  clampedOffset - halfW, symY, zBase,
                  clampedOffset, symY, zTip,
                  clampedOffset, symY, zTip,
                  clampedOffset + halfW, symY, zBase,
                ]);
        const casementGeo = new THREE.BufferGeometry();
        casementGeo.setAttribute('position', new THREE.BufferAttribute(casementVerts, 3));
        wallGroup.add(new THREE.LineSegments(casementGeo, arcMat));
      }
    };

    const addConduitTube = (
      targetGroup: THREE.Group,
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      radius: number,
      mat: THREE.Material,
      pickTarget?: SelectionTarget,
    ) => {
      const dist = p1.distanceTo(p2);
      if (dist < 0.01) return;
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const dir = new THREE.Vector3().subVectors(p2, p1).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

      const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dist, 8), mat);
      tube.position.copy(mid);
      tube.quaternion.copy(quat);
      if (pickTarget) tube.userData.pickTarget = pickTarget;
      targetGroup.add(tube);

      if (pickTarget) {
        const hitBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, dist, 0.24),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        hitBox.position.copy(mid);
        hitBox.quaternion.copy(quat);
        hitBox.userData.pickTarget = pickTarget;
        targetGroup.add(hitBox);
      }
    };

    const noopRaycast = () => {};

    const buildSecurityCoverageVisual = (
      targetGroup: THREE.Group,
      dev: SecurityDevice,
      curWalls: WallSegment[],
      curHeight: number,
      slabTopY: number,
      isFlatBlueprint: boolean,
      isSelected: boolean,
      isPreview = false,
      isTriggered = false,
    ) => {
      const info = SECURITY_DEVICE_INFO[dev.kind];
      const cov = computeSecurityCoverage(dev, curWalls, curHeight);
      if (cov.polygon.length < 3) return cov;

      const colorHex = isTriggered ? '#ef4444' : isSelected ? '#f59e0b' : info.color;
      const shape = new THREE.Shape();
      shape.moveTo(cov.polygon[0].x, cov.polygon[0].z);
      for (let i = 1; i < cov.polygon.length; i++) {
        shape.lineTo(cov.polygon[i].x, cov.polygon[i].z);
      }
      shape.closePath();

      const fillGeo = new THREE.ShapeGeometry(shape);
      fillGeo.rotateX(Math.PI / 2);
      const fillY = isFlatBlueprint ? slabTopY + 0.055 : slabTopY + 0.042;
      const fillMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: isPreview
          ? 0.24
          : isTriggered
            ? isFlatBlueprint
              ? 0.34
              : 0.26
            : isFlatBlueprint
              ? isSelected
                ? 0.28
                : 0.16
              : isSelected
                ? 0.22
                : 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      fillMesh.position.y = fillY;
      fillMesh.renderOrder = 1;
      fillMesh.raycast = noopRaycast;
      targetGroup.add(fillMesh);

      // Crisp occluded visibility boundary lines (non-blocking for clicks on doors/walls beneath)
      const borderVerts: number[] = [];
      const lineY = fillY + 0.004;
      for (let i = 0; i < cov.polygon.length; i++) {
        const a = cov.polygon[i];
        const b = cov.polygon[(i + 1) % cov.polygon.length];
        borderVerts.push(a.x, lineY, a.z, b.x, lineY, b.z);
      }
      const borderGeo = new THREE.BufferGeometry();
      borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(borderVerts, 3));
      const borderMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: isPreview ? 0.85 : isTriggered ? 0.96 : isSelected ? 0.92 : 0.55,
      });
      const borderLines = new THREE.LineSegments(borderGeo, borderMat);
      borderLines.raycast = noopRaycast;
      targetGroup.add(borderLines);

      // Center aim axis + 3D sight-cone edges
      const yawRad = (dev.yawDeg * Math.PI) / 180;
      const aimLen = Math.min(dev.rangeMeters, 1.45);
      if (isFlatBlueprint) {
        const aimVerts = new Float32Array([
          dev.x,
          lineY + 0.008,
          dev.z,
          dev.x + Math.cos(yawRad) * aimLen,
          lineY + 0.008,
          dev.z + Math.sin(yawRad) * aimLen,
        ]);
        const aimGeo = new THREE.BufferGeometry();
        aimGeo.setAttribute('position', new THREE.BufferAttribute(aimVerts, 3));
        const aimLines = new THREE.LineSegments(
          aimGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(colorHex),
            transparent: true,
            opacity: isTriggered ? 0.98 : isSelected ? 0.95 : 0.72,
          }),
        );
        aimLines.raycast = noopRaycast;
        targetGroup.add(aimLines);
      } else if (cov.boundaryPoints.length >= 2) {
        const mountY = slabTopY + Math.min(Math.max(0.35, curHeight - 0.06), dev.mountHeight);
        const coneVerts: number[] = [];
        const rayIndices =
          dev.fovDeg >= 359
            ? [
                0,
                Math.floor(cov.boundaryPoints.length * 0.25),
                Math.floor(cov.boundaryPoints.length * 0.5),
                Math.floor(cov.boundaryPoints.length * 0.75),
              ]
            : [0, Math.floor(cov.boundaryPoints.length * 0.5), cov.boundaryPoints.length - 1];
        for (const rIdx of rayIndices) {
          const bp = cov.boundaryPoints[rIdx];
          if (!bp) continue;
          coneVerts.push(dev.x, mountY, dev.z, bp.x, fillY + 0.01, bp.z);
        }
        const coneGeo = new THREE.BufferGeometry();
        coneGeo.setAttribute('position', new THREE.Float32BufferAttribute(coneVerts, 3));
        const coneLines = new THREE.LineSegments(
          coneGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(colorHex),
            transparent: true,
            opacity: isTriggered ? 0.78 : isSelected ? 0.65 : 0.35,
          }),
        );
        coneLines.raycast = noopRaycast;
        targetGroup.add(coneLines);
      }

      return cov;
    };

    const buildSecurityDeviceMesh = (
      dev: SecurityDevice,
      curHeight: number,
      slabTopY: number,
      isFlatBlueprint: boolean,
      isSelected: boolean,
      isTriggered = false,
    ): THREE.Group => {
      const info = SECURITY_DEVICE_INFO[dev.kind];
      const baseColor = isTriggered ? '#ef4444' : isSelected ? '#f59e0b' : info.color;
      const bodyGroup = new THREE.Group();
      const yawRad = (dev.yawDeg * Math.PI) / 180;
      const pickTarget: SelectionTarget = { kind: 'security', securityId: dev.id };

      if (isFlatBlueprint) {
        const y2d = slabTopY + 0.21;
        bodyGroup.position.set(dev.x, y2d, dev.z);
        bodyGroup.rotation.y = -yawRad;

        const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(baseColor) });
        const darkMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

        if (dev.kind === 'bullet-cam') {
          const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), darkMat);
          bodyGroup.add(mount);
          const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.095), accentMat);
          barrel.position.set(0.08, 0, 0);
          bodyGroup.add(barrel);
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, 0.115), darkMat);
          visor.position.set(0.16, 0, 0);
          bodyGroup.add(visor);
        } else if (dev.kind === 'dome-cam' || dev.kind === 'ptz-cam') {
          const outer = new THREE.Mesh(
            new THREE.CylinderGeometry(
              dev.kind === 'ptz-cam' ? 0.125 : 0.105,
              dev.kind === 'ptz-cam' ? 0.125 : 0.105,
              0.05,
              18,
            ),
            accentMat,
          );
          bodyGroup.add(outer);
          const lens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.056, 0.06), darkMat);
          lens.position.set(0.05, 0, 0);
          bodyGroup.add(lens);
        } else if (dev.kind === 'ceiling-pir') {
          const outerRing = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.048, 18), accentMat);
          bodyGroup.add(outerRing);
          const core = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.055, 14), darkMat);
          bodyGroup.add(core);
        } else if (dev.kind === 'motion-sensor' || dev.kind === 'curtain-pir') {
          const wBox = dev.kind === 'curtain-pir' ? 0.08 : 0.1;
          const dBox = dev.kind === 'curtain-pir' ? 0.09 : 0.14;
          const housing = new THREE.Mesh(new THREE.BoxGeometry(wBox, 0.05, dBox), accentMat);
          bodyGroup.add(housing);
          const windowBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.055, dBox * 0.78), darkMat);
          windowBar.position.set(wBox * 0.45, 0, 0);
          bodyGroup.add(windowBar);
        } else if (dev.kind === 'glass-break' || dev.kind === 'siren') {
          const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.05, 6), accentMat);
          bodyGroup.add(badge);
          const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.056, 10), darkMat);
          bodyGroup.add(dot);
        } else {
          const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.16), accentMat);
          bodyGroup.add(plate);
        }

        if (isTriggered) {
          const alertRing = new THREE.Mesh(
            new THREE.RingGeometry(0.18, 0.24, 24),
            new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }),
          );
          alertRing.rotation.x = -Math.PI / 2;
          alertRing.position.y = 0.03;
          alertRing.raycast = noopRaycast;
          bodyGroup.add(alertRing);
        }

        const hitProxy = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        bodyGroup.add(hitProxy);
      } else {
        const mountY = slabTopY + Math.min(Math.max(0.35, curHeight - 0.06), dev.mountHeight);
        bodyGroup.position.set(dev.x, mountY, dev.z);
        bodyGroup.rotation.y = -yawRad;

        const shellMat = new THREE.MeshStandardMaterial({
          color: isTriggered ? 0xfee2e2 : isSelected ? 0xfbbf24 : 0xf1f5f9,
          roughness: 0.35,
          metalness: 0.25,
        });
        const accentMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor),
          roughness: 0.35,
          metalness: 0.28,
          ...(isTriggered ? { emissive: 0xef4444, emissiveIntensity: 0.8 } : {}),
        });
        const lensMat = new THREE.MeshStandardMaterial({
          color: isTriggered ? 0xdc2626 : 0x0f172a,
          roughness: 0.15,
          metalness: 0.6,
          emissive: new THREE.Color(baseColor),
          emissiveIntensity: isTriggered ? 0.95 : 0.28,
        });

        const tiltRad = -(dev.tiltDeg * Math.PI) / 180;

        if (dev.kind === 'bullet-cam') {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.025, 14), shellMat);
          plate.rotation.z = Math.PI / 2;
          plate.position.set(-0.02, 0, 0);
          bodyGroup.add(plate);

          const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 10), shellMat);
          arm.rotation.z = Math.PI / 2;
          arm.position.set(0.03, 0, 0);
          bodyGroup.add(arm);

          const headPivot = new THREE.Group();
          headPivot.position.set(0.07, 0, 0);
          headPivot.rotation.z = tiltRad;

          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.16, 14), shellMat);
          body.rotation.z = Math.PI / 2;
          body.position.set(0.07, 0, 0);
          headPivot.add(body);

          const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 14), accentMat);
          collar.rotation.z = Math.PI / 2;
          collar.position.set(0.145, 0, 0);
          headPivot.add(collar);

          const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.015, 14), lensMat);
          lens.rotation.z = Math.PI / 2;
          lens.position.set(0.16, 0, 0);
          headPivot.add(lens);

          bodyGroup.add(headPivot);
        } else if (dev.kind === 'dome-cam' || dev.kind === 'ptz-cam') {
          const r = dev.kind === 'ptz-cam' ? 0.095 : 0.075;
          const base = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.03, 18), shellMat);
          bodyGroup.add(base);

          const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.02, 18), accentMat);
          ring.position.set(0, -0.022, 0);
          bodyGroup.add(ring);

          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(r * 0.85, 16, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
            lensMat,
          );
          dome.position.set(0, -0.025, 0);
          bodyGroup.add(dome);

          const aimIndicator = new THREE.Mesh(new THREE.BoxGeometry(r * 0.65, 0.025, 0.03), accentMat);
          aimIndicator.position.set(r * 0.5, -0.045, 0);
          aimIndicator.rotation.z = tiltRad;
          bodyGroup.add(aimIndicator);
        } else if (dev.kind === 'ceiling-pir') {
          const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.032, 18), shellMat);
          bodyGroup.add(puck);
          const dome = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
            lensMat,
          );
          dome.position.set(0, -0.012, 0);
          bodyGroup.add(dome);
          const statusRing = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 18), accentMat);
          statusRing.position.set(0, -0.014, 0);
          bodyGroup.add(statusRing);
        } else if (dev.kind === 'motion-sensor' || dev.kind === 'curtain-pir') {
          const mountPivot = new THREE.Group();
          mountPivot.rotation.z = tiltRad * 0.6;
          const h = dev.kind === 'curtain-pir' ? 0.145 : 0.125;
          const w = dev.kind === 'curtain-pir' ? 0.052 : 0.075;
          const caseBox = new THREE.Mesh(new THREE.BoxGeometry(0.055, h, w), shellMat);
          caseBox.position.set(0.02, 0, 0);
          mountPivot.add(caseBox);

          const fresnel = new THREE.Mesh(new THREE.BoxGeometry(0.018, h * 0.68, w * 0.78), lensMat);
          fresnel.position.set(0.048, -0.005, 0);
          mountPivot.add(fresnel);

          const ledTop = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.016, w * 0.45), accentMat);
          ledTop.position.set(0.046, h * 0.36, 0);
          mountPivot.add(ledTop);
          bodyGroup.add(mountPivot);
        } else if (dev.kind === 'door-contact') {
          const mainBar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.085, 0.035), accentMat);
          mainBar.position.set(0.015, 0, -0.022);
          bodyGroup.add(mainBar);
          const magnetBar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.024), shellMat);
          magnetBar.position.set(0.015, 0, 0.022);
          bodyGroup.add(magnetBar);
        } else if (dev.kind === 'glass-break') {
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.028, 16), shellMat);
          disc.rotation.z = Math.PI / 2;
          disc.position.set(0.014, 0, 0);
          bodyGroup.add(disc);
          const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.01, 12), accentMat);
          grille.rotation.z = Math.PI / 2;
          grille.position.set(0.028, 0, 0);
          bodyGroup.add(grille);
        } else if (dev.kind === 'siren') {
          const housing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.14), shellMat);
          housing.position.set(0.025, 0, 0);
          bodyGroup.add(housing);
          const strobe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.065, 0.11), accentMat);
          strobe.position.set(0.045, 0.04, 0);
          bodyGroup.add(strobe);
          const horn = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.06, 0.11), lensMat);
          horn.position.set(0.042, -0.04, 0);
          bodyGroup.add(horn);
        } else {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.16, 0.12), shellMat);
          panel.position.set(0.016, 0, 0);
          bodyGroup.add(panel);
          const lcd = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.045, 0.085), lensMat);
          lcd.position.set(0.03, 0.04, 0);
          bodyGroup.add(lcd);
          const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.085), accentMat);
          pad.position.set(0.03, -0.03, 0);
          bodyGroup.add(pad);
        }
      }

      bodyGroup.traverse((child) => {
        child.userData.pickTarget = pickTarget;
      });
      return bodyGroup;
    };

    const buildFurnitureMesh = (
      item: FurnitureItem,
      slabTopY: number,
      isFlatBlueprint: boolean,
      isSelected: boolean,
    ): THREE.Group => {
      const info = FURNITURE_KIND_INFO[item.kind];
      const baseColor = isSelected ? '#f59e0b' : info.color;
      const group = new THREE.Group();
      const yawRad = (item.rotationDeg * Math.PI) / 180;
      const pickTarget: SelectionTarget = { kind: 'furniture', furnitureId: item.id };
      const w = Math.max(0.3, item.width);
      const d = Math.max(0.3, item.depth);
      const h = Math.max(0.25, item.height);

      if (isFlatBlueprint) {
        const y2d = slabTopY + 0.08;
        group.position.set(item.x, y2d, item.z);
        group.rotation.y = -yawRad;

        const fillMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(isSelected ? '#fef3c7' : '#f8fafc'),
        });
        const accentMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(baseColor),
        });
        const outlineMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(isSelected ? '#d97706' : baseColor),
        });

        if (item.kind !== 'toilet') {
          const baseBox = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, d), fillMat);
          group.add(baseBox);

          const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, 0.028, d));
          group.add(new THREE.LineSegments(edgeGeo, outlineMat));
        }

        if (item.kind === 'sofa') {
          const backBar = new THREE.Mesh(
            new THREE.BoxGeometry(w, 0.032, Math.min(0.18, d * 0.22)),
            accentMat,
          );
          backBar.position.set(0, 0.004, -d * 0.5 + Math.min(0.09, d * 0.11));
          group.add(backBar);
          for (const s of [-1, 1]) {
            const arm = new THREE.Mesh(
              new THREE.BoxGeometry(Math.min(0.16, w * 0.12), 0.032, d * 0.82),
              accentMat,
            );
            arm.position.set(s * (w * 0.5 - Math.min(0.08, w * 0.06)), 0.004, d * 0.05);
            group.add(arm);
          }
        } else if (item.kind === 'bed') {
          const headboard = new THREE.Mesh(
            new THREE.BoxGeometry(w, 0.035, Math.min(0.14, d * 0.08)),
            accentMat,
          );
          headboard.position.set(0, 0.005, -d * 0.5 + Math.min(0.07, d * 0.04));
          group.add(headboard);
          const pillowCount = w >= 1.3 ? 2 : 1;
          const pw = (w * 0.72) / pillowCount;
          for (let i = 0; i < pillowCount; i++) {
            const px =
              pillowCount === 1 ? 0 : (i === 0 ? -1 : 1) * (w * 0.22);
            const pillow = new THREE.Mesh(
              new THREE.BoxGeometry(pw * 0.85, 0.032, Math.min(0.32, d * 0.18)),
              accentMat,
            );
            pillow.position.set(px, 0.004, -d * 0.5 + Math.min(0.28, d * 0.16));
            group.add(pillow);
          }
        } else if (item.kind === 'working-table') {
          const chair = new THREE.Mesh(
            new THREE.CylinderGeometry(0.22, 0.22, 0.03, 16),
            accentMat,
          );
          chair.position.set(0, 0.003, d * 0.5 + 0.16);
          group.add(chair);
          const monitor = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(0.55, w * 0.45), 0.034, 0.06),
            accentMat,
          );
          monitor.position.set(0, 0.005, -d * 0.24);
          group.add(monitor);
        } else if (item.kind === 'workbench') {
          for (let i = -2; i <= 2; i++) {
            const slat = new THREE.Mesh(
              new THREE.BoxGeometry(w * 0.92, 0.03, 0.022),
              accentMat,
            );
            slat.position.set(0, 0.004, i * (d * 0.17));
            group.add(slat);
          }
          const viseBlock = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(0.32, w * 0.2), 0.034, 0.12),
            accentMat,
          );
          viseBlock.position.set(-w * 0.34, 0.005, d * 0.5 + 0.06);
          group.add(viseBlock);
        } else if (item.kind === 'dining-table') {
          for (const sx of [-w * 0.26, w * 0.26]) {
            for (const sz of [-1, 1]) {
              const chair = new THREE.Mesh(
                new THREE.BoxGeometry(0.36, 0.028, 0.12),
                accentMat,
              );
              chair.position.set(sx, 0.003, sz * (d * 0.5 + 0.1));
              group.add(chair);
            }
          }
        } else if (item.kind === 'toilet') {
          const tankD = Math.min(0.2, d * 0.3);
          const tank = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.028, tankD), fillMat);
          tank.position.set(0, 0.003, -d * 0.5 + tankD * 0.5);
          group.add(tank);
          group.add(
            (() => {
              const tankEdge = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(w * 0.92, 0.03, tankD)),
                outlineMat,
              );
              tankEdge.position.copy(tank.position);
              return tankEdge;
            })(),
          );
          const bowlOuter = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.026, 20),
            fillMat,
          );
          bowlOuter.scale.set(1, 1, 1.24);
          bowlOuter.position.set(0, 0.002, tankD * 0.32);
          group.add(bowlOuter);
          const rimRing = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.36, w * 0.36, 0.029, 18),
            accentMat,
          );
          rimRing.scale.set(1, 1, 1.22);
          rimRing.position.set(0, 0.003, tankD * 0.32);
          group.add(rimRing);
          const innerBowl = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.24, w * 0.24, 0.032, 16),
            fillMat,
          );
          innerBowl.scale.set(1, 1, 1.22);
          innerBowl.position.set(0, 0.004, tankD * 0.34);
          group.add(innerBowl);
          const flushBtn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.036, 10),
            accentMat,
          );
          flushBtn.position.set(0, 0.005, -d * 0.5 + tankD * 0.5);
          group.add(flushBtn);
        } else {
          const innerBand = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.82, 0.03, d * 0.82),
            accentMat,
          );
          innerBand.position.set(0, 0.003, 0);
          group.add(innerBand);
        }

        const hitProxy = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.12, 0.14, d + 0.12),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        group.add(hitProxy);
      } else {
        group.position.set(item.x, slabTopY, item.z);
        group.rotation.y = -yawRad;

        const primaryMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(baseColor),
          roughness: 0.65,
          metalness: 0.08,
        });
        const secondaryMat = new THREE.MeshStandardMaterial({
          color: isSelected ? 0xfde68a : 0xe2e8f0,
          roughness: 0.72,
          metalness: 0.05,
        });
        const darkMetalMat = new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.4,
          metalness: 0.55,
        });

        if (item.kind === 'sofa') {
          const seatH = Math.min(0.42, h * 0.48);
          const backThick = Math.min(0.2, d * 0.22);
          const armW = Math.min(0.18, w * 0.11);
          const seat = new THREE.Mesh(
            new THREE.BoxGeometry(w - armW * 2, seatH, d - backThick * 0.4),
            primaryMat,
          );
          seat.position.set(0, seatH * 0.5, backThick * 0.2);
          seat.castShadow = !isSoftwareGl;
          seat.receiveShadow = true;
          group.add(seat);

          const back = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, backThick),
            primaryMat,
          );
          back.position.set(0, h * 0.5, -d * 0.5 + backThick * 0.5);
          back.castShadow = !isSoftwareGl;
          back.receiveShadow = true;
          group.add(back);

          for (const s of [-1, 1]) {
            const arm = new THREE.Mesh(
              new THREE.BoxGeometry(armW, Math.min(h * 0.76, seatH + 0.22), d),
              primaryMat,
            );
            arm.position.set(s * (w * 0.5 - armW * 0.5), Math.min(h * 0.76, seatH + 0.22) * 0.5, 0);
            arm.castShadow = !isSoftwareGl;
            group.add(arm);
          }
        } else if (item.kind === 'workbench') {
          const topThick = 0.085;
          const butcherMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xf59e0b : 0xb45309,
            roughness: 0.62,
            metalness: 0.04,
          });
          const timberFrameMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xfbbf24 : 0x78350f,
            roughness: 0.74,
            metalness: 0.05,
          });

          // Heavy laminated butcher-block top
          const topSlab = new THREE.Mesh(
            new THREE.BoxGeometry(w, topThick, d),
            butcherMat,
          );
          topSlab.position.set(0, h - topThick * 0.5, 0);
          topSlab.castShadow = !isSoftwareGl;
          topSlab.receiveShadow = true;
          group.add(topSlab);

          // 4 heavy 8.5x8.5 cm post legs
          const legThick = 0.085;
          const legH = Math.max(0.25, h - topThick);
          const lx = w * 0.5 - legThick * 1.1;
          const lz = d * 0.5 - legThick * 1.1;
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const post = new THREE.Mesh(
                new THREE.BoxGeometry(legThick, legH, legThick),
                timberFrameMat,
              );
              post.position.set(sx * lx, legH * 0.5, sz * lz);
              post.castShadow = !isSoftwareGl;
              group.add(post);
            }
          }

          // Perimeter aprons under benchtop & lower shelf
          const shelfY = Math.max(0.18, legH * 0.28);
          const shelf = new THREE.Mesh(
            new THREE.BoxGeometry(w - legThick * 1.6, 0.032, d - legThick * 1.6),
            timberFrameMat,
          );
          shelf.position.set(0, shelfY, 0);
          shelf.castShadow = !isSoftwareGl;
          shelf.receiveShadow = true;
          group.add(shelf);

          for (const sz of [-1, 1]) {
            const rail = new THREE.Mesh(
              new THREE.BoxGeometry(w - legThick * 2, 0.075, 0.045),
              timberFrameMat,
            );
            rail.position.set(0, h - topThick - 0.04, sz * lz);
            group.add(rail);
          }

          // Heavy cast-iron front woodworking vise
          const viseJaw = new THREE.Mesh(
            new THREE.BoxGeometry(Math.min(0.32, w * 0.22), 0.11, 0.05),
            darkMetalMat,
          );
          viseJaw.position.set(-w * 0.34, h - topThick * 0.75, d * 0.5 + 0.04);
          group.add(viseJaw);

          const viseHandle = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8),
            darkMetalMat,
          );
          viseHandle.rotation.z = Math.PI * 0.2;
          viseHandle.position.set(-w * 0.34, h - topThick * 0.85, d * 0.5 + 0.085);
          group.add(viseHandle);
        } else if (item.kind === 'sofa-table' || item.kind === 'working-table' || item.kind === 'dining-table') {
          const topThick = item.kind === 'sofa-table' ? 0.045 : 0.05;
          const topMesh = new THREE.Mesh(
            new THREE.BoxGeometry(w, topThick, d),
            primaryMat,
          );
          topMesh.position.set(0, h - topThick * 0.5, 0);
          topMesh.castShadow = !isSoftwareGl;
          topMesh.receiveShadow = true;
          group.add(topMesh);

          const legR = item.kind === 'sofa-table' ? 0.025 : 0.032;
          const legH = Math.max(0.15, h - topThick);
          for (const sx of [-1, 1]) {
            for (const sz of [-1, 1]) {
              const leg = new THREE.Mesh(
                new THREE.BoxGeometry(legR * 2, legH, legR * 2),
                darkMetalMat,
              );
              leg.position.set(
                sx * (w * 0.5 - legR * 2.2),
                legH * 0.5,
                sz * (d * 0.5 - legR * 2.2),
              );
              leg.castShadow = !isSoftwareGl;
              group.add(leg);
            }
          }

          if (item.kind === 'working-table') {
            const monitorStand = new THREE.Mesh(
              new THREE.BoxGeometry(0.14, 0.12, 0.1),
              darkMetalMat,
            );
            monitorStand.position.set(0, h + 0.06, -d * 0.25);
            group.add(monitorStand);
            const monitorScreen = new THREE.Mesh(
              new THREE.BoxGeometry(Math.min(0.62, w * 0.45), 0.34, 0.025),
              darkMetalMat,
            );
            monitorScreen.position.set(0, h + 0.26, -d * 0.23);
            group.add(monitorScreen);

            // Office task chair tucked at front
            const chairSeat = new THREE.Mesh(
              new THREE.BoxGeometry(0.46, 0.06, 0.44),
              darkMetalMat,
            );
            chairSeat.position.set(0, 0.45, d * 0.5 + 0.18);
            group.add(chairSeat);

            const chairStem = new THREE.Mesh(
              new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10),
              darkMetalMat,
            );
            chairStem.position.set(0, 0.21, d * 0.5 + 0.18);
            group.add(chairStem);

            const chairBack = new THREE.Mesh(
              new THREE.BoxGeometry(0.42, 0.42, 0.05),
              secondaryMat,
            );
            chairBack.position.set(0, 0.68, d * 0.5 + 0.39);
            group.add(chairBack);
          }
        } else if (item.kind === 'bed') {
          const frameH = 0.28;
          const mattressH = 0.22;
          const headH = Math.max(0.75, h);
          const frame = new THREE.Mesh(
            new THREE.BoxGeometry(w, frameH, d),
            primaryMat,
          );
          frame.position.set(0, frameH * 0.5, 0);
          frame.castShadow = !isSoftwareGl;
          frame.receiveShadow = true;
          group.add(frame);

          const mattress = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.94, mattressH, d * 0.92),
            secondaryMat,
          );
          mattress.position.set(0, frameH + mattressH * 0.5, d * 0.02);
          mattress.castShadow = !isSoftwareGl;
          group.add(mattress);

          const headboard = new THREE.Mesh(
            new THREE.BoxGeometry(w, headH, 0.09),
            primaryMat,
          );
          headboard.position.set(0, headH * 0.5, -d * 0.5 + 0.045);
          headboard.castShadow = !isSoftwareGl;
          group.add(headboard);
        } else if (item.kind === 'toilet') {
          const porcelainMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xfde68a : 0xf8fafc,
            roughness: 0.2,
            metalness: 0.05,
          });
          const basinMat = new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.32,
            metalness: 0.04,
          });
          const chromeMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.22,
            metalness: 0.85,
          });

          const seatH = Math.min(0.42, Math.max(0.34, h * 0.54));
          const tankD = Math.min(0.2, d * 0.3);
          const tankH = Math.max(0.36, h - seatH * 0.45);
          const tankZ = -d * 0.5 + tankD * 0.5;
          const bowlZ = tankD * 0.34;

          const pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.26, w * 0.32, seatH * 0.65, 16),
            porcelainMat,
          );
          pedestal.position.set(0, seatH * 0.325, bowlZ);
          pedestal.castShadow = !isSoftwareGl;
          pedestal.receiveShadow = true;
          group.add(pedestal);

          const bowlBody = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.44, w * 0.28, seatH * 0.48, 20),
            porcelainMat,
          );
          bowlBody.scale.set(1, 1, 1.24);
          bowlBody.position.set(0, seatH * 0.76, bowlZ);
          bowlBody.castShadow = !isSoftwareGl;
          bowlBody.receiveShadow = true;
          group.add(bowlBody);

          const seatRing = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.032, 20),
            secondaryMat,
          );
          seatRing.scale.set(1, 1, 1.22);
          seatRing.position.set(0, seatH + 0.014, bowlZ);
          group.add(seatRing);

          const basinHole = new THREE.Mesh(
            new THREE.CylinderGeometry(w * 0.27, w * 0.24, 0.036, 18),
            basinMat,
          );
          basinHole.scale.set(1, 1, 1.2);
          basinHole.position.set(0, seatH + 0.015, bowlZ + 0.015);
          group.add(basinHole);

          const cistern = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.92, tankH, tankD),
            porcelainMat,
          );
          cistern.position.set(0, seatH * 0.45 + tankH * 0.5, tankZ);
          cistern.castShadow = !isSoftwareGl;
          cistern.receiveShadow = true;
          group.add(cistern);

          const cisternLid = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.96, 0.032, tankD + 0.025),
            porcelainMat,
          );
          cisternLid.position.set(0, seatH * 0.45 + tankH + 0.016, tankZ);
          group.add(cisternLid);

          const flushBtn = new THREE.Mesh(
            new THREE.CylinderGeometry(0.028, 0.028, 0.018, 12),
            chromeMat,
          );
          flushBtn.position.set(0, seatH * 0.45 + tankH + 0.036, tankZ);
          group.add(flushBtn);
        } else {
          // Wardrobe / Cabinet
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), primaryMat);
          body.position.set(0, h * 0.5, 0);
          body.castShadow = !isSoftwareGl;
          body.receiveShadow = true;
          group.add(body);

          const handle = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, Math.min(0.32, h * 0.2), 0.025),
            darkMetalMat,
          );
          handle.position.set(0, h * 0.52, d * 0.5 + 0.015);
          group.add(handle);
        }
      }

      group.traverse((child) => {
        child.userData.pickTarget = pickTarget;
      });
      return group;
    };

    const refreshSecurityTriggers = (overridePos?: Point2D | null) => {
      const {
        walls: curWalls,
        securityDevices: curDevices,
        wallHeight: curH,
        viewMode: curView,
        testMotionActive: curTest,
        showSecurity: curShowSec,
        activeCameraViewId: curCamId,
      } = stateRef.current;

      const motionPt =
        overridePos !== undefined
          ? overridePos
          : curView === '3d-walk' && !curCamId
            ? { x: walkState.position.x, z: walkState.position.z }
            : curTest
              ? testMotionPosRef.current
              : null;

      const nextSet =
        curShowSec && curDevices.length > 0
          ? evaluateSecurityTriggers(motionPt, curDevices, curWalls, curH)
          : new Set<string>();

      const prevKey = Array.from(triggeredIdsRef.current).sort().join(',');
      const nextKey = Array.from(nextSet).sort().join(',');
      if (prevKey !== nextKey) {
        triggeredIdsRef.current = nextSet;
        const labels = curDevices
          .filter((d) => nextSet.has(d.id))
          .map((d) => d.label || SECURITY_DEVICE_INFO[d.kind].label);
        setTriggeredSummary(labels);
        rebuildHouseRef.current?.();
      }
      return nextSet;
    };

    const rebuildHouse = () => {
      const {
        walls: curWalls,
        wires: curWires,
        junctions: curJunctions,
        pipes: curPipes,
        fixtures: curFixtures,
        securityDevices: curSecurityDevices,
        furniture: curFurniture,
        customRoomNames: curCustomRoomNames,
        wallHeight: curHeight,
        defaultWallColor: curDefaultColor,
        selected: curSelected,
        showFloorPlate: curFloor,
        showDimensions: curShowDims,
        showInnerDimensions: curShowInnerDims,
        showObjectDistances: curShowObjectDistances,
        showRoomAreas: curShowRoomAreas,
        showCeiling: curShowCeiling,
        ceilingMode: curCeilingMode,
        showWalkDimensions: curShowWalkDims,
        showStructure: curShowStructure,
        showWiring: curShowWiring,
        showPlumbing: curShowPlumbing,
        showSecurity: curShowSecurity,
        showSecurityCoverage: curShowSecurityCoverage,
        showInterior: curShowInterior,
        xrayWalls: curXrayWalls,
        activeTool: curTool,
        viewMode: curView,
        activeCameraViewId: curCameraViewId,
        testMotionActive: curTestMotion,
      } = stateRef.current;

      const motionTargetPt =
        curView === '3d-walk' && !curCameraViewId
          ? { x: walkState.position.x, z: walkState.position.z }
          : curTestMotion
            ? testMotionPosRef.current
            : null;
      const triggeredSet =
        curShowSecurity && curSecurityDevices.length > 0
          ? evaluateSecurityTriggers(motionTargetPt, curSecurityDevices, curWalls, curHeight)
          : new Set<string>();
      const prevTrigKey = Array.from(triggeredIdsRef.current).sort().join(',');
      const nextTrigKey = Array.from(triggeredSet).sort().join(',');
      if (prevTrigKey !== nextTrigKey) {
        triggeredIdsRef.current = triggeredSet;
        const nextLabels = curSecurityDevices
          .filter((d) => triggeredSet.has(d.id))
          .map((d) => d.label || SECURITY_DEVICE_INFO[d.kind].label);
        setTriggeredSummary(nextLabels);
      }

      disposeGroupChildren(houseGroup);
      disposeGroupChildren(wireGroup);
      disposeGroupChildren(plumbingGroup);
      disposeGroupChildren(securityGroup);
      disposeGroupChildren(furnitureGroup);
      disposeGroupChildren(dimensionGroup);
      disposeGroupChildren(clearanceGroup);
      disposeGroupChildren(handleGroup);
      dimensionAnchorsRef.current = [];
      roomAnchorsRef.current = [];
      walkDimAnchorsRef.current = [];
      clearanceAnchorsRef.current = [];
      furnitureAnchorsRef.current = [];
      opaqueWallMeshesRef.current = [];
      securityAnchorsRef.current = [];
      openingAnimControllersRef.current = [];

      const is2D = curView === '2d';
      const bounds = computeFloorBounds(curWalls, 0.45);
      contactShadowPlane.position.set(bounds.centerX, 0.001, bounds.centerZ);
      contactShadowPlane.scale.set(Math.max(1, bounds.width / 10), Math.max(1, bounds.depth / 10), 1);

      if (curFloor && curWalls.length > 0) {
        currentFloorTex.repeat.set(Math.max(1, bounds.width), Math.max(1, bounds.depth));
        const slabGeo = new THREE.BoxGeometry(bounds.width, 0.04, bounds.depth);
        const slab = new THREE.Mesh(slabGeo, floorSlabMat);
        slab.position.set(bounds.centerX, 0.02, bounds.centerZ);
        slab.receiveShadow = true;
        houseGroup.add(slab);
      }

      const slabTopY = curFloor && curWalls.length > 0 ? 0.04 : 0;
      const effectiveRenderHeight = is2D ? 0.12 : curHeight;
      const isFlatBlueprint = is2D || curHeight <= 0.12;

      const dimLineVerts: number[] = [];
      const dimTickVerts: number[] = [];
      const innerDimLineVerts: number[] = [];
      const innerDimTickVerts: number[] = [];
      const openingDimLineVerts: number[] = [];
      const openingDimTickVerts: number[] = [];

      // Compute outer wall envelope & gable roof envelope when 3D roof is enabled
      let roofParams: {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
        centerX: number;
        centerZ: number;
        ridgeAlongX: boolean;
        halfSpan: number;
        ridgeLength: number;
        ridgeRise: number;
        eaveBaseY: number;
      } | null = null;
      if (!isFlatBlueprint && curWalls.length >= 2 && curHeight > 0.35) {
        let wMinX = Infinity;
        let wMaxX = -Infinity;
        let wMinZ = Infinity;
        let wMaxZ = -Infinity;
        for (const w of curWalls) {
          const pad = w.thickness * 0.5;
          wMinX = Math.min(wMinX, w.start.x - pad, w.end.x - pad);
          wMaxX = Math.max(wMaxX, w.start.x + pad, w.end.x + pad);
          wMinZ = Math.min(wMinZ, w.start.z - pad, w.end.z - pad);
          wMaxZ = Math.max(wMaxZ, w.start.z + pad, w.end.z + pad);
        }
        const spanX = wMaxX - wMinX;
        const spanZ = wMaxZ - wMinZ;
        if (spanX >= 0.9 && spanZ >= 0.9) {
          const ridgeAlongX = spanX >= spanZ;
          const halfSpan = (ridgeAlongX ? spanZ : spanX) * 0.5;
          const ridgeLength = ridgeAlongX ? spanX : spanZ;
          const ridgeRise = Math.max(0.95, Math.min(3.4, halfSpan * 0.48));
          roofParams = {
            minX: wMinX,
            maxX: wMaxX,
            minZ: wMinZ,
            maxZ: wMaxZ,
            centerX: (wMinX + wMaxX) * 0.5,
            centerZ: (wMinZ + wMaxZ) * 0.5,
            ridgeAlongX,
            halfSpan,
            ridgeLength,
            ridgeRise,
            eaveBaseY: slabTopY + curHeight,
          };
        }
      }

      const getRoofUndersideY = (px: number, pz: number): number => {
        if (!roofParams) return slabTopY + curHeight;
        const distFromRidge = roofParams.ridgeAlongX
          ? Math.abs(pz - roofParams.centerZ)
          : Math.abs(px - roofParams.centerX);
        const ratio = Math.max(0, 1 - distFromRidge / Math.max(0.2, roofParams.halfSpan));
        return roofParams.eaveBaseY + roofParams.ridgeRise * ratio;
      };

      if (curShowStructure) {
        for (const wall of curWalls) {
          const len = wallLength(wall);
          if (len < 0.05) continue;

          const isWallSelected = curSelected?.kind === 'wall' && curSelected.wallId === wall.id;
          const wallHex = wall.color || curDefaultColor;
          const { startExtend, endExtend } = getWallEndpointExtensions(wall, curWalls);
          const { boxes, normalizedOpenings } = decomposeWallIntoBoxes(
            wall,
            effectiveRenderHeight,
            startExtend,
            endExtend,
            curWalls,
          );
          const angle = wallAngleRad(wall);

          const wallGroup = new THREE.Group();
          wallGroup.position.set(wall.start.x, slabTopY, wall.start.z);
          wallGroup.rotation.y = -angle;
          houseGroup.add(wallGroup);

          for (const box of boxes) {
            const geo = new THREE.BoxGeometry(box.sizeX, box.sizeY, box.sizeZ);
            const meshMat = isWallSelected
              ? curXrayWalls && !isFlatBlueprint
                ? wallXraySelectedMat
                : wallSelectedMat
              : is2D
                ? getWall2DMaterial(wallHex, curXrayWalls)
                : getWall3DMaterial(wallHex, curXrayWalls);
            const mesh = new THREE.Mesh(geo, meshMat);
            const yLift2D = is2D
              ? isWallSelected
                ? 0.005
                : Math.min(0.003, wall.thickness * 0.008)
              : 0;
            mesh.position.set(box.localX, box.localY + yLift2D, 0);
            mesh.castShadow = !isSoftwareGl && !is2D && curHeight > 0.12 && !curXrayWalls;
            mesh.receiveShadow = true;
            mesh.userData.pickTarget = { kind: 'wall', wallId: wall.id } satisfies SelectionTarget;
            wallGroup.add(mesh);
            opaqueWallMeshesRef.current.push(mesh);

            if (curXrayWalls && !isFlatBlueprint) {
              const edges = new THREE.EdgesGeometry(geo, 25);
              const line = new THREE.LineSegments(edges, wallXrayEdgeMat);
              line.position.copy(mesh.position);
              line.raycast = noopRaycast;
              wallGroup.add(line);
            }
          }

        for (const item of normalizedOpenings) {
          const { opening, clampedOffset, clampedWidth } = item;
          const isOpSelected =
            curSelected?.kind === 'opening' &&
            curSelected.wallId === wall.id &&
            curSelected.openingId === opening.id;
          const activeFrameMat = isOpSelected ? frameSelectedMat : frameMat;
          const swing = opening.swingSide ?? 1;
          const targetOpen = opening.isOpen ? 1 : 0;
          const cachedProg = openingProgressCacheRef.current.get(opening.id);
          const initialProg = cachedProg !== undefined ? cachedProg : targetOpen;
          openingProgressCacheRef.current.set(opening.id, initialProg);

          const pickTarget: SelectionTarget = {
            kind: 'opening',
            wallId: wall.id,
            openingId: opening.id,
          };
          const interactMeta: OpeningInteractMeta = {
            wallId: wall.id,
            openingId: opening.id,
            type: opening.type,
            isOpen: Boolean(opening.isOpen),
          };

          if (isFlatBlueprint) {
            add2DArchitecturalSymbol(
              wallGroup,
              wall.id,
              wall.thickness,
              opening,
              clampedOffset,
              clampedWidth,
              effectiveRenderHeight + 0.02,
              isOpSelected,
            );
          } else if (isDoorOpening(opening.type)) {
            const doorVisH = Math.min(opening.height, curHeight);
            const jambThick = 0.045;
            const frameDepth = wall.thickness + 0.025;

            for (const side of [-1, 1]) {
              const jamb = new THREE.Mesh(
                new THREE.BoxGeometry(jambThick, doorVisH, frameDepth),
                activeFrameMat,
              );
              jamb.position.set(
                clampedOffset + side * (clampedWidth * 0.5 - jambThick * 0.5),
                doorVisH * 0.5,
                0,
              );
              tagOpeningHierarchy(jamb, pickTarget, interactMeta);
              wallGroup.add(jamb);
            }

            if (curHeight >= opening.height - 0.05) {
              const headBar = new THREE.Mesh(
                new THREE.BoxGeometry(clampedWidth, jambThick, frameDepth),
                activeFrameMat,
              );
              headBar.position.set(clampedOffset, doorVisH - jambThick * 0.5, 0);
              tagOpeningHierarchy(headBar, pickTarget, interactMeta);
              wallGroup.add(headBar);
            }

            if (opening.type === 'door') {
              const hingeDir = opening.hingeSide === 'right' ? 1 : -1;
              const leafWidth = Math.max(0.2, clampedWidth - jambThick * 2);
              const leafPivot = new THREE.Group();
              leafPivot.position.set(
                clampedOffset + hingeDir * (clampedWidth * 0.5 - jambThick),
                0,
                0,
              );
              const leafMesh = new THREE.Mesh(
                new THREE.BoxGeometry(leafWidth, Math.max(0.1, doorVisH - 0.03), 0.042),
                doorLeafMat,
              );
              leafMesh.position.set(-hingeDir * leafWidth * 0.5, doorVisH * 0.5, 0);
              leafMesh.castShadow = !isSoftwareGl;
              leafPivot.add(leafMesh);

              // Door handle on both faces opposite the hinge
              const knob = new THREE.Mesh(
                new THREE.SphereGeometry(0.036, 10, 10),
                handleBrassMat,
              );
              knob.position.set(-hingeDir * (leafWidth - 0.09), Math.min(1.02, doorVisH * 0.5), 0);
              knob.scale.set(1, 1, 1.8);
              leafPivot.add(knob);

              tagOpeningHierarchy(leafPivot, pickTarget, interactMeta);
              wallGroup.add(leafPivot);

              const applyDoor = (p: number) => {
                leafPivot.rotation.y = p * swing * hingeDir * Math.PI * 0.48;
              };
              applyDoor(initialProg);
              openingAnimControllersRef.current.push({
                openingId: opening.id,
                currentProgress: initialProg,
                targetProgress: targetOpen,
                apply: applyDoor,
              });
            } else if (opening.type === 'double-door') {
              const innerSpan = Math.max(0.4, clampedWidth - jambThick * 2);
              const leafW = innerSpan * 0.5;
              const pivots: { pivot: THREE.Group; side: -1 | 1 }[] = [];

              for (const side of [-1, 1] as const) {
                const pivot = new THREE.Group();
                pivot.position.set(clampedOffset + side * (innerSpan * 0.5), 0, 0);
                const leaf = new THREE.Mesh(
                  new THREE.BoxGeometry(leafW - 0.01, Math.max(0.1, doorVisH - 0.03), 0.042),
                  doorLeafMat,
                );
                leaf.position.set(-side * (leafW * 0.5), doorVisH * 0.5, 0);
                leaf.castShadow = !isSoftwareGl;
                pivot.add(leaf);

                const knob = new THREE.Mesh(
                  new THREE.SphereGeometry(0.034, 10, 10),
                  handleBrassMat,
                );
                knob.position.set(-side * (leafW - 0.08), Math.min(1.02, doorVisH * 0.5), 0);
                knob.scale.set(1, 1, 1.8);
                pivot.add(knob);

                tagOpeningHierarchy(pivot, pickTarget, interactMeta);
                wallGroup.add(pivot);
                pivots.push({ pivot, side });
              }

              const applyDouble = (p: number) => {
                for (const itemPivot of pivots) {
                  itemPivot.pivot.rotation.y = p * itemPivot.side * swing * Math.PI * 0.47;
                }
              };
              applyDouble(initialProg);
              openingAnimControllersRef.current.push({
                openingId: opening.id,
                currentProgress: initialProg,
                targetProgress: targetOpen,
                apply: applyDouble,
              });
            } else if (opening.type === 'sliding-door') {
              // Sliding Door: closed when side-by-side; slides over fixed leaf in chosen slide direction when opened
              const slideDir = opening.hingeSide === 'right' ? -1 : 1;
              const innerSpan = Math.max(0.6, clampedWidth - jambThick * 2);
              const panelW = innerSpan * 0.52;
              const trackZ = Math.min(0.038, wall.thickness * 0.2);

              const buildSlidingPanel = (centerX: number, zOff: number): THREE.Group => {
                const group = new THREE.Group();
                group.position.set(centerX, 0, zOff);

                const glass = new THREE.Mesh(
                  new THREE.PlaneGeometry(Math.max(0.15, panelW - 0.09), Math.max(0.2, doorVisH - 0.12)),
                  glassMat,
                );
                glass.position.set(0, doorVisH * 0.5, 0);
                glass.renderOrder = 2;
                group.add(glass);

                const stileW = 0.045;
                for (const s of [-1, 1]) {
                  const stile = new THREE.Mesh(
                    new THREE.BoxGeometry(stileW, doorVisH - 0.04, 0.035),
                    activeFrameMat,
                  );
                  stile.position.set(s * (panelW * 0.5 - stileW * 0.5), doorVisH * 0.5, 0);
                  group.add(stile);
                }
                for (const ry of [0.03, doorVisH - 0.06]) {
                  const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(panelW, 0.05, 0.035),
                    activeFrameMat,
                  );
                  rail.position.set(0, ry, 0);
                  group.add(rail);
                }
                tagOpeningHierarchy(group, pickTarget, interactMeta);
                wallGroup.add(group);
                return group;
              };

              const fixedX = clampedOffset - slideDir * (innerSpan * 0.5 - panelW * 0.5);
              const closedSlideX = clampedOffset + slideDir * (innerSpan * 0.5 - panelW * 0.5);
              const openSlideX = fixedX + slideDir * 0.08;

              buildSlidingPanel(fixedX, -swing * trackZ);
              const slidingPanel = buildSlidingPanel(closedSlideX, swing * trackZ);

              const applySlide = (p: number) => {
                slidingPanel.position.x = THREE.MathUtils.lerp(closedSlideX, openSlideX, p);
              };
              applySlide(initialProg);
              openingAnimControllersRef.current.push({
                openingId: opening.id,
                currentProgress: initialProg,
                targetProgress: targetOpen,
                apply: applySlide,
              });
            } else {
              // Overhead Sectional Garage Door: rises up jamb tracks, rounds corner curve, and rests flat against ceiling
              const innerW = Math.max(0.45, clampedWidth - jambThick * 2);
              const ceilingY =
                curHeight >= doorVisH + 0.08
                  ? curHeight - 0.07
                  : Math.max(doorVisH * 0.8, curHeight - 0.045);
              const curveR = Math.min(0.22, Math.max(0.1, ceilingY * 0.12));
              const vertLen = Math.max(0.14, ceilingY - curveR);
              const arcLen = (Math.PI * 0.5) * curveR;
              const horizDepth = doorVisH + 0.12;
              const panelCount = 5;
              const panelH = doorVisH / panelCount;
              const panelThick = 0.042;
              const maxTravel = vertLen + arcLen;

              // Left & right vertical + overhead ceiling tracks
              const railRadius = 0.016;
              for (const side of [-1, 1] as const) {
                const railX = clampedOffset + side * (innerW * 0.5 + 0.02);

                const vRail = new THREE.Mesh(
                  new THREE.BoxGeometry(railRadius * 2, vertLen, railRadius * 2),
                  garageTrackMat,
                );
                vRail.position.set(railX, vertLen * 0.5, 0);
                tagOpeningHierarchy(vRail, pickTarget, interactMeta);
                wallGroup.add(vRail);

                const hRail = new THREE.Mesh(
                  new THREE.BoxGeometry(railRadius * 2, railRadius * 2, horizDepth),
                  garageTrackMat,
                );
                hRail.position.set(
                  railX,
                  ceilingY + panelThick * 0.55,
                  swing * (curveR + horizDepth * 0.5),
                );
                tagOpeningHierarchy(hRail, pickTarget, interactMeta);
                wallGroup.add(hRail);

                // Curve elbow connecting vertical track to ceiling rail
                const elbowPts = 6;
                for (let eIdx = 0; eIdx < elbowPts; eIdx++) {
                  const thA = ((eIdx + 0.5) / elbowPts) * (Math.PI * 0.5);
                  const elbowSeg = new THREE.Mesh(
                    new THREE.BoxGeometry(
                      railRadius * 1.9,
                      (arcLen / elbowPts) * 1.15,
                      railRadius * 1.9,
                    ),
                    garageTrackMat,
                  );
                  elbowSeg.position.set(
                    railX,
                    vertLen + curveR * Math.sin(thA),
                    swing * curveR * (1 - Math.cos(thA)),
                  );
                  elbowSeg.rotation.x = swing * thA;
                  wallGroup.add(elbowSeg);
                }

                // Ceiling hanger brackets anchoring rail tail up to soffit
                const hangerTopY = Math.max(curHeight, ceilingY + 0.08);
                const hangerH = Math.max(0.06, hangerTopY - ceilingY);
                const hanger = new THREE.Mesh(
                  new THREE.BoxGeometry(0.02, hangerH, 0.02),
                  garageTrackMat,
                );
                hanger.position.set(
                  railX,
                  ceilingY + hangerH * 0.5,
                  swing * (curveR + horizDepth - 0.12),
                );
                wallGroup.add(hanger);
              }

              // Sectional insulated door slats with horizontal ribs, top lites & bottom handle
              const sectionGroups: THREE.Group[] = [];
              for (let i = 0; i < panelCount; i++) {
                const secGroup = new THREE.Group();
                const faceMat = isOpSelected ? frameSelectedMat : garagePanelMat;

                const slatMesh = new THREE.Mesh(
                  new THREE.BoxGeometry(innerW, Math.max(0.08, panelH - 0.012), panelThick),
                  faceMat,
                );
                slatMesh.castShadow = !isSoftwareGl;
                secGroup.add(slatMesh);

                // Horizontal dark articulation rib between sections
                const rib = new THREE.Mesh(
                  new THREE.BoxGeometry(innerW - 0.02, 0.016, panelThick + 0.008),
                  garageSeamMat,
                );
                rib.position.set(0, -panelH * 0.5 + 0.008, 0);
                secGroup.add(rib);

                // Frosted window transom lites on top panel
                if (i === panelCount - 1 && innerW >= 1.1) {
                  const liteCount = innerW >= 3.2 ? 4 : innerW >= 2.0 ? 3 : 2;
                  const liteW = Math.min(0.46, (innerW - 0.32) / liteCount);
                  const liteH = Math.max(0.08, panelH * 0.44);
                  const pitch = (innerW - 0.24) / liteCount;
                  for (let l = 0; l < liteCount; l++) {
                    const lx = -innerW * 0.5 + 0.12 + pitch * (l + 0.5);
                    const lite = new THREE.Mesh(
                      new THREE.BoxGeometry(liteW * 0.85, liteH, panelThick + 0.01),
                      glassMat,
                    );
                    lite.position.set(lx, 0, 0);
                    secGroup.add(lite);
                  }
                }

                // Centered lift handle & bottom weatherseal on bottom slat
                if (i === 0) {
                  const liftHandle = new THREE.Mesh(
                    new THREE.BoxGeometry(0.18, 0.028, panelThick + 0.028),
                    handleBrassMat,
                  );
                  liftHandle.position.set(0, -panelH * 0.12, 0);
                  secGroup.add(liftHandle);
                }

                secGroup.position.set(clampedOffset, 0, 0);
                tagOpeningHierarchy(secGroup, pickTarget, interactMeta);
                wallGroup.add(secGroup);
                sectionGroups.push(secGroup);
              }

              const evalGarageTrack = (s: number): { y: number; z: number; rotX: number } => {
                if (s <= vertLen) {
                  return { y: s, z: 0, rotX: 0 };
                }
                if (s <= vertLen + arcLen) {
                  const theta = ((s - vertLen) / arcLen) * (Math.PI * 0.5);
                  return {
                    y: vertLen + curveR * Math.sin(theta),
                    z: swing * curveR * (1 - Math.cos(theta)),
                    rotX: swing * theta,
                  };
                }
                const horizDist = s - (vertLen + arcLen);
                return {
                  y: ceilingY,
                  z: swing * (curveR + horizDist),
                  rotX: swing * (Math.PI * 0.5),
                };
              };

              const applyGarageDoor = (p: number) => {
                const travel = p * maxTravel;
                for (let i = 0; i < panelCount; i++) {
                  const s = (i + 0.5) * panelH + travel;
                  const pose = evalGarageTrack(s);
                  const sec = sectionGroups[i];
                  sec.position.y = pose.y;
                  sec.position.z = pose.z;
                  sec.rotation.x = pose.rotX;
                }
              };

              applyGarageDoor(initialProg);
              openingAnimControllersRef.current.push({
                openingId: opening.id,
                currentProgress: initialProg,
                targetProgress: targetOpen,
                apply: applyGarageDoor,
              });
            }
          } else {
            // 3D Interactive Casement Window (2 sashes, starts closed, swings open smoothly!)
            const winSill = opening.sillHeight;
            const winTop = Math.min(curHeight, winSill + opening.height);
            if (curHeight > winSill + 0.08) {
              const visH = winTop - winSill;
              const midY = winSill + visH * 0.5;
              const barThick = 0.04;
              const frameDepth = wall.thickness + 0.03;

              const outerParts: THREE.Mesh[] = [];
              const topRail = new THREE.Mesh(
                new THREE.BoxGeometry(clampedWidth, barThick, frameDepth),
                activeFrameMat,
              );
              topRail.position.set(clampedOffset, winTop - barThick * 0.5, 0);
              outerParts.push(topRail);

              const bottomRail = new THREE.Mesh(
                new THREE.BoxGeometry(clampedWidth, barThick, frameDepth),
                activeFrameMat,
              );
              bottomRail.position.set(clampedOffset, winSill + barThick * 0.5, 0);
              outerParts.push(bottomRail);

              for (const side of [-1, 1]) {
                const sideJamb = new THREE.Mesh(
                  new THREE.BoxGeometry(barThick, visH, frameDepth),
                  activeFrameMat,
                );
                sideJamb.position.set(clampedOffset + side * (clampedWidth * 0.5 - barThick * 0.5), midY, 0);
                outerParts.push(sideJamb);
              }

              for (const part of outerParts) {
                tagOpeningHierarchy(part, pickTarget, interactMeta);
                wallGroup.add(part);
              }

              // Casement Window Sashes (supports 'both' double-casement or 'left'/'right' single-casement, opening toward swingSide)
              const innerW = Math.max(0.24, clampedWidth - barThick * 2);
              const sashH = Math.max(0.14, visH - barThick * 2);
              const winHinge = opening.hingeSide ?? 'both';
              const sashSides: (-1 | 1)[] =
                winHinge === 'left' ? [-1] : winHinge === 'right' ? [1] : [-1, 1];
              const sashW = sashSides.length === 1 ? innerW : innerW * 0.5;
              const sashPivots: { pivot: THREE.Group; side: -1 | 1 }[] = [];

              for (const side of sashSides) {
                const pivot = new THREE.Group();
                pivot.position.set(clampedOffset + side * (innerW * 0.5), midY, swing * 0.014);
                const centerOff = -side * (sashW * 0.5);

                const glass = new THREE.Mesh(
                  new THREE.PlaneGeometry(Math.max(0.08, sashW - 0.06), Math.max(0.08, sashH - 0.06)),
                  glassMat,
                );
                glass.position.set(centerOff, 0, 0);
                glass.renderOrder = 2;
                pivot.add(glass);

                const railMat = isOpSelected ? frameSelectedMat : sashFrameMat;
                for (const s of [-1, 1]) {
                  const vRail = new THREE.Mesh(
                    new THREE.BoxGeometry(0.032, sashH, 0.036),
                    railMat,
                  );
                  vRail.position.set(centerOff + s * (sashW * 0.5 - 0.016), 0, 0);
                  pivot.add(vRail);
                }
                for (const s of [-1, 1]) {
                  const hRail = new THREE.Mesh(
                    new THREE.BoxGeometry(sashW, 0.032, 0.036),
                    railMat,
                  );
                  hRail.position.set(centerOff, s * (sashH * 0.5 - 0.016), 0);
                  pivot.add(hRail);
                }

                // Exterior hinge barrels on swing face so closed window side (In/Out) is clear in 3D
                for (const hy of [-sashH * 0.28, sashH * 0.28]) {
                  const hingePin = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.009, 0.009, 0.055, 8),
                    handleBrassMat,
                  );
                  hingePin.position.set(-side * 0.01, hy, swing * 0.022);
                  pivot.add(hingePin);
                }

                // Window latch handle on the opening stile pointing toward swing face
                const handle = new THREE.Mesh(
                  new THREE.BoxGeometry(0.018, 0.08, 0.048),
                  handleBrassMat,
                );
                handle.position.set(-side * (sashW - 0.028), 0, swing * 0.034);
                pivot.add(handle);

                tagOpeningHierarchy(pivot, pickTarget, interactMeta);
                wallGroup.add(pivot);
                sashPivots.push({ pivot, side });
              }

              const applyWindow = (p: number) => {
                for (const sp of sashPivots) {
                  sp.pivot.rotation.y = p * sp.side * swing * Math.PI * 0.42;
                }
              };
              applyWindow(initialProg);
              openingAnimControllersRef.current.push({
                openingId: opening.id,
                currentProgress: initialProg,
                targetProgress: targetOpen,
                apply: applyWindow,
              });
            }
          }

          // Opening dimension tag in 2D mode
          if (is2D && curShowDims) {
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const outSide = getWallOutwardSide(wall, curWalls);
            const normX = -sinA * outSide;
            const normZ = cosA * outSide;
            const opWorldX = wall.start.x + cosA * clampedOffset + normX * (wall.thickness * 0.5 + 0.25);
            const opWorldZ = wall.start.z + sinA * clampedOffset + normZ * (wall.thickness * 0.5 + 0.25);
            dimensionAnchorsRef.current.push({
              id: `op-${opening.id}`,
              worldPos: new THREE.Vector3(opWorldX, slabTopY + 0.16, opWorldZ),
              text: `${openingShortCode(opening.type)} ${clampedWidth.toFixed(2)} m`,
              numericValue: Number(clampedWidth.toFixed(2)),
              kind: 'opening',
              wallId: wall.id,
              openingId: opening.id,
              selected: isOpSelected || isWallSelected,
              minFrustum: 22,
            });
          }
        }

        // Architectural dimension lines in 2D mode
        if (is2D && curShowDims && len >= 0.35) {
          const isInnerWall = isInteriorMergedWall(wall, curWalls);
          const outSide = getWallOutwardSide(wall, curWalls);
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const ux = cosA;
          const uz = sinA;
          const nx = -sinA * outSide;
          const nz = cosA * outSide;
          const dimY = slabTopY + 0.15;
          const sx = wall.start.x;
          const sz = wall.start.z;

          if (!isInnerWall) {
            const outerRes = computeWallOuterDimensions(wall, curWalls);
            const hasSplitBays = outerRes.baySpans.length > 1;
            const spansToDraw = [
              ...outerRes.baySpans.map((sp, idx) => ({ sp, isBay: true, idx })),
              ...(outerRes.overallSpans.length > 0
                ? outerRes.overallSpans.map((sp, idx) => ({ sp, isBay: false, idx }))
                : [
                    {
                      sp: {
                        startS: -outerRes.startExtend,
                        endS: len + outerRes.endExtend,
                        outerLength: outerRes.outerLength,
                        outSide,
                      },
                      isBay: false,
                      idx: 0,
                    },
                  ]),
            ];

            for (const { sp, isBay, idx } of spansToDraw) {
              const sNx = -sinA * sp.outSide;
              const sNz = cosA * sp.outSide;
              const dimOffset = wall.thickness * 0.5 + (!isBay && hasSplitBays ? 0.94 : 0.62);
              const extStartGap = wall.thickness * 0.5 + 0.1;
              const extOvershoot = dimOffset + 0.16;

              const osx = sx + ux * sp.startS;
              const osz = sz + uz * sp.startS;
              const oex = sx + ux * sp.endS;
              const oez = sz + uz * sp.endS;

              const p1x = osx + sNx * dimOffset;
              const p1z = osz + sNz * dimOffset;
              const p2x = oex + sNx * dimOffset;
              const p2z = oez + sNz * dimOffset;

              dimLineVerts.push(
                osx + sNx * extStartGap, dimY, osz + sNz * extStartGap,
                osx + sNx * extOvershoot, dimY, osz + sNz * extOvershoot,
                oex + sNx * extStartGap, dimY, oez + sNz * extStartGap,
                oex + sNx * extOvershoot, dimY, oez + sNz * extOvershoot,
                p1x, dimY, p1z,
                p2x, dimY, p2z,
              );

              const tickR = 0.11;
              const tx = (ux + sNx) * tickR;
              const tz = (uz + sNz) * tickR;
              dimTickVerts.push(
                p1x - tx, dimY, p1z - tz,
                p1x + tx, dimY, p1z + tz,
                p2x - tx, dimY, p2z - tz,
                p2x + tx, dimY, p2z + tz,
              );

              dimensionAnchorsRef.current.push({
                id: isBay
                  ? `wall-bay-${wall.id}-${idx}`
                  : idx === 0
                    ? `wall-${wall.id}`
                    : `wall-ov-${wall.id}-${idx}`,
                worldPos: new THREE.Vector3((p1x + p2x) * 0.5, dimY, (p1z + p2z) * 0.5),
                text: `${sp.outerLength.toFixed(2)} m`,
                numericValue: Number(sp.outerLength.toFixed(2)),
                kind: 'wall',
                wallId: wall.id,
                extraOuterLength: Number((sp.outerLength - len).toFixed(4)),
                selected: isWallSelected,
                minFrustum: isBay ? 24 : undefined,
              });
            }
          }

          // Inner clear room dimensions on inward side
          if (curShowInnerDims) {
            const { inSide, spans } = computeWallInnerDimensions(wall, curWalls);
            const inx = -sinA * inSide;
            const inz = cosA * inSide;
            const inDimOff = wall.thickness * 0.5 + 0.34;
            const inGap = wall.thickness * 0.5 + 0.06;
            const inOver = inDimOff + 0.1;

            spans.forEach((span, idx) => {
              const ax = sx + ux * span.startS;
              const az = sz + uz * span.startS;
              const bx = sx + ux * span.endS;
              const bz = sz + uz * span.endS;

              const q1x = ax + inx * inDimOff;
              const q1z = az + inz * inDimOff;
              const q2x = bx + inx * inDimOff;
              const q2z = bz + inz * inDimOff;

              innerDimLineVerts.push(
                ax + inx * inGap, dimY, az + inz * inGap,
                ax + inx * inOver, dimY, az + inz * inOver,
                bx + inx * inGap, dimY, bz + inz * inGap,
                bx + inx * inOver, dimY, bz + inz * inOver,
                q1x, dimY, q1z,
                q2x, dimY, q2z,
              );

              const itR = 0.085;
              const itx = (ux + inx) * itR;
              const itz = (uz + inx * 0 + inz) * itR;
              innerDimTickVerts.push(
                q1x - itx, dimY, q1z - itz,
                q1x + itx, dimY, q1z + itz,
                q2x - itx, dimY, q2z - itz,
                q2x + itx, dimY, q2z + itz,
              );

              dimensionAnchorsRef.current.push({
                id: `inner-${wall.id}-${idx}`,
                worldPos: new THREE.Vector3((q1x + q2x) * 0.5, dimY, (q1z + q2z) * 0.5),
                text: `${span.clearLength.toFixed(2)} m`,
                numericValue: Number(span.clearLength.toFixed(2)),
                kind: 'inner',
                wallId: wall.id,
                selected: isWallSelected,
                minFrustum: 28,
              });
            });
          }
        }

        if (is2D && isWallSelected) {
          for (const endKind of ['start', 'end'] as const) {
            const pt = wall[endKind];
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 18), handleMat);
            grip.position.set(pt.x, slabTopY + effectiveRenderHeight + 0.08, pt.z);
            grip.userData.cornerHandle = { pos: { ...pt } };
            handleGroup.add(grip);
          }
        }
      }

      // Clipped 2D architectural outlines so inner walls fuse cleanly with outer walls
      if (isFlatBlueprint && curWalls.length > 0) {
        const selectedWallId = curSelected?.kind === 'wall' ? curSelected.wallId : null;
        const { regularVerts, selectedVerts } = buildClipped2DWallOutlineVertices(
          curWalls,
          slabTopY + effectiveRenderHeight + 0.004,
          selectedWallId,
        );
        if (regularVerts.length > 0) {
          const outlineGeo = new THREE.BufferGeometry();
          outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(regularVerts, 3));
          const outlineLines = new THREE.LineSegments(outlineGeo, wallCapLineMat);
          outlineLines.raycast = noopRaycast;
          houseGroup.add(outlineLines);
        }
        if (selectedVerts.length > 0) {
          const selOutlineGeo = new THREE.BufferGeometry();
          selOutlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(selectedVerts, 3));
          const selOutlineLines = new THREE.LineSegments(selOutlineGeo, wallCapLineMat);
          selOutlineLines.raycast = noopRaycast;
          houseGroup.add(selOutlineLines);
        }
      }

      // Closed rooms: automatic ceiling slab in 3D, 2D room area badges, and 3D measured dimensions
      const is3DWithWalkDims =
        curShowWalkDims && (curView === '3d-walk' || curView === '3d-orbit') && !curCameraViewId;
      const closedRooms =
        curWalls.length >= 3 && (curShowRoomAreas || curShowCeiling || is3DWithWalkDims)
          ? detectClosedRooms(curWalls, curCustomRoomNames)
          : [];

      // Flat interior ceiling slab (rendered in 'flat' and 'gable', omitted in 'open-gable' so roof space stays vaulted/open)
      if (
        !isFlatBlueprint &&
        curShowCeiling &&
        (curCeilingMode === 'flat' || curCeilingMode === 'gable') &&
        curHeight > 0.35 &&
        closedRooms.length > 0
      ) {
        const activeCeilingMat = curXrayWalls ? ceilingXrayMat : ceilingMat;
        for (const room of closedRooms) {
          if (room.ceilingPolygon.length < 3) continue;
          const shape = new THREE.Shape();
          room.ceilingPolygon.forEach((p, idx) => {
            if (idx === 0) shape.moveTo(p.x, -p.z);
            else shape.lineTo(p.x, -p.z);
          });
          shape.closePath();

          const ceilingGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.14,
            bevelEnabled: false,
          });
          ceilingGeo.rotateX(-Math.PI / 2);
          const ceilingMesh = new THREE.Mesh(ceilingGeo, activeCeilingMat);
          ceilingMesh.position.y = slabTopY + curHeight - 0.002;
          ceilingMesh.castShadow = false;
          ceilingMesh.receiveShadow = true;
          ceilingMesh.raycast = noopRaycast;
          houseGroup.add(ceilingMesh);
        }
      }

      // Classic Triangle Pitched Gable Roof ('gable' with flat ceiling below, or 'open-gable' exposed cathedral rafters)
      if (
        !isFlatBlueprint &&
        curShowCeiling &&
        (curCeilingMode === 'gable' || curCeilingMode === 'open-gable') &&
        roofParams
      ) {
        const {
          centerX: rcx,
          centerZ: rcz,
          ridgeAlongX,
          halfSpan,
          ridgeLength,
          ridgeRise,
          eaveBaseY,
        } = roofParams;
        const overhang = 0.28;
        const roofThick = 0.14;
        const pitchAngle = Math.atan2(ridgeRise, halfSpan);
        const slopeRun = Math.hypot(halfSpan, ridgeRise) + overhang;
        const totalRoofLen = ridgeLength + overhang * 2;
        const roofMatActive = curXrayWalls ? ceilingXrayMat : roofExteriorMat;
        const gableEndMatActive = curXrayWalls
          ? ceilingXrayMat
          : getWall3DMaterial(curDefaultColor, false);

        const gableGroup = new THREE.Group();
        gableGroup.position.set(rcx, eaveBaseY, rcz);
        if (!ridgeAlongX) {
          gableGroup.rotation.y = Math.PI / 2;
        }

        // Two pitched roof slopes
        for (const side of [-1, 1] as const) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(totalRoofLen, roofThick, slopeRun),
            roofMatActive,
          );
          const midDist = (halfSpan - overhang * 0.5) * 0.5;
          const midY = (ridgeRise - Math.tan(pitchAngle) * overhang * 0.5) * 0.5;
          panel.position.set(0, midY + roofThick * 0.45, side * midDist);
          panel.rotation.x = side * pitchAngle;
          panel.castShadow = !isSoftwareGl && !curXrayWalls;
          panel.receiveShadow = true;
          panel.raycast = noopRaycast;
          gableGroup.add(panel);
        }

        // Exterior ridge cap beam
        const ridgeCap = new THREE.Mesh(
          new THREE.BoxGeometry(totalRoofLen + 0.04, 0.12, 0.16),
          curXrayWalls ? ceilingXrayMat : roofRidgeMat,
        );
        ridgeCap.position.set(0, ridgeRise + roofThick * 0.55, 0);
        ridgeCap.castShadow = !isSoftwareGl && !curXrayWalls;
        ridgeCap.raycast = noopRaycast;
        gableGroup.add(ridgeCap);

        // Two triangular gable end walls closing front & back of the roof
        const gableShape = new THREE.Shape();
        gableShape.moveTo(-halfSpan, 0);
        gableShape.lineTo(halfSpan, 0);
        gableShape.lineTo(0, ridgeRise);
        gableShape.closePath();

        const gableEndThick = 0.16;
        const gableEndGeo = new THREE.ExtrudeGeometry(gableShape, {
          depth: gableEndThick,
          bevelEnabled: false,
        });
        gableEndGeo.rotateY(Math.PI / 2);

        for (const endSign of [-1, 1] as const) {
          const endMesh = new THREE.Mesh(gableEndGeo, gableEndMatActive);
          endMesh.position.set(
            endSign * (ridgeLength * 0.5 - gableEndThick * 0.5),
            0,
            0,
          );
          if (endSign < 0) {
            endMesh.position.x = -ridgeLength * 0.5;
          } else {
            endMesh.position.x = ridgeLength * 0.5 - gableEndThick;
          }
          endMesh.castShadow = !isSoftwareGl && !curXrayWalls;
          endMesh.receiveShadow = true;
          endMesh.raycast = noopRaycast;
          gableGroup.add(endMesh);
        }

        // Open-ceiling mode: exposed interior timber ridge beam, rafters & collar ties
        if (curCeilingMode === 'open-gable') {
          const timberRidge = new THREE.Mesh(
            new THREE.BoxGeometry(ridgeLength, 0.16, 0.11),
            rafterWoodMat,
          );
          timberRidge.position.set(0, ridgeRise - 0.08, 0);
          timberRidge.castShadow = !isSoftwareGl;
          timberRidge.raycast = noopRaycast;
          gableGroup.add(timberRidge);

          const rafterBayCount = Math.max(2, Math.round(ridgeLength / 1.35));
          const rafterSpanLen = Math.hypot(halfSpan, ridgeRise);
          for (let i = 1; i < rafterBayCount; i++) {
            const rx = -ridgeLength * 0.5 + (i / rafterBayCount) * ridgeLength;
            for (const side of [-1, 1] as const) {
              const rafter = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.12, rafterSpanLen),
                rafterWoodMat,
              );
              rafter.position.set(rx, ridgeRise * 0.5 - 0.06, side * (halfSpan * 0.5));
              rafter.rotation.x = side * pitchAngle;
              rafter.castShadow = !isSoftwareGl;
              rafter.raycast = noopRaycast;
              gableGroup.add(rafter);
            }

            if (i % 2 === 1) {
              const collarWidth = halfSpan * 0.85;
              const collarTie = new THREE.Mesh(
                new THREE.BoxGeometry(0.075, 0.095, collarWidth),
                rafterWoodMat,
              );
              collarTie.position.set(rx, ridgeRise * 0.58 - 0.05, 0);
              collarTie.castShadow = !isSoftwareGl;
              collarTie.raycast = noopRaycast;
              gableGroup.add(collarTie);
            }
          }
        }

        houseGroup.add(gableGroup);
      }

      if ((is2D || (!isFlatBlueprint && !curCameraViewId)) && curShowRoomAreas && closedRooms.length > 0) {
        const badgeY = is2D
          ? slabTopY + effectiveRenderHeight + 0.06
          : slabTopY + Math.max(0.85, curHeight * 0.42);
        for (const room of closedRooms) {
          roomAnchorsRef.current.push({
            id: `room-area-${room.id}`,
            roomId: room.id,
            worldPos: new THREE.Vector3(room.centroid.x, badgeY, room.centroid.z),
            name: room.name,
            areaSqM: room.netAreaSqM,
          });
        }
      }

      if (!isFlatBlueprint && is3DWithWalkDims) {
        for (const room of closedRooms) {
          walkDimAnchorsRef.current.push({
            id: `walk-room-${room.id}`,
            worldPos: new THREE.Vector3(
              room.centroid.x,
              slabTopY + Math.max(1.2, curHeight - 0.28),
              room.centroid.z,
            ),
            text: `${room.name} · ${room.netAreaSqM.toFixed(1)} m² · H ${curHeight.toFixed(2)} m`,
            badgeKind: 'room',
          });
        }

        const seenHeightCorners: Point2D[] = [];
        const add3DTick = (
          verts: number[],
          px: number,
          py: number,
          pz: number,
          tx: number,
          ty: number,
          tz: number,
        ) => {
          verts.push(px - tx, py - ty, pz - tz, px + tx, py + ty, pz + tz);
        };

        for (const wall of curWalls) {
          const wLen = wallLength(wall);
          if (wLen < 0.35) continue;
          const ang = wallAngleRad(wall);
          const cosA = Math.cos(ang);
          const sinA = Math.sin(ang);
          const ux = cosA;
          const uz = sinA;
          const outSide = getWallOutwardSide(wall, curWalls);
          const nx = -sinA * outSide;
          const nz = cosA * outSide;
          const outerRes = computeWallOuterDimensions(wall, curWalls);
          const { inSide, spans } = computeWallInnerDimensions(wall, curWalls);
          const dY = slabTopY + 0.035;

          if (outerRes.overallSpans.length > 0) {
            const hasSplitBays = outerRes.baySpans.length > 1;
            const spansToDraw = [
              ...outerRes.baySpans.map((sp, idx) => ({ sp, isBay: true, idx })),
              ...outerRes.overallSpans.map((sp, idx) => ({ sp, isBay: false, idx })),
            ];

            for (const entry of spansToDraw) {
              const { sp, isBay, idx } = entry;
              const sNx = -sinA * sp.outSide;
              const sNz = cosA * sp.outSide;
              const outOff =
                wall.thickness * 0.5 + (!isBay && hasSplitBays ? 0.54 : 0.3);
              const gap = wall.thickness * 0.5 + 0.04;
              const over = outOff + 0.09;

              const osx = wall.start.x + ux * sp.startS;
              const osz = wall.start.z + uz * sp.startS;
              const oex = wall.start.x + ux * sp.endS;
              const oez = wall.start.z + uz * sp.endS;

              const p1x = osx + sNx * outOff;
              const p1z = osz + sNz * outOff;
              const p2x = oex + sNx * outOff;
              const p2z = oez + sNz * outOff;

              dimLineVerts.push(
                osx + sNx * gap, dY, osz + sNz * gap,
                osx + sNx * over, dY, osz + sNz * over,
                oex + sNx * gap, dY, oez + sNz * gap,
                oex + sNx * over, dY, oez + sNz * over,
                p1x, dY, p1z,
                p2x, dY, p2z,
              );
              add3DTick(dimTickVerts, p1x, dY, p1z, (ux + sNx) * 0.075, 0, (uz + sNz) * 0.075);
              add3DTick(dimTickVerts, p2x, dY, p2z, (ux + sNx) * 0.075, 0, (uz + sNz) * 0.075);

              walkDimAnchorsRef.current.push({
                id: `walk-wall-${wall.id}-${isBay ? 'bay' : 'ov'}-${idx}`,
                worldPos: new THREE.Vector3((p1x + p2x) * 0.5, dY + 0.16, (p1z + p2z) * 0.5),
                text: `${isBay ? 'Bay' : 'Wall'} ${sp.outerLength.toFixed(2)} m`,
                badgeKind: 'wall',
              });
            }

            // Vertical wall height dimension line measured right from outer corner
            const firstSp = outerRes.overallSpans[0];
            const firstNx = -sinA * firstSp.outSide;
            const firstNz = cosA * firstSp.outSide;
            const osx0 = wall.start.x + ux * firstSp.startS;
            const osz0 = wall.start.z + uz * firstSp.startS;
            const cPos = { x: osx0, z: osz0 };
            if (!seenHeightCorners.some((c) => distance2D(c, cPos) < 0.25)) {
              seenHeightCorners.push(cPos);
              const hX = osx0 + (firstNx - ux * 0.25) * (wall.thickness * 0.5 + 0.22);
              const hZ = osz0 + (firstNz - uz * 0.25) * (wall.thickness * 0.5 + 0.22);
              const botY = slabTopY;
              const topY = slabTopY + curHeight;
              dimLineVerts.push(
                osx0 + firstNx * (wall.thickness * 0.5), botY + 0.01, osz0 + firstNz * (wall.thickness * 0.5),
                hX + firstNx * 0.06, botY + 0.01, hZ + firstNz * 0.06,
                osx0 + firstNx * (wall.thickness * 0.5), topY, osz0 + firstNz * (wall.thickness * 0.5),
                hX + firstNx * 0.06, topY, hZ + firstNz * 0.06,
                hX, botY, hZ,
                hX, topY, hZ,
              );
              add3DTick(dimTickVerts, hX, botY, hZ, firstNx * 0.055, 0.055, firstNz * 0.055);
              add3DTick(dimTickVerts, hX, topY, hZ, firstNx * 0.055, 0.055, firstNz * 0.055);
              walkDimAnchorsRef.current.push({
                id: `walk-wall-h-${wall.id}`,
                worldPos: new THREE.Vector3(hX, (botY + topY) * 0.5, hZ),
                text: `H ${curHeight.toFixed(2)} m`,
                badgeKind: 'wall',
              });
            }
          } else if (spans.length === 0) {
            const p1x = wall.start.x + nx * (wall.thickness * 0.5 + 0.24);
            const p1z = wall.start.z + nz * (wall.thickness * 0.5 + 0.24);
            const p2x = wall.end.x + nx * (wall.thickness * 0.5 + 0.24);
            const p2z = wall.end.z + nz * (wall.thickness * 0.5 + 0.24);
            dimLineVerts.push(p1x, dY, p1z, p2x, dY, p2z);
            walkDimAnchorsRef.current.push({
              id: `walk-wall-${wall.id}`,
              worldPos: new THREE.Vector3((p1x + p2x) * 0.5, dY + 0.16, (p1z + p2z) * 0.5),
              text: `Wall ${wLen.toFixed(2)} m`,
              badgeKind: 'wall',
            });
          }

          const inx = -sinA * inSide;
          const inz = cosA * inSide;
          const inOff = wall.thickness * 0.5 + 0.2;
          const inGap = wall.thickness * 0.5 + 0.03;
          const inOver = inOff + 0.08;
          spans.forEach((span, idx) => {
            const ax = wall.start.x + ux * span.startS;
            const az = wall.start.z + uz * span.startS;
            const bx = wall.start.x + ux * span.endS;
            const bz = wall.start.z + uz * span.endS;

            const q1x = ax + inx * inOff;
            const q1z = az + inz * inOff;
            const q2x = bx + inx * inOff;
            const q2z = bz + inz * inOff;

            innerDimLineVerts.push(
              ax + inx * inGap, dY, az + inz * inGap,
              ax + inx * inOver, dY, az + inz * inOver,
              bx + inx * inGap, dY, bz + inz * inGap,
              bx + inx * inOver, dY, bz + inz * inOver,
              q1x, dY, q1z,
              q2x, dY, q2z,
            );
            add3DTick(innerDimTickVerts, q1x, dY, q1z, (ux + inx) * 0.065, 0, (uz + inz) * 0.065);
            add3DTick(innerDimTickVerts, q2x, dY, q2z, (ux + inx) * 0.065, 0, (uz + inz) * 0.065);

            walkDimAnchorsRef.current.push({
              id: `walk-span-${wall.id}-${idx}`,
              worldPos: new THREE.Vector3((q1x + q2x) * 0.5, dY + 0.14, (q1z + q2z) * 0.5),
              text: `Span ${span.clearLength.toFixed(2)} m`,
              badgeKind: 'wall',
            });
          });

          const { normalizedOpenings } = decomposeWallIntoBoxes(wall, curHeight, 0, 0, curWalls);
          for (const item of normalizedOpenings) {
            const op = item.opening;
            const halfW = item.clampedWidth * 0.5;
            const sLeft = item.clampedOffset - halfW;
            const sRight = item.clampedOffset + halfW;
            const j1x = wall.start.x + ux * sLeft;
            const j1z = wall.start.z + uz * sLeft;
            const j2x = wall.start.x + ux * sRight;
            const j2z = wall.start.z + uz * sRight;

            const effSill = Math.max(0, Math.min(curHeight - 0.1, op.sillHeight));
            const effHeight = Math.max(0.1, Math.min(curHeight - effSill, op.height));
            const opFaceOff = wall.thickness * 0.5 + 0.14;
            const opGap = wall.thickness * 0.5 + 0.02;
            const opOver = opFaceOff + 0.06;
            const sillY = slabTopY + Math.max(0.035, effSill + 0.015);
            const topY = slabTopY + Math.min(curHeight, effSill + effHeight);

            const o1x = j1x + nx * opFaceOff;
            const o1z = j1z + nz * opFaceOff;
            const o2x = j2x + nx * opFaceOff;
            const o2z = j2z + nz * opFaceOff;

            // Width dimension line measured directly across the opening jambs
            openingDimLineVerts.push(
              j1x + nx * opGap, sillY, j1z + nz * opGap,
              j1x + nx * opOver, sillY, j1z + nz * opOver,
              j2x + nx * opGap, sillY, j2z + nz * opGap,
              j2x + nx * opOver, sillY, j2z + nz * opOver,
              o1x, sillY, o1z,
              o2x, sillY, o2z,
            );
            add3DTick(openingDimTickVerts, o1x, sillY, o1z, (ux + nx) * 0.05, 0, (uz + nz) * 0.05);
            add3DTick(openingDimTickVerts, o2x, sillY, o2z, (ux + nx) * 0.05, 0, (uz + nz) * 0.05);

            // Vertical height dimension line right next to the opening jamb
            const hLineX = j2x + nx * opFaceOff + ux * 0.08;
            const hLineZ = j2z + nz * opFaceOff + uz * 0.08;
            const botOpY = slabTopY + effSill;
            openingDimLineVerts.push(
              j2x + nx * opGap, botOpY, j2z + nz * opGap,
              hLineX + nx * 0.04, botOpY, hLineZ + nz * 0.04,
              j2x + nx * opGap, topY, j2z + nz * opGap,
              hLineX + nx * 0.04, topY, hLineZ + nz * 0.04,
              hLineX, botOpY, hLineZ,
              hLineX, topY, hLineZ,
            );
            add3DTick(openingDimTickVerts, hLineX, botOpY, hLineZ, nx * 0.045, 0.045, nz * 0.045);
            add3DTick(openingDimTickVerts, hLineX, topY, hLineZ, nx * 0.045, 0.045, nz * 0.045);

            // Sill height witness line for windows
            if (effSill > 0.08) {
              const sLineX = j1x + nx * opFaceOff - ux * 0.08;
              const sLineZ = j1z + nz * opFaceOff - uz * 0.08;
              openingDimLineVerts.push(
                j1x + nx * opGap, slabTopY + 0.02, j1z + nz * opGap,
                sLineX + nx * 0.04, slabTopY + 0.02, sLineZ + nz * 0.04,
                sLineX, slabTopY + 0.02, sLineZ,
                sLineX, botOpY, sLineZ,
              );
              add3DTick(openingDimTickVerts, sLineX, slabTopY + 0.02, sLineZ, nx * 0.04, 0.04, nz * 0.04);
              add3DTick(openingDimTickVerts, sLineX, botOpY, sLineZ, nx * 0.04, 0.04, nz * 0.04);
            }

            const label =
              op.type === 'window'
                ? `Win ${item.clampedWidth.toFixed(2)}×${effHeight.toFixed(2)}m · Sill ${effSill.toFixed(2)}m`
                : `${openingShortCode(op.type)} ${item.clampedWidth.toFixed(2)}×${effHeight.toFixed(2)}m`;
            walkDimAnchorsRef.current.push({
              id: `walk-op-${op.id}`,
              worldPos: new THREE.Vector3((o1x + o2x) * 0.5, (botOpY + topY) * 0.5, (o1z + o2z) * 0.5),
              text: label,
              badgeKind: 'opening',
            });
          }
        }
      }

      // Render subtle grabbable corner nodes across all joints in 2D Select mode
      if (is2D && curTool === 'select') {
        const seenCorners: Point2D[] = [];
        for (const w of curWalls) {
          for (const pt of [w.start, w.end]) {
            if (!seenCorners.some((c) => distance2D(c, pt) < 0.05)) {
              seenCorners.push(pt);
              const isSelectedWallEndpoint =
                curSelected?.kind === 'wall' &&
                curWalls.some(
                  (sw) =>
                    sw.id === curSelected.wallId &&
                    (distance2D(sw.start, pt) < 0.05 || distance2D(sw.end, pt) < 0.05),
                );
              if (!isSelectedWallEndpoint) {
                const node = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), cornerNodeMat);
                node.position.set(pt.x, slabTopY + effectiveRenderHeight + 0.05, pt.z);
                node.userData.cornerHandle = { pos: { ...pt } };
                handleGroup.add(node);
              }
            }
          }
        }
      }
      } // End if (curShowStructure)

      if (curShowStructure && dimLineVerts.length > 0) {
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(dimLineVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(lineGeo, dimLineMat));

        const tickGeo = new THREE.BufferGeometry();
        tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(dimTickVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(tickGeo, dimTickMat));
      }

      if (curShowStructure && innerDimLineVerts.length > 0) {
        const inLineGeo = new THREE.BufferGeometry();
        inLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerDimLineVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(inLineGeo, innerDimLineMat));

        const inTickGeo = new THREE.BufferGeometry();
        inTickGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerDimTickVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(inTickGeo, innerDimTickMat));
      }

      if (curShowStructure && openingDimLineVerts.length > 0) {
        const opLineGeo = new THREE.BufferGeometry();
        opLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(openingDimLineVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(opLineGeo, openingDimLineMat));

        const opTickGeo = new THREE.BufferGeometry();
        opTickGeo.setAttribute('position', new THREE.Float32BufferAttribute(openingDimTickVerts, 3));
        dimensionGroup.add(new THREE.LineSegments(opTickGeo, openingDimTickMat));
      }

      // Render EU electrical junction points + staggered multi-breaker conduits ONLY when showWiring is enabled
      if (curShowWiring) {
        for (const j of curJunctions) {
          const info = getJunctionWorldInfo(j, curWalls, curHeight, slabTopY);
          if (!info) continue;

          const isJSelected = curSelected?.kind === 'junction' && curSelected.junctionId === j.id;
          const jMat = isJSelected
            ? wireSelectedMat
            : getWireMaterial(JUNCTION_KIND_INFO[j.kind].color);
          const pickTarget: SelectionTarget = { kind: 'junction', junctionId: j.id };
          const powered = isJunctionPoweredByBreaker(j.id, curWires, curJunctions, curWalls);
          const isLit = (j.kind === 'ceiling-light' || j.kind === 'wall-light') && j.isOn !== false && powered;
          const faceYaw = -info.wallAngle + (info.faceSide < 0 ? Math.PI : 0);

          if (isFlatBlueprint) {
            const y2d = slabTopY + 0.185;
            if (distance2D(info.centerPos, info.facePos) > 0.01) {
              addConduitTube(
                wireGroup,
                new THREE.Vector3(info.centerPos.x, y2d, info.centerPos.z),
                new THREE.Vector3(info.facePos.x, y2d, info.facePos.z),
                0.018,
                jMat,
                pickTarget,
              );
            }

            let symMesh: THREE.Mesh;
            if (j.kind === 'ceiling-light') {
              symMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.14, 0.14, 0.055, 20),
                jMat,
              );
            } else if (j.kind === 'wall-light') {
              symMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.1, 0.1, 0.055, 16),
                jMat,
              );
            } else if (j.kind === 'junction-box') {
              symMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.085, 0.085, 0.055, 14),
                jMat,
              );
            } else if (j.kind === 'panel') {
              symMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.055, 0.14), jMat);
            } else {
              symMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.11), jMat);
            }
            symMesh.position.set(info.facePos.x, y2d, info.facePos.z);
            symMesh.rotation.y = faceYaw;
            symMesh.userData.pickTarget = pickTarget;
            wireGroup.add(symMesh);

            const hitProxy = new THREE.Mesh(
              new THREE.BoxGeometry(0.34, 0.16, 0.34),
              new THREE.MeshBasicMaterial({ visible: false }),
            );
            hitProxy.position.set(info.facePos.x, y2d, info.facePos.z);
            hitProxy.rotation.y = faceYaw;
            hitProxy.userData.pickTarget = pickTarget;
            wireGroup.add(hitProxy);
          } else {
            const jElevY = Math.min(slabTopY + Math.max(0.2, curHeight - 0.03), info.elevationY);
            if (j.kind === 'ceiling-light') {
              const lightGroup = new THREE.Group();
              lightGroup.position.set(info.facePos.x, jElevY, info.facePos.z);
              const canopy = new THREE.Mesh(
                new THREE.CylinderGeometry(0.16, 0.18, 0.045, 20),
                isJSelected ? wireSelectedMat : sashFrameMat,
              );
              canopy.userData.pickTarget = pickTarget;
              lightGroup.add(canopy);

              if (curCeilingMode === 'open-gable' && curShowCeiling && roofParams) {
                const roofY = getRoofUndersideY(info.facePos.x, info.facePos.z);
                const rodLen = roofY - jElevY;
                if (rodLen > 0.06) {
                  const downrod = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.014, 0.014, rodLen, 8),
                    sashFrameMat,
                  );
                  downrod.position.y = rodLen * 0.5;
                  downrod.userData.pickTarget = pickTarget;
                  lightGroup.add(downrod);

                  const topRose = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.065, 0.075, 0.04, 14),
                    sashFrameMat,
                  );
                  topRose.position.y = rodLen - 0.01;
                  lightGroup.add(topRose);
                }
              }

              const bulbMat = new THREE.MeshStandardMaterial({
                color: isLit ? 0xfef3c7 : 0xcbd5e1,
                emissive: isLit ? 0xf59e0b : 0x000000,
                emissiveIntensity: isLit ? 0.95 : 0,
                roughness: 0.25,
              });
              const diffuser = new THREE.Mesh(
                new THREE.CylinderGeometry(0.13, 0.11, 0.035, 18),
                bulbMat,
              );
              diffuser.position.y = -0.03;
              diffuser.userData.pickTarget = pickTarget;
              lightGroup.add(diffuser);

              if (isLit && !isSoftwareGl) {
                const ptLight = new THREE.PointLight(0xfff1d6, 1.4, 7.0, 1.5);
                ptLight.position.set(0, -0.12, 0);
                lightGroup.add(ptLight);
              }
              wireGroup.add(lightGroup);
            } else if (j.kind === 'wall-light') {
              const sconceGroup = new THREE.Group();
              sconceGroup.position.set(info.facePos.x, jElevY, info.facePos.z);
              sconceGroup.rotation.y = faceYaw;

              const backplate = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.18, 0.04),
                isJSelected ? wireSelectedMat : frameMat,
              );
              backplate.userData.pickTarget = pickTarget;
              sconceGroup.add(backplate);

              const shadeMat = new THREE.MeshStandardMaterial({
                color: isLit ? 0xfef3c7 : 0xe2e8f0,
                emissive: isLit ? 0xf59e0b : 0x000000,
                emissiveIntensity: isLit ? 0.85 : 0,
                roughness: 0.3,
              });
              const shade = new THREE.Mesh(
                new THREE.CylinderGeometry(0.065, 0.08, 0.16, 14),
                shadeMat,
              );
              shade.position.set(0, 0.02, 0.05);
              shade.userData.pickTarget = pickTarget;
              sconceGroup.add(shade);

              if (isLit && !isSoftwareGl) {
                const ptLight = new THREE.PointLight(0xffe8bf, 0.9, 4.8, 1.6);
                ptLight.position.set(0, 0, 0.14);
                sconceGroup.add(ptLight);
              }
              wireGroup.add(sconceGroup);
            } else if (j.kind === 'panel') {
              const panelGroup = new THREE.Group();
              panelGroup.position.set(info.facePos.x, jElevY, info.facePos.z);
              panelGroup.rotation.y = faceYaw;

              const shellMat = isJSelected
                ? wireSelectedMat
                : new THREE.MeshStandardMaterial({
                    color: 0x334155,
                    roughness: 0.45,
                    metalness: 0.45,
                  });
              const backBox = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.06), shellMat);
              backBox.userData.pickTarget = pickTarget;
              panelGroup.add(backBox);

              const innerCavity = new THREE.Mesh(
                new THREE.BoxGeometry(0.31, 0.4, 0.015),
                new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 }),
              );
              innerCavity.position.set(0, 0, 0.026);
              innerCavity.userData.pickTarget = pickTarget;
              panelGroup.add(innerCavity);

              const dinRail = new THREE.Mesh(
                new THREE.BoxGeometry(0.28, 0.024, 0.012),
                new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.3 }),
              );
              dinRail.position.set(0, 0.03, 0.035);
              panelGroup.add(dinRail);

              const panelBreakers = getPanelBreakerCircuitSummaries(j, curWires, curJunctions, curWalls);
              const showBreakers = panelBreakers.slice(0, 6);
              const brkCount = showBreakers.length;
              showBreakers.forEach((brk, bIdx) => {
                const bx = (bIdx - (brkCount - 1) * 0.5) * 0.044;
                const brkCtrl = { panelId: j.id, breakerLabel: brk.breakerLabel };

                const mcbBody = new THREE.Mesh(
                  new THREE.BoxGeometry(0.036, 0.1, 0.022),
                  new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 }),
                );
                mcbBody.position.set(bx, 0.03, 0.042);
                mcbBody.userData.pickTarget = pickTarget;
                mcbBody.userData.panelBreakerToggle = brkCtrl;
                panelGroup.add(mcbBody);

                const toggleMat = new THREE.MeshStandardMaterial({
                  color: new THREE.Color(brk.color),
                  roughness: 0.35,
                });
                const toggleSwitch = new THREE.Mesh(
                  new THREE.BoxGeometry(0.026, 0.024, 0.018),
                  toggleMat,
                );
                toggleSwitch.position.set(bx, brk.isOn ? 0.045 : 0.015, 0.056);
                toggleSwitch.userData.pickTarget = pickTarget;
                toggleSwitch.userData.panelBreakerToggle = brkCtrl;
                panelGroup.add(toggleSwitch);

                const led = new THREE.Mesh(
                  new THREE.BoxGeometry(0.014, 0.01, 0.006),
                  new THREE.MeshBasicMaterial({ color: brk.isOn ? 0x10b981 : 0x64748b }),
                );
                led.position.set(bx, 0.072, 0.054);
                led.userData.pickTarget = pickTarget;
                led.userData.panelBreakerToggle = brkCtrl;
                panelGroup.add(led);
              });

              // Hinged panel door (click in 3D or Inspector to swing open and reveal breakers)
              const doorPivot = new THREE.Group();
              doorPivot.position.set(-0.175, 0, 0.058);
              doorPivot.rotation.y = j.isOpen ? -Math.PI * 0.68 : 0;

              const doorMesh = new THREE.Mesh(
                new THREE.BoxGeometry(0.35, 0.44, 0.018),
                isJSelected ? wireSelectedMat : shellMat,
              );
              doorMesh.position.set(0.175, 0, 0);
              doorMesh.userData.pickTarget = pickTarget;
              doorMesh.userData.panelDoorToggle = j.id;
              doorPivot.add(doorMesh);

              const doorHandle = new THREE.Mesh(
                new THREE.BoxGeometry(0.018, 0.06, 0.024),
                handleBrassMat,
              );
              doorHandle.position.set(0.32, 0, 0.012);
              doorHandle.userData.pickTarget = pickTarget;
              doorHandle.userData.panelDoorToggle = j.id;
              doorPivot.add(doorHandle);

              panelGroup.add(doorPivot);
              wireGroup.add(panelGroup);
            } else {
              const jGroup = new THREE.Group();
              jGroup.position.set(info.facePos.x, jElevY, info.facePos.z);
              jGroup.rotation.y = faceYaw;

              const boxGeo =
                j.kind === 'junction-box'
                  ? new THREE.BoxGeometry(0.11, 0.11, 0.036)
                  : new THREE.BoxGeometry(0.13, 0.13, 0.034);
              const basePlate = new THREE.Mesh(boxGeo, jMat);
              basePlate.userData.pickTarget = pickTarget;
              jGroup.add(basePlate);

              if (j.kind === 'socket') {
                const well = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.032, 0.032, 0.012, 16),
                  cadDarkMat,
                );
                well.rotation.x = Math.PI / 2;
                well.position.set(0, 0, 0.018);
                well.userData.pickTarget = pickTarget;
                jGroup.add(well);
              } else if (j.kind === 'switch') {
                const rocker = new THREE.Mesh(
                  new THREE.BoxGeometry(0.055, 0.065, 0.016),
                  doorLeafMat,
                );
                rocker.position.set(0, 0, 0.018);
                rocker.userData.pickTarget = pickTarget;
                jGroup.add(rocker);
              }

              wireGroup.add(jGroup);
            }

            // Enlarged 3D hit proxy so clicking or wiring electrical junctions in 3D Orbit & 3D Walk is effortless
            const hitProxy3D = new THREE.Mesh(
              new THREE.BoxGeometry(
                j.kind === 'panel' ? 0.44 : 0.3,
                j.kind === 'panel' ? 0.52 : 0.3,
                0.26,
              ),
              new THREE.MeshBasicMaterial({ visible: false }),
            );
            hitProxy3D.position.set(info.facePos.x, jElevY, info.facePos.z);
            hitProxy3D.rotation.y = faceYaw;
            hitProxy3D.userData.pickTarget = pickTarget;
            wireGroup.add(hitProxy3D);
          }
        }

        if (curWires.length > 0) {
          const renderList = computeAllWireRenderData(
            curWires,
            curJunctions,
            curWalls,
            curHeight,
            slabTopY,
            isFlatBlueprint,
          );
          const tubeRadius = isFlatBlueprint ? 0.02 : 0.011;

          for (const rd of renderList) {
            const isWireSelected = curSelected?.kind === 'wire' && curSelected.wireId === rd.wire.id;
            const wireMat = isWireSelected ? wireSelectedMat : getWireMaterial(rd.color);
            const pickTarget: SelectionTarget = { kind: 'wire', wireId: rd.wire.id };

            for (const seg of rd.segments) {
              addConduitTube(
                wireGroup,
                new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z),
                new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z),
                tubeRadius,
                wireMat,
                pickTarget,
              );
            }

            for (const drop of rd.verticalDrops) {
              addConduitTube(
                wireGroup,
                new THREE.Vector3(drop.x, drop.yStart, drop.z),
                new THREE.Vector3(drop.x, drop.yEnd, drop.z),
                isFlatBlueprint ? 0.016 : 0.01,
                wireMat,
                pickTarget,
              );
            }

            for (const np of rd.nodePoints) {
              if (isFlatBlueprint) {
                const node = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.052, 0.052, 0.045, 12),
                  wireMat,
                );
                node.position.set(np.x, np.y, np.z);
                node.userData.pickTarget = pickTarget;
                wireGroup.add(node);
              } else {
                const joint = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), wireMat);
                joint.position.set(np.x, np.y, np.z);
                joint.userData.pickTarget = pickTarget;
                wireGroup.add(joint);
              }
            }
          }

          // Render draggable vertex handles when a wire is selected in 2D or 3D Select mode
          if (curTool === 'select' && curSelected?.kind === 'wire') {
            const selWire = curWires.find((w) => w.id === curSelected.wireId);
            if (selWire) {
              const wireY3D =
                slabTopY +
                resolveMountElevation(
                  selWire.mountRef ?? 'ceiling',
                  selWire.dropFromTop ?? 0.3,
                  selWire.height ?? 0.3,
                  curHeight,
                );
              selWire.points.forEach((pt, idx) => {
                const gripColor = pt.connectedWireId ? 0x059669 : 0x2563eb;
                const grip = new THREE.Mesh(
                  is2D
                    ? new THREE.CylinderGeometry(0.145, 0.145, 0.09, 16)
                    : new THREE.SphereGeometry(0.075, 14, 14),
                  new THREE.MeshBasicMaterial({ color: gripColor }),
                );
                grip.position.set(pt.x, is2D ? slabTopY + 0.24 : wireY3D, pt.z);
                grip.userData.wireVertexHandle = {
                  wireId: selWire.id,
                  vertexIndex: idx,
                };
                handleGroup.add(grip);
              });
            }
          }
        }
      }

      // Render Plumbing / Water Fixtures + under-skin PEX/PVC pipes ONLY when showPlumbing is enabled
      if (curShowPlumbing) {
        for (const f of curFixtures) {
          const info = getFixtureWorldInfo(f, curWalls, curHeight, slabTopY);
          if (!info) continue;

          const isFSelected = curSelected?.kind === 'fixture' && curSelected.fixtureId === f.id;
          const fMat = isFSelected
            ? wireSelectedMat
            : getWireMaterial(PLUMBING_FIXTURE_INFO[f.kind].color);
          const pickTarget: SelectionTarget = { kind: 'fixture', fixtureId: f.id };

          const fFaceYaw = -info.wallAngle + (info.faceSide < 0 ? Math.PI : 0);

          if (isFlatBlueprint) {
            const y2d = slabTopY + 0.182;
            addConduitTube(
              plumbingGroup,
              new THREE.Vector3(info.centerPos.x, y2d, info.centerPos.z),
              new THREE.Vector3(info.facePos.x, y2d, info.facePos.z),
              0.02,
              fMat,
              pickTarget,
            );

            const symMesh =
              f.kind === 'boiler'
                ? new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.18), fMat)
                : f.kind === 'wc'
                  ? new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.16), fMat)
                  : new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.055, 14), fMat);
            symMesh.position.set(info.facePos.x, y2d, info.facePos.z);
            symMesh.rotation.y = fFaceYaw;
            symMesh.userData.pickTarget = pickTarget;
            plumbingGroup.add(symMesh);

            const hitProxy = new THREE.Mesh(
              new THREE.BoxGeometry(0.34, 0.16, 0.34),
              new THREE.MeshBasicMaterial({ visible: false }),
            );
            hitProxy.position.set(info.facePos.x, y2d, info.facePos.z);
            hitProxy.rotation.y = fFaceYaw;
            hitProxy.userData.pickTarget = pickTarget;
            plumbingGroup.add(hitProxy);
          } else {
            const fElevY = Math.min(slabTopY + Math.max(0.14, curHeight - 0.06), info.elevationY);
            const boxGeo =
              f.kind === 'boiler'
                ? new THREE.BoxGeometry(0.34, 0.44, 0.14)
                : f.kind === 'wc'
                  ? new THREE.BoxGeometry(0.24, 0.24, 0.12)
                  : new THREE.BoxGeometry(0.15, 0.15, 0.06);
            const fMesh = new THREE.Mesh(boxGeo, fMat);
            fMesh.position.set(info.facePos.x, fElevY, info.facePos.z);
            fMesh.rotation.y = fFaceYaw;
            fMesh.userData.pickTarget = pickTarget;
            plumbingGroup.add(fMesh);
          }
        }

        if (curPipes.length > 0) {
          const renderList = computeAllPlumbingRenderData(
            curPipes,
            curFixtures,
            curWalls,
            curHeight,
            slabTopY,
            isFlatBlueprint,
          );

          for (const rd of renderList) {
            const isPipeSelected = curSelected?.kind === 'pipe' && curSelected.pipeId === rd.pipe.id;
            const pipeMat = isPipeSelected ? wireSelectedMat : getWireMaterial(rd.color);
            const pickTarget: SelectionTarget = { kind: 'pipe', pipeId: rd.pipe.id };
            const tubeRadius = isFlatBlueprint
              ? 0.024
              : PLUMBING_SPEC_INFO[rd.pipe.pipeSpec].radius3D;

            for (const seg of rd.segments) {
              addConduitTube(
                plumbingGroup,
                new THREE.Vector3(seg.start.x, seg.start.y, seg.start.z),
                new THREE.Vector3(seg.end.x, seg.end.y, seg.end.z),
                tubeRadius,
                pipeMat,
                pickTarget,
              );
            }

            for (const drop of rd.verticalDrops) {
              addConduitTube(
                plumbingGroup,
                new THREE.Vector3(drop.x, drop.yStart, drop.z),
                new THREE.Vector3(drop.x, drop.yEnd, drop.z),
                Math.max(0.011, tubeRadius * 0.9),
                pipeMat,
                pickTarget,
              );
            }

            for (const np of rd.nodePoints) {
              if (isFlatBlueprint) {
                const node = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.058, 0.058, 0.045, 12),
                  pipeMat,
                );
                node.position.set(np.x, np.y, np.z);
                node.userData.pickTarget = pickTarget;
                plumbingGroup.add(node);
              } else {
                const tee = new THREE.Mesh(
                  new THREE.SphereGeometry(Math.max(0.014, tubeRadius * 1.15), 10, 10),
                  pipeMat,
                );
                tee.position.set(np.x, np.y, np.z);
                tee.userData.pickTarget = pickTarget;
                plumbingGroup.add(tee);
              }
            }
          }
        }
      }

      // Render Security Cameras, Motion Sensors & Wall-Occluded FOV Coverage ONLY when showSecurity is enabled
      if (curShowSecurity && curSecurityDevices.length > 0) {
        for (const dev of curSecurityDevices) {
          const isActiveCameraFeed = !is2D && curCameraViewId === dev.id;
          const isDevSelected =
            curSelected?.kind === 'security' && curSelected.securityId === dev.id;
          const isTriggered = triggeredSet.has(dev.id);
          const info = SECURITY_DEVICE_INFO[dev.kind];

          if (curShowSecurityCoverage && !isActiveCameraFeed && dev.fovDeg > 0 && dev.rangeMeters > 0) {
            const cov = buildSecurityCoverageVisual(
              securityGroup,
              dev,
              curWalls,
              curHeight,
              slabTopY,
              isFlatBlueprint,
              isDevSelected,
              false,
              isTriggered,
            );

            if (is2D) {
              const yawRad = (dev.yawDeg * Math.PI) / 180;
              const labelDist = Math.min(dev.rangeMeters * 0.42, 1.35);
              securityAnchorsRef.current.push({
                id: `sec-${dev.id}`,
                securityId: dev.id,
                worldPos: new THREE.Vector3(
                  dev.x + Math.cos(yawRad) * labelDist,
                  slabTopY + 0.25,
                  dev.z + Math.sin(yawRad) * labelDist,
                ),
                text: `${dev.label || info.shortCode} · ${Math.round(dev.fovDeg)}° · ${cov.areaSqM.toFixed(1)}m²${isTriggered ? ' · ALERT' : ''}`,
                selected: isDevSelected,
                triggered: isTriggered,
                isCamera: isCameraSecurityDevice(dev.kind),
                color: isTriggered ? '#ef4444' : isDevSelected ? '#d97706' : info.color,
              });
            }
          }

          if (!isActiveCameraFeed) {
            const devMesh = buildSecurityDeviceMesh(
              dev,
              curHeight,
              slabTopY,
              isFlatBlueprint,
              isDevSelected,
              isTriggered,
            );
            securityGroup.add(devMesh);
          }

          // In 2D Select mode, render a draggable Aim Handle for any selected FOV device
          if (is2D && isDevSelected && curTool === 'select' && dev.fovDeg > 0) {
            const yawRad = (dev.yawDeg * Math.PI) / 180;
            const handleDist = Math.max(0.85, Math.min(1.4, dev.rangeMeters * 0.35));
            const hx = dev.x + Math.cos(yawRad) * handleDist;
            const hz = dev.z + Math.sin(yawRad) * handleDist;

            const aimLineVerts = new Float32Array([
              dev.x,
              slabTopY + 0.24,
              dev.z,
              hx,
              slabTopY + 0.24,
              hz,
            ]);
            const aimLineGeo = new THREE.BufferGeometry();
            aimLineGeo.setAttribute('position', new THREE.BufferAttribute(aimLineVerts, 3));
            handleGroup.add(
              new THREE.Line(
                aimLineGeo,
                new THREE.LineBasicMaterial({ color: 0xd97706 }),
              ),
            );

            const aimGrip = new THREE.Mesh(
              new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16),
              new THREE.MeshBasicMaterial({ color: 0xd97706 }),
            );
            aimGrip.position.set(hx, slabTopY + 0.25, hz);
            aimGrip.userData.securityAimHandle = { securityId: dev.id };
            handleGroup.add(aimGrip);
          }
        }
      }

      // Render Interior Furniture ONLY when showInterior is enabled
      if (curShowInterior && curFurniture.length > 0) {
        for (const item of curFurniture) {
          const isFurnSelected =
            curSelected?.kind === 'furniture' && curSelected.furnitureId === item.id;
          const furnMesh = buildFurnitureMesh(item, slabTopY, isFlatBlueprint, isFurnSelected);
          furnitureGroup.add(furnMesh);

          const defaultInfo = FURNITURE_KIND_INFO[item.kind];
          const trimmedLabel = item.label?.trim() || '';
          const hasCustomLabel =
            trimmedLabel.length > 0 &&
            trimmedLabel.toLowerCase() !== defaultInfo.shortLabel.toLowerCase() &&
            trimmedLabel.toLowerCase() !== defaultInfo.label.toLowerCase();
          if (hasCustomLabel || isFurnSelected) {
            furnitureAnchorsRef.current.push({
              id: `furn-lbl-${item.id}`,
              furnitureId: item.id,
              worldPos: new THREE.Vector3(
                item.x,
                isFlatBlueprint ? slabTopY + 0.28 : slabTopY + item.height + 0.16,
                item.z,
              ),
              text: trimmedLabel || defaultInfo.shortLabel,
              selected: isFurnSelected,
            });
          }
        }
      }

      // Render Selected Object Clearance Distances (Front, Back, Left, Right) when toggled ON
      if (curShowObjectDistances && curSelected && !curCameraViewId) {
        const rays = computeObjectClearances(
          curSelected,
          curShowStructure ? curWalls : [],
          curShowInterior ? curFurniture : [],
          curShowPlumbing ? curFixtures : [],
          curShowWiring ? curJunctions : [],
          curShowSecurity ? curSecurityDevices : [],
          curHeight,
          slabTopY,
        );
        if (rays.length > 0) {
          const clrLineVerts: number[] = [];
          const clrTickVerts: number[] = [];
          for (const ray of rays) {
            const ry = isFlatBlueprint ? slabTopY + 0.27 : ray.y;
            clrLineVerts.push(ray.start.x, ry, ray.start.z, ray.end.x, ry, ray.end.z);
            const rdx = ray.end.x - ray.start.x;
            const rdz = ray.end.z - ray.start.z;
            const rLen = Math.hypot(rdx, rdz);
            if (rLen > 0.005) {
              const px = (-rdz / rLen) * 0.075;
              const pz = (rdx / rLen) * 0.075;
              clrTickVerts.push(
                ray.start.x - px, ry, ray.start.z - pz,
                ray.start.x + px, ry, ray.start.z + pz,
                ray.end.x - px, ry, ray.end.z - pz,
                ray.end.x + px, ry, ray.end.z + pz,
              );
            }
            clearanceAnchorsRef.current.push({
              id: `clr-${ray.side}`,
              worldPos: new THREE.Vector3(
                (ray.start.x + ray.end.x) * 0.5,
                isFlatBlueprint ? ry + 0.02 : ry + 0.08,
                (ray.start.z + ray.end.z) * 0.5,
              ),
              shortLabel: ray.shortLabel,
              text: `${ray.shortLabel} ${ray.distance.toFixed(2)} m`,
              targetLabel: ray.targetLabel,
            });
          }
          if (clrLineVerts.length > 0) {
            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(clrLineVerts, 3));
            clearanceGroup.add(new THREE.LineSegments(lineGeo, clearanceLineMat));
          }
          if (clrTickVerts.length > 0) {
            const tickGeo = new THREE.BufferGeometry();
            tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(clrTickVerts, 3));
            clearanceGroup.add(new THREE.LineSegments(tickGeo, clearanceTickMat));
          }
        }
      }

      // Draggable Live Motion Sensor Test Target ("Test Motion" puck in 2D / 3D Orbit)
      if (curTestMotion && testMotionPosRef.current && (is2D || curView === '3d-orbit') && !curCameraViewId) {
        const tp = testMotionPosRef.current;
        const puckColor = triggeredSet.size > 0 ? 0xef4444 : 0x0ea5e9;
        const testY = is2D ? slabTopY + 0.24 : slabTopY + 0.05;

        const baseDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.26, is2D ? 0.12 : 0.08, 20),
          new THREE.MeshBasicMaterial({ color: puckColor }),
        );
        baseDisc.position.set(tp.x, testY, tp.z);
        baseDisc.userData.motionTestHandle = true;
        handleGroup.add(baseDisc);

        const outerRing = new THREE.Mesh(
          new THREE.RingGeometry(0.29, 0.37, 28),
          new THREE.MeshBasicMaterial({ color: puckColor, side: THREE.DoubleSide }),
        );
        outerRing.rotation.x = -Math.PI / 2;
        outerRing.position.set(tp.x, testY + 0.05, tp.z);
        outerRing.userData.motionTestHandle = true;
        handleGroup.add(outerRing);

        if (!is2D) {
          const torso = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.18, 1.35, 14),
            new THREE.MeshStandardMaterial({ color: puckColor, roughness: 0.4 }),
          );
          torso.position.set(tp.x, slabTopY + 0.72, tp.z);
          torso.userData.motionTestHandle = true;
          handleGroup.add(torso);

          const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 14, 12),
            new THREE.MeshStandardMaterial({ color: puckColor, roughness: 0.35 }),
          );
          head.position.set(tp.x, slabTopY + 1.56, tp.z);
          head.userData.motionTestHandle = true;
          handleGroup.add(head);
        }
      }

      updateProjectedDimensions();
    };
    rebuildHouseRef.current = rebuildHouse;

    const updateOrthoProjection = (w: number, h: number) => {
      const a = w / Math.max(1, h);
      orthoCamera.left = (-orthoFrustum * a) / 2;
      orthoCamera.right = (orthoFrustum * a) / 2;
      orthoCamera.top = orthoFrustum / 2;
      orthoCamera.bottom = -orthoFrustum / 2;
      orthoCamera.position.set(orthoCenter.x, 32, orthoCenter.y);
      orthoCamera.lookAt(orthoCenter.x, 0, orthoCenter.y);
      orthoCamera.updateProjectionMatrix();
      updateProjectedDimensions();
    };

    const applyCameraView = () => {
      const camId = stateRef.current.activeCameraViewId;
      if (!camId) return;
      const dev = stateRef.current.securityDevices.find((d) => d.id === camId);
      if (!dev) return;

      scene.fog = new THREE.Fog(0xf4f6f8, 28, 82);
      orbitControls.enabled = false;
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }

      const curHeight = stateRef.current.wallHeight;
      const slabTopY = stateRef.current.showFloorPlate && stateRef.current.walls.length > 0 ? 0.04 : 0;
      const mountY = slabTopY + Math.min(Math.max(0.45, curHeight - 0.08), dev.mountHeight);
      const yawRad = (dev.yawDeg * Math.PI) / 180;
      const tiltRad = (dev.tiltDeg * Math.PI) / 180;

      const eyeX = dev.x + Math.cos(yawRad) * 0.14;
      const eyeZ = dev.z + Math.sin(yawRad) * 0.14;
      const dirX = Math.cos(yawRad) * Math.cos(tiltRad);
      const dirY = -Math.sin(tiltRad);
      const dirZ = Math.sin(yawRad) * Math.cos(tiltRad);

      const aspectRatio = Math.max(
        0.4,
        (renderer.domElement.clientWidth || container.clientWidth || 1280) /
          Math.max(1, renderer.domElement.clientHeight || container.clientHeight || 720),
      );
      const hFovRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(dev.fovDeg || 90, 20, 145));
      const vFovRad = 2 * Math.atan(Math.tan(hFovRad * 0.5) / aspectRatio);
      perspCamera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFovRad), 28, 115);
      perspCamera.near = 0.08;
      perspCamera.position.set(eyeX, mountY, eyeZ);
      perspCamera.up.set(0, 1, 0);
      perspCamera.lookAt(eyeX + dirX * 5, mountY + dirY * 5, eyeZ + dirZ * 5);
      perspCamera.updateProjectionMatrix();
      perspCamera.updateMatrixWorld(true);
      setDimLabels([]);
      setSecurityLabels([]);
    };
    applyCameraViewRef.current = applyCameraView;

    let hasInitialized2D = false;
    let hasInitializedOrbit = false;

    const switchViewMode = (
      mode: ViewMode,
      modeOpts?: { resetToOrigin?: boolean; fitPlan?: boolean },
    ) => {
      const { walls: curWalls } = stateRef.current;
      const bounds = computeFloorBounds(curWalls, 0.6);
      const resetToOrigin = Boolean(modeOpts?.resetToOrigin);
      const fitPlan = Boolean(modeOpts?.fitPlan);

      if (resetToOrigin) {
        cameraAnchorRef.current = { x: 0, z: 0 };
      } else if (fitPlan && !stateRef.current.cameraLocked) {
        cameraAnchorRef.current = { x: bounds.centerX, z: bounds.centerZ };
      }

      if (stateRef.current.activeCameraViewId) {
        applyCameraView();
        return;
      }

      perspCamera.near = 0.1;
      const anchor = cameraAnchorRef.current;

      const curAspect = Math.max(
        0.4,
        (renderer.domElement.clientWidth || container.clientWidth || 1280) /
          Math.max(1, renderer.domElement.clientHeight || container.clientHeight || 720),
      );
      const curHFov = THREE.MathUtils.clamp(stateRef.current.cameraFov || 105, 50, 170);

      if (mode === '2d') {
        scene.fog = null;
        orbitControls.enabled = false;
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock();
        }
        orthoCenter.set(anchor.x, anchor.z);
        if (!hasInitialized2D || resetToOrigin || fitPlan) {
          orthoFrustum = Math.max(11, Math.max(bounds.width, bounds.depth) * 1.42);
          hasInitialized2D = true;
        }
        updateOrthoProjection(container.clientWidth || width, container.clientHeight || height);
      } else if (mode === '3d-walk') {
        scene.fog = new THREE.Fog(0xf4f6f8, 22, 68);
        orbitControls.enabled = false;
        const spawn = findWalkthroughSpawn(curWalls);
        const eyeHeight = Math.max(0.95, stateRef.current.walkerHeight - 0.11);
        walkState.position.set(spawn.position.x, eyeHeight, spawn.position.z);
        walkState.yaw = spawn.yaw;
        walkState.pitch = -0.02;
        perspCamera.fov = horizontalToVerticalFov(curHFov, curAspect);
        perspCamera.zoom = THREE.MathUtils.clamp(stateRef.current.cameraZoom || 1, 0.5, 2.5);
        perspCamera.near = 0.05;
        perspCamera.position.copy(walkState.position);
        perspCamera.rotation.order = 'YXZ';
        perspCamera.rotation.y = walkState.yaw;
        perspCamera.rotation.x = walkState.pitch;
        perspCamera.rotation.z = 0;
        perspCamera.updateProjectionMatrix();
        perspCamera.updateMatrixWorld(true);
        setDimLabels([]);
        setRoomLabels([]);
        updateWalkProjectedDimensions();
      } else {
        scene.fog = new THREE.Fog(0xf4f6f8, 28, 82);
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock();
        }
        perspCamera.fov = horizontalToVerticalFov(
          THREE.MathUtils.clamp(curHFov * 0.82, 42, 160),
          curAspect,
        );
        perspCamera.zoom = THREE.MathUtils.clamp(stateRef.current.cameraZoom || 1, 0.5, 2.5);
        perspCamera.near = 0.08;
        perspCamera.updateProjectionMatrix();

        const isLocked = stateRef.current.cameraLocked;
        orbitControls.enablePan = false;
        const span = Math.max(8, bounds.width, bounds.depth);
        const targetY = Math.max(0.6, stateRef.current.wallHeight * 0.4);
        const nextTarget = new THREE.Vector3(anchor.x, targetY, anchor.z);

        let nextCamPos: THREE.Vector3;
        if (!hasInitializedOrbit || resetToOrigin || fitPlan) {
          nextCamPos = new THREE.Vector3(
            anchor.x + span * 0.95,
            span * 0.78,
            anchor.z + span * 1.05,
          );
          hasInitializedOrbit = true;
        } else {
          const offset = perspCamera.position.clone().sub(orbitControls.target);
          if (offset.length() < 1.5) {
            offset.set(span * 0.95, span * 0.78, span * 1.05);
          }
          nextCamPos = nextTarget.clone().add(offset);
        }

        if (isLocked) {
          orbitControls.enabled = true;
          orbitTargetGoal = nextTarget;
          orbitCamGoal = nextCamPos;
          if (isSoftwareGl || resetToOrigin) {
            orbitControls.target.copy(orbitTargetGoal);
            perspCamera.position.copy(orbitCamGoal);
            orbitTargetGoal = null;
            orbitCamGoal = null;
            orbitControls.update();
          }
        } else {
          // Unlocked Orbit = Free-Fly camera (not pinned to any pivot point)
          orbitControls.enabled = false;
          orbitTargetGoal = null;
          orbitCamGoal = null;
          if (resetToOrigin || fitPlan) {
            perspCamera.position.copy(nextCamPos);
            perspCamera.lookAt(nextTarget);
          }
          syncFreeFlyFromCamera();
        }
        setDimLabels([]);
        perspCamera.updateMatrixWorld(true);
        updateWalkProjectedDimensions();
      }
    };
    switchViewModeRef.current = switchViewMode;

    syncCameraLockRef.current = (locked: boolean) => {
      orbitControls.enablePan = false;
      const mode = stateRef.current.viewMode;
      if (mode === '2d') {
        if (locked) {
          cameraAnchorRef.current = { x: orthoCenter.x, z: orthoCenter.y };
        }
      } else if (mode === '3d-orbit') {
        orbitTargetGoal = null;
        orbitCamGoal = null;
        if (!locked) {
          // Unlock = enter Free-Fly anywhere in space
          orbitControls.enabled = false;
          syncFreeFlyFromCamera();
        } else {
          // Re-lock around a forward pivot in front of the current free-fly camera
          perspCamera.updateMatrixWorld(true);
          perspCamera.getWorldDirection(_flyForward);
          const groundT =
            _flyForward.y < -0.05
              ? THREE.MathUtils.clamp(-perspCamera.position.y / _flyForward.y, 2.5, 18)
              : 7.5;
          const pivot = perspCamera.position.clone().addScaledVector(_flyForward, groundT);
          pivot.y = Math.max(0.3, Math.min(stateRef.current.wallHeight * 0.65, pivot.y));
          orbitControls.target.copy(pivot);
          cameraAnchorRef.current = { x: pivot.x, z: pivot.z };
          orbitControls.enabled = true;
          orbitControls.update();
        }
        updateWalkProjectedDimensions();
      }
      requestRender();
    };

    syncWalkerHeightRef.current = (height: number) => {
      const eyeHeight = Math.max(0.95, height - 0.11);
      walkState.position.y = eyeHeight;
      if (stateRef.current.viewMode === '3d-walk' && !stateRef.current.activeCameraViewId) {
        perspCamera.position.y = eyeHeight;
        perspCamera.updateMatrixWorld(true);
        updateWalkProjectedDimensions();
        requestRender();
      }
    };

    syncCameraLensRef.current = (fov: number, zoom: number) => {
      if (stateRef.current.activeCameraViewId) return;
      const mode = stateRef.current.viewMode;
      const curAspect = Math.max(
        0.4,
        (renderer.domElement.clientWidth || container.clientWidth || 1280) /
          Math.max(1, renderer.domElement.clientHeight || container.clientHeight || 720),
      );
      const clampedHFov = THREE.MathUtils.clamp(fov || 105, 50, 170);
      if (mode === '3d-walk') {
        perspCamera.fov = horizontalToVerticalFov(clampedHFov, curAspect);
        perspCamera.zoom = THREE.MathUtils.clamp(zoom, 0.5, 2.5);
        perspCamera.updateProjectionMatrix();
        updateWalkProjectedDimensions();
        requestRender();
      } else if (mode === '3d-orbit') {
        perspCamera.fov = horizontalToVerticalFov(
          THREE.MathUtils.clamp(clampedHFov * 0.82, 42, 160),
          curAspect,
        );
        perspCamera.zoom = THREE.MathUtils.clamp(zoom, 0.5, 2.5);
        perspCamera.updateProjectionMatrix();
        updateWalkProjectedDimensions();
        requestRender();
      }
    };

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const getActiveCamera = () =>
      stateRef.current.activeCameraViewId || stateRef.current.viewMode !== '2d'
        ? perspCamera
        : orthoCamera;

    const centerRaycaster = new THREE.Raycaster();
    centerRaycaster.far = 7.5;
    const centerNdc = new THREE.Vector2(0, 0);
    let lastPromptText: string | null = null;

    const findOpeningInHits = (
      hits: THREE.Intersection[],
      maxDistance = Infinity,
    ): { meta: OpeningInteractMeta; distance: number } | null => {
      for (const hit of hits) {
        if (hit.distance > maxDistance) break;
        if (hit.object instanceof THREE.Line || hit.object instanceof THREE.LineSegments) {
          continue;
        }
        const meta = hit.object.userData.openingInteract as OpeningInteractMeta | undefined;
        if (meta) {
          return { meta, distance: hit.distance };
        }
        const pt = hit.object.userData.pickTarget as SelectionTarget | undefined;
        if (pt?.kind === 'wall' && !stateRef.current.xrayWalls) {
          // Opaque walls stop ray penetration unless we hit an opening first
          break;
        }
      }
      return null;
    };

    const findPanelControlInHits = (
      hits: THREE.Intersection[],
      maxDistance = Infinity,
    ):
      | { kind: 'breaker'; panelId: string; breakerLabel: string }
      | { kind: 'door'; panelId: string }
      | null => {
      for (const hit of hits) {
        if (hit.distance > maxDistance) break;
        if (hit.object instanceof THREE.Line || hit.object instanceof THREE.LineSegments) {
          continue;
        }
        const brkCtrl = hit.object.userData.panelBreakerToggle as
          | { panelId: string; breakerLabel: string }
          | undefined;
        if (brkCtrl) {
          return { kind: 'breaker', panelId: brkCtrl.panelId, breakerLabel: brkCtrl.breakerLabel };
        }
        const doorId = hit.object.userData.panelDoorToggle as string | undefined;
        if (doorId) {
          return { kind: 'door', panelId: doorId };
        }
        const pt = hit.object.userData.pickTarget as SelectionTarget | undefined;
        if (pt?.kind === 'wall' && !stateRef.current.xrayWalls) {
          break;
        }
      }
      return null;
    };

    const findCenterOpeningMeta = (): OpeningInteractMeta | null => {
      if (stateRef.current.viewMode !== '3d-walk' || stateRef.current.activeCameraViewId) return null;
      perspCamera.updateMatrixWorld(true);
      houseGroup.updateMatrixWorld(true);
      centerRaycaster.setFromCamera(centerNdc, perspCamera);
      const hits = centerRaycaster.intersectObjects(houseGroup.children, true);
      return findOpeningInHits(hits, 7.5)?.meta ?? null;
    };

    toggleCenterOpeningRef.current = () => {
      const meta = findCenterOpeningMeta();
      if (meta) {
        callbacksRef.current.onToggleOpeningOpen(meta.wallId, meta.openingId);
      }
    };

    const refreshAimPrompt = () => {
      const meta = findCenterOpeningMeta();
      const nextText = meta ? openingActionPrompt(meta) : null;
      if (nextText !== lastPromptText) {
        lastPromptText = nextText;
        setAimPrompt(nextText);
      }
    };

    const afterDraw = (cb: () => void) => {
      try {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
          return;
        }
      } catch {
        // Fallback below
      }
      frameId = window.setTimeout(cb, 80);
    };

    const keysDown = new Set<string>();
    const clock = new THREE.Clock();

    const stepContinuousOrTransitions = (delta: number): boolean => {
      let needsAnotherFrame = false;
      const mode = stateRef.current.viewMode;

      // Animate opening doors and windows smoothly
      for (const ctrl of openingAnimControllersRef.current) {
        if (Math.abs(ctrl.currentProgress - ctrl.targetProgress) > 0.003) {
          ctrl.currentProgress = THREE.MathUtils.damp(
            ctrl.currentProgress,
            ctrl.targetProgress,
            10,
            Math.max(delta, 0.016),
          );
          openingProgressCacheRef.current.set(ctrl.openingId, ctrl.currentProgress);
          ctrl.apply(ctrl.currentProgress);
          needsAnotherFrame = true;
        } else if (ctrl.currentProgress !== ctrl.targetProgress) {
          ctrl.currentProgress = ctrl.targetProgress;
          openingProgressCacheRef.current.set(ctrl.openingId, ctrl.currentProgress);
          ctrl.apply(ctrl.currentProgress);
        }
      }

      if (stateRef.current.activeCameraViewId) {
        return needsAnotherFrame;
      }

      if (mode === '3d-orbit') {
        if (stateRef.current.cameraLocked) {
          if (orbitTargetGoal && orbitCamGoal) {
            orbitControls.target.lerp(orbitTargetGoal, 1 - Math.exp(-8 * delta));
            perspCamera.position.lerp(orbitCamGoal, 1 - Math.exp(-8 * delta));
            if (
              orbitControls.target.distanceTo(orbitTargetGoal) < 0.03 &&
              perspCamera.position.distanceTo(orbitCamGoal) < 0.03
            ) {
              orbitControls.target.copy(orbitTargetGoal);
              perspCamera.position.copy(orbitCamGoal);
              orbitTargetGoal = null;
              orbitCamGoal = null;
            } else {
              needsAnotherFrame = true;
            }
          }
          if (orbitControls.update()) {
            needsAnotherFrame = true;
          }
          updateWalkProjectedDimensions();
        } else {
          // Free-Fly Orbit Camera: 6-DOF flight with WASD / Arrows / Q-E-Space-C
          perspCamera.rotation.order = 'YXZ';
          perspCamera.rotation.y = freeFlyState.yaw;
          perspCamera.rotation.x = freeFlyState.pitch;
          perspCamera.rotation.z = 0;

          let fwd = 0;
          let strafe = 0;
          let vert = 0;
          if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) fwd += 1;
          if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) fwd -= 1;
          if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) strafe += 1;
          if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) strafe -= 1;
          if (keysDown.has('KeyE') || keysDown.has('Space')) vert += 1;
          if (keysDown.has('KeyQ') || keysDown.has('KeyC')) vert -= 1;

          if (fwd !== 0 || strafe !== 0 || vert !== 0) {
            const brisk = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
            const flySpeed = (brisk ? 8.2 : 4.4) * Math.min(delta, 0.08);
            perspCamera.getWorldDirection(_flyForward);
            _flyRight.crossVectors(_flyForward, perspCamera.up).normalize();

            const moveVec = new THREE.Vector3();
            moveVec.addScaledVector(_flyForward, fwd);
            moveVec.addScaledVector(_flyRight, strafe);
            moveVec.y += vert;
            if (moveVec.lengthSq() > 0.0001) {
              moveVec.normalize().multiplyScalar(flySpeed);
              perspCamera.position.add(moveVec);
              perspCamera.position.y = Math.max(0.15, perspCamera.position.y);
            }
            needsAnotherFrame = true;
          }
          updateWalkProjectedDimensions();
        }
      } else if (mode === '3d-walk') {
        const moveJoy = walkMoveRef.current;
        let forward = 0;
        let strafe = 0;
        if (keysDown.has('KeyW') || keysDown.has('ArrowUp')) forward += 1;
        if (keysDown.has('KeyS') || keysDown.has('ArrowDown')) forward -= 1;
        if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) strafe += 1;
        if (keysDown.has('KeyA') || keysDown.has('ArrowLeft')) strafe -= 1;

        forward += moveJoy.y;
        strafe += moveJoy.x;

        if (Math.abs(forward) > 0.02 || Math.abs(strafe) > 0.02) {
          const mag = Math.hypot(forward, strafe);
          const normF = mag > 1 ? forward / mag : forward;
          const normS = mag > 1 ? strafe / mag : strafe;
          const brisk = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight');
          const speed = (brisk ? 4.4 : 2.65) * Math.min(delta, 0.08);

          const sinY = Math.sin(walkState.yaw);
          const cosY = Math.cos(walkState.yaw);
          const dx = (-sinY * normF + cosY * normS) * speed;
          const dz = (-cosY * normF - sinY * normS) * speed;

          const resolved = resolveWalkthroughCollision(
            { x: walkState.position.x + dx, z: walkState.position.z + dz },
            stateRef.current.walls,
            stateRef.current.wallHeight,
            0.28,
          );
          walkState.position.x = resolved.x;
          walkState.position.z = resolved.z;
          needsAnotherFrame = true;
        }

        perspCamera.position.copy(walkState.position);
        perspCamera.rotation.order = 'YXZ';
        perspCamera.rotation.y = walkState.yaw;
        perspCamera.rotation.x = walkState.pitch;
        perspCamera.rotation.z = 0;
        refreshAimPrompt();
        refreshSecurityTriggers({ x: walkState.position.x, z: walkState.position.z });
        updateWalkProjectedDimensions();
      }

      return needsAnotherFrame;
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(clock.getDelta(), 0.1);
        const keepGoing = stepContinuousOrTransitions(dt);
        renderer.render(scene, getActiveCamera());
        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || keepGoing)) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };
    requestRenderRef.current = requestRender;

    const onOrbitStart = () => {
      orbitTargetGoal = null;
      orbitCamGoal = null;
    };
    const onOrbitChange = () => {
      if (stateRef.current.viewMode === '3d-orbit') {
        updateWalkProjectedDimensions();
      }
      requestRender();
    };
    orbitControls.addEventListener('start', onOrbitStart);
    orbitControls.addEventListener('change', onOrbitChange);

    // 2D Drafting & Preview Helpers
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    let draftAnchor: Point2D | null = null;
    let draftHover: Point2D | null = null;
    let rectAnchor: Point2D | null = null;
    let rectHover: Point2D | null = null;
    let wireDraftPoints: WirePoint[] = [];
    let pipeDraftPoints: WirePoint[] = [];

    type DragInteractionState =
      | {
          kind: 'corner';
          baseWalls: WallSegment[];
          origPos: Point2D;
          lastPos: Point2D;
          onlyWallId: string | null;
        }
      | {
          kind: 'wall';
          wallId: string;
          baseWalls: WallSegment[];
          startClientX: number;
          startClientY: number;
          startGround: Point2D;
          active: boolean;
          lastDx: number;
          lastDz: number;
        }
      | {
          kind: 'opening';
          wallId: string;
          openingId: string;
          baseWalls: WallSegment[];
          startClientX: number;
          startClientY: number;
          active: boolean;
          lastTargetWallId: string;
          lastOffset: number;
        }
      | {
          kind: 'junction';
          junctionId: string;
          baseJunctions: ElectricalJunction[];
          startClientX: number;
          startClientY: number;
          active: boolean;
          lastTargetWallId: string;
          lastOffset: number;
          lastFreePos?: Point2D;
        }
      | {
          kind: 'fixture';
          fixtureId: string;
          baseFixtures: PlumbingFixture[];
          startClientX: number;
          startClientY: number;
          active: boolean;
          lastTargetWallId: string;
          lastOffset: number;
        }
      | {
          kind: 'wireVertex';
          wireId: string;
          vertexIndex: number;
          baseWires: ElectricalWire[];
          lastPoint: WirePoint;
          dragY?: number;
        }
      | {
          kind: 'securityAim';
          deviceId: string;
          baseDevices: SecurityDevice[];
          lastDevice: SecurityDevice;
        }
      | {
          kind: 'security';
          deviceId: string;
          baseDevices: SecurityDevice[];
          startClientX: number;
          startClientY: number;
          active: boolean;
          lastDevice: SecurityDevice;
        }
      | {
          kind: 'furniture';
          furnitureId: string;
          baseFurniture: FurnitureItem[];
          startClientX: number;
          startClientY: number;
          startGround: Point2D;
          active: boolean;
          lastItem: FurnitureItem;
        }
      | {
          kind: 'motionTest';
        };

    let activeDrag: DragInteractionState | null = null;

    const clearPreview = () => {
      disposeGroupChildren(previewGroup);
      setLiveOverlay(null);
    };

    const drawSnapGuides = (guides: Array<{ from: Point2D; to: Point2D }>) => {
      if (guides.length === 0) return;
      const verts: number[] = [];
      for (const g of guides) {
        verts.push(g.from.x, 0.19, g.from.z, g.to.x, 0.19, g.to.z);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      previewGroup.add(new THREE.LineSegments(geo, guideLineMat));
    };

    const projectWorldToScreen = (pt: THREE.Vector3): { x: number; y: number } => {
      const rect = renderer.domElement.getBoundingClientRect();
      const projected = pt.clone().project(getActiveCamera());
      return {
        x: ((projected.x + 1) * 0.5) * rect.width,
        y: (-(projected.y - 1) * 0.5) * rect.height,
      };
    };

    const pickBest3DTarget = (hits: THREE.Intersection[]): SelectionTarget | undefined => {
      let firstWallDist = Infinity;
      for (const h of hits) {
        if (h.object instanceof THREE.Line || h.object instanceof THREE.LineSegments) continue;
        const pt = h.object.userData.pickTarget as SelectionTarget | undefined;
        if (pt?.kind === 'wall') {
          firstWallDist = h.distance;
          break;
        }
      }
      for (const h of hits) {
        if (h.object instanceof THREE.Line || h.object instanceof THREE.LineSegments) continue;
        const pt = h.object.userData.pickTarget as SelectionTarget | undefined;
        if (!pt) continue;
        if (pt.kind !== 'wall' && h.distance <= firstWallDist + 0.35) {
          return pt;
        }
      }
      const fallback = hits.find(
        (h) => !(h.object instanceof THREE.Line || h.object instanceof THREE.LineSegments) && h.object.userData.pickTarget,
      );
      return fallback?.object.userData.pickTarget as SelectionTarget | undefined;
    };

    const screenToGround2D = (clientX: number, clientY: number, touchOffsetPx = 0): Point2D | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const adjY = clientY - touchOffsetPx;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((adjY - rect.top) / rect.height) * 2 + 1;
      const cam = stateRef.current.viewMode === '2d' ? orthoCamera : perspCamera;
      raycaster.setFromCamera(ndc, cam);
      const hit = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
        return { x: hit.x, z: hit.z };
      }
      return null;
    };

    const resolvePointerPlacement = (
      clientX: number,
      clientY: number,
      touchOffsetPx = 0,
    ): {
      groundPt: Point2D | null;
      wallHit: { wall: WallSegment; offset: number; projPt: Point2D } | null;
      snapOverride?: { point: Point2D; matchedTargetId?: string; matchedWireId?: string };
    } => {
      const rect = renderer.domElement.getBoundingClientRect();
      const adjY = clientY - touchOffsetPx;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((adjY - rect.top) / rect.height) * 2 + 1;

      const cur = stateRef.current;
      if (cur.viewMode === '2d') {
        raycaster.setFromCamera(ndc, orthoCamera);
        const hit = new THREE.Vector3();
        const groundPt = raycaster.ray.intersectPlane(groundPlane, hit)
          ? { x: hit.x, z: hit.z }
          : null;
        return { groundPt, wallHit: null };
      }

      perspCamera.updateMatrixWorld(true);
      houseGroup.updateMatrixWorld(true);
      wireGroup.updateMatrixWorld(true);
      plumbingGroup.updateMatrixWorld(true);
      raycaster.setFromCamera(ndc, perspCamera);

      let wallHit: { wall: WallSegment; offset: number; projPt: Point2D } | null = null;
      let wallHitDist = Infinity;
      if (cur.showStructure && opaqueWallMeshesRef.current.length > 0) {
        const wHits = raycaster.intersectObjects(opaqueWallMeshesRef.current, false);
        for (const h of wHits) {
          const ptTarget = h.object.userData.pickTarget as SelectionTarget | undefined;
          if (ptTarget?.kind === 'wall') {
            const wall = cur.walls.find((w) => w.id === ptTarget.wallId);
            if (wall) {
              const proj = projectPointOntoWall({ x: h.point.x, z: h.point.z }, wall);
              wallHit = { wall, offset: proj.offset, projPt: proj.point };
              wallHitDist = h.distance;
              break;
            }
          }
        }
      }

      const slabTopY = cur.showFloorPlate && cur.walls.length > 0 ? 0.04 : 0;
      let snapOverride: { point: Point2D; matchedTargetId?: string; matchedWireId?: string } | undefined;

      if (cur.activeTool === 'wire' && cur.showWiring) {
        const ptrScreenX = clientX - rect.left;
        const ptrScreenY = adjY - rect.top;

        // 1. Direct raycast against electrical junctions & wires in 3D (handles hit proxies too)
        const wireHits = raycaster.intersectObjects(wireGroup.children, true);
        for (const h of wireHits) {
          if (h.distance > wallHitDist + 0.35) break;
          const pt = h.object.userData.pickTarget as SelectionTarget | undefined;
          if (pt?.kind === 'junction') {
            const jObj = cur.junctions.find((j) => j.id === pt.junctionId);
            const info = jObj ? getJunctionWorldInfo(jObj, cur.walls, cur.wallHeight, slabTopY) : null;
            if (jObj && info) {
              snapOverride = { point: info.centerPos, matchedTargetId: jObj.id };
              break;
            }
          } else if (pt?.kind === 'wire') {
            snapOverride = {
              point: { x: Number(h.point.x.toFixed(3)), z: Number(h.point.z.toFixed(3)) },
              matchedWireId: pt.wireId,
            };
            break;
          }
        }

        // 2. Screen-space proximity snap to 3D junction elevations (no perspective parallax mismatch)
        if (!snapOverride) {
          let bestScreenDist = 28;
          for (const j of cur.junctions) {
            const info = getJunctionWorldInfo(j, cur.walls, cur.wallHeight, slabTopY);
            if (!info) continue;
            const elevY = Math.min(slabTopY + Math.max(0.2, cur.wallHeight - 0.03), info.elevationY);
            const projV = new THREE.Vector3(info.facePos.x, elevY, info.facePos.z).project(perspCamera);
            if (projV.z < -1 || projV.z > 1) continue;
            const sx = ((projV.x + 1) * 0.5) * rect.width;
            const sy = (-(projV.y - 1) * 0.5) * rect.height;
            const sd = Math.hypot(sx - ptrScreenX, sy - ptrScreenY);
            if (sd < bestScreenDist) {
              bestScreenDist = sd;
              snapOverride = { point: info.centerPos, matchedTargetId: j.id };
            }
          }
        }
      } else if (cur.activeTool === 'pipe' && cur.showPlumbing) {
        const ptrScreenX = clientX - rect.left;
        const ptrScreenY = adjY - rect.top;
        const pipeHits = raycaster.intersectObjects(plumbingGroup.children, true);
        for (const h of pipeHits) {
          if (h.distance > wallHitDist + 0.35) break;
          const pt = h.object.userData.pickTarget as SelectionTarget | undefined;
          if (pt?.kind === 'fixture') {
            const fObj = cur.fixtures.find((f) => f.id === pt.fixtureId);
            const info = fObj ? getFixtureWorldInfo(fObj, cur.walls, cur.wallHeight, slabTopY) : null;
            if (fObj && info) {
              snapOverride = { point: info.centerPos, matchedTargetId: fObj.id };
              break;
            }
          } else if (pt?.kind === 'pipe') {
            snapOverride = {
              point: { x: Number(h.point.x.toFixed(3)), z: Number(h.point.z.toFixed(3)) },
              matchedWireId: pt.pipeId,
            };
            break;
          }
        }
        if (!snapOverride) {
          let bestScreenDist = 28;
          for (const f of cur.fixtures) {
            const info = getFixtureWorldInfo(f, cur.walls, cur.wallHeight, slabTopY);
            if (!info) continue;
            const elevY = Math.min(slabTopY + Math.max(0.14, cur.wallHeight - 0.06), info.elevationY);
            const projV = new THREE.Vector3(info.facePos.x, elevY, info.facePos.z).project(perspCamera);
            if (projV.z < -1 || projV.z > 1) continue;
            const sx = ((projV.x + 1) * 0.5) * rect.width;
            const sy = (-(projV.y - 1) * 0.5) * rect.height;
            const sd = Math.hypot(sx - ptrScreenX, sy - ptrScreenY);
            if (sd < bestScreenDist) {
              bestScreenDist = sd;
              snapOverride = { point: info.centerPos, matchedTargetId: f.id };
            }
          }
        }
      }

      const hit = new THREE.Vector3();
      let groundHit = raycaster.ray.intersectPlane(groundPlane, hit)
        ? { x: hit.x, z: hit.z }
        : null;

      // If placing a ceiling light while looking up in 3D Walk/Orbit, intersect the ceiling plane
      if (
        !groundHit &&
        cur.activeTool === 'junction' &&
        cur.activeJunctionKind === 'ceiling-light'
      ) {
        const ceilingPlane = new THREE.Plane(
          new THREE.Vector3(0, 1, 0),
          -(slabTopY + Math.max(1.2, cur.wallHeight)),
        );
        const ceilHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(ceilingPlane, ceilHit)) {
          groundHit = { x: ceilHit.x, z: ceilHit.z };
        }
      }

      // When drawing a wire in 3D, project along wire elevation plane if no wall/snap target hit
      if (!wallHit && !snapOverride && cur.activeTool === 'wire' && cur.wallHeight > 0.2) {
        const wireElev =
          slabTopY +
          resolveMountElevation(
            cur.activeWireMountRef,
            cur.activeWireDropFromTop,
            cur.activeWireHeight,
            cur.wallHeight,
          );
        const wirePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -wireElev);
        const wirePlaneHit = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(wirePlane, wirePlaneHit) && !groundHit) {
          groundHit = { x: wirePlaneHit.x, z: wirePlaneHit.z };
        }
      }

      return {
        groundPt: snapOverride ? snapOverride.point : (groundHit ?? (wallHit ? wallHit.projPt : null)),
        wallHit,
        snapOverride,
      };
    };

    const isOpeningTool = (t: ToolMode): t is OpeningType =>
      t === 'door' ||
      t === 'double-door' ||
      t === 'sliding-door' ||
      t === 'garage-door' ||
      t === 'window';

    const getJunctionSnapTargets = () =>
      stateRef.current.junctions
        .map((j) => {
          const info = getJunctionWorldInfo(
            j,
            stateRef.current.walls,
            stateRef.current.wallHeight,
            0,
          );
          if (!info) return null;
          return {
            id: j.id,
            kind: j.kind,
            snapPos: info.centerPos,
            facePos: info.facePos,
            hitPositions: [info.centerPos, info.facePos],
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

    const getFixtureSnapTargets = () =>
      stateRef.current.fixtures
        .map((f) => {
          const info = getFixtureWorldInfo(
            f,
            stateRef.current.walls,
            stateRef.current.wallHeight,
            0,
          );
          if (!info) return null;
          return {
            id: f.id,
            kind: f.kind,
            snapPos: info.centerPos,
            facePos: info.facePos,
            hitPositions: [info.centerPos, info.facePos],
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

    const getFixtureSnapPoints = (): Point2D[] =>
      stateRef.current.fixtures
        .map((f) =>
          getFixtureWorldInfo(f, stateRef.current.walls, stateRef.current.wallHeight, 0)?.centerPos,
        )
        .filter((pt): pt is Point2D => Boolean(pt));

    const getWireSnapTargets = (excludeWireId?: string): WireSnapTarget[] => {
      const cur = stateRef.current;
      if (cur.wires.length === 0) return [];
      const renderList = computeAllWireRenderData(
        cur.wires,
        cur.junctions,
        cur.walls,
        cur.wallHeight,
        0,
        true,
      );
      return renderList
        .filter((rd) => rd.wire.id !== excludeWireId)
        .map((rd) => ({
          wireId: rd.wire.id,
          label: rd.wire.breakerLabel,
          points: rd.wire.points,
          renderedSegments: rd.segments.map((s) => ({
            start: { x: s.start.x, z: s.start.z },
            end: { x: s.end.x, z: s.end.z },
          })),
        }));
    };

    const getPipeSnapTargets = (excludePipeId?: string): WireSnapTarget[] => {
      const cur = stateRef.current;
      if (cur.pipes.length === 0) return [];
      const renderList = computeAllPlumbingRenderData(
        cur.pipes,
        cur.fixtures,
        cur.walls,
        cur.wallHeight,
        0,
        true,
      );
      return renderList
        .filter((rd) => rd.pipe.id !== excludePipeId)
        .map((rd) => ({
          wireId: rd.pipe.id,
          label: rd.pipe.lineLabel,
          points: rd.pipe.points,
          renderedSegments: rd.segments.map((s) => ({
            start: { x: s.start.x, z: s.start.z },
            end: { x: s.end.x, z: s.end.z },
          })),
        }));
    };

    const updateDraftPreview = (pointerX: number, pointerY: number, isTouch: boolean, shiftKey: boolean) => {
      clearPreview();
      const {
        viewMode: curView,
        activeTool: tool,
        activeWireCircuit: wireCircuit,
        activeBreakerLabel: breakerLabel,
        activeCableSpec: cableSpec,
        activeWireMountRef: wireMountRef,
        activeWireDropFromTop: wireDropFromTop,
        activeWireHeight: wireFloorHeight,
        activeJunctionKind: juncKind,
        activePipeType: pipeType,
        activePipeSpec: pipeSpec,
        activePipeLabel: pipeLabel,
        activePipeMountRef: pipeMountRef,
        activePipeDropFromTop: pipeDropFromTop,
        activePipeHeight: pipeFloorHeight,
        activeFixtureKind: fixtureKind,
        activeSecurityKind: securityKind,
        walls: curWalls,
        wires: curWires,
        pipes: curPipes,
        junctions: curJunctions,
        fixtures: curFixtures,
        wallHeight: curWallHeight,
        defaultThickness: thick,
        openingDefaults: defaults,
        snapMode: curSnap,
        showFloorPlate: curFloor,
      } = stateRef.current;
      const is2D = curView === '2d';
      const isFlatBlueprint = is2D || curWallHeight <= 0.12;
      const slabTopY = curFloor && curWalls.length > 0 ? 0.04 : 0;

      const offsetPx =
        isTouch &&
        (tool === 'wall' ||
          tool === 'wall-rect' ||
          tool === 'wire' ||
          tool === 'junction' ||
          tool === 'pipe' ||
          tool === 'fixture' ||
          tool === 'security' ||
          tool === 'furniture' ||
          isOpeningTool(tool))
          ? 38
          : 0;

      if (isTouch && offsetPx > 0) {
        const rect = renderer.domElement.getBoundingClientRect();
        setTouchReticle({ x: pointerX - rect.left, y: pointerY - rect.top - offsetPx });
      } else {
        setTouchReticle(null);
      }

      const { groundPt, wallHit, snapOverride } = resolvePointerPlacement(pointerX, pointerY, offsetPx);
      const raw = snapOverride
        ? snapOverride.point
        : wallHit &&
            (tool === 'wire' ||
              tool === 'pipe' ||
              (tool === 'junction' && juncKind !== 'ceiling-light') ||
              tool === 'fixture' ||
              isOpeningTool(tool) ||
              tool === 'security')
          ? wallHit.projPt
          : groundPt;
      if (!raw) return;

      if (tool === 'wall') {
        const snapped = snapPointToGridAndEndpoints(raw, draftAnchor, curWalls, {
          snapMode: curSnap,
          shiftKey,
        });
        draftHover = snapped.point;
        drawSnapGuides(snapped.guides);

        const dotColor =
          snapped.snapKind === 'endpoint'
            ? 0xd97706
            : snapped.snapKind === 'wall' || snapped.snapKind === 'align'
              ? 0x0284c7
              : 0x2563eb;

        const dot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16),
          new THREE.MeshBasicMaterial({ color: dotColor }),
        );
        dot.position.set(snapped.point.x, slabTopY + 0.14, snapped.point.z);
        previewGroup.add(dot);

        if (draftAnchor) {
          const len = distance2D(draftAnchor, snapped.point);
          if (len > 0.05) {
            const ang = Math.atan2(snapped.point.z - draftAnchor.z, snapped.point.x - draftAnchor.x);
            const previewH = isFlatBlueprint ? 0.14 : Math.max(0.2, curWallHeight);
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(len, previewH, thick),
              new THREE.MeshBasicMaterial({
                color: 0x2563eb,
                transparent: true,
                opacity: 0.42,
              }),
            );
            box.position.set(
              (draftAnchor.x + snapped.point.x) * 0.5,
              slabTopY + previewH * 0.5,
              (draftAnchor.z + snapped.point.z) * 0.5,
            );
            box.rotation.y = -ang;
            previewGroup.add(box);

            const midWorld = new THREE.Vector3(
              (draftAnchor.x + snapped.point.x) * 0.5,
              slabTopY + previewH + 0.12,
              (draftAnchor.z + snapped.point.z) * 0.5,
            );
            const scr = projectWorldToScreen(midWorld);
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${len.toFixed(2)} m${snapped.angleDeg !== null ? ` · ${snapped.angleDeg}°` : ''}`,
            });
          }
        }
      } else if (tool === 'wall-rect') {
        const snapped = snapPointToGridAndEndpoints(raw, null, curWalls, {
          snapMode: curSnap,
          shiftKey,
        });
        rectHover = snapped.point;
        drawSnapGuides(snapped.guides);

        const dotColor =
          snapped.snapKind === 'endpoint'
            ? 0xd97706
            : snapped.snapKind === 'wall' || snapped.snapKind === 'align'
              ? 0x0284c7
              : 0x2563eb;
        const dot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16),
          new THREE.MeshBasicMaterial({ color: dotColor }),
        );
        dot.position.set(snapped.point.x, slabTopY + 0.14, snapped.point.z);
        previewGroup.add(dot);

        if (rectAnchor) {
          const minX = Math.min(rectAnchor.x, snapped.point.x);
          const maxX = Math.max(rectAnchor.x, snapped.point.x);
          const minZ = Math.min(rectAnchor.z, snapped.point.z);
          const maxZ = Math.max(rectAnchor.z, snapped.point.z);
          const wSpan = maxX - minX;
          const dSpan = maxZ - minZ;

          if (wSpan > 0.08 && dSpan > 0.08) {
            const previewH = isFlatBlueprint ? 0.14 : Math.max(0.2, curWallHeight);
            const rectWallMat = new THREE.MeshBasicMaterial({
              color: 0x2563eb,
              transparent: true,
              opacity: 0.42,
            });
            const edges: [Point2D, Point2D][] = [
              [{ x: minX, z: minZ }, { x: maxX, z: minZ }],
              [{ x: maxX, z: minZ }, { x: maxX, z: maxZ }],
              [{ x: maxX, z: maxZ }, { x: minX, z: maxZ }],
              [{ x: minX, z: maxZ }, { x: minX, z: minZ }],
            ];
            for (const [s, e] of edges) {
              const segLen = distance2D(s, e);
              const ang = Math.atan2(e.z - s.z, e.x - s.x);
              const box = new THREE.Mesh(
                new THREE.BoxGeometry(segLen, previewH, thick),
                rectWallMat,
              );
              box.position.set((s.x + e.x) * 0.5, slabTopY + previewH * 0.5, (s.z + e.z) * 0.5);
              box.rotation.y = -ang;
              previewGroup.add(box);
            }

            const area = wSpan * dSpan;
            const scr = projectWorldToScreen(
              new THREE.Vector3((minX + maxX) * 0.5, slabTopY + previewH + 0.14, (minZ + maxZ) * 0.5),
            );
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${wSpan.toFixed(2)} × ${dSpan.toFixed(2)} m · ${area.toFixed(2)} m²`,
            });
          }
        }
      } else if (tool === 'wire') {
        const lastWirePt = wireDraftPoints.length > 0 ? wireDraftPoints[wireDraftPoints.length - 1] : null;
        const jSnapTargets = getJunctionSnapTargets();
        const wSnapTargets = getWireSnapTargets();
        const snapped = snapOverride
          ? {
              point: snapOverride.point,
              snapKind: 'endpoint' as const,
              angleDeg: null,
              matchedTargetId: snapOverride.matchedTargetId,
              matchedWireId: snapOverride.matchedWireId,
              guides: [],
            }
          : snapPointToGridAndEndpoints(raw, lastWirePt, curWalls, {
              snapMode: curSnap,
              shiftKey,
              endpointRadius: is2D ? Math.max(0.32, orthoFrustum * 0.022) : 0.42,
              extraSnapTargets: jSnapTargets,
              wireSnapTargets: wSnapTargets,
            });
        drawSnapGuides(snapped.guides);

        const matchedJunc = snapped.matchedTargetId
          ? jSnapTargets.find((t) => t.id === snapped.matchedTargetId) ?? null
          : null;
        const matchedWire = snapped.matchedWireId
          ? curWires.find((w) => w.id === snapped.matchedWireId) ?? null
          : null;

        const wirePreviewY = isFlatBlueprint
          ? 0.185
          : slabTopY +
            resolveMountElevation(wireMountRef, wireDropFromTop, wireFloorHeight, curWallHeight);

        const circuitColorHex = getWireDisplayColor(wireCircuit, breakerLabel);
        const previewMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(circuitColorHex) });

        const dot = new THREE.Mesh(
          isFlatBlueprint
            ? new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14)
            : new THREE.SphereGeometry(0.035, 12, 12),
          previewMat,
        );
        dot.position.set(snapped.point.x, wirePreviewY, snapped.point.z);
        previewGroup.add(dot);

        if (matchedJunc) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.11, 0.16, 24),
            new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(matchedJunc.facePos.x, wirePreviewY + 0.03, matchedJunc.facePos.z);
          previewGroup.add(ring);

          addConduitTube(
            previewGroup,
            new THREE.Vector3(matchedJunc.snapPos.x, wirePreviewY, matchedJunc.snapPos.z),
            new THREE.Vector3(matchedJunc.facePos.x, wirePreviewY, matchedJunc.facePos.z),
            0.018,
            new THREE.MeshBasicMaterial({ color: 0x059669 }),
          );
        } else if (matchedWire) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.11, 0.16, 24),
            new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(snapped.point.x, wirePreviewY + 0.03, snapped.point.z);
          previewGroup.add(ring);
        }

        const allPts = [...wireDraftPoints, snapped.point];
        for (let i = 0; i < allPts.length - 1; i++) {
          const a = allPts[i];
          const b = allPts[i + 1];
          addConduitTube(
            previewGroup,
            new THREE.Vector3(a.x, wirePreviewY, a.z),
            new THREE.Vector3(b.x, wirePreviewY, b.z),
            isFlatBlueprint ? 0.02 : 0.014,
            previewMat,
          );
        }
        for (const p of wireDraftPoints) {
          const node = new THREE.Mesh(
            isFlatBlueprint
              ? new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12)
              : new THREE.SphereGeometry(0.024, 10, 10),
            p.connectedWireId ? new THREE.MeshBasicMaterial({ color: 0x059669 }) : previewMat,
          );
          node.position.set(p.x, wirePreviewY, p.z);
          previewGroup.add(node);
        }

        const specTag = CABLE_SPEC_INFO[cableSpec].shortLabel;
        if (lastWirePt) {
          const segLen = distance2D(lastWirePt, snapped.point);
          const breakdown = computeDraftWireLength(
            allPts,
            wireMountRef,
            wireDropFromTop,
            wireFloorHeight,
            curJunctions,
            curWalls,
            curWallHeight,
          );
          const scr = projectWorldToScreen(
            new THREE.Vector3(
              (lastWirePt.x + snapped.point.x) * 0.5,
              wirePreviewY + 0.08,
              (lastWirePt.z + snapped.point.z) * 0.5,
            ),
          );
          const dropNote =
            breakdown.dropCount > 0
              ? ` incl. ${breakdown.dropCount} drop${breakdown.dropCount > 1 ? 's' : ''}`
              : '';
          const connectNote = matchedJunc
            ? ` → ${JUNCTION_KIND_INFO[matchedJunc.kind].shortCode}`
            : matchedWire
              ? ` → Tap ${matchedWire.breakerLabel}`
              : '';
          setLiveOverlay({
            screenX: scr.x,
            screenY: scr.y - 18,
            label: `${breakerLabel || 'B1'} (${specTag})${connectNote} · +${segLen.toFixed(2)} m | Total: ${breakdown.totalMeters.toFixed(2)} m${dropNote}`,
          });
        } else if (matchedJunc) {
          const jLabel = JUNCTION_KIND_INFO[matchedJunc.kind].label;
          const scr = projectWorldToScreen(
            new THREE.Vector3(matchedJunc.facePos.x, wirePreviewY + 0.08, matchedJunc.facePos.z),
          );
          setLiveOverlay({
            screenX: scr.x,
            screenY: scr.y - 18,
            label: `${breakerLabel || 'B1'} (${specTag}) · Connect from ${jLabel}`,
          });
        } else if (matchedWire) {
          const scr = projectWorldToScreen(
            new THREE.Vector3(snapped.point.x, wirePreviewY + 0.08, snapped.point.z),
          );
          setLiveOverlay({
            screenX: scr.x,
            screenY: scr.y - 18,
            label: `${breakerLabel || 'B1'} (${specTag}) · Connect to ${matchedWire.breakerLabel}`,
          });
        }
      } else if (tool === 'junction' && juncKind === 'ceiling-light') {
        const snapped = snapPointToGridAndEndpoints(raw, null, curWalls, {
          snapMode: curSnap,
          shiftKey,
        });
        const cx = snapped.point.x;
        const cz = snapped.point.z;
        const cy = isFlatBlueprint ? 0.19 : slabTopY + Math.max(0.35, curWallHeight - 0.04);
        const jInfo = JUNCTION_KIND_INFO[juncKind];
        const previewMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.055, 20),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(jInfo.color),
            transparent: true,
            opacity: 0.8,
          }),
        );
        previewMesh.position.set(cx, cy, cz);
        previewGroup.add(previewMesh);

        const scr = projectWorldToScreen(new THREE.Vector3(cx, cy + 0.1, cz));
        setLiveOverlay({
          screenX: scr.x,
          screenY: scr.y - 18,
          label: `${jInfo.label} · (${cx.toFixed(2)}, ${cz.toFixed(2)})`,
        });
      } else if (tool === 'junction') {
        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.65;
          for (const w of curWalls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          const len = wallLength(bestWall);
          if (len > 0.28) {
            const effectiveSnap = resolveEffectiveSnapMode(curSnap, shiftKey);
            const rawClamped = Math.max(0.12, Math.min(len - 0.12, bestOffset));
            const clamped =
              effectiveSnap === 'free'
                ? Number(rawClamped.toFixed(2))
                : Math.max(0.12, Math.min(len - 0.12, Math.round(rawClamped / 0.05) * 0.05));

            const ang = wallAngleRad(bestWall);
            const ux = Math.cos(ang);
            const uz = Math.sin(ang);
            const nx = -uz;
            const nz = ux;
            const inSide = getWallOutwardSide(bestWall, curWalls) === 1 ? -1 : 1;
            const faceOff = inSide * (bestWall.thickness * 0.5 + 0.032);
            const fx = bestWall.start.x + ux * clamped + nx * faceOff;
            const fz = bestWall.start.z + uz * clamped + nz * faceOff;

            const jInfo = JUNCTION_KIND_INFO[juncKind];
            const jElevY = isFlatBlueprint
              ? 0.19
              : slabTopY +
                resolveMountElevation(
                  jInfo.mountRef,
                  jInfo.defaultDropFromTop,
                  jInfo.defaultHeight,
                  curWallHeight,
                );
            const previewMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(jInfo.color),
              transparent: true,
              opacity: 0.78,
            });
            const previewMesh = new THREE.Mesh(
              isFlatBlueprint
                ? juncKind === 'panel'
                  ? new THREE.BoxGeometry(0.28, 0.12, 0.14)
                  : new THREE.BoxGeometry(0.16, 0.12, 0.12)
                : juncKind === 'panel'
                  ? new THREE.BoxGeometry(0.32, 0.42, 0.08)
                  : new THREE.BoxGeometry(0.13, 0.13, 0.05),
              previewMat,
            );
            previewMesh.position.set(fx, jElevY, fz);
            previewMesh.rotation.y = -ang;
            previewGroup.add(previewMesh);

            const scr = projectWorldToScreen(new THREE.Vector3(fx, jElevY + 0.12, fz));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${jInfo.label} · ${clamped.toFixed(2)} m`,
            });
          }
        }
      } else if (tool === 'pipe') {
        const lastPipePt = pipeDraftPoints.length > 0 ? pipeDraftPoints[pipeDraftPoints.length - 1] : null;
        const fSnapTargets = getFixtureSnapTargets();
        const pSnapTargets = getPipeSnapTargets();
        const fSnapPts = getFixtureSnapPoints();
        const snapped = snapPointToGridAndEndpoints(raw, lastPipePt, curWalls, {
          snapMode: curSnap,
          shiftKey,
          endpointRadius: is2D ? Math.max(0.32, orthoFrustum * 0.022) : 0.42,
          extraSnapPoints: fSnapPts,
          extraSnapTargets: fSnapTargets,
          wireSnapTargets: pSnapTargets,
        });
        drawSnapGuides(snapped.guides);

        const matchedFix = snapped.matchedTargetId
          ? fSnapTargets.find((t) => t.id === snapped.matchedTargetId) ?? null
          : null;
        const matchedPipe = snapped.matchedWireId
          ? curPipes.find((p) => p.id === snapped.matchedWireId) ?? null
          : null;

        const pipePreviewY = isFlatBlueprint
          ? 0.185
          : slabTopY +
            resolveMountElevation(pipeMountRef, pipeDropFromTop, pipeFloorHeight, curWallHeight);

        const pipeColorHex = getPlumbingDisplayColor(pipeType, pipeSpec);
        const previewMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pipeColorHex) });

        const dot = new THREE.Mesh(
          isFlatBlueprint
            ? new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14)
            : new THREE.SphereGeometry(0.036, 12, 12),
          previewMat,
        );
        dot.position.set(snapped.point.x, pipePreviewY, snapped.point.z);
        previewGroup.add(dot);

        if (matchedFix) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.11, 0.16, 24),
            new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(matchedFix.facePos.x, pipePreviewY + 0.03, matchedFix.facePos.z);
          previewGroup.add(ring);
        } else if (matchedPipe) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.11, 0.16, 24),
            new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(snapped.point.x, pipePreviewY + 0.03, snapped.point.z);
          previewGroup.add(ring);
        }

        const allPts = [...pipeDraftPoints, snapped.point];
        for (let i = 0; i < allPts.length - 1; i++) {
          const a = allPts[i];
          const b = allPts[i + 1];
          addConduitTube(
            previewGroup,
            new THREE.Vector3(a.x, pipePreviewY, a.z),
            new THREE.Vector3(b.x, pipePreviewY, b.z),
            isFlatBlueprint ? 0.024 : PLUMBING_SPEC_INFO[pipeSpec].radius3D,
            previewMat,
          );
        }
        for (const p of pipeDraftPoints) {
          const node = new THREE.Mesh(
            isFlatBlueprint
              ? new THREE.CylinderGeometry(0.064, 0.064, 0.05, 12)
              : new THREE.SphereGeometry(0.026, 10, 10),
            p.connectedWireId ? new THREE.MeshBasicMaterial({ color: 0x059669 }) : previewMat,
          );
          node.position.set(p.x, pipePreviewY, p.z);
          previewGroup.add(node);
        }

        const specTag = PLUMBING_SPEC_INFO[pipeSpec].shortLabel;
        if (lastPipePt) {
          const segLen = distance2D(lastPipePt, snapped.point);
          const breakdown = computeDraftRouteLength(
            allPts,
            pipeMountRef,
            pipeDropFromTop,
            pipeFloorHeight,
            curFixtures,
            curWalls,
            curWallHeight,
          );
          const scr = projectWorldToScreen(
            new THREE.Vector3(
              (lastPipePt.x + snapped.point.x) * 0.5,
              pipePreviewY + 0.08,
              (lastPipePt.z + snapped.point.z) * 0.5,
            ),
          );
          const riserNote =
            breakdown.dropCount > 0
              ? ` incl. ${breakdown.dropCount} riser${breakdown.dropCount > 1 ? 's' : ''}`
              : '';
          const connectNote = matchedFix
            ? ` → ${PLUMBING_FIXTURE_INFO[matchedFix.kind].shortCode}`
            : matchedPipe
              ? ` → Tee ${matchedPipe.lineLabel}`
              : '';
          setLiveOverlay({
            screenX: scr.x,
            screenY: scr.y - 18,
            label: `${pipeLabel || 'CW-1'} (${specTag})${connectNote} · +${segLen.toFixed(2)} m | Total: ${breakdown.totalMeters.toFixed(2)} m${riserNote}`,
          });
        } else {
          const snappedToFix = Boolean(matchedFix) || fSnapPts.some((fp) => distance2D(fp, snapped.point) < 0.05);
          if (snappedToFix) {
            const scr = projectWorldToScreen(
              new THREE.Vector3(snapped.point.x, pipePreviewY + 0.08, snapped.point.z),
            );
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${pipeLabel || 'CW-1'} (${specTag}) · Start at Water Point`,
            });
          } else if (matchedPipe) {
            const scr = projectWorldToScreen(
              new THREE.Vector3(snapped.point.x, pipePreviewY + 0.08, snapped.point.z),
            );
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${pipeLabel || 'CW-1'} (${specTag}) · Tee from ${matchedPipe.lineLabel}`,
            });
          }
        }
      } else if (tool === 'fixture') {
        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.65;
          for (const w of curWalls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          const len = wallLength(bestWall);
          if (len > 0.28) {
            const effectiveSnap = resolveEffectiveSnapMode(curSnap, shiftKey);
            const rawClamped = Math.max(0.12, Math.min(len - 0.12, bestOffset));
            const clamped =
              effectiveSnap === 'free'
                ? Number(rawClamped.toFixed(2))
                : Math.max(0.12, Math.min(len - 0.12, Math.round(rawClamped / 0.05) * 0.05));

            const ang = wallAngleRad(bestWall);
            const ux = Math.cos(ang);
            const uz = Math.sin(ang);
            const nx = -uz;
            const nz = ux;
            const inSide = getWallOutwardSide(bestWall, curWalls) === 1 ? -1 : 1;
            const faceOff = inSide * (bestWall.thickness * 0.5 + 0.032);
            const fx = bestWall.start.x + ux * clamped + nx * faceOff;
            const fz = bestWall.start.z + uz * clamped + nz * faceOff;

            const fInfo = PLUMBING_FIXTURE_INFO[fixtureKind];
            const fElevY = isFlatBlueprint
              ? 0.19
              : slabTopY +
                resolveMountElevation(
                  fInfo.mountRef,
                  fInfo.defaultDropFromTop,
                  fInfo.defaultHeight,
                  curWallHeight,
                );
            const previewMat = new THREE.MeshBasicMaterial({
              color: new THREE.Color(fInfo.color),
              transparent: true,
              opacity: 0.78,
            });
            const previewMesh = new THREE.Mesh(
              isFlatBlueprint
                ? fixtureKind === 'boiler'
                  ? new THREE.BoxGeometry(0.32, 0.12, 0.18)
                  : new THREE.BoxGeometry(0.18, 0.12, 0.14)
                : fixtureKind === 'boiler'
                  ? new THREE.BoxGeometry(0.34, 0.44, 0.14)
                  : fixtureKind === 'wc'
                    ? new THREE.BoxGeometry(0.24, 0.24, 0.12)
                    : new THREE.BoxGeometry(0.15, 0.15, 0.06),
              previewMat,
            );
            previewMesh.position.set(fx, fElevY, fz);
            previewMesh.rotation.y = -ang;
            previewGroup.add(previewMesh);

            const scr = projectWorldToScreen(new THREE.Vector3(fx, fElevY + 0.12, fz));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: `${fInfo.label} · ${clamped.toFixed(2)} m`,
            });
          }
        }
      } else if (isOpeningTool(tool)) {
        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.65;
          for (const w of curWalls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          const len = wallLength(bestWall);
          const opWidth = defaults[tool].width;
          const opHeight = defaults[tool].height;
          const opSill = tool === 'window' ? defaults[tool].sillHeight : 0;
          const margin = Math.max(0.15, bestWall.thickness * 0.6) + opWidth * 0.5;
          if (len > margin * 2) {
            const clamped = Math.max(margin, Math.min(len - margin, bestOffset));
            const ang = wallAngleRad(bestWall);
            const wx = bestWall.start.x + Math.cos(ang) * clamped;
            const wz = bestWall.start.z + Math.sin(ang) * clamped;
            const visH = isFlatBlueprint ? 0.2 : Math.min(opHeight, Math.max(0.25, curWallHeight - opSill));
            const centerY = isFlatBlueprint ? 0.12 : slabTopY + opSill + visH * 0.5;
            const previewMesh = new THREE.Mesh(
              new THREE.BoxGeometry(opWidth, visH, bestWall.thickness + 0.08),
              new THREE.MeshBasicMaterial({
                color: tool === 'window' ? 0x0284c7 : 0xd97706,
                transparent: true,
                opacity: 0.55,
              }),
            );
            previewMesh.position.set(wx, centerY, wz);
            previewMesh.rotation.y = -ang;
            previewGroup.add(previewMesh);

            const scr = projectWorldToScreen(new THREE.Vector3(wx, centerY + visH * 0.5 + 0.08, wz));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 18,
              label: openingPreviewLabel(tool, opWidth),
            });
          }
        }
      } else if (tool === 'security') {
        const placed = getSecurityPlacementSnap(raw, securityKind, curWalls, curSnap, shiftKey);
        const tempDev: SecurityDevice = { id: 'preview-sec', ...placed };
        const info = SECURITY_DEVICE_INFO[securityKind];
        const ghostMesh = buildSecurityDeviceMesh(
          tempDev,
          curWallHeight,
          slabTopY,
          isFlatBlueprint,
          false,
        );
        previewGroup.add(ghostMesh);

        const cov =
          tempDev.fovDeg > 0 && tempDev.rangeMeters > 0
            ? buildSecurityCoverageVisual(
                previewGroup,
                tempDev,
                curWalls,
                curWallHeight,
                slabTopY,
                isFlatBlueprint,
                false,
                true,
              )
            : null;

        const labelY = isFlatBlueprint ? 0.28 : slabTopY + tempDev.mountHeight + 0.15;
        const scr = projectWorldToScreen(new THREE.Vector3(tempDev.x, labelY, tempDev.z));
        setLiveOverlay({
          screenX: scr.x,
          screenY: scr.y - 18,
          label: cov
            ? `${info.label} · ${Math.round(tempDev.fovDeg)}° · ${tempDev.rangeMeters.toFixed(1)}m · ${cov.areaSqM.toFixed(1)} m² (${cov.coveragePct}%)`
            : `${info.label}${tempDev.wallId ? ' · Wall Mount' : ''}`,
        });
      } else if (tool === 'furniture') {
        const snapped = snapPointToGridAndEndpoints(raw, null, curWalls, {
          snapMode: curSnap,
          shiftKey,
        });
        const fKind = stateRef.current.activeFurnitureKind;
        const info = FURNITURE_KIND_INFO[fKind];
        const ghostItem: FurnitureItem = {
          id: 'preview-furniture',
          kind: fKind,
          label: info.shortLabel,
          x: snapped.point.x,
          z: snapped.point.z,
          rotationDeg: 0,
          width: info.defaultWidth,
          depth: info.defaultDepth,
          height: info.defaultHeight,
        };
        const ghostMesh = buildFurnitureMesh(ghostItem, slabTopY, isFlatBlueprint, true);
        previewGroup.add(ghostMesh);

        const labelY = isFlatBlueprint ? 0.28 : slabTopY + info.defaultHeight + 0.12;
        const scr = projectWorldToScreen(new THREE.Vector3(ghostItem.x, labelY, ghostItem.z));
        setLiveOverlay({
          screenX: scr.x,
          screenY: scr.y - 18,
          label: `${info.label} · ${info.defaultWidth.toFixed(2)}×${info.defaultDepth.toFixed(2)} m`,
        });
      }
      requestRender();
    };

    const commitWireDraft = () => {
      if (wireDraftPoints.length >= 2) {
        callbacksRef.current.onAddWire(wireDraftPoints);
      }
      wireDraftPoints = [];
      setWireChainActive(false);
      clearPreview();
      requestRender();
    };
    commitWireDraftRef.current = commitWireDraft;

    const seedWireStart = (pt: Point2D) => {
      wireDraftPoints = [{ x: Number(pt.x.toFixed(3)), z: Number(pt.z.toFixed(3)) }];
      setWireChainActive(true);
      clearPreview();
      const previewMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(
          getWireDisplayColor(stateRef.current.activeWireCircuit, stateRef.current.activeBreakerLabel),
        ),
      });
      const node = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.07, 14), previewMat);
      node.position.set(pt.x, 0.19, pt.z);
      previewGroup.add(node);
      requestRender();
    };
    seedWireStartRef.current = seedWireStart;

    const commitPipeDraft = () => {
      if (pipeDraftPoints.length >= 2) {
        callbacksRef.current.onAddPipe(pipeDraftPoints);
      }
      pipeDraftPoints = [];
      setPipeChainActive(false);
      clearPreview();
      requestRender();
    };
    commitPipeDraftRef.current = commitPipeDraft;

    const cancelDraftChain = () => {
      draftAnchor = null;
      draftHover = null;
      rectAnchor = null;
      rectHover = null;
      rectPressStart = null;
      wireDraftPoints = [];
      pipeDraftPoints = [];
      activeDrag = null;
      setChainActive(false);
      setWireChainActive(false);
      setPipeChainActive(false);
      setTouchReticle(null);
      clearPreview();
      requestRender();
    };
    cancelDraftChainRef.current = cancelDraftChain;

    const resolveDisconnectWallId = (cornerPos: Point2D, shiftPressed: boolean): string | null => {
      if (!shiftPressed) return null;
      const touching = stateRef.current.walls.filter(
        (w) => distance2D(w.start, cornerPos) < 0.05 || distance2D(w.end, cornerPos) < 0.05,
      );
      if (touching.length <= 1) return null;
      const curSel = stateRef.current.selected;
      if (curSel?.kind === 'wall') {
        const matchSel = touching.find((w) => w.id === curSel.wallId);
        if (matchSel) return matchSel.id;
      }
      const pickedId = touching[0].id;
      callbacksRef.current.onSelect({ kind: 'wall', wallId: pickedId });
      return pickedId;
    };

    const activePointers = new Map<number, { x: number; y: number; type: string }>();
    let isPanning2D = false;
    let lastPanX = 0;
    let lastPanY = 0;
    let pinchLastDist = 0;
    let pinchLastCenter = { x: 0, y: 0 };

    let walkDragLook = false;
    let camDragLook = false;
    let walkDragStartX = 0;
    let walkDragStartY = 0;
    let walkMovedEnough = false;
    let pointerStartedOnCanvas = false;

    let wallPressStart: { x: number; y: number; anchor: Point2D | null; isTouch: boolean } | null = null;
    let rectPressStart: { x: number; y: number; anchor: Point2D; isTouch: boolean } | null = null;
    let lastPointerClient: { x: number; y: number } | null = null;

    const executeToolPlacementAt = (
      clientX: number,
      clientY: number,
      isTouch: boolean,
      shiftKey: boolean,
    ): boolean => {
      if (stateRef.current.editLocked) return false;
      const tool = stateRef.current.activeTool;
      if (tool === 'select') return false;

      const offsetPx = isTouch ? 38 : 0;
      const { groundPt, wallHit, snapOverride } = resolvePointerPlacement(clientX, clientY, offsetPx);
      const raw = snapOverride
        ? snapOverride.point
        : wallHit &&
            (tool === 'wire' ||
              tool === 'pipe' ||
              (tool === 'junction' && stateRef.current.activeJunctionKind !== 'ceiling-light') ||
              tool === 'fixture' ||
              isOpeningTool(tool) ||
              tool === 'security')
          ? wallHit.projPt
          : groundPt;
      if (!raw) return false;

      if (tool === 'wall') {
        const snapped = snapPointToGridAndEndpoints(raw, draftAnchor, stateRef.current.walls, {
          snapMode: stateRef.current.snapMode,
          shiftKey,
        });

        if (!draftAnchor) {
          draftAnchor = snapped.point;
          setChainActive(true);
          if (stateRef.current.viewMode === '2d') {
            wallPressStart = { x: clientX, y: clientY, anchor: snapped.point, isTouch };
          }
          updateDraftPreview(clientX, clientY, isTouch, shiftKey);
        } else {
          const len = distance2D(draftAnchor, snapped.point);
          if (len >= 0.2) {
            callbacksRef.current.onAddWall(draftAnchor, snapped.point);
            draftAnchor = snapped.point;
            setChainActive(true);
            updateDraftPreview(clientX, clientY, isTouch, shiftKey);
          }
        }
        return true;
      }

      if (tool === 'wall-rect') {
        const snapped = snapPointToGridAndEndpoints(raw, null, stateRef.current.walls, {
          snapMode: stateRef.current.snapMode,
          shiftKey,
        });

        if (!rectAnchor) {
          rectAnchor = snapped.point;
          setChainActive(true);
          if (stateRef.current.viewMode === '2d') {
            rectPressStart = { x: clientX, y: clientY, anchor: snapped.point, isTouch };
          }
          updateDraftPreview(clientX, clientY, isTouch, shiftKey);
        } else {
          const dx = Math.abs(snapped.point.x - rectAnchor.x);
          const dz = Math.abs(snapped.point.z - rectAnchor.z);
          if (dx >= 0.25 && dz >= 0.25) {
            callbacksRef.current.onAddWallRect(rectAnchor, snapped.point);
            rectAnchor = null;
            rectHover = null;
            rectPressStart = null;
            setChainActive(false);
            clearPreview();
            requestRender();
          }
        }
        return true;
      }

      if (tool === 'wire') {
        const lastPt = wireDraftPoints.length > 0 ? wireDraftPoints[wireDraftPoints.length - 1] : null;
        const snapped = snapOverride
          ? {
              point: snapOverride.point,
              matchedTargetId: snapOverride.matchedTargetId,
              matchedWireId: snapOverride.matchedWireId,
            }
          : snapPointToGridAndEndpoints(raw, lastPt, stateRef.current.walls, {
              snapMode: stateRef.current.snapMode,
              shiftKey,
              endpointRadius:
                stateRef.current.viewMode === '2d' ? Math.max(0.32, orthoFrustum * 0.022) : 0.42,
              extraSnapTargets: getJunctionSnapTargets(),
              wireSnapTargets: getWireSnapTargets(),
            });

        if (lastPt && distance2D(lastPt, snapped.point) < 0.14) {
          commitWireDraft();
          return true;
        }

        wireDraftPoints.push({
          x: snapped.point.x,
          z: snapped.point.z,
          ...(snapped.matchedWireId ? { connectedWireId: snapped.matchedWireId } : {}),
        });

        // If finishing a wire directly onto another junction/element or wire, auto-commit the connection
        if (
          wireDraftPoints.length >= 2 &&
          (snapped.matchedTargetId || snapped.matchedWireId)
        ) {
          commitWireDraft();
          return true;
        }

        setWireChainActive(true);
        updateDraftPreview(clientX, clientY, isTouch, shiftKey);
        return true;
      }

      if (tool === 'junction') {
        if (stateRef.current.activeJunctionKind === 'ceiling-light') {
          const snapped = snapPointToGridAndEndpoints(raw, null, stateRef.current.walls, {
            snapMode: stateRef.current.snapMode,
            shiftKey,
          });
          callbacksRef.current.onAddJunction('ceiling', 0, {
            x: Number(snapped.point.x.toFixed(2)),
            z: Number(snapped.point.z.toFixed(2)),
          });
          clearPreview();
          return true;
        }

        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.7;
          for (const w of stateRef.current.walls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          const len = wallLength(bestWall);
          if (len > 0.28) {
            const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, shiftKey);
            const clamped = Math.max(0.12, Math.min(len - 0.12, bestOffset));
            const finalOffset =
              effectiveSnap === 'free'
                ? Number(clamped.toFixed(2))
                : Math.max(0.12, Math.min(len - 0.12, Math.round(clamped / 0.05) * 0.05));
            callbacksRef.current.onAddJunction(bestWall.id, finalOffset);
            clearPreview();
            return true;
          }
        }
        return false;
      }

      if (tool === 'pipe') {
        const lastPt = pipeDraftPoints.length > 0 ? pipeDraftPoints[pipeDraftPoints.length - 1] : null;
        const snapped = snapOverride
          ? {
              point: snapOverride.point,
              matchedTargetId: snapOverride.matchedTargetId,
              matchedWireId: snapOverride.matchedWireId,
            }
          : snapPointToGridAndEndpoints(raw, lastPt, stateRef.current.walls, {
              snapMode: stateRef.current.snapMode,
              shiftKey,
              endpointRadius:
                stateRef.current.viewMode === '2d' ? Math.max(0.32, orthoFrustum * 0.022) : 0.42,
              extraSnapPoints: getFixtureSnapPoints(),
              extraSnapTargets: getFixtureSnapTargets(),
              wireSnapTargets: getPipeSnapTargets(),
            });

        if (lastPt && distance2D(lastPt, snapped.point) < 0.14) {
          commitPipeDraft();
          return true;
        }

        pipeDraftPoints.push({
          x: snapped.point.x,
          z: snapped.point.z,
          ...(snapped.matchedWireId ? { connectedWireId: snapped.matchedWireId } : {}),
        });
        if (
          pipeDraftPoints.length >= 2 &&
          (snapped.matchedTargetId || snapped.matchedWireId)
        ) {
          commitPipeDraft();
          return true;
        }
        setPipeChainActive(true);
        updateDraftPreview(clientX, clientY, isTouch, shiftKey);
        return true;
      }

      if (tool === 'fixture') {
        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.7;
          for (const w of stateRef.current.walls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          const len = wallLength(bestWall);
          if (len > 0.28) {
            const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, shiftKey);
            const clamped = Math.max(0.12, Math.min(len - 0.12, bestOffset));
            const finalOffset =
              effectiveSnap === 'free'
                ? Number(clamped.toFixed(2))
                : Math.max(0.12, Math.min(len - 0.12, Math.round(clamped / 0.05) * 0.05));
            callbacksRef.current.onAddFixture(bestWall.id, finalOffset);
            clearPreview();
            return true;
          }
        }
        return false;
      }

      if (isOpeningTool(tool)) {
        let bestWall: WallSegment | null = wallHit ? wallHit.wall : null;
        let bestOffset = wallHit ? wallHit.offset : 0;
        if (!bestWall) {
          let bestDist = 0.7;
          for (const w of stateRef.current.walls) {
            const proj = projectPointOntoWall(raw, w);
            if (proj.distance < bestDist) {
              bestDist = proj.distance;
              bestWall = w;
              bestOffset = proj.offset;
            }
          }
        }
        if (bestWall) {
          callbacksRef.current.onAddOpening(bestWall.id, tool, bestOffset);
          clearPreview();
          return true;
        }
        return false;
      }

      if (tool === 'security') {
        const placed = getSecurityPlacementSnap(
          raw,
          stateRef.current.activeSecurityKind,
          stateRef.current.walls,
          stateRef.current.snapMode,
          shiftKey,
        );
        callbacksRef.current.onAddSecurityDevice(placed);
        clearPreview();
        return true;
      }

      if (tool === 'furniture') {
        const snapped = snapPointToGridAndEndpoints(raw, null, stateRef.current.walls, {
          snapMode: stateRef.current.snapMode,
          shiftKey,
        });
        const fKind = stateRef.current.activeFurnitureKind;
        const info = FURNITURE_KIND_INFO[fKind];
        callbacksRef.current.onAddFurniture({
          kind: fKind,
          label: info.shortLabel,
          x: Number(snapped.point.x.toFixed(2)),
          z: Number(snapped.point.z.toFixed(2)),
          rotationDeg: 0,
          width: info.defaultWidth,
          depth: info.defaultDepth,
          height: info.defaultHeight,
        });
        clearPreview();
        return true;
      }

      return false;
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointerStartedOnCanvas = true;
      lastPointerClient = { x: e.clientX, y: e.clientY };
      setEditingDim(null);
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      const mode = stateRef.current.viewMode;

      if (mode === '2d' && activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        pinchLastDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchLastCenter = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        wallPressStart = null;
        activeDrag = null;
        return;
      }

      if (mode === '2d') {
        if (e.button === 1 || e.button === 2 || keysDown.has('Space')) {
          if (e.button === 2 && wireDraftPoints.length > 0) {
            commitWireDraft();
            return;
          }
          if (e.button === 2 && pipeDraftPoints.length > 0) {
            commitPipeDraft();
            return;
          }
          if (e.button === 2 && (draftAnchor || rectAnchor)) {
            cancelDraftChain();
            return;
          }
          if (!stateRef.current.cameraLocked) {
            isPanning2D = true;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
          }
          return;
        }

        const isTouch = e.pointerType === 'touch';
        const tool = stateRef.current.activeTool;

        // Grab live motion-sensor test target regardless of active placement tool
        if (stateRef.current.testMotionActive) {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, orthoCamera);
          const testHits = raycaster.intersectObjects(handleGroup.children, false);
          if (testHits.some((h) => h.object.userData.motionTestHandle)) {
            activeDrag = { kind: 'motionTest' };
            renderer.domElement.setPointerCapture(e.pointerId);
            return;
          }
        }

        if (tool === 'select' || stateRef.current.editLocked) {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, orthoCamera);

          // 1a. Grabbing a handle (corner handle, wire vertex handle, or security aim handle)
          const gripHits = stateRef.current.editLocked
            ? []
            : raycaster.intersectObjects(handleGroup.children, false);
          if (gripHits.length > 0) {
            const uData = gripHits[0].object.userData;
            if (stateRef.current.showWiring && uData.wireVertexHandle) {
              const { wireId, vertexIndex } = uData.wireVertexHandle as {
                wireId: string;
                vertexIndex: number;
              };
              const targetWire = stateRef.current.wires.find((w) => w.id === wireId);
              const targetPt = targetWire?.points[vertexIndex];
              if (targetWire && targetPt) {
                activeDrag = {
                  kind: 'wireVertex',
                  wireId,
                  vertexIndex,
                  baseWires: stateRef.current.wires.map((w) => ({
                    ...w,
                    points: w.points.map((p) => ({ ...p })),
                  })),
                  lastPoint: { ...targetPt },
                };
                renderer.domElement.setPointerCapture(e.pointerId);
                return;
              }
            }
            if (stateRef.current.showSecurity && uData.securityAimHandle) {
              const { securityId } = uData.securityAimHandle as { securityId: string };
              const dev = stateRef.current.securityDevices.find((d) => d.id === securityId);
              if (dev) {
                activeDrag = {
                  kind: 'securityAim',
                  deviceId: securityId,
                  baseDevices: stateRef.current.securityDevices.map((d) => ({ ...d })),
                  lastDevice: { ...dev },
                };
                renderer.domElement.setPointerCapture(e.pointerId);
                return;
              }
            }
            if (stateRef.current.showStructure && uData.cornerHandle) {
              const origPos = uData.cornerHandle.pos as Point2D;
              const onlyWallId = resolveDisconnectWallId(origPos, e.shiftKey);
              activeDrag = {
                kind: 'corner',
                baseWalls: cloneWalls(stateRef.current.walls),
                origPos: { ...origPos },
                lastPos: { ...origPos },
                onlyWallId,
              };
              renderer.domElement.setPointerCapture(e.pointerId);
              return;
            }
          }

          if (!stateRef.current.editLocked && stateRef.current.showStructure) {
            const rawDown = screenToGround2D(e.clientX, e.clientY, 0);
            if (rawDown) {
              const cornerTol = Math.max(0.22, orthoFrustum * (isTouch ? 0.03 : 0.018));
              let nearCorner: Point2D | null = null;
              let bestCornerDist = cornerTol;
              for (const w of stateRef.current.walls) {
                for (const pt of [w.start, w.end]) {
                  const d = distance2D(rawDown, pt);
                  if (d < bestCornerDist) {
                    bestCornerDist = d;
                    nearCorner = pt;
                  }
                }
              }
              if (nearCorner) {
                const onlyWallId = resolveDisconnectWallId(nearCorner, e.shiftKey);
                activeDrag = {
                  kind: 'corner',
                  baseWalls: cloneWalls(stateRef.current.walls),
                  origPos: { ...nearCorner },
                  lastPos: { ...nearCorner },
                  onlyWallId,
                };
                renderer.domElement.setPointerCapture(e.pointerId);
                return;
              }
            }
          }

          // 2. Clicking / dragging a security device, pipe, fixture, wire, junction, furniture, opening, or wall middle
          const pickTargets: THREE.Object3D[] = [];
          if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
          if (stateRef.current.showWiring) pickTargets.push(wireGroup);
          if (stateRef.current.showPlumbing) pickTargets.push(plumbingGroup);
          if (stateRef.current.showInterior) pickTargets.push(furnitureGroup);
          if (stateRef.current.showStructure) pickTargets.push(houseGroup);
          const hits = raycaster.intersectObjects(pickTargets, true);
          const hitTarget = hits.find((h) => h.object.userData.pickTarget)?.object.userData
            .pickTarget as SelectionTarget | undefined;
          callbacksRef.current.onSelect(hitTarget ?? null);

          if (!stateRef.current.editLocked) {
            if (hitTarget?.kind === 'security') {
              const dev = stateRef.current.securityDevices.find((d) => d.id === hitTarget.securityId);
              if (dev) {
                activeDrag = {
                  kind: 'security',
                  deviceId: dev.id,
                  baseDevices: stateRef.current.securityDevices.map((d) => ({ ...d })),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  active: false,
                  lastDevice: { ...dev },
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (hitTarget?.kind === 'furniture') {
              const item = stateRef.current.furniture.find((f) => f.id === hitTarget.furnitureId);
              const raw = screenToGround2D(e.clientX, e.clientY, 0);
              if (item && raw) {
                activeDrag = {
                  kind: 'furniture',
                  furnitureId: item.id,
                  baseFurniture: stateRef.current.furniture.map((f) => ({ ...f })),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startGround: raw,
                  active: false,
                  lastItem: { ...item },
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (hitTarget?.kind === 'opening') {
              const hostWall = stateRef.current.walls.find((w) => w.id === hitTarget.wallId);
              const op = hostWall?.openings.find((o) => o.id === hitTarget.openingId);
              if (hostWall && op) {
                activeDrag = {
                  kind: 'opening',
                  wallId: hitTarget.wallId,
                  openingId: hitTarget.openingId,
                  baseWalls: cloneWalls(stateRef.current.walls),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  active: false,
                  lastTargetWallId: hitTarget.wallId,
                  lastOffset: op.offset,
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (hitTarget?.kind === 'junction') {
              const junc = stateRef.current.junctions.find((j) => j.id === hitTarget.junctionId);
              if (junc) {
                activeDrag = {
                  kind: 'junction',
                  junctionId: junc.id,
                  baseJunctions: stateRef.current.junctions.map((j) => ({ ...j })),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  active: false,
                  lastTargetWallId: junc.wallId,
                  lastOffset: junc.offset,
                  ...(junc.wallId === 'ceiling'
                    ? { lastFreePos: { x: junc.x ?? 0, z: junc.z ?? 0 } }
                    : {}),
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (hitTarget?.kind === 'fixture') {
              const fix = stateRef.current.fixtures.find((f) => f.id === hitTarget.fixtureId);
              if (fix) {
                activeDrag = {
                  kind: 'fixture',
                  fixtureId: fix.id,
                  baseFixtures: stateRef.current.fixtures.map((f) => ({ ...f })),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  active: false,
                  lastTargetWallId: fix.wallId,
                  lastOffset: fix.offset,
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (hitTarget?.kind === 'wall') {
              const raw = screenToGround2D(e.clientX, e.clientY, 0);
              if (raw) {
                activeDrag = {
                  kind: 'wall',
                  wallId: hitTarget.wallId,
                  baseWalls: cloneWalls(stateRef.current.walls),
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startGround: raw,
                  active: false,
                  lastDx: 0,
                  lastDz: 0,
                };
                renderer.domElement.setPointerCapture(e.pointerId);
              }
            } else if (!hitTarget && !stateRef.current.cameraLocked && e.button === 0) {
              isPanning2D = true;
              lastPanX = e.clientX;
              lastPanY = e.clientY;
            }
          } else if (!hitTarget && !stateRef.current.cameraLocked && e.button === 0) {
            isPanning2D = true;
            lastPanX = e.clientX;
            lastPanY = e.clientY;
          }
          return;
        }

        executeToolPlacementAt(e.clientX, e.clientY, isTouch, e.shiftKey);
      } else if (stateRef.current.activeCameraViewId) {
        camDragLook = true;
        walkDragStartX = e.clientX;
        walkDragStartY = e.clientY;
        walkMovedEnough = false;
      } else if (mode === '3d-walk') {
        if (document.pointerLockElement === renderer.domElement) {
          if (e.button === 0) {
            const isCtrlEdit = e.ctrlKey || e.metaKey;
            if (!isCtrlEdit && stateRef.current.activeTool !== 'select' && !stateRef.current.editLocked) {
              const rect = renderer.domElement.getBoundingClientRect();
              executeToolPlacementAt(
                rect.left + rect.width * 0.5,
                rect.top + rect.height * 0.5,
                false,
                e.shiftKey,
              );
            } else {
              perspCamera.updateMatrixWorld(true);
              houseGroup.updateMatrixWorld(true);
              wireGroup.updateMatrixWorld(true);
              plumbingGroup.updateMatrixWorld(true);
              securityGroup.updateMatrixWorld(true);
              furnitureGroup.updateMatrixWorld(true);
              centerRaycaster.setFromCamera(centerNdc, perspCamera);
              const pickTargets: THREE.Object3D[] = [];
              if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
              if (stateRef.current.showWiring) pickTargets.push(wireGroup);
              if (stateRef.current.showPlumbing) pickTargets.push(plumbingGroup);
              if (stateRef.current.showInterior) pickTargets.push(furnitureGroup);
              if (stateRef.current.showStructure) pickTargets.push(houseGroup);
              const hits = centerRaycaster.intersectObjects(pickTargets, true);

              if (isCtrlEdit) {
                const hitTarget = pickBest3DTarget(hits);
                callbacksRef.current.onSelect(hitTarget ?? null);
                document.exitPointerLock?.();
                return;
              }

              const panelCtrl = findPanelControlInHits(hits, 7.5);
              if (panelCtrl?.kind === 'door') {
                const panelObj = stateRef.current.junctions.find((j) => j.id === panelCtrl.panelId);
                if (panelObj) {
                  callbacksRef.current.onUpdateJunction(panelObj.id, { isOpen: !panelObj.isOpen });
                  callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelObj.id });
                  return;
                }
              } else if (panelCtrl?.kind === 'breaker' && !stateRef.current.editLocked) {
                callbacksRef.current.onTogglePanelBreaker?.(panelCtrl.panelId, panelCtrl.breakerLabel);
                callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelCtrl.panelId });
                return;
              }

              const openMeta = findOpeningInHits(hits, 7.5)?.meta ?? null;
              if (openMeta) {
                toggleCenterOpeningRef.current?.();
              } else {
                const hitTarget = pickBest3DTarget(hits);
                if (hitTarget) callbacksRef.current.onSelect(hitTarget);
              }
            }
          }
          return;
        }

        walkDragLook = true;
        walkDragStartX = e.clientX;
        walkDragStartY = e.clientY;
        walkMovedEnough = false;
      } else if (mode === '3d-orbit') {
        if (e.button === 0) {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          perspCamera.updateMatrixWorld(true);
          raycaster.setFromCamera(ndc, perspCamera);
          const gripHits = stateRef.current.editLocked
            ? []
            : raycaster.intersectObjects(handleGroup.children, false);
          if (gripHits.length > 0) {
            const uData = gripHits[0].object.userData;
            if (stateRef.current.testMotionActive && uData.motionTestHandle) {
              activeDrag = { kind: 'motionTest' };
              orbitControls.enabled = false;
              renderer.domElement.setPointerCapture(e.pointerId);
              return;
            }
            if (stateRef.current.showWiring && uData.wireVertexHandle) {
              const { wireId, vertexIndex } = uData.wireVertexHandle as {
                wireId: string;
                vertexIndex: number;
              };
              const targetWire = stateRef.current.wires.find((w) => w.id === wireId);
              const targetPt = targetWire?.points[vertexIndex];
              if (targetWire && targetPt) {
                const slabTopY =
                  stateRef.current.showFloorPlate && stateRef.current.walls.length > 0 ? 0.04 : 0;
                const dragY =
                  slabTopY +
                  resolveMountElevation(
                    targetWire.mountRef ?? 'ceiling',
                    targetWire.dropFromTop ?? 0.3,
                    targetWire.height ?? 0.3,
                    stateRef.current.wallHeight,
                  );
                activeDrag = {
                  kind: 'wireVertex',
                  wireId,
                  vertexIndex,
                  baseWires: stateRef.current.wires.map((w) => ({
                    ...w,
                    points: w.points.map((p) => ({ ...p })),
                  })),
                  lastPoint: { ...targetPt },
                  dragY,
                };
                orbitControls.enabled = false;
                renderer.domElement.setPointerCapture(e.pointerId);
                return;
              }
            }
          }
        }
        if (!stateRef.current.cameraLocked) {
          flyDragLook = true;
        }
        walkDragStartX = e.clientX;
        walkDragStartY = e.clientY;
        walkMovedEnough = false;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      lastPointerClient = { x: e.clientX, y: e.clientY };
      if (activePointers.has(e.pointerId)) {
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      }
      const mode = stateRef.current.viewMode;

      if (mode === '2d' && activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const center = { x: (pts[0].x + pts[1].x) * 0.5, y: (pts[0].y + pts[1].y) * 0.5 };
        const rect = renderer.domElement.getBoundingClientRect();

        if (pinchLastDist > 10 && dist > 10) {
          const factor = pinchLastDist / dist;
          orthoFrustum = THREE.MathUtils.clamp(orthoFrustum * factor, 4, 48);
        }

        const dx = center.x - pinchLastCenter.x;
        const dy = center.y - pinchLastCenter.y;
        if (!stateRef.current.cameraLocked) {
          const worldPerPx = orthoFrustum / Math.max(1, rect.height);
          orthoCenter.x -= dx * worldPerPx;
          orthoCenter.y -= dy * worldPerPx;
          cameraAnchorRef.current = { x: orthoCenter.x, z: orthoCenter.y };
        }

        pinchLastDist = dist;
        pinchLastCenter = center;
        updateOrthoProjection(rect.width, rect.height);
        requestRender();
        return;
      }

      if (mode === '2d') {
        if (isPanning2D) {
          if (!stateRef.current.cameraLocked) {
            const rect = renderer.domElement.getBoundingClientRect();
            const worldPerPx = orthoFrustum / Math.max(1, rect.height);
            orthoCenter.x -= (e.clientX - lastPanX) * worldPerPx;
            orthoCenter.y -= (e.clientY - lastPanY) * worldPerPx;
            cameraAnchorRef.current = { x: orthoCenter.x, z: orthoCenter.y };
            updateOrthoProjection(rect.width, rect.height);
            requestRender();
          }
          lastPanX = e.clientX;
          lastPanY = e.clientY;
          return;
        }

        if (activeDrag) {
          const raw = screenToGround2D(e.clientX, e.clientY, e.pointerType === 'touch' ? 32 : 0);
          if (!raw) return;

          if (activeDrag.kind === 'motionTest') {
            testMotionPosRef.current = {
              x: Number(raw.x.toFixed(2)),
              z: Number(raw.z.toFixed(2)),
            };
            const scr = projectWorldToScreen(new THREE.Vector3(raw.x, 0.3, raw.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 22,
              label: `Test Person (${raw.x.toFixed(1)}, ${raw.z.toFixed(1)})`,
            });
            rebuildHouse();
            requestRender();
            return;
          }

          if (activeDrag.kind === 'corner') {
            const origCorner = activeDrag.origPos;
            const onlyWallId = activeDrag.onlyWallId;
            const refWalls = activeDrag.baseWalls
              .map((w) => {
                if (onlyWallId && w.id !== onlyWallId) return w;
                const startIsOrig = distance2D(w.start, origCorner) < 0.05;
                const endIsOrig = distance2D(w.end, origCorner) < 0.05;
                if (startIsOrig && !endIsOrig) {
                  return { ...w, start: { ...w.end } };
                }
                if (endIsOrig && !startIsOrig) {
                  return { ...w, end: { ...w.start } };
                }
                if (startIsOrig && endIsOrig) return null;
                return w;
              })
              .filter((w): w is WallSegment => w !== null);
            const snapped = snapPointToGridAndEndpoints(raw, null, refWalls, {
              snapMode: stateRef.current.snapMode,
              shiftKey: e.shiftKey,
            });
            clearPreview();
            drawSnapGuides(snapped.guides);
            activeDrag.lastPos = snapped.point;
            callbacksRef.current.onMoveCorner(
              activeDrag.baseWalls,
              activeDrag.origPos,
              snapped.point,
              onlyWallId,
              false,
            );
            const scr = projectWorldToScreen(new THREE.Vector3(snapped.point.x, 0.25, snapped.point.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 22,
              label: onlyWallId
                ? `Disconnect Corner (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`
                : `Corner (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`,
            });
            return;
          }

          if (activeDrag.kind === 'wall') {
            if (!activeDrag.active) {
              if (Math.hypot(e.clientX - activeDrag.startClientX, e.clientY - activeDrag.startClientY) < 6) {
                return;
              }
              activeDrag.active = true;
            }

            const dragWallId = activeDrag.wallId;
            let dx = raw.x - activeDrag.startGround.x;
            let dz = raw.z - activeDrag.startGround.z;

            const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, e.shiftKey);
            const step = getGridStepForSnapMode(effectiveSnap);

            if (step > 0) {
              dx = Math.round(dx / step) * step;
              dz = Math.round(dz / step) * step;
            } else {
              dx = Number(dx.toFixed(3));
              dz = Number(dz.toFixed(3));
            }

            const draggedOrig = activeDrag.baseWalls.find((w) => w.id === dragWallId);
            if (draggedOrig) {
              const stationaryWalls = activeDrag.baseWalls.filter(
                (w) =>
                  w.id !== draggedOrig.id &&
                  distance2D(w.start, draggedOrig.start) >= 0.05 &&
                  distance2D(w.end, draggedOrig.start) >= 0.05 &&
                  distance2D(w.start, draggedOrig.end) >= 0.05 &&
                  distance2D(w.end, draggedOrig.end) >= 0.05,
              );

              // If dragging a middle wall whose endpoints rest on perpendicular T-junction host walls,
              // keep it gliding cleanly along those host walls unless Shift or a large perpendicular pull (>0.45m) is made.
              if (!e.shiftKey) {
                const dLen = wallLength(draggedOrig);
                const dux = dLen > 0.05 ? (draggedOrig.end.x - draggedOrig.start.x) / dLen : 1;
                const duz = dLen > 0.05 ? (draggedOrig.end.z - draggedOrig.start.z) / dLen : 0;

                for (const host of stationaryWalls) {
                  const hLen = wallLength(host);
                  if (hLen < 0.1) continue;
                  const hux = (host.end.x - host.start.x) / hLen;
                  const huz = (host.end.z - host.start.z) / hLen;
                  if (Math.abs(hux * dux + huz * duz) > 0.92) continue;

                  const pS = projectPointOntoWall(draggedOrig.start, host);
                  const pE = projectPointOntoWall(draggedOrig.end, host);
                  const attachTol = Math.max(0.08, host.thickness * 0.5 + 0.02);
                  const startOnHost = pS.distance <= attachTol && pS.offset >= 0.02 && pS.offset <= hLen - 0.02;
                  const endOnHost = pE.distance <= attachTol && pE.offset >= 0.02 && pE.offset <= hLen - 0.02;
                  if (!startOnHost && !endOnHost) continue;

                  const hnx = -huz;
                  const hnz = hux;
                  const perpPull = dx * hnx + dz * hnz;
                  if (Math.abs(perpPull) < 0.45) {
                    const alongMove = dx * hux + dz * huz;
                    dx = Number((hux * alongMove).toFixed(3));
                    dz = Number((huz * alongMove).toFixed(3));
                    break;
                  }
                }
              }

              // Snap EITHER start or end of the dragged wall to stationary endpoints, alignments, or T-junction walls
              clearPreview();
              const candidateStart = {
                x: draggedOrig.start.x + dx,
                z: draggedOrig.start.z + dz,
              };
              const candidateEnd = {
                x: draggedOrig.end.x + dx,
                z: draggedOrig.end.z + dz,
              };
              const snapStart = snapPointToGridAndEndpoints(candidateStart, null, stationaryWalls, {
                snapMode: effectiveSnap,
                endpointRadius: 0.2,
              });
              const snapEnd = snapPointToGridAndEndpoints(candidateEnd, null, stationaryWalls, {
                snapMode: effectiveSnap,
                endpointRadius: 0.2,
              });

              const startStrong =
                snapStart.snapKind === 'endpoint' ||
                snapStart.snapKind === 'wall' ||
                snapStart.snapKind === 'align';
              const endStrong =
                snapEnd.snapKind === 'endpoint' ||
                snapEnd.snapKind === 'wall' ||
                snapEnd.snapKind === 'align';

              const startShift = startStrong
                ? distance2D(candidateStart, snapStart.point)
                : Infinity;
              const endShift = endStrong
                ? distance2D(candidateEnd, snapEnd.point)
                : Infinity;

              if (startStrong && startShift <= endShift) {
                dx = Number((snapStart.point.x - draggedOrig.start.x).toFixed(3));
                dz = Number((snapStart.point.z - draggedOrig.start.z).toFixed(3));
                drawSnapGuides(snapStart.guides);
              } else if (endStrong) {
                dx = Number((snapEnd.point.x - draggedOrig.end.x).toFixed(3));
                dz = Number((snapEnd.point.z - draggedOrig.end.z).toFixed(3));
                drawSnapGuides(snapEnd.guides);
              }
            }

            activeDrag.lastDx = dx;
            activeDrag.lastDz = dz;
            callbacksRef.current.onMoveWall(dragWallId, activeDrag.baseWalls, dx, dz, false);

            const draggedBase = activeDrag.baseWalls.find((w) => w.id === dragWallId);
            if (draggedBase) {
              const mx = (draggedBase.start.x + draggedBase.end.x) * 0.5 + dx;
              const mz = (draggedBase.start.z + draggedBase.end.z) * 0.5 + dz;
              const scr = projectWorldToScreen(new THREE.Vector3(mx, 0.25, mz));
              setLiveOverlay({
                screenX: scr.x,
                screenY: scr.y - 20,
                label: `Move Δ(${dx >= 0 ? '+' : ''}${dx.toFixed(2)}, ${dz >= 0 ? '+' : ''}${dz.toFixed(2)}) m`,
              });
            }
            return;
          }

          if (activeDrag.kind === 'opening') {
            if (!activeDrag.active) {
              if (Math.hypot(e.clientX - activeDrag.startClientX, e.clientY - activeDrag.startClientY) < 5) {
                return;
              }
              activeDrag.active = true;
            }

            const dragWallId = activeDrag.wallId;
            const dragOpeningId = activeDrag.openingId;
            const lastTargetId = activeDrag.lastTargetWallId;

            const curHost = activeDrag.baseWalls.find((w) => w.id === lastTargetId);
            let targetWall = curHost ?? null;
            let bestOffset = activeDrag.lastOffset;
            let bestDist = Infinity;

            if (curHost) {
              const pHost = projectPointOntoWall(raw, curHost);
              bestOffset = pHost.offset;
              bestDist = pHost.distance;
            }

            for (const w of activeDrag.baseWalls) {
              const proj = projectPointOntoWall(raw, w);
              const switchThreshold = w.id === curHost?.id ? 0.85 : Math.min(0.45, bestDist * 0.65);
              if (proj.distance < switchThreshold) {
                bestDist = proj.distance;
                targetWall = w;
                bestOffset = proj.offset;
              }
            }

            if (targetWall) {
              const len = wallLength(targetWall);
              const openingObj = activeDrag.baseWalls
                .find((w) => w.id === dragWallId)
                ?.openings.find((o) => o.id === dragOpeningId);
              const opW = openingObj?.width ?? 0.95;
              const margin = Math.max(0.15, targetWall.thickness * 0.6) + opW * 0.5;
              if (len > margin * 2) {
                const clamped = Math.max(margin, Math.min(len - margin, bestOffset));
                const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, e.shiftKey);
                const step = getGridStepForSnapMode(effectiveSnap);
                const finalOffset =
                  step > 0
                    ? Math.max(
                        margin,
                        Math.min(
                          len - margin,
                          Math.round(clamped / Math.min(step, 0.1)) * Math.min(step, 0.1),
                        ),
                      )
                    : Number(clamped.toFixed(2));

                activeDrag.lastTargetWallId = targetWall.id;
                activeDrag.lastOffset = finalOffset;
                callbacksRef.current.onMoveOpening(
                  activeDrag.baseWalls,
                  activeDrag.wallId,
                  activeDrag.openingId,
                  targetWall.id,
                  finalOffset,
                  false,
                );

                const ang = wallAngleRad(targetWall);
                const ox = targetWall.start.x + Math.cos(ang) * finalOffset;
                const oz = targetWall.start.z + Math.sin(ang) * finalOffset;
                const scr = projectWorldToScreen(new THREE.Vector3(ox, 0.25, oz));
                setLiveOverlay({
                  screenX: scr.x,
                  screenY: scr.y - 20,
                  label: `Pos ${finalOffset.toFixed(2)} m`,
                });
              }
            }
            return;
          }

          if (activeDrag.kind === 'junction') {
            const jDrag = activeDrag;
            if (!jDrag.active) {
              if (Math.hypot(e.clientX - jDrag.startClientX, e.clientY - jDrag.startClientY) < 5) {
                return;
              }
              jDrag.active = true;
            }

            if (jDrag.lastTargetWallId === 'ceiling') {
              const snapped = snapPointToGridAndEndpoints(raw, null, stateRef.current.walls, {
                snapMode: stateRef.current.snapMode,
                shiftKey: e.shiftKey,
              });
              jDrag.lastFreePos = snapped.point;
              callbacksRef.current.onMoveJunction(
                jDrag.baseJunctions,
                jDrag.junctionId,
                'ceiling',
                0,
                false,
                snapped.point,
              );
              const scr = projectWorldToScreen(new THREE.Vector3(snapped.point.x, 0.25, snapped.point.z));
              setLiveOverlay({
                screenX: scr.x,
                screenY: scr.y - 20,
                label: `CL (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`,
              });
              return;
            }

            const curWalls = stateRef.current.walls;
            const curHost = curWalls.find((w) => w.id === jDrag.lastTargetWallId);
            let targetWall = curHost ?? null;
            let bestOffset = jDrag.lastOffset;
            let bestDist = Infinity;

            if (curHost) {
              const pHost = projectPointOntoWall(raw, curHost);
              bestOffset = pHost.offset;
              bestDist = pHost.distance;
            }

            for (const w of curWalls) {
              const proj = projectPointOntoWall(raw, w);
              const switchThreshold = w.id === curHost?.id ? 0.85 : Math.min(0.45, bestDist * 0.65);
              if (proj.distance < switchThreshold) {
                bestDist = proj.distance;
                targetWall = w;
                bestOffset = proj.offset;
              }
            }

            if (targetWall) {
              const len = wallLength(targetWall);
              if (len > 0.28) {
                const clamped = Math.max(0.1, Math.min(len - 0.1, bestOffset));
                const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, e.shiftKey);
                const finalOffset =
                  effectiveSnap === 'free'
                    ? Number(clamped.toFixed(2))
                    : Math.max(0.1, Math.min(len - 0.1, Math.round(clamped / 0.05) * 0.05));

                jDrag.lastTargetWallId = targetWall.id;
                jDrag.lastOffset = finalOffset;
                callbacksRef.current.onMoveJunction(
                  jDrag.baseJunctions,
                  jDrag.junctionId,
                  targetWall.id,
                  finalOffset,
                  false,
                );

                const ang = wallAngleRad(targetWall);
                const jx = targetWall.start.x + Math.cos(ang) * finalOffset;
                const jz = targetWall.start.z + Math.sin(ang) * finalOffset;
                const scr = projectWorldToScreen(new THREE.Vector3(jx, 0.25, jz));
                const jObj = jDrag.baseJunctions.find((j) => j.id === jDrag.junctionId);
                const code = jObj ? JUNCTION_KIND_INFO[jObj.kind].shortCode : 'JB';
                setLiveOverlay({
                  screenX: scr.x,
                  screenY: scr.y - 20,
                  label: `${code} Pos ${finalOffset.toFixed(2)} m`,
                });
              }
            }
            return;
          }

          if (activeDrag.kind === 'fixture') {
            const fDrag = activeDrag;
            if (!fDrag.active) {
              if (Math.hypot(e.clientX - fDrag.startClientX, e.clientY - fDrag.startClientY) < 5) {
                return;
              }
              fDrag.active = true;
            }

            const curWalls = stateRef.current.walls;
            const curHost = curWalls.find((w) => w.id === fDrag.lastTargetWallId);
            let targetWall = curHost ?? null;
            let bestOffset = fDrag.lastOffset;
            let bestDist = Infinity;

            if (curHost) {
              const pHost = projectPointOntoWall(raw, curHost);
              bestOffset = pHost.offset;
              bestDist = pHost.distance;
            }

            for (const w of curWalls) {
              const proj = projectPointOntoWall(raw, w);
              const switchThreshold = w.id === curHost?.id ? 0.85 : Math.min(0.45, bestDist * 0.65);
              if (proj.distance < switchThreshold) {
                bestDist = proj.distance;
                targetWall = w;
                bestOffset = proj.offset;
              }
            }

            if (targetWall) {
              const len = wallLength(targetWall);
              if (len > 0.28) {
                const clamped = Math.max(0.1, Math.min(len - 0.1, bestOffset));
                const effectiveSnap = resolveEffectiveSnapMode(stateRef.current.snapMode, e.shiftKey);
                const finalOffset =
                  effectiveSnap === 'free'
                    ? Number(clamped.toFixed(2))
                    : Math.max(0.1, Math.min(len - 0.1, Math.round(clamped / 0.05) * 0.05));

                fDrag.lastTargetWallId = targetWall.id;
                fDrag.lastOffset = finalOffset;
                callbacksRef.current.onMoveFixture(
                  fDrag.baseFixtures,
                  fDrag.fixtureId,
                  targetWall.id,
                  finalOffset,
                  false,
                );

                const ang = wallAngleRad(targetWall);
                const fx = targetWall.start.x + Math.cos(ang) * finalOffset;
                const fz = targetWall.start.z + Math.sin(ang) * finalOffset;
                const scr = projectWorldToScreen(new THREE.Vector3(fx, 0.25, fz));
                const fObj = fDrag.baseFixtures.find((f) => f.id === fDrag.fixtureId);
                const code = fObj ? PLUMBING_FIXTURE_INFO[fObj.kind].shortCode : 'FIX';
                setLiveOverlay({
                  screenX: scr.x,
                  screenY: scr.y - 20,
                  label: `${code} Pos ${finalOffset.toFixed(2)} m`,
                });
              }
            }
            return;
          }

          if (activeDrag.kind === 'wireVertex') {
            const wDrag = activeDrag;
            const targetWire = wDrag.baseWires.find((w) => w.id === wDrag.wireId);
            const anchorPt =
              wDrag.vertexIndex > 0
                ? targetWire?.points[wDrag.vertexIndex - 1] ?? null
                : targetWire?.points[1] ?? null;
            const jTargets = getJunctionSnapTargets();
            const wTargets = getWireSnapTargets(wDrag.wireId);
            const snapped = snapPointToGridAndEndpoints(raw, anchorPt, stateRef.current.walls, {
              snapMode: stateRef.current.snapMode,
              shiftKey: e.shiftKey,
              endpointRadius: Math.max(0.32, orthoFrustum * 0.022),
              extraSnapTargets: jTargets,
              wireSnapTargets: wTargets,
            });
            clearPreview();
            drawSnapGuides(snapped.guides);
            if (snapped.matchedWireId) {
              const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.13, 0.19, 24),
                new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide }),
              );
              ring.rotation.x = -Math.PI / 2;
              ring.position.set(snapped.point.x, 0.23, snapped.point.z);
              previewGroup.add(ring);
            }
            const nextPt: WirePoint = {
              x: snapped.point.x,
              z: snapped.point.z,
              ...(snapped.matchedWireId ? { connectedWireId: snapped.matchedWireId } : {}),
            };
            wDrag.lastPoint = nextPt;
            callbacksRef.current.onMoveWireVertex(
              wDrag.baseWires,
              wDrag.wireId,
              wDrag.vertexIndex,
              nextPt,
              false,
            );
            const matchedW = snapped.matchedWireId
              ? stateRef.current.wires.find((w) => w.id === snapped.matchedWireId)
              : null;
            const scr = projectWorldToScreen(new THREE.Vector3(snapped.point.x, 0.25, snapped.point.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 22,
              label: matchedW
                ? `Tap ${matchedW.breakerLabel} (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`
                : `Wire Node (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`,
            });
            return;
          }

          if (activeDrag.kind === 'securityAim') {
            const sDrag = activeDrag;
            const baseDev = sDrag.baseDevices.find((d) => d.id === sDrag.deviceId);
            if (!baseDev) return;
            const dx = raw.x - baseDev.x;
            const dz = raw.z - baseDev.z;
            if (Math.hypot(dx, dz) > 0.05) {
              const rawDeg = ((Math.atan2(dz, dx) * 180) / Math.PI + 360) % 360;
              const yawDeg = e.shiftKey
                ? Number(rawDeg.toFixed(1))
                : ((Math.round(rawDeg / 15) * 15) % 360 + 360) % 360;
              const nextDev: SecurityDevice = { ...baseDev, yawDeg };
              sDrag.lastDevice = nextDev;
              callbacksRef.current.onMoveSecurityDevice(
                sDrag.baseDevices,
                sDrag.deviceId,
                nextDev,
                false,
              );
              const cov = computeSecurityCoverage(
                nextDev,
                stateRef.current.walls,
                stateRef.current.wallHeight,
              );
              const scr = projectWorldToScreen(new THREE.Vector3(baseDev.x, 0.28, baseDev.z));
              setLiveOverlay({
                screenX: scr.x,
                screenY: scr.y - 22,
                label: `Aim ${Math.round(yawDeg)}° · ${Math.round(nextDev.fovDeg)}° FOV · ${cov.areaSqM.toFixed(1)} m² (${cov.coveragePct}%)`,
              });
            }
            return;
          }

          if (activeDrag.kind === 'security') {
            const secDrag = activeDrag;
            if (!secDrag.active) {
              if (Math.hypot(e.clientX - secDrag.startClientX, e.clientY - secDrag.startClientY) < 5) {
                return;
              }
              secDrag.active = true;
            }
            const origDev = secDrag.baseDevices.find((d) => d.id === secDrag.deviceId);
            if (!origDev) return;
            const snapped = getSecurityPlacementSnap(
              raw,
              origDev.kind,
              stateRef.current.walls,
              stateRef.current.snapMode,
              e.shiftKey,
            );
            const keepYaw =
              snapped.wallId === origDev.wallId && snapped.faceSide === origDev.faceSide;
            const nextDev: SecurityDevice = {
              ...origDev,
              x: snapped.x,
              z: snapped.z,
              wallId: snapped.wallId,
              offset: snapped.offset,
              faceSide: snapped.faceSide,
              yawDeg: keepYaw ? origDev.yawDeg : snapped.yawDeg,
            };
            secDrag.lastDevice = nextDev;
            callbacksRef.current.onMoveSecurityDevice(
              secDrag.baseDevices,
              secDrag.deviceId,
              nextDev,
              false,
            );
            const cov = computeSecurityCoverage(
              nextDev,
              stateRef.current.walls,
              stateRef.current.wallHeight,
            );
            const scr = projectWorldToScreen(new THREE.Vector3(nextDev.x, 0.28, nextDev.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 22,
              label:
                nextDev.fovDeg > 0
                  ? `${SECURITY_DEVICE_INFO[nextDev.kind].shortCode} · ${cov.areaSqM.toFixed(1)} m² (${cov.coveragePct}%)`
                  : `${SECURITY_DEVICE_INFO[nextDev.kind].label}`,
            });
            return;
          }

          if (activeDrag.kind === 'furniture') {
            const fDrag = activeDrag;
            if (!fDrag.active) {
              if (Math.hypot(e.clientX - fDrag.startClientX, e.clientY - fDrag.startClientY) < 5) {
                return;
              }
              fDrag.active = true;
            }
            const origItem = fDrag.baseFurniture.find((f) => f.id === fDrag.furnitureId);
            if (!origItem) return;
            const rawCand = {
              x: origItem.x + (raw.x - fDrag.startGround.x),
              z: origItem.z + (raw.z - fDrag.startGround.z),
            };
            const snapped = snapPointToGridAndEndpoints(rawCand, null, stateRef.current.walls, {
              snapMode: stateRef.current.snapMode,
              shiftKey: e.shiftKey,
            });
            const nextItem: FurnitureItem = {
              ...origItem,
              x: Number(snapped.point.x.toFixed(2)),
              z: Number(snapped.point.z.toFixed(2)),
            };
            fDrag.lastItem = nextItem;
            callbacksRef.current.onMoveFurniture(
              fDrag.baseFurniture,
              fDrag.furnitureId,
              nextItem,
              false,
            );
            const scr = projectWorldToScreen(new THREE.Vector3(nextItem.x, 0.25, nextItem.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 22,
              label: `${FURNITURE_KIND_INFO[nextItem.kind].label} (${nextItem.x.toFixed(2)}, ${nextItem.z.toFixed(2)})`,
            });
            return;
          }
        }

        const tool = stateRef.current.activeTool;
        if (
          tool === 'wall' ||
          tool === 'wall-rect' ||
          tool === 'wire' ||
          tool === 'junction' ||
          tool === 'pipe' ||
          tool === 'fixture' ||
          tool === 'security' ||
          tool === 'furniture' ||
          isOpeningTool(tool)
        ) {
          updateDraftPreview(e.clientX, e.clientY, e.pointerType === 'touch', e.shiftKey);
        }
      } else if (stateRef.current.activeCameraViewId) {
        if (camDragLook) {
          const dx = e.clientX - walkDragStartX;
          const dy = e.clientY - walkDragStartY;
          if (Math.hypot(dx, dy) > 4) walkMovedEnough = true;
          const cam = stateRef.current.securityDevices.find(
            (d) => d.id === stateRef.current.activeCameraViewId,
          );
          if (cam && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
            const nextYaw = ((cam.yawDeg + dx * 0.25) % 360 + 360) % 360;
            const nextTilt = THREE.MathUtils.clamp(cam.tiltDeg + dy * 0.18, 0, 75);
            callbacksRef.current.onUpdateSecurityDevice(cam.id, {
              yawDeg: Number(nextYaw.toFixed(1)),
              tiltDeg: Number(nextTilt.toFixed(1)),
            });
            walkDragStartX = e.clientX;
            walkDragStartY = e.clientY;
          }
        }
      } else if (mode === '3d-walk') {
        if (document.pointerLockElement === renderer.domElement) {
          walkState.yaw -= e.movementX * 0.0024;
          walkState.pitch = THREE.MathUtils.clamp(walkState.pitch - e.movementY * 0.0024, -1.25, 1.25);
          if (stateRef.current.activeTool !== 'select') {
            const rect = renderer.domElement.getBoundingClientRect();
            updateDraftPreview(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5, false, e.shiftKey);
          }
          requestRender();
        } else if (walkDragLook) {
          const dx = e.clientX - walkDragStartX;
          const dy = e.clientY - walkDragStartY;
          if (Math.hypot(dx, dy) > 9) walkMovedEnough = true;
          walkState.yaw -= dx * 0.0045;
          walkState.pitch = THREE.MathUtils.clamp(walkState.pitch - dy * 0.0045, -1.25, 1.25);
          walkDragStartX = e.clientX;
          walkDragStartY = e.clientY;
          requestRender();
        } else if (stateRef.current.activeTool !== 'select') {
          updateDraftPreview(e.clientX, e.clientY, e.pointerType === 'touch', e.shiftKey);
        }
      } else if (mode === '3d-orbit') {
        if (activeDrag?.kind === 'motionTest') {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, perspCamera);
          const hitPt = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(groundPlane, hitPt)) {
            testMotionPosRef.current = {
              x: Number(hitPt.x.toFixed(2)),
              z: Number(hitPt.z.toFixed(2)),
            };
            rebuildHouse();
            requestRender();
          }
          return;
        }
        if (activeDrag?.kind === 'wireVertex') {
          const wDrag = activeDrag;
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(ndc, perspCamera);
          const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(wDrag.dragY ?? 0.3));
          const hitPt = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
            const rawPt = { x: hitPt.x, z: hitPt.z };
            const targetWire = wDrag.baseWires.find((w) => w.id === wDrag.wireId);
            const anchorPt =
              wDrag.vertexIndex > 0
                ? targetWire?.points[wDrag.vertexIndex - 1] ?? null
                : targetWire?.points[1] ?? null;
            const snapped = snapPointToGridAndEndpoints(rawPt, anchorPt, stateRef.current.walls, {
              snapMode: stateRef.current.snapMode,
              shiftKey: e.shiftKey,
              endpointRadius: 0.42,
              extraSnapTargets: getJunctionSnapTargets(),
              wireSnapTargets: getWireSnapTargets(wDrag.wireId),
            });
            const nextPt: WirePoint = {
              x: snapped.point.x,
              z: snapped.point.z,
              ...(snapped.matchedWireId ? { connectedWireId: snapped.matchedWireId } : {}),
            };
            wDrag.lastPoint = nextPt;
            callbacksRef.current.onMoveWireVertex(
              wDrag.baseWires,
              wDrag.wireId,
              wDrag.vertexIndex,
              nextPt,
              false,
            );
            const matchedW = snapped.matchedWireId
              ? stateRef.current.wires.find((w) => w.id === snapped.matchedWireId)
              : null;
            const scr = projectWorldToScreen(new THREE.Vector3(snapped.point.x, wDrag.dragY ?? 1.0, snapped.point.z));
            setLiveOverlay({
              screenX: scr.x,
              screenY: scr.y - 20,
              label: matchedW
                ? `Tap ${matchedW.breakerLabel}`
                : `Wire Node (${snapped.point.x.toFixed(2)}, ${snapped.point.z.toFixed(2)})`,
            });
            requestRender();
          }
          return;
        }
        if (flyDragLook && !stateRef.current.cameraLocked) {
          const dx = e.clientX - walkDragStartX;
          const dy = e.clientY - walkDragStartY;
          if (Math.hypot(dx, dy) > 9) walkMovedEnough = true;
          freeFlyState.yaw -= dx * 0.0045;
          freeFlyState.pitch = THREE.MathUtils.clamp(freeFlyState.pitch - dy * 0.0045, -1.42, 1.42);
          walkDragStartX = e.clientX;
          walkDragStartY = e.clientY;
          perspCamera.rotation.order = 'YXZ';
          perspCamera.rotation.y = freeFlyState.yaw;
          perspCamera.rotation.x = freeFlyState.pitch;
          perspCamera.rotation.z = 0;
          updateWalkProjectedDimensions();
          requestRender();
        } else if (e.buttons > 0 && Math.hypot(e.clientX - walkDragStartX, e.clientY - walkDragStartY) > 9) {
          walkMovedEnough = true;
        } else if (e.buttons === 0 && stateRef.current.activeTool !== 'select') {
          updateDraftPreview(e.clientX, e.clientY, e.pointerType === 'touch', e.shiftKey);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const startedOnCanvas = pointerStartedOnCanvas;
      pointerStartedOnCanvas = false;
      activePointers.delete(e.pointerId);
      const mode = stateRef.current.viewMode;

      if (
        !startedOnCanvas &&
        !activeDrag &&
        !isPanning2D &&
        !wallPressStart &&
        !rectPressStart &&
        !walkDragLook &&
        !flyDragLook &&
        !camDragLook
      ) {
        return;
      }

      if (isPanning2D) {
        isPanning2D = false;
        return;
      }

      if (mode === '2d') {
        if (activeDrag) {
          if (activeDrag.kind === 'motionTest') {
            activeDrag = null;
            clearPreview();
            return;
          }
          if (activeDrag.kind === 'corner') {
            callbacksRef.current.onMoveCorner(
              activeDrag.baseWalls,
              activeDrag.origPos,
              activeDrag.lastPos,
              activeDrag.onlyWallId,
              true,
            );
          } else if (activeDrag.kind === 'wall' && activeDrag.active) {
            callbacksRef.current.onMoveWall(
              activeDrag.wallId,
              activeDrag.baseWalls,
              activeDrag.lastDx,
              activeDrag.lastDz,
              true,
            );
          } else if (activeDrag.kind === 'opening' && activeDrag.active) {
            callbacksRef.current.onMoveOpening(
              activeDrag.baseWalls,
              activeDrag.wallId,
              activeDrag.openingId,
              activeDrag.lastTargetWallId,
              activeDrag.lastOffset,
              true,
            );
          } else if (activeDrag.kind === 'junction' && activeDrag.active) {
            callbacksRef.current.onMoveJunction(
              activeDrag.baseJunctions,
              activeDrag.junctionId,
              activeDrag.lastTargetWallId,
              activeDrag.lastOffset,
              true,
              activeDrag.lastFreePos,
            );
          } else if (activeDrag.kind === 'fixture' && activeDrag.active) {
            callbacksRef.current.onMoveFixture(
              activeDrag.baseFixtures,
              activeDrag.fixtureId,
              activeDrag.lastTargetWallId,
              activeDrag.lastOffset,
              true,
            );
          } else if (activeDrag.kind === 'wireVertex') {
            callbacksRef.current.onMoveWireVertex(
              activeDrag.baseWires,
              activeDrag.wireId,
              activeDrag.vertexIndex,
              activeDrag.lastPoint,
              true,
            );
          } else if (activeDrag.kind === 'securityAim') {
            callbacksRef.current.onMoveSecurityDevice(
              activeDrag.baseDevices,
              activeDrag.deviceId,
              activeDrag.lastDevice,
              true,
            );
          } else if (activeDrag.kind === 'security' && activeDrag.active) {
            callbacksRef.current.onMoveSecurityDevice(
              activeDrag.baseDevices,
              activeDrag.deviceId,
              activeDrag.lastDevice,
              true,
            );
          } else if (activeDrag.kind === 'furniture' && activeDrag.active) {
            callbacksRef.current.onMoveFurniture(
              activeDrag.baseFurniture,
              activeDrag.furnitureId,
              activeDrag.lastItem,
              true,
            );
          }
          activeDrag = null;
          clearPreview();
          return;
        }

        if (wallPressStart && stateRef.current.activeTool === 'wall') {
          const dragDist = Math.hypot(e.clientX - wallPressStart.x, e.clientY - wallPressStart.y);
          if (dragDist > 26 && draftAnchor && draftHover) {
            const wallLen = distance2D(draftAnchor, draftHover);
            if (wallLen >= 0.25) {
              callbacksRef.current.onAddWall(draftAnchor, draftHover);
              draftAnchor = draftHover;
              setChainActive(true);
            }
          }
          wallPressStart = null;
          setTouchReticle(null);
        } else if (rectPressStart && stateRef.current.activeTool === 'wall-rect') {
          const dragDist = Math.hypot(e.clientX - rectPressStart.x, e.clientY - rectPressStart.y);
          if (dragDist > 26 && rectAnchor && rectHover) {
            const dx = Math.abs(rectHover.x - rectAnchor.x);
            const dz = Math.abs(rectHover.z - rectAnchor.z);
            if (dx >= 0.25 && dz >= 0.25) {
              callbacksRef.current.onAddWallRect(rectAnchor, rectHover);
              rectAnchor = null;
              rectHover = null;
              setChainActive(false);
              clearPreview();
            }
          }
          rectPressStart = null;
          setTouchReticle(null);
        }
      } else if (stateRef.current.activeCameraViewId) {
        camDragLook = false;
        if (!walkMovedEnough && e.button === 0 && startedOnCanvas && e.target === renderer.domElement) {
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          perspCamera.updateMatrixWorld(true);
          houseGroup.updateMatrixWorld(true);
          securityGroup.updateMatrixWorld(true);
          raycaster.setFromCamera(ndc, perspCamera);
          const pickTargets: THREE.Object3D[] = [];
          if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
          if (stateRef.current.showStructure) pickTargets.push(houseGroup);
          const hits = raycaster.intersectObjects(pickTargets, true);
          const openingHit = findOpeningInHits(hits);
          if (openingHit) {
            callbacksRef.current.onToggleOpeningOpen(openingHit.meta.wallId, openingHit.meta.openingId);
            return;
          }
          const hitTarget = pickBest3DTarget(hits);
          if (hitTarget?.kind === 'security') {
            const dev = stateRef.current.securityDevices.find((d) => d.id === hitTarget.securityId);
            if (dev && isCameraSecurityDevice(dev.kind)) {
              callbacksRef.current.onSelect(hitTarget);
              callbacksRef.current.onEnterCameraView(dev.id);
              return;
            }
          }
        }
      } else if (mode === '3d-walk') {
        walkDragLook = false;
        if (document.pointerLockElement === renderer.domElement) return;
        if (!walkMovedEnough && e.button === 0 && startedOnCanvas && e.target === renderer.domElement) {
          const isCtrlEdit = e.ctrlKey || e.metaKey;
          if (!isCtrlEdit && stateRef.current.activeTool !== 'select' && !stateRef.current.editLocked) {
            executeToolPlacementAt(e.clientX, e.clientY, e.pointerType === 'touch', e.shiftKey);
            return;
          }
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          perspCamera.updateMatrixWorld(true);
          houseGroup.updateMatrixWorld(true);
          securityGroup.updateMatrixWorld(true);
          wireGroup.updateMatrixWorld(true);
          plumbingGroup.updateMatrixWorld(true);
          furnitureGroup.updateMatrixWorld(true);
          raycaster.setFromCamera(ndc, perspCamera);
          const pickTargets: THREE.Object3D[] = [];
          if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
          if (stateRef.current.showWiring) pickTargets.push(wireGroup);
          if (stateRef.current.showPlumbing) pickTargets.push(plumbingGroup);
          if (stateRef.current.showInterior) pickTargets.push(furnitureGroup);
          if (stateRef.current.showStructure) pickTargets.push(houseGroup);
          const hits = raycaster.intersectObjects(pickTargets, true);

          if (isCtrlEdit) {
            const hitTarget = pickBest3DTarget(hits);
            callbacksRef.current.onSelect(hitTarget ?? null);
            return;
          }

          const panelCtrl = findPanelControlInHits(hits, 7.5);
          if (panelCtrl?.kind === 'door') {
            const panelObj = stateRef.current.junctions.find((j) => j.id === panelCtrl.panelId);
            if (panelObj) {
              callbacksRef.current.onUpdateJunction(panelObj.id, { isOpen: !panelObj.isOpen });
              callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelObj.id });
              return;
            }
          } else if (panelCtrl?.kind === 'breaker' && !stateRef.current.editLocked) {
            callbacksRef.current.onTogglePanelBreaker?.(panelCtrl.panelId, panelCtrl.breakerLabel);
            callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelCtrl.panelId });
            return;
          }

          const openingHit = findOpeningInHits(hits, 7.5);
          if (openingHit) {
            callbacksRef.current.onToggleOpeningOpen(openingHit.meta.wallId, openingHit.meta.openingId);
            return;
          }
          const hitTarget = pickBest3DTarget(hits);
          if (hitTarget?.kind === 'security') {
            const dev = stateRef.current.securityDevices.find((d) => d.id === hitTarget.securityId);
            if (dev && isCameraSecurityDevice(dev.kind)) {
              callbacksRef.current.onSelect(hitTarget);
              callbacksRef.current.onEnterCameraView(dev.id);
              return;
            }
          }
          callbacksRef.current.onSelect(hitTarget ?? null);
        }
      } else if (mode === '3d-orbit') {
        flyDragLook = false;
        if (activeDrag?.kind === 'motionTest') {
          activeDrag = null;
          orbitControls.enabled = stateRef.current.cameraLocked;
          clearPreview();
          return;
        }
        if (activeDrag?.kind === 'wireVertex') {
          callbacksRef.current.onMoveWireVertex(
            activeDrag.baseWires,
            activeDrag.wireId,
            activeDrag.vertexIndex,
            activeDrag.lastPoint,
            true,
          );
          activeDrag = null;
          orbitControls.enabled = stateRef.current.cameraLocked;
          clearPreview();
          return;
        }
        if (!walkMovedEnough && e.button === 0 && startedOnCanvas && e.target === renderer.domElement) {
          const isCtrlEdit = e.ctrlKey || e.metaKey;
          if (!isCtrlEdit && stateRef.current.activeTool !== 'select' && !stateRef.current.editLocked) {
            executeToolPlacementAt(e.clientX, e.clientY, e.pointerType === 'touch', e.shiftKey);
            return;
          }
          const rect = renderer.domElement.getBoundingClientRect();
          ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          perspCamera.updateMatrixWorld(true);
          houseGroup.updateMatrixWorld(true);
          securityGroup.updateMatrixWorld(true);
          wireGroup.updateMatrixWorld(true);
          plumbingGroup.updateMatrixWorld(true);
          furnitureGroup.updateMatrixWorld(true);
          raycaster.setFromCamera(ndc, perspCamera);
          const pickTargets: THREE.Object3D[] = [];
          if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
          if (stateRef.current.showWiring) pickTargets.push(wireGroup);
          if (stateRef.current.showPlumbing) pickTargets.push(plumbingGroup);
          if (stateRef.current.showInterior) pickTargets.push(furnitureGroup);
          if (stateRef.current.showStructure) pickTargets.push(houseGroup);
          const hits = raycaster.intersectObjects(pickTargets, true);

          if (!isCtrlEdit) {
            const panelCtrl = findPanelControlInHits(hits);
            if (panelCtrl?.kind === 'door') {
              const panelObj = stateRef.current.junctions.find((j) => j.id === panelCtrl.panelId);
              if (panelObj) {
                callbacksRef.current.onUpdateJunction(panelObj.id, { isOpen: !panelObj.isOpen });
                callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelObj.id });
                return;
              }
            } else if (panelCtrl?.kind === 'breaker' && !stateRef.current.editLocked) {
              callbacksRef.current.onTogglePanelBreaker?.(panelCtrl.panelId, panelCtrl.breakerLabel);
              callbacksRef.current.onSelect({ kind: 'junction', junctionId: panelCtrl.panelId });
              return;
            }

            const openingHit = findOpeningInHits(hits);
            if (openingHit) {
              callbacksRef.current.onToggleOpeningOpen(openingHit.meta.wallId, openingHit.meta.openingId);
              callbacksRef.current.onSelect({
                kind: 'opening',
                wallId: openingHit.meta.wallId,
                openingId: openingHit.meta.openingId,
              });
              return;
            }
          }

          const hitTarget = pickBest3DTarget(hits);
          if (!isCtrlEdit && hitTarget?.kind === 'security') {
            const dev = stateRef.current.securityDevices.find((d) => d.id === hitTarget.securityId);
            if (dev && isCameraSecurityDevice(dev.kind)) {
              callbacksRef.current.onSelect(hitTarget);
              callbacksRef.current.onEnterCameraView(dev.id);
              return;
            }
          }
          callbacksRef.current.onSelect(hitTarget ?? null);
        }
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      if (stateRef.current.activeTool === 'wire' && wireDraftPoints.length >= 2) {
        commitWireDraft();
      } else if (stateRef.current.activeTool === 'pipe' && pipeDraftPoints.length >= 2) {
        commitPipeDraft();
      } else if (stateRef.current.viewMode === '2d' && stateRef.current.activeTool === 'select') {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(ndc, orthoCamera);
        const pickTargets: THREE.Object3D[] = [];
        if (stateRef.current.showSecurity) pickTargets.push(securityGroup);
        if (stateRef.current.showStructure) pickTargets.push(houseGroup);
        const hits = raycaster.intersectObjects(pickTargets, true);
        const hitTarget = hits.find((h) => h.object.userData.pickTarget)?.object.userData
          .pickTarget as SelectionTarget | undefined;
        if (hitTarget?.kind === 'opening') {
          callbacksRef.current.onToggleOpeningOpen(hitTarget.wallId, hitTarget.openingId);
        } else if (hitTarget?.kind === 'security') {
          const dev = stateRef.current.securityDevices.find((d) => d.id === hitTarget.securityId);
          if (dev && isCameraSecurityDevice(dev.kind)) {
            callbacksRef.current.onEnterCameraView(dev.id);
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (stateRef.current.viewMode === '3d-walk' && !stateRef.current.activeCameraViewId) {
        if (callbacksRef.current.onChangeCameraZoom) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.1 : -0.1;
          const nextZoom = Number(
            THREE.MathUtils.clamp(stateRef.current.cameraZoom + delta, 0.5, 2.5).toFixed(2),
          );
          callbacksRef.current.onChangeCameraZoom(nextZoom);
        }
        return;
      }
      if (
        stateRef.current.viewMode === '3d-orbit' &&
        !stateRef.current.cameraLocked &&
        !stateRef.current.activeCameraViewId
      ) {
        e.preventDefault();
        perspCamera.getWorldDirection(_flyForward);
        const dollyDist = e.deltaY < 0 ? 1.15 : -1.15;
        perspCamera.position.addScaledVector(_flyForward, dollyDist);
        perspCamera.position.y = Math.max(0.15, perspCamera.position.y);
        updateWalkProjectedDimensions();
        requestRender();
        return;
      }
      if (stateRef.current.viewMode !== '2d') return;
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      orthoFrustum = THREE.MathUtils.clamp(orthoFrustum * factor, 4, 48);
      const rect = renderer.domElement.getBoundingClientRect();
      updateOrthoProjection(rect.width, rect.height);
      requestRender();
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (wireDraftPoints.length >= 2) {
        commitWireDraft();
      } else if (pipeDraftPoints.length >= 2) {
        commitPipeDraft();
      } else if (draftAnchor || rectAnchor || wireDraftPoints.length > 0 || pipeDraftPoints.length > 0) {
        cancelDraftChain();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      keysDown.add(e.code);

      if (e.code === 'Escape' && stateRef.current.activeCameraViewId) {
        callbacksRef.current.onExitCameraView();
        return;
      }

      if (
        e.code === 'Escape' &&
        (draftAnchor || rectAnchor || wireDraftPoints.length > 0 || pipeDraftPoints.length > 0)
      ) {
        cancelDraftChain();
      }

      if (stateRef.current.viewMode === '3d-walk' && !stateRef.current.activeCameraViewId && (e.code === 'KeyE' || e.code === 'KeyF')) {
        toggleCenterOpeningRef.current?.();
      }

      const isWalkMove =
        stateRef.current.viewMode === '3d-walk' &&
        !stateRef.current.activeCameraViewId &&
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
      const isFlyMove =
        stateRef.current.viewMode === '3d-orbit' &&
        !stateRef.current.cameraLocked &&
        !stateRef.current.activeCameraViewId &&
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyQ',
          'KeyE',
          'KeyC',
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.code);

      if (isWalkMove || isFlyMove) {
        requestRender();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
    };

    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      setPointerLockedState(locked);
      callbacksRef.current.onPointerLockChange?.(locked);
      refreshAimPrompt();
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      const nextAspect = w / Math.max(1, h);
      perspCamera.aspect = nextAspect;
      if (!stateRef.current.activeCameraViewId) {
        const hFov = THREE.MathUtils.clamp(stateRef.current.cameraFov || 105, 50, 170);
        if (stateRef.current.viewMode === '3d-walk') {
          perspCamera.fov = horizontalToVerticalFov(hFov, nextAspect);
        } else if (stateRef.current.viewMode === '3d-orbit') {
          perspCamera.fov = horizontalToVerticalFov(
            THREE.MathUtils.clamp(hFov * 0.82, 42, 160),
            nextAspect,
          );
        }
      }
      perspCamera.updateProjectionMatrix();
      updateOrthoProjection(w, h);
      requestRender();
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('dblclick', handleDoubleClick);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    dom.addEventListener('wheel', handleWheel, { passive: false });
    dom.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    dom.addEventListener('webglcontextlost', handleContextLost);
    dom.addEventListener('webglcontextrestored', handleContextRestored);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    pointerLockRequestRef.current = () => {
      if (stateRef.current.viewMode === '3d-walk' && dom.requestPointerLock) {
        dom.requestPointerLock();
      }
    };

    if (pasteTargetRef) {
      pasteTargetRef.current = () => {
        const curMode = stateRef.current.viewMode;
        if (curMode === '2d') {
          if (lastPointerClient) {
            const pt = screenToGround2D(lastPointerClient.x, lastPointerClient.y, 0);
            if (pt) return { x: Number(pt.x.toFixed(2)), z: Number(pt.z.toFixed(2)) };
          }
          return { x: Number(orthoCenter.x.toFixed(2)), z: Number(orthoCenter.y.toFixed(2)) };
        }
        if (curMode === '3d-walk' && !stateRef.current.activeCameraViewId) {
          return {
            x: Number((walkState.position.x - Math.sin(walkState.yaw) * 2.2).toFixed(2)),
            z: Number((walkState.position.z - Math.cos(walkState.yaw) * 2.2).toFixed(2)),
          };
        }
        const rect = dom.getBoundingClientRect();
        const cx = lastPointerClient ? lastPointerClient.x : rect.left + rect.width * 0.5;
        const cy = lastPointerClient ? lastPointerClient.y : rect.top + rect.height * 0.5;
        const pt = screenToGround2D(cx, cy, 0);
        if (pt) return { x: Number(pt.x.toFixed(2)), z: Number(pt.z.toFixed(2)) };
        return { x: 0, z: 0 };
      };
    }

    rebuildHouse();
    switchViewMode(stateRef.current.viewMode);
    if (!isSoftwareGl) {
      renderer.compile(scene, getActiveCamera());
    }
    requestRender();

    const joyPollInterval = window.setInterval(() => {
      if (
        stateRef.current.viewMode === '3d-walk' &&
        (Math.abs(walkMoveRef.current.x) > 0.02 || Math.abs(walkMoveRef.current.y) > 0.02)
      ) {
        requestRender();
      }
    }, 60);

    return () => {
      disposed = true;
      syncFloorTextureRef.current = null;
      if (pasteTargetRef) pasteTargetRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      clearInterval(joyPollInterval);
      resizeObserver.disconnect();
      orbitControls.removeEventListener('start', onOrbitStart);
      orbitControls.removeEventListener('change', onOrbitChange);
      orbitControls.dispose();

      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('dblclick', handleDoubleClick);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      dom.removeEventListener('wheel', handleWheel);
      dom.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      dom.removeEventListener('webglcontextlost', handleContextLost);
      dom.removeEventListener('webglcontextrestored', handleContextRestored);

      disposeGroupChildren(houseGroup);
      disposeGroupChildren(wireGroup);
      disposeGroupChildren(plumbingGroup);
      disposeGroupChildren(securityGroup);
      disposeGroupChildren(furnitureGroup);
      disposeGroupChildren(dimensionGroup);
      disposeGroupChildren(clearanceGroup);
      disposeGroupChildren(handleGroup);
      disposeGroupChildren(previewGroup);
      gridTex.dispose();
      currentFloorTex.dispose();
      groundMat.dispose();
      contactShadowTex.dispose();
      contactShadowMat.dispose();
      envTarget.dispose();
      wallMat.dispose();
      wall2DPocheMat.dispose();
      wallSelectedMat.dispose();
      wallXraySelectedMat.dispose();
      wallXrayEdgeMat.dispose();
      wallCapLineMat.dispose();
      floorSlabMat.dispose();
      ceilingMat.dispose();
      ceilingXrayMat.dispose();
      roofExteriorMat.dispose();
      roofRidgeMat.dispose();
      rafterWoodMat.dispose();
      frameMat.dispose();
      frameSelectedMat.dispose();
      sashFrameMat.dispose();
      doorLeafMat.dispose();
      garagePanelMat.dispose();
      garageSeamMat.dispose();
      garageTrackMat.dispose();
      handleBrassMat.dispose();
      glassMat.dispose();
      cadDarkMat.dispose();
      cadDoorArcMat.dispose();
      cadSelectedSymbolMat.dispose();
      cadWindowMat.dispose();
      dimLineMat.dispose();
      dimTickMat.dispose();
      clearanceLineMat.dispose();
      clearanceTickMat.dispose();
      innerDimLineMat.dispose();
      innerDimTickMat.dispose();
      openingDimLineMat.dispose();
      openingDimTickMat.dispose();
      guideLineMat.dispose();
      handleMat.dispose();
      cornerNodeMat.dispose();
      wireSelectedMat.dispose();
      wallColorMats3D.forEach((m) => m.dispose());
      wallColorMatsXray3D.forEach((m) => m.dispose());
      wallColorMats2D.forEach((m) => m.dispose());
      wallColorMatsXray2D.forEach((m) => m.dispose());
      wireColorMats.forEach((m) => m.dispose());
      renderer.dispose();
      if (dom.parentNode === container) {
        container.removeChild(dom);
      }
    };
  }, []);

  const commitDimensionEdit = () => {
    if (!editingDim) return;
    const parsed = parseFloat(editingDim.valueStr);
    if (Number.isFinite(parsed) && parsed > 0.1) {
      if (editingDim.kind === 'wall') {
        const targetCenterLen = Math.max(0.4, parsed - (editingDim.extraOuterLength ?? 0));
        callbacksRef.current.onResizeWall(editingDim.wallId, targetCenterLen);
      } else if (editingDim.kind === 'inner') {
        const wall = stateRef.current.walls.find((w) => w.id === editingDim.wallId);
        if (wall) {
          const delta = parsed - (editingDim.originalClearValue ?? parsed);
          callbacksRef.current.onResizeWall(editingDim.wallId, wallLength(wall) + delta);
        }
      } else if (editingDim.openingId) {
        callbacksRef.current.onUpdateOpeningWidth(editingDim.wallId, editingDim.openingId, parsed);
      }
    }
    setEditingDim(null);
  };

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 p-6 text-center">
        <div className="max-w-sm rounded-xl bg-white border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">3D Viewport Unavailable</h2>
          <p className="mt-2 text-sm text-slate-600">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100">
      <div ref={mountRef} className="w-full h-full" />

      {/* Clickable Architectural 2D Dimension Labels (Outer, Inner Clear & Openings) */}
      {viewMode === '2d' &&
        showDimensions &&
        dimLabels.map((lbl) => (
          <button
            key={lbl.id}
            type="button"
            title={
              editLocked
                ? 'Editing locked · Unlock edits to resize'
                : lbl.kind === 'inner'
                  ? 'Inner clear dimension · Click to resize'
                  : 'Click to edit dimension'
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (editLocked) return;
              setEditingDim({
                id: lbl.id,
                kind: lbl.kind,
                wallId: lbl.wallId,
                openingId: lbl.openingId,
                originalClearValue: lbl.kind === 'inner' ? lbl.numericValue : undefined,
                extraOuterLength: lbl.kind === 'wall' ? lbl.extraOuterLength : undefined,
                screenX: lbl.screenX,
                screenY: lbl.screenY,
                valueStr: lbl.numericValue.toFixed(2),
              });
            }}
            className={`pointer-events-auto ${editLocked ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-blue-500'} absolute z-10 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded font-mono-tabular whitespace-nowrap transition-shadow ${
              lbl.kind === 'wall'
                ? lbl.selected
                  ? 'bg-amber-600 text-white text-[11px] font-semibold shadow-sm'
                  : 'bg-white/95 text-slate-800 border border-slate-300 text-[11px] font-medium shadow-xs'
                : lbl.kind === 'inner'
                  ? lbl.selected
                    ? 'bg-teal-600 text-white text-[10px] font-semibold shadow-sm'
                    : 'bg-teal-50/95 text-teal-800 border border-teal-300 text-[10px] font-medium shadow-xs'
                  : lbl.selected
                    ? 'bg-amber-500 text-white text-[10px] font-semibold'
                    : 'bg-slate-800/90 text-white text-[10px] font-medium'
            }`}
            style={{ left: lbl.screenX, top: lbl.screenY }}
          >
            {lbl.text}
          </button>
        ))}

      {/* 2D Closed Room Surface Area Badges (Click to Rename Room) */}
      {viewMode === '2d' &&
        showRoomAreas &&
        showStructure &&
        roomLabels.map((rm) => (
          <button
            key={rm.id}
            type="button"
            title={editLocked ? 'Editing locked' : 'Click to rename room'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (editLocked) return;
              setEditingRoom({
                roomId: rm.roomId,
                screenX: rm.screenX,
                screenY: rm.screenY,
                nameStr: rm.name,
              });
            }}
            className={`pointer-events-auto ${editLocked ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-teal-500'} absolute z-10 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-white/95 border border-teal-300 shadow-xs text-center transition-shadow`}
            style={{ left: rm.screenX, top: rm.screenY }}
          >
            <div className="text-[10px] font-semibold text-slate-700 leading-tight">{rm.name}</div>
            <div className="text-[11px] font-mono-tabular font-bold text-teal-700 leading-tight">
              {rm.areaSqM.toFixed(2)} m²
            </div>
          </button>
        ))}

      {/* 3D Closed Room Names & Areas Badges (when Areas toggle is ON in Orbit/Walk) */}
      {(viewMode === '3d-walk' || viewMode === '3d-orbit') &&
        !activeCameraViewId &&
        showRoomAreas &&
        showStructure &&
        roomLabels.map((rm) => (
          <div
            key={rm.id}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-teal-400/75 text-white shadow-sm text-center"
            style={{ left: rm.screenX, top: rm.screenY }}
          >
            <div className="text-[10px] font-semibold text-slate-100 leading-tight">{rm.name}</div>
            <div className="text-[11px] font-mono-tabular font-bold text-teal-300 leading-tight">
              {rm.areaSqM.toFixed(2)} m²
            </div>
          </div>
        ))}

      {/* Selected Object Front / Back / Left / Right Clearance Distance Badges */}
      {showObjectDistances &&
        !activeCameraViewId &&
        clearanceLabels.map((cl) => (
          <div
            key={cl.id}
            title={cl.targetLabel ? `${cl.text} to ${cl.targetLabel}` : cl.text}
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-violet-700/95 border border-violet-300 text-white text-[10px] font-mono-tabular font-semibold whitespace-nowrap shadow-sm"
            style={{ left: cl.screenX, top: cl.screenY }}
          >
            {cl.text}
          </div>
        ))}

      {/* Custom Furniture Name Labels (2D for custom-named/selected, 3D for selected) */}
      {showInterior &&
        !activeCameraViewId &&
        furnitureLabels.map((fl) => (
          <div
            key={fl.id}
            className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shadow-xs border ${
              fl.selected
                ? 'bg-amber-600/95 text-white border-amber-300'
                : 'bg-white/95 text-slate-800 border-slate-300'
            }`}
            style={{ left: fl.screenX, top: fl.screenY }}
          >
            {fl.text}
          </div>
        ))}

      {/* Inline Room Name Editor Popover */}
      {viewMode === '2d' && editingRoom && (
        <form
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            callbacksRef.current.onRenameRoom(editingRoom.roomId, editingRoom.nameStr);
            setEditingRoom(null);
          }}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg bg-white border-2 border-teal-600 p-1 shadow-lg"
          style={{ left: editingRoom.screenX, top: editingRoom.screenY }}
        >
          <input
            type="text"
            maxLength={32}
            autoFocus
            onFocus={(e) => e.target.select()}
            value={editingRoom.nameStr}
            onChange={(e) =>
              setEditingRoom((prev) => (prev ? { ...prev, nameStr: e.target.value } : null))
            }
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditingRoom(null);
              }
            }}
            placeholder="Room name"
            className="w-28 rounded bg-slate-50 px-2 py-1 text-xs font-medium text-slate-900 focus:outline-none"
          />
          <button
            type="submit"
            className="px-2 py-1 rounded bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700"
          >
            Save
          </button>
        </form>
      )}

      {/* 3D Measured CAD Dimension Tags (Walk & Orbit, Default OFF, Toggleable) */}
      {(viewMode === '3d-walk' || viewMode === '3d-orbit') &&
        showWalkDimensions &&
        !activeCameraViewId &&
        walkDimLabels.map((wl) => (
          <div
            key={wl.id}
            className={`pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded font-mono-tabular whitespace-nowrap text-[11px] font-semibold shadow-sm border ${
              wl.badgeKind === 'room'
                ? 'bg-teal-900/90 text-white border-teal-400'
                : wl.badgeKind === 'opening'
                  ? 'bg-slate-900/90 text-sky-200 border-sky-500/70'
                  : 'bg-white/95 text-slate-900 border-slate-300'
            }`}
            style={{ left: wl.screenX, top: wl.screenY }}
          >
            {wl.text}
          </div>
        ))}

      {/* Security Camera & Sensor Coverage Badges in 2D */}
      {viewMode === '2d' &&
        showSecurity &&
        (showSecurityCoverage || testMotionActive) &&
        securityLabels.map((lbl) => (
          <div
            key={lbl.id}
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 flex items-center gap-0.5"
            style={{ left: lbl.screenX, top: lbl.screenY }}
          >
            <button
              type="button"
              title="Click to select security device"
              onClick={(e) => {
                e.stopPropagation();
                onSelect({ kind: 'security', securityId: lbl.securityId });
              }}
              className={`cursor-pointer px-1.5 py-0.5 rounded font-mono-tabular whitespace-nowrap text-[10px] font-semibold shadow-xs transition-shadow hover:ring-2 hover:ring-amber-400 inline-flex items-center gap-1 ${
                lbl.triggered
                  ? 'bg-red-600 text-white'
                  : lbl.selected
                    ? 'bg-amber-600 text-white'
                    : 'bg-white/95 text-slate-800 border border-slate-300'
              }`}
            >
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{
                  backgroundColor: lbl.triggered || lbl.selected ? '#ffffff' : lbl.color,
                }}
              />
              <span>{lbl.text}</span>
            </button>
            {lbl.isCamera && (
              <button
                type="button"
                title="Enter Camera 3D View"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: 'security', securityId: lbl.securityId });
                  onEnterCameraView(lbl.securityId);
                }}
                className="cursor-pointer px-1.5 py-0.5 rounded bg-slate-900 hover:bg-blue-600 text-white text-[10px] font-semibold shadow-xs transition-colors"
              >
                3D
              </button>
            )}
          </div>
        ))}

      {/* Inline Dimension Value Editor Popover */}
      {viewMode === '2d' && editingDim && (
        <form
          onPointerDown={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            commitDimensionEdit();
          }}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg bg-white border-2 border-blue-600 p-1 shadow-lg"
          style={{ left: editingDim.screenX, top: editingDim.screenY }}
        >
          <input
            type="number"
            min={0.4}
            max={40}
            step={0.05}
            autoFocus
            onFocus={(e) => e.target.select()}
            value={editingDim.valueStr}
            onChange={(e) =>
              setEditingDim((prev) => (prev ? { ...prev, valueStr: e.target.value } : null))
            }
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditingDim(null);
              }
            }}
            className="w-20 rounded bg-slate-50 px-2 py-1 text-xs font-mono-tabular font-semibold text-slate-900 focus:outline-none"
          />
          <span className="text-[11px] text-slate-500 pr-1">m</span>
          <button
            type="submit"
            className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700"
          >
            Apply
          </button>
        </form>
      )}

      {/* Triggered Moving Sensor / Intrusion Alert Banner */}
      {showSecurity && triggeredSummary.length > 0 && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold shadow-md flex items-center gap-2 whitespace-nowrap">
          <span>ALERT · Triggered:</span>
          <span className="font-mono-tabular">{triggeredSummary.join(' · ')}</span>
        </div>
      )}

      {/* Live Camera 3D Feed HUD Bar */}
      {activeCameraViewId && (() => {
        const camIndex = securityDevices.findIndex((d) => d.id === activeCameraViewId);
        const activeCam = camIndex >= 0 ? securityDevices[camIndex] : null;
        const opticalCams = securityDevices.filter((d) => isCameraSecurityDevice(d.kind));
        const optIdx = opticalCams.findIndex((d) => d.id === activeCameraViewId);
        if (!activeCam) return null;
        const info = SECURITY_DEVICE_INFO[activeCam.kind];
        const camName = activeCam.label || `${info.shortCode}-${camIndex + 1}`;
        return (
          <div className="pointer-events-auto fixed bottom-5 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2.5 rounded-xl bg-slate-900/95 border border-slate-700 px-3.5 py-2 text-white shadow-xl max-w-[94vw]">
            <div className="flex items-center gap-2 pr-1">
              <span className="text-xs font-semibold">{camName}</span>
              <span className="text-[11px] text-slate-300 font-mono-tabular">
                {Math.round(activeCam.fovDeg)}° FOV · Aim {Math.round(activeCam.yawDeg)}° · Tilt{' '}
                {Math.round(activeCam.tiltDeg)}°
              </span>
            </div>
            <span className="hidden sm:inline text-[11px] text-slate-400">
              Drag to pan/tilt · Click doors/windows to open
            </span>
            {opticalCams.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const prev =
                      opticalCams[(optIdx - 1 + opticalCams.length) % opticalCams.length];
                    onSelect({ kind: 'security', securityId: prev.id });
                    onEnterCameraView(prev.id);
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = opticalCams[(optIdx + 1) % opticalCams.length];
                    onSelect({ kind: 'security', securityId: next.id });
                    onEnterCameraView(next.id);
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium"
                >
                  Next
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onExitCameraView}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
            >
              Exit Camera (Esc)
            </button>
          </div>
        );
      })()}

      {/* 3D Walkthrough Crosshair & Interactive Open/Close Prompt */}
      {viewMode === '3d-walk' && !activeCameraViewId && (pointerLockedState || aimPrompt) && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center">
          <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-900 bg-white/90 shadow-sm" />
          {aimPrompt && (
            <button
              type="button"
              onClick={() => toggleCenterOpeningRef.current?.()}
              className="pointer-events-auto cursor-pointer mt-3 px-3 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shadow-md"
            >
              {pointerLockedState ? `Click / E · ${aimPrompt}` : `Tap / E · ${aimPrompt}`}
            </button>
          )}
        </div>
      )}

      {/* Live 2D Drawing Dimension Readout */}
      {liveOverlay && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-sm font-mono-tabular whitespace-nowrap"
          style={{ left: liveOverlay.screenX, top: liveOverlay.screenY }}
        >
          {liveOverlay.label}
        </div>
      )}

      {/* Touch Fingertip Offset Crosshair */}
      {touchReticle && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-blue-600"
          style={{ left: touchReticle.x, top: touchReticle.y }}
        >
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-600" />
        </div>
      )}

      {/* Active wall-chain, wall-rect, or wire-run Finish button (available in 2D Plan, 3D Orbit, and 3D Walk) */}
      {activeTool === 'wall' && chainActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={() => cancelDraftChainRef.current?.()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-md hover:bg-slate-800 active:scale-[0.98] transition-transform whitespace-nowrap"
          >
            Finish Wall Chain
          </button>
        </div>
      )}

      {activeTool === 'wall-rect' && chainActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
          <button
            type="button"
            onClick={() => cancelDraftChainRef.current?.()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-md hover:bg-slate-800 active:scale-[0.98] transition-transform whitespace-nowrap"
          >
            Cancel Rectangle
          </button>
        </div>
      )}

      {activeTool === 'wire' && wireChainActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => commitWireDraftRef.current?.()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-md hover:bg-slate-800 active:scale-[0.98] transition-transform whitespace-nowrap"
          >
            Finish Wire Run
          </button>
          <button
            type="button"
            onClick={() => cancelDraftChainRef.current?.()}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium shadow-md hover:bg-slate-50 whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
      )}

      {activeTool === 'pipe' && pipeChainActive && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={() => commitPipeDraftRef.current?.()}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-md hover:bg-slate-800 active:scale-[0.98] transition-transform whitespace-nowrap"
          >
            Finish Pipe Run
          </button>
          <button
            type="button"
            onClick={() => cancelDraftChainRef.current?.()}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium shadow-md hover:bg-slate-50 whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-100/95 p-6">
          <div className="rounded-xl bg-white border border-slate-200 px-5 py-4 text-sm text-slate-700 shadow-sm">
            Restoring graphics context…
          </div>
        </div>
      )}
    </div>
  );
};
