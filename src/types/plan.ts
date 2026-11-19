export interface Point2D {
  x: number;
  z: number;
}

export interface WirePoint extends Point2D {
  /** Wall segment ID when this vertex is sticky to a wall */
  wallId?: string;
  /** Distance from wall.start along wall centerline (meters) */
  offset?: number;
  /** Explicit wall endpoint lock so corner drags & resizes stretch cleanly */
  pinEnd?: 'start' | 'end';
  /** Wall junction or plumbing fixture ID when snapped directly onto a wall point */
  anchorTargetId?: string;
  /** Existing wire ID when snapped/spliced onto another wire */
  connectedWireId?: string;
}

export type OpeningType = 'door' | 'double-door' | 'sliding-door' | 'garage-door' | 'window';

export interface WallOpening {
  id: string;
  type: OpeningType;
  /** Distance from wall start along wall centerline, in meters */
  offset: number;
  /** Opening width in meters */
  width: number;
  /** Opening vertical height in meters */
  height: number;
  /** Height from floor to bottom of opening (0 for doors) */
  sillHeight: number;
  /** Swing or offset direction across wall thickness (1 = Inward/Side A, -1 = Outward/Side B) */
  swingSide?: 1 | -1;
  /** Hinge or slide handing along wall length ('left' | 'right', or 'both' for double-casement windows) */
  hingeSide?: 'left' | 'right' | 'both';
  /** Whether the door or window is currently open in 3D view (defaults to false / closed) */
  isOpen?: boolean;
}

export interface OpeningDimensionPreset {
  width: number;
  height: number;
  sillHeight: number;
}

export type OpeningDefaultsMap = Record<OpeningType, OpeningDimensionPreset>;

export interface WallSegment {
  id: string;
  start: Point2D;
  end: Point2D;
  /** Wall thickness in meters */
  thickness: number;
  /** Optional per-wall color hex (falls back to defaultWallColor) */
  color?: string;
  openings: WallOpening[];
}

export type WireCircuitType = 'power' | 'lighting' | 'data';
export type WireMountRef = 'from-top' | 'from-floor';
export type CableSpec = '3x1.5' | '3x2.5' | '5x2.5' | '5x4.0' | '5x6.0' | 'cat6';

export const CABLE_SPEC_INFO: Record<
  CableSpec,
  { label: string; shortLabel: string; rating: string }
> = {
  '3x1.5': { label: '3×1.5 mm² (CYKY/NYM)', shortLabel: '3×1.5', rating: '10A Lighting' },
  '3x2.5': { label: '3×2.5 mm² (CYKY/NYM)', shortLabel: '3×2.5', rating: '16A Sockets' },
  '5x2.5': { label: '5×2.5 mm² (3-Phase)', shortLabel: '5×2.5', rating: '16A 3-Phase' },
  '5x4.0': { label: '5×4.0 mm² (Heavy)', shortLabel: '5×4.0', rating: '25A Hob/EV' },
  '5x6.0': { label: '5×6.0 mm² (Feeder)', shortLabel: '5×6.0', rating: '32A Sub-Panel' },
  cat6: { label: 'Cat6 UTP (Data/LAN)', shortLabel: 'Cat6', rating: 'Ethernet' },
};

export const CABLE_SPEC_OPTIONS: CableSpec[] = ['3x1.5', '3x2.5', '5x2.5', '5x4.0', '5x6.0', 'cat6'];

export interface ElectricalWire {
  id: string;
  points: WirePoint[];
  circuit: WireCircuitType;
  /** Breaker / run identifier, e.g. B1, B2, L1, D1 */
  breakerLabel: string;
  /** Metric conductor cross-section, e.g. 3x1.5, 3x2.5, 5x4.0 */
  cableSpec: CableSpec;
  /** EU standard: measured down from top of wall ('from-top') or up from floor ('from-floor') */
  mountRef: WireMountRef;
  /** Distance down from top edge of wall when mountRef === 'from-top' (EU DIN 18015-3: 0.30 m) */
  dropFromTop: number;
  /** Height above floor in meters when mountRef === 'from-floor' */
  height: number;
}

export interface WireBreakerPreset {
  id: string;
  breakerLabel: string;
  circuit: WireCircuitType;
  cableSpec: CableSpec;
  label: string;
  color: string;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
}

