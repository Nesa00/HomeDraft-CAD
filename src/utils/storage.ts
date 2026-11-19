import {
  DEFAULT_OPENING_DIMENSIONS,
  type CeilingMode,
  type ElectricalJunction,
  type ElectricalWire,
  type ExportConfig,
  type FloorStyle,
  type FurnitureItem,
  type OpeningDefaultsMap,
  type PlumbingFixture,
  type PlumbingPipe,
  type SecurityDevice,
  type SnapMode,
  type TemplateId,
  type ViewMode,
  type WallSegment,
  type WorkspaceStep,
} from '../types/plan';

const WORKSPACE_STORAGE_KEY = 'homedraft-cad.workspace.v1';
const LEGACY_WORKSPACE_STORAGE_KEY = 'planforge3d.workspace.v1';

export interface SavedProjectSlot {
  updatedAt: number;
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
  ceilingMode: CeilingMode;
  openingDefaults: OpeningDefaultsMap;
}

export interface SavedUiPrefs {
  viewMode: ViewMode;
  workspaceStep: WorkspaceStep;
  walkerHeight: number;
  cameraFov: number;
  cameraZoom: number;
  snapMode: SnapMode;
  showDimensions: boolean;
  showInnerDimensions: boolean;
  showObjectDistances: boolean;
  showRoomAreas: boolean;
  showCeiling: boolean;
  showWalkDimensions: boolean;
  showStructure: boolean;
  showWiring: boolean;
  showPlumbing: boolean;
  showSecurity: boolean;
  showInterior: boolean;
  showSecurityCoverage: boolean;
  xrayWalls: boolean;
  editLocked: boolean;
  exportConfig: ExportConfig;
}

export interface SavedWorkspaceEnvelope {
  version: 1;
  activeTemplate: TemplateId;
  slots: Partial<Record<TemplateId, SavedProjectSlot>>;
  prefs?: Partial<SavedUiPrefs>;
}

export interface ProjectJsonExport {
  format: 'homedraft-cad-project';
  version: 1;
  exportedAt: string;
  templateId: TemplateId;
  project: SavedProjectSlot;
  prefs?: Partial<SavedUiPrefs>;
}

const VALID_TEMPLATES = new Set<TemplateId>([
  'cottage',
  'l-shape',
  'studio',
  'two-bedroom',
  'office-suite',
  'workshop',
  'blank',
]);

const VALID_FLOOR_STYLES = new Set<FloorStyle>([
  'tile',
  'wood-parquet',
  'concrete',
  'terrazzo',
  'checker',
  'solid',
]);

const VALID_CEILING_MODES = new Set<CeilingMode>(['flat', 'gable', 'open-gable']);

function cloneSlot(raw: unknown): SavedProjectSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<SavedProjectSlot>;
  if (!Array.isArray(obj.walls)) return null;

  const mergeOpeningDefaults: OpeningDefaultsMap = {
    door: { ...DEFAULT_OPENING_DIMENSIONS.door, ...(obj.openingDefaults?.door ?? {}) },
    'double-door': {
      ...DEFAULT_OPENING_DIMENSIONS['double-door'],
      ...(obj.openingDefaults?.['double-door'] ?? {}),
    },
    'sliding-door': {
      ...DEFAULT_OPENING_DIMENSIONS['sliding-door'],
      ...(obj.openingDefaults?.['sliding-door'] ?? {}),
    },
    'garage-door': {
      ...DEFAULT_OPENING_DIMENSIONS['garage-door'],
      ...(obj.openingDefaults?.['garage-door'] ?? {}),
    },
    window: { ...DEFAULT_OPENING_DIMENSIONS.window, ...(obj.openingDefaults?.window ?? {}) },
  };

  return {
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : Date.now(),
    walls: obj.walls
      .filter(
        (w): w is WallSegment =>
          !!w &&
          typeof w === 'object' &&
          typeof w.id === 'string' &&
          !!w.start &&
          typeof w.start.x === 'number' &&
          typeof w.start.z === 'number' &&
          !!w.end &&
          typeof w.end.x === 'number' &&
          typeof w.end.z === 'number',
      )
      .map((w) => ({
        ...w,
        start: { x: w.start.x, z: w.start.z },
        end: { x: w.end.x, z: w.end.z },
        thickness: typeof w.thickness === 'number' && Number.isFinite(w.thickness) ? w.thickness : 0.2,
        openings: Array.isArray(w.openings) ? w.openings.map((o) => ({ ...o })) : [],
      })),
    wires: Array.isArray(obj.wires)
      ? obj.wires.map((w) => ({
          ...w,
          points: Array.isArray(w.points) ? w.points.map((pt) => ({ ...pt })) : [],
        }))
      : [],
    junctions: Array.isArray(obj.junctions)
      ? obj.junctions.map((j) => ({
          ...j,
          connectedWireIds: j.connectedWireIds ? [...j.connectedWireIds] : undefined,
          disconnectedWireIds: j.disconnectedWireIds ? [...j.disconnectedWireIds] : undefined,
          breakerStates: j.breakerStates ? { ...j.breakerStates } : undefined,
        }))
      : [],
    pipes: Array.isArray(obj.pipes)
      ? obj.pipes.map((p) => ({
          ...p,
          points: Array.isArray(p.points) ? p.points.map((pt) => ({ ...pt })) : [],
        }))
      : [],
    fixtures: Array.isArray(obj.fixtures) ? obj.fixtures.map((f) => ({ ...f })) : [],
    securityDevices: Array.isArray(obj.securityDevices)
      ? obj.securityDevices.map((d) => ({ ...d }))
      : [],
    furniture: Array.isArray(obj.furniture) ? obj.furniture.map((f) => ({ ...f })) : [],
    customRoomNames:
      obj.customRoomNames && typeof obj.customRoomNames === 'object'
        ? { ...obj.customRoomNames }
        : {},
    wallHeight:
      typeof obj.wallHeight === 'number' && Number.isFinite(obj.wallHeight)
        ? obj.wallHeight
        : 2.6,
    defaultThickness:
      typeof obj.defaultThickness === 'number' && Number.isFinite(obj.defaultThickness)
        ? obj.defaultThickness
        : 0.2,
    defaultWallColor:
      typeof obj.defaultWallColor === 'string' && obj.defaultWallColor.length > 0
        ? obj.defaultWallColor
        : '#eae6df',
    floorColor:
      typeof obj.floorColor === 'string' && obj.floorColor.length > 0
        ? obj.floorColor
        : '#ddd7cc',
    floorStyle:
      obj.floorStyle && VALID_FLOOR_STYLES.has(obj.floorStyle) ? obj.floorStyle : 'tile',
    ceilingMode:
      obj.ceilingMode && VALID_CEILING_MODES.has(obj.ceilingMode) ? obj.ceilingMode : 'flat',
    openingDefaults: mergeOpeningDefaults,
  };
}