export const WIRE_CIRCUIT_INFO: Record<
  WireCircuitType,
  {
    label: string;
    color: string;
    defaultHeight: number;
    defaultDropFromTop: number;
    defaultCableSpec: CableSpec;
  }
> = {
  power: {
    label: 'Power (230V)',
    color: '#ea580c',
    defaultHeight: 0.3,
    defaultDropFromTop: 0.3,
    defaultCableSpec: '3x2.5',
  },
  lighting: {
    label: 'Lighting',
    color: '#eab308',
    defaultHeight: 2.25,
    defaultDropFromTop: 0.25,
    defaultCableSpec: '3x1.5',
  },
  data: {
    label: 'Data / Comms',
    color: '#0284c7',
    defaultHeight: 1.15,
    defaultDropFromTop: 0.35,
    defaultCableSpec: 'cat6',
  },
};

export const WIRE_BREAKER_PRESETS: WireBreakerPreset[] = [
  {
    id: 'b1-power',
    breakerLabel: 'B1',
    circuit: 'power',
    cableSpec: '3x2.5',
    label: 'B1 16A · 3×2.5',
    color: '#ea580c',
    mountRef: 'from-top',
    dropFromTop: 0.3,
    height: 0.3,
  },
  {
    id: 'b2-power',
    breakerLabel: 'B2',
    circuit: 'power',
    cableSpec: '3x2.5',
    label: 'B2 16A · 3×2.5',
    color: '#dc2626',
    mountRef: 'from-top',
    dropFromTop: 0.3,
    height: 0.3,
  },
  {
    id: 'b3-heavy',
    breakerLabel: 'B3',
    circuit: 'power',
    cableSpec: '5x4.0',
    label: 'B3 25A · 5×4.0',
    color: '#9333ea',
    mountRef: 'from-top',
    dropFromTop: 0.3,
    height: 0.3,
  },
  {
    id: 'l1-light',
    breakerLabel: 'L1',
    circuit: 'lighting',
    cableSpec: '3x1.5',
    label: 'L1 10A · 3×1.5',
    color: '#eab308',
    mountRef: 'from-top',
    dropFromTop: 0.25,
    height: 2.25,
  },
  {
    id: 'd1-data',
    breakerLabel: 'D1',
    circuit: 'data',
    cableSpec: 'cat6',
    label: 'D1 LAN · Cat6',
    color: '#0284c7',
    mountRef: 'from-top',
    dropFromTop: 0.35,
    height: 1.15,
  },
];

export type JunctionKind =
  | 'junction-box'
  | 'socket'
  | 'switch'
  | 'panel'
  | 'wall-light'
  | 'ceiling-light';

export interface ElectricalJunction {
  id: string;
  wallId: string;
  /** Distance from wall.start along centerline (meters) */
  offset: number;
  /** Free 2D world coordinates when mounted on the ceiling (e.g. ceiling-light) */
  x?: number;
  z?: number;
  kind: JunctionKind;
  /** Reference mode: top-down (EU junction box) or floor-up (socket/switch/panel) */
  mountRef: WireMountRef;
  /** Drop from top of wall when mountRef === 'from-top' */
  dropFromTop: number;
  /** Height from floor when mountRef === 'from-floor' */
  height: number;
  /** Wall face side (1 or -1) */
  faceSide?: 1 | -1;
  label?: string;
  /** Wires explicitly tapped into this point along the same wall or ceiling */
  connectedWireIds?: string[];
  /** Wires explicitly disconnected from this point so proximity auto-connect does not re-link them */
  disconnectedWireIds?: string[];
  /** Whether a wall-light or ceiling-light is switched on in 3D (default true) */
  isOn?: boolean;
  /** Whether a breaker panel's front cabinet door is open in 3D */
  isOpen?: boolean;
  /** Per-breaker ON/OFF state keyed by breakerLabel on a panel (default ON when true/undefined) */
  breakerStates?: Record<string, boolean>;
}

export const JUNCTION_KIND_INFO: Record<
  JunctionKind,
  {
    label: string;
    shortCode: string;
    color: string;
    mountRef: WireMountRef;
    defaultDropFromTop: number;
    defaultHeight: number;
  }
> = {
  'junction-box': {
    label: 'Junction Box',
    shortCode: 'JB',
    color: '#475569',
    mountRef: 'from-top',
    defaultDropFromTop: 0.3,
    defaultHeight: 2.4,
  },
  socket: {
    label: 'Socket (0.30m)',
    shortCode: 'SK',
    color: '#ea580c',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.3,
    defaultHeight: 0.3,
  },
  switch: {
    label: 'Switch (1.05m)',
    shortCode: 'SW',
    color: '#eab308',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.3,
    defaultHeight: 1.05,
  },
  panel: {
    label: 'Breaker Panel',
    shortCode: 'DB',
    color: '#0f172a',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.3,
    defaultHeight: 1.5,
  },
  'wall-light': {
    label: 'Wall Light (1.85m)',
    shortCode: 'WL',
    color: '#f59e0b',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.55,
    defaultHeight: 1.85,
  },
  'ceiling-light': {
    label: 'Ceiling Light',
    shortCode: 'CL',
    color: '#d97706',
    mountRef: 'from-top',
    defaultDropFromTop: 0.05,
    defaultHeight: 2.55,
  },
};

/* ---------------- PLUMBING / WATER INSTALLATION ---------------- */

export type PlumbingPipeType = 'cold' | 'hot' | 'circulation' | 'drain';
export type PlumbingPipeSpec = 'pex-16' | 'pex-20' | 'pex-25' | 'pvc-50' | 'pvc-110';

export const PLUMBING_SPEC_INFO: Record<
  PlumbingPipeSpec,
  { label: string; shortLabel: string; radius3D: number }
> = {
  'pex-16': { label: 'PEX-Al-PEX Ø16×2', shortLabel: 'Ø16 PEX', radius3D: 0.011 },
  'pex-20': { label: 'PEX-Al-PEX Ø20×2', shortLabel: 'Ø20 PEX', radius3D: 0.014 },
  'pex-25': { label: 'PEX Main Ø25×2.5', shortLabel: 'Ø25 PEX', radius3D: 0.017 },
  'pvc-50': { label: 'HT PVC Ø50 Drain', shortLabel: 'Ø50 PVC', radius3D: 0.022 },
  'pvc-110': { label: 'HT PVC Ø110 Soil', shortLabel: 'Ø110 PVC', radius3D: 0.03 },
};

export const PLUMBING_SPEC_OPTIONS: PlumbingPipeSpec[] = [
  'pex-16',
  'pex-20',
  'pex-25',
  'pvc-50',
  'pvc-110',
];

export const PLUMBING_TYPE_INFO: Record<
  PlumbingPipeType,
  {
    label: string;
    color: string;
    defaultHeight: number;
    defaultDropFromTop: number;
    defaultSpec: PlumbingPipeSpec;
  }
> = {
  cold: {
    label: 'Cold Water',
    color: '#2563eb',
    defaultHeight: 0.35,
    defaultDropFromTop: 0.45,
    defaultSpec: 'pex-16',
  },
  hot: {
    label: 'Hot Water',
    color: '#ef4444',
    defaultHeight: 0.48,
    defaultDropFromTop: 0.55,
    defaultSpec: 'pex-16',
  },
  circulation: {
    label: 'Hot Return',
    color: '#f97316',
    defaultHeight: 0.58,
    defaultDropFromTop: 0.65,
    defaultSpec: 'pex-16',
  },
  drain: {
    label: 'Drain / Waste',
    color: '#64748b',
    defaultHeight: 0.14,
    defaultDropFromTop: 2.4,
    defaultSpec: 'pvc-50',
  },
};

export interface PlumbingPipePreset {
  id: string;
  lineLabel: string;
  pipeType: PlumbingPipeType;
  pipeSpec: PlumbingPipeSpec;
  label: string;
  color: string;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
}