export function loadWorkspaceFromStorage(): SavedWorkspaceEnvelope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(WORKSPACE_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedWorkspaceEnvelope>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return null;

    const activeTemplate: TemplateId =
      parsed.activeTemplate && VALID_TEMPLATES.has(parsed.activeTemplate)
        ? parsed.activeTemplate
        : 'cottage';

    const slots: Partial<Record<TemplateId, SavedProjectSlot>> = {};
    if (parsed.slots && typeof parsed.slots === 'object') {
      for (const [k, v] of Object.entries(parsed.slots)) {
        if (!VALID_TEMPLATES.has(k as TemplateId)) continue;
        const cleanSlot = cloneSlot(v);
        if (cleanSlot) {
          slots[k as TemplateId] = cleanSlot;
        }
      }
    }

    return {
      version: 1,
      activeTemplate,
      slots,
      prefs: parsed.prefs && typeof parsed.prefs === 'object' ? { ...parsed.prefs } : undefined,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceToStorage(envelope: SavedWorkspaceEnvelope): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // Ignore storage quota / private-browsing errors silently
  }
}

export function serializeProjectToJson(
  templateId: TemplateId,
  slot: SavedProjectSlot,
  prefs?: Partial<SavedUiPrefs>,
): string {
  const payload: ProjectJsonExport = {
    format: 'homedraft-cad-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    templateId,
    project: slot,
    prefs,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseProjectFromJson(rawText: string): {
  templateId?: TemplateId;
  project: SavedProjectSlot;
  prefs?: Partial<SavedUiPrefs>;
} | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    // 1. Standard HomeDraft-CAD single-project export format
    if (parsed.project && typeof parsed.project === 'object') {
      const slot = cloneSlot(parsed.project);
      if (!slot) return null;
      const tpl =
        typeof parsed.templateId === 'string' && VALID_TEMPLATES.has(parsed.templateId as TemplateId)
          ? (parsed.templateId as TemplateId)
          : undefined;
      return {
        templateId: tpl,
        project: slot,
        prefs:
          parsed.prefs && typeof parsed.prefs === 'object'
            ? { ...(parsed.prefs as Partial<SavedUiPrefs>) }
            : undefined,
      };
    }

    // 2. Full workspace envelope export (uses activeTemplate's slot or first slot)
    if (parsed.slots && typeof parsed.slots === 'object') {
      const slotsObj = parsed.slots as Record<string, unknown>;
      const preferredKey =
        typeof parsed.activeTemplate === 'string' && VALID_TEMPLATES.has(parsed.activeTemplate as TemplateId)
          ? (parsed.activeTemplate as TemplateId)
          : undefined;
      const candidate =
        (preferredKey ? slotsObj[preferredKey] : undefined) ??
        Object.values(slotsObj).find((v) => v && typeof v === 'object');
      const slot = cloneSlot(candidate);
      if (!slot) return null;
      return {
        templateId: preferredKey,
        project: slot,
        prefs:
          parsed.prefs && typeof parsed.prefs === 'object'
            ? { ...(parsed.prefs as Partial<SavedUiPrefs>) }
            : undefined,
      };
    }

    // 3. Raw SavedProjectSlot directly ({ walls: [...], ... })
    const directSlot = cloneSlot(parsed);
    if (directSlot) {
      return { project: directSlot };
    }

    return null;
  } catch {
    return null;
  }
}