export const PLUMBING_PIPE_PRESETS: PlumbingPipePreset[] = [
  {
    id: 'cw-16',
    lineLabel: 'CW-1',
    pipeType: 'cold',
    pipeSpec: 'pex-16',
    label: 'CW-1 · Ø16 PEX',
    color: '#2563eb',
    mountRef: 'from-floor',
    dropFromTop: 0.45,
    height: 0.35,
  },
  {
    id: 'cw-20',
    lineLabel: 'CW-Main',
    pipeType: 'cold',
    pipeSpec: 'pex-20',
    label: 'CW Main · Ø20 PEX',
    color: '#1d4ed8',
    mountRef: 'from-floor',
    dropFromTop: 0.45,
    height: 0.35,
  },
  {
    id: 'hw-16',
    lineLabel: 'HW-1',
    pipeType: 'hot',
    pipeSpec: 'pex-16',
    label: 'HW-1 · Ø16 PEX',
    color: '#ef4444',
    mountRef: 'from-floor',
    dropFromTop: 0.55,
    height: 0.48,
  },
  {
    id: 'circ-16',
    lineLabel: 'REC-1',
    pipeType: 'circulation',
    pipeSpec: 'pex-16',
    label: 'Return · Ø16 PEX',
    color: '#f97316',
    mountRef: 'from-floor',
    dropFromTop: 0.65,
    height: 0.58,
  },
  {
    id: 'dr-50',
    lineLabel: 'DR-50',
    pipeType: 'drain',
    pipeSpec: 'pvc-50',
    label: 'Drain · Ø50 PVC',
    color: '#64748b',
    mountRef: 'from-floor',
    dropFromTop: 2.35,
    height: 0.14,
  },
  {
    id: 'dr-110',
    lineLabel: 'DR-110',
    pipeType: 'drain',
    pipeSpec: 'pvc-110',
    label: 'WC Soil · Ø110 PVC',
    color: '#334155',
    mountRef: 'from-floor',
    dropFromTop: 2.4,
    height: 0.1,
  },
];

export interface PlumbingPipe {
  id: string;
  points: WirePoint[];
  pipeType: PlumbingPipeType;
  pipeSpec: PlumbingPipeSpec;
  lineLabel: string;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
}

export type PlumbingFixtureKind = 'sink' | 'shower' | 'wc' | 'boiler' | 'floor-drain';

export interface PlumbingFixture {
  id: string;
  wallId: string;
  offset: number;
  kind: PlumbingFixtureKind;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
  faceSide?: 1 | -1;
}

export const PLUMBING_FIXTURE_INFO: Record<
  PlumbingFixtureKind,
  {
    label: string;
    shortCode: string;
    color: string;
    mountRef: WireMountRef;
    defaultDropFromTop: number;
    defaultHeight: number;
  }
> = {
  sink: {
    label: 'Sink Valve (0.55m)',
    shortCode: 'SNK',
    color: '#0284c7',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.45,
    defaultHeight: 0.55,
  },
  shower: {
    label: 'Shower Mixer (1.10m)',
    shortCode: 'SHW',
    color: '#0891b2',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.45,
    defaultHeight: 1.1,
  },
  wc: {
    label: 'WC Cistern (0.95m)',
    shortCode: 'WC',
    color: '#475569',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.45,
    defaultHeight: 0.95,
  },
  boiler: {
    label: 'Manifold / Boiler',
    shortCode: 'BLR',
    color: '#dc2626',
    mountRef: 'from-floor',
    defaultDropFromTop: 0.45,
    defaultHeight: 1.4,
  },
  'floor-drain': {
    label: 'Drain Trap (0.12m)',
    shortCode: 'DRN',
    color: '#334155',
    mountRef: 'from-floor',
    defaultDropFromTop: 2.35,
    defaultHeight: 0.12,
  },
};

/* ---------------- SECURITY & CAMERAS ---------------- */

export type SecurityDeviceKind =
  | 'bullet-cam'
  | 'dome-cam'
  | 'ptz-cam'
  | 'motion-sensor'
  | 'ceiling-pir'
  | 'curtain-pir'
  | 'door-contact'
  | 'glass-break'
  | 'siren'
  | 'keypad';

export interface SecurityDevice {
  id: string;
  kind: SecurityDeviceKind;
  x: number;
  z: number;
  /** Optional host wall ID if mounted on a wall (moves when wall moves) */
  wallId?: string;
  /** Distance from wall.start along centerline (meters) when wall-mounted */
  offset?: number;
  /** Wall face side (1 or -1) when wall-mounted */
  faceSide?: 1 | -1;
  /** Horizontal aim direction in 2D XZ plan degrees (0 = +X, 90 = +Z) */
  yawDeg: number;
  /** Downward tilt angle in 3D degrees */
  tiltDeg: number;
  /** Horizontal FOV / detection cone angle in degrees (0 for keypad/siren) */
  fovDeg: number;
  /** Effective detection / view distance in meters */
  rangeMeters: number;
  /** Mounting height above floor in meters */
  mountHeight: number;
  label?: string;
}

export const CAMERA_DEVICE_KINDS: SecurityDeviceKind[] = [
  'bullet-cam',
  'dome-cam',
  'ptz-cam',
];

export const SENSOR_DEVICE_KINDS: SecurityDeviceKind[] = [
  'motion-sensor',
  'ceiling-pir',
  'curtain-pir',
  'door-contact',
  'glass-break',
  'siren',
  'keypad',
];

export function isCameraSecurityDevice(kind: SecurityDeviceKind): boolean {
  return kind === 'bullet-cam' || kind === 'dome-cam' || kind === 'ptz-cam';
}

export const SECURITY_DEVICE_INFO: Record<
  SecurityDeviceKind,
  {
    category: 'camera' | 'sensor';
    label: string;
    shortLabel: string;
    shortCode: string;
    color: string;
    defaultFovDeg: number;
    defaultRangeMeters: number;
    defaultMountHeight: number;
    defaultTiltDeg: number;
    seesThroughGlass: boolean;
  }
> = {
  'bullet-cam': {
    category: 'camera',
    label: 'Bullet Camera',
    shortLabel: 'Bullet',
    shortCode: 'CAM',
    color: '#0d9488',
    defaultFovDeg: 75,
    defaultRangeMeters: 9.0,
    defaultMountHeight: 2.45,
    defaultTiltDeg: 18,
    seesThroughGlass: true,
  },
  'dome-cam': {
    category: 'camera',
    label: 'Dome Camera',
    shortLabel: 'Dome',
    shortCode: 'DOME',
    color: '#0284c7',
    defaultFovDeg: 110,
    defaultRangeMeters: 7.0,
    defaultMountHeight: 2.5,
    defaultTiltDeg: 25,
    seesThroughGlass: true,
  },
  'ptz-cam': {
    category: 'camera',
    label: '360° / Wide PTZ',
    shortLabel: 'PTZ',
    shortCode: 'PTZ',
    color: '#2563eb',
    defaultFovDeg: 180,
    defaultRangeMeters: 10.0,
    defaultMountHeight: 2.5,
    defaultTiltDeg: 22,
    seesThroughGlass: true,
  },
  'motion-sensor': {
    category: 'sensor',
    label: 'Wall PIR Motion',
    shortLabel: 'Wall PIR',
    shortCode: 'PIR',
    color: '#7c3aed',
    defaultFovDeg: 95,
    defaultRangeMeters: 8.5,
    defaultMountHeight: 2.2,
    defaultTiltDeg: 14,
    seesThroughGlass: false,
  },
  'ceiling-pir': {
    category: 'sensor',
    label: '360° Ceiling Motion',
    shortLabel: '360° PIR',
    shortCode: 'PIR360',
    color: '#9333ea',
    defaultFovDeg: 360,
    defaultRangeMeters: 5.5,
    defaultMountHeight: 2.55,
    defaultTiltDeg: 45,
    seesThroughGlass: false,
  },
  'curtain-pir': {
    category: 'sensor',
    label: 'Corridor Beam Motion',
    shortLabel: 'Beam PIR',
    shortCode: 'BEAM',
    color: '#c026d3',
    defaultFovDeg: 24,
    defaultRangeMeters: 12.0,
    defaultMountHeight: 2.2,
    defaultTiltDeg: 10,
    seesThroughGlass: false,
  },
  'door-contact': {
    category: 'sensor',
    label: 'Door/Window Contact',
    shortLabel: 'Contact',
    shortCode: 'MAG',
    color: '#d97706',
    defaultFovDeg: 120,
    defaultRangeMeters: 1.4,
    defaultMountHeight: 2.05,
    defaultTiltDeg: 8,
    seesThroughGlass: false,
  },
  'glass-break': {
    category: 'sensor',
    label: 'Glass-Break Sensor',
    shortLabel: 'Glass',
    shortCode: 'GBK',
    color: '#0891b2',
    defaultFovDeg: 160,
    defaultRangeMeters: 5.0,
    defaultMountHeight: 2.35,
    defaultTiltDeg: 12,
    seesThroughGlass: false,
  },
  siren: {
    category: 'sensor',
    label: 'Alarm Siren & Strobe',
    shortLabel: 'Siren',
    shortCode: 'SRN',
    color: '#dc2626',
    defaultFovDeg: 0,
    defaultRangeMeters: 0,
    defaultMountHeight: 2.4,
    defaultTiltDeg: 0,
    seesThroughGlass: false,
  },
  keypad: {
    category: 'sensor',
    label: 'Alarm Keypad',
    shortLabel: 'Keypad',
    shortCode: 'KEY',
    color: '#0f172a',
    defaultFovDeg: 0,
    defaultRangeMeters: 0,
    defaultMountHeight: 1.4,
    defaultTiltDeg: 0,
    seesThroughGlass: false,
  },
};

/* ---------------- INTERIOR & FURNITURE ---------------- */

export type FurnitureKind =
  | 'sofa'
  | 'sofa-table'
  | 'working-table'
  | 'workbench'
  | 'dining-table'
  | 'bed'
  | 'wardrobe'
  | 'toilet';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  label: string;
  x: number;
  z: number;
  /** Plan rotation in degrees (0..360) */
  rotationDeg: number;
  /** Width along local X in meters */
  width: number;
  /** Depth along local Z in meters */
  depth: number;
  /** Height from floor in meters */
  height: number;
  color?: string;
}

export const FURNITURE_KIND_INFO: Record<
  FurnitureKind,
  {
    label: string;
    shortLabel: string;
    shortCode: string;
    color: string;
    defaultWidth: number;
    defaultDepth: number;
    defaultHeight: number;
  }
> = {
  sofa: {
    label: '3-Seat Sofa',
    shortLabel: 'Sofa',
    shortCode: 'SOFA',
    color: '#64748b',
    defaultWidth: 2.1,
    defaultDepth: 0.9,
    defaultHeight: 0.82,
  },
  'sofa-table': {
    label: 'Sofa / Coffee Table',
    shortLabel: 'Sofa Table',
    shortCode: 'CTBL',
    color: '#b45309',
    defaultWidth: 1.15,
    defaultDepth: 0.65,
    defaultHeight: 0.44,
  },
  'working-table': {
    label: 'Office Desk + Chair',
    shortLabel: 'Office Desk',
    shortCode: 'DESK',
    color: '#475569',
    defaultWidth: 1.4,
    defaultDepth: 0.75,
    defaultHeight: 0.75,
  },
  workbench: {
    label: 'Working Table / Workbench',
    shortLabel: 'Working Table',
    shortCode: 'WKBN',
    color: '#92400e',
    defaultWidth: 1.9,
    defaultDepth: 0.85,
    defaultHeight: 0.9,
  },
  'dining-table': {
    label: 'Dining Table + 4 Chairs',
    shortLabel: 'Dining Table',
    shortCode: 'DINE',
    color: '#a16207',
    defaultWidth: 1.6,
    defaultDepth: 0.9,
    defaultHeight: 0.76,
  },
  bed: {
    label: 'Double Bed',
    shortLabel: 'Bed',
    shortCode: 'BED',
    color: '#475569',
    defaultWidth: 1.7,
    defaultDepth: 2.05,
    defaultHeight: 0.95,
  },
  wardrobe: {
    label: 'Wardrobe Cabinet',
    shortLabel: 'Wardrobe',
    shortCode: 'WRD',
    color: '#78716c',
    defaultWidth: 1.5,
    defaultDepth: 0.6,
    defaultHeight: 2.1,
  },
  toilet: {
    label: 'Classic Toilet (WC)',
    shortLabel: 'Toilet',
    shortCode: 'WC',
    color: '#f1f5f9',
    defaultWidth: 0.42,
    defaultDepth: 0.68,
    defaultHeight: 0.78,
  },
};

export type FloorStyle =
  | 'tile'
  | 'wood-parquet'
  | 'concrete'
  | 'terrazzo'
  | 'checker'
  | 'solid';

export const FLOOR_STYLE_OPTIONS: Array<{
  style: FloorStyle;
  label: string;
}> = [
  { style: 'tile', label: 'Ceramic Tile' },
  { style: 'wood-parquet', label: 'Wood Parquet' },
  { style: 'concrete', label: 'Polished Concrete' },
  { style: 'terrazzo', label: 'Terrazzo' },
  { style: 'checker', label: 'Checkered' },
  { style: 'solid', label: 'Solid Matte' },
];

export const FLOOR_COLOR_PALETTE: WallColorSwatch[] = [
  { name: 'Limestone', hex: '#ddd7cc' },
  { name: 'Oak Parquet', hex: '#c89f72' },
  { name: 'Walnut', hex: '#8b5e3c' },
  { name: 'Cool Concrete', hex: '#cbd5e1' },
  { name: 'Slate Tile', hex: '#64748b' },
  { name: 'Warm Cream', hex: '#f3ede2' },
  { name: 'Terracotta', hex: '#c47b60' },
  { name: 'Charcoal', hex: '#334155' },
];

export type WorkspaceStep = 'structure' | 'wiring' | 'plumbing' | 'interior';
export type CeilingMode = 'flat' | 'gable' | 'open-gable';

export type ViewMode = '2d' | '3d-walk' | '3d-orbit';
export type ToolMode =
  | 'select'
  | 'wall'
  | 'wall-rect'
  | 'door'
  | 'double-door'
  | 'sliding-door'
  | 'garage-door'
  | 'window'
  | 'wire'
  | 'junction'
  | 'pipe'
  | 'fixture'
  | 'security'
  | 'furniture';

export type TemplateId =
  | 'cottage'
  | 'l-shape'
  | 'studio'
  | 'two-bedroom'
  | 'office-suite'
  | 'workshop'
  | 'blank';
export type SnapMode = 'grid' | 'fine' | 'free';
export type ExportFormat = 'stl' | 'obj';
export type PrintScale = 50 | 100 | 200 | 1;

export interface ExportConfig {
  format: ExportFormat;
  scale: PrintScale;
  includeBasePlate: boolean;
  baseThicknessMm: number;
}

export type SelectionTarget =
  | { kind: 'wall'; wallId: string }
  | { kind: 'opening'; wallId: string; openingId: string }
  | { kind: 'wire'; wireId: string }
  | { kind: 'junction'; junctionId: string }
  | { kind: 'pipe'; pipeId: string }
  | { kind: 'fixture'; fixtureId: string }
  | { kind: 'security'; securityId: string }
  | { kind: 'furniture'; furnitureId: string }
  | null;

export interface PlanSnapshot {
  activeTemplate?: TemplateId;
  walls: WallSegment[];
  wires: ElectricalWire[];
  junctions: ElectricalJunction[];
  pipes: PlumbingPipe[];
  fixtures: PlumbingFixture[];
  securityDevices: SecurityDevice[];
  furniture?: FurnitureItem[];
  customRoomNames?: Record<string, string>;
  wallHeight: number;
  defaultThickness: number;
  defaultWallColor: string;
  floorColor?: string;
  floorStyle?: FloorStyle;
  ceilingMode?: CeilingMode;
  openingDefaults?: OpeningDefaultsMap;
}

export interface SnapResult {
  point: Point2D;
  snapKind: 'endpoint' | 'wall' | 'align' | 'angle' | 'grid' | 'free';
  angleDeg: number | null;
  guides: Array<{ from: Point2D; to: Point2D }>;
  matchedTargetId?: string;
  matchedWireId?: string;
}

export interface WallColorSwatch {
  name: string;
  hex: string;
}

export const WALL_COLOR_PALETTE: WallColorSwatch[] = [
  { name: 'Warm Plaster', hex: '#eae6df' },
  { name: 'Crisp White', hex: '#f8fafc' },
  { name: 'Sandstone', hex: '#e2d4be' },
  { name: 'Terracotta', hex: '#c87d65' },
  { name: 'Sage Gray', hex: '#b8c4bb' },
  { name: 'Slate Stone', hex: '#94a3b8' },
  { name: 'Charcoal', hex: '#475569' },
  { name: 'Deep Navy', hex: '#334155' },
];

export const DEFAULT_OPENING_DIMENSIONS: OpeningDefaultsMap = {
  door: { width: 0.95, height: 2.1, sillHeight: 0 },
  'double-door': { width: 1.6, height: 2.15, sillHeight: 0 },
  'sliding-door': { width: 2.0, height: 2.15, sillHeight: 0 },
  'garage-door': { width: 2.6, height: 2.15, sillHeight: 0 },
  window: { width: 1.3, height: 1.15, sillHeight: 0.9 },
};

export function isDoorOpening(type: OpeningType): boolean {
  return (
    type === 'door' ||
    type === 'double-door' ||
    type === 'sliding-door' ||
    type === 'garage-door'
  );
}

export interface ClosedRoomInfo {
  id: string;
  name: string;
  centerlinePolygon: Point2D[];
  innerPolygon: Point2D[];
  ceilingPolygon: Point2D[];
  centroid: Point2D;
  netAreaSqM: number;
  grossAreaSqM: number;
  perimeterM: number;
}
