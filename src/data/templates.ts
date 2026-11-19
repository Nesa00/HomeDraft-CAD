import type { Point2D, TemplateId, WallSegment } from '../types/plan';

export interface PlanTemplate {
  id: TemplateId;
  name: string;
  summary: string;
  wallHeight: number;
  defaultThickness: number;
  defaultWallColor: string;
  walls: WallSegment[];
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'cottage',
    name: 'Starter Cottage',
    summary: '8 × 6 m 2-room residence',
    wallHeight: 2.8,
    defaultThickness: 0.22,
    defaultWallColor: '#eae6df',
    walls: [
      {
        id: 'w-north',
        start: { x: -4, z: -3 },
        end: { x: 4, z: -3 },
        thickness: 0.22,
        openings: [
          { id: 'op-n1', type: 'window', offset: 1.75, width: 1.4, height: 1.15, sillHeight: 0.9, isOpen: false },
          { id: 'op-n2', type: 'window', offset: 5.75, width: 1.4, height: 1.15, sillHeight: 0.9, isOpen: false },
        ],
      },
      {
        id: 'w-east',
        start: { x: 4, z: -3 },
        end: { x: 4, z: 3 },
        thickness: 0.22,
        openings: [
          { id: 'op-e1', type: 'window', offset: 3.0, width: 1.4, height: 1.15, sillHeight: 0.9, isOpen: false },
        ],
      },
      {
        id: 'w-south',
        start: { x: 4, z: 3 },
        end: { x: -4, z: 3 },
        thickness: 0.22,
        openings: [
          { id: 'op-s2', type: 'double-door', offset: 2.25, width: 1.6, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'op-s1', type: 'window', offset: 6.25, width: 1.3, height: 1.15, sillHeight: 0.9, isOpen: false },
        ],
      },
      {
        id: 'w-west',
        start: { x: -4, z: 3 },
        end: { x: -4, z: -3 },
        thickness: 0.22,
        openings: [
          { id: 'op-w1', type: 'window', offset: 3.0, width: 1.3, height: 1.15, sillHeight: 0.9, isOpen: false },
        ],
      },
      {
        id: 'w-inner',
        start: { x: -0.5, z: -3 },
        end: { x: -0.5, z: 3 },
        thickness: 0.16,
        openings: [
          { id: 'op-i1', type: 'door', offset: 3.0, width: 0.95, height: 2.1, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
    ],
  },
  {
    id: 'l-shape',
    name: 'L-Shape Suite',
    summary: '10 × 8 m winged layout',
    wallHeight: 2.9,
    defaultThickness: 0.24,
    defaultWallColor: '#eae6df',
    walls: [
      {
        id: 'lw-1',
        start: { x: -5, z: -4 },
        end: { x: 5, z: -4 },
        thickness: 0.24,
        openings: [
          { id: 'lo-1', type: 'window', offset: 2.75, width: 1.6, height: 1.2, sillHeight: 0.85, isOpen: false },
          { id: 'lo-2', type: 'sliding-door', offset: 7.75, width: 2.1, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'lw-2',
        start: { x: 5, z: -4 },
        end: { x: 5, z: 1 },
        thickness: 0.24,
        openings: [
          { id: 'lo-3', type: 'window', offset: 2.5, width: 1.5, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'lw-3',
        start: { x: 5, z: 1 },
        end: { x: 0.5, z: 1 },
        thickness: 0.24,
        openings: [
          { id: 'lo-4', type: 'double-door', offset: 2.25, width: 1.6, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'lw-4',
        start: { x: 0.5, z: 1 },
        end: { x: 0.5, z: 4 },
        thickness: 0.24,
        openings: [
          { id: 'lo-5', type: 'window', offset: 1.5, width: 1.1, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'lw-5',
        start: { x: 0.5, z: 4 },
        end: { x: -5, z: 4 },
        thickness: 0.24,
        openings: [
          { id: 'lo-6', type: 'door', offset: 2.75, width: 1.05, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'lw-6',
        start: { x: -5, z: 4 },
        end: { x: -5, z: -4 },
        thickness: 0.24,
        openings: [
          { id: 'lo-7', type: 'window', offset: 2.0, width: 1.4, height: 1.2, sillHeight: 0.85, isOpen: false },
          { id: 'lo-8', type: 'window', offset: 6.0, width: 1.4, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'lw-7',
        start: { x: -5, z: -0.25 },
        end: { x: 0.5, z: -0.25 },
        thickness: 0.16,
        openings: [
          { id: 'lo-9', type: 'door', offset: 3.8, width: 0.95, height: 2.1, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'lw-8',
        start: { x: 0.5, z: -4 },
        end: { x: 0.5, z: 1 },
        thickness: 0.16,
        openings: [
          { id: 'lo-10', type: 'door', offset: 1.85, width: 0.95, height: 2.1, sillHeight: 0, swingSide: -1, isOpen: false },
        ],
      },
    ],
  },
  {
    id: 'studio',
    name: 'Open Studio',
    summary: '7 × 5 m compact loft',
    wallHeight: 2.7,
    defaultThickness: 0.2,
    defaultWallColor: '#eae6df',
    walls: [
      {
        id: 'sw-1',
        start: { x: -3.5, z: -2.5 },
        end: { x: 3.5, z: -2.5 },
        thickness: 0.2,
        openings: [
          { id: 'so-1', type: 'window', offset: 4.5, width: 2.0, height: 1.3, sillHeight: 0.8, isOpen: false },
        ],
      },
      {
        id: 'sw-2',
        start: { x: 3.5, z: -2.5 },
        end: { x: 3.5, z: 2.5 },
        thickness: 0.2,
        openings: [
          { id: 'so-2', type: 'window', offset: 2.5, width: 1.6, height: 1.3, sillHeight: 0.8, isOpen: false },
        ],
      },
      {
        id: 'sw-3',
        start: { x: 3.5, z: 2.5 },
        end: { x: -3.5, z: 2.5 },
        thickness: 0.2,
        openings: [
          { id: 'so-3', type: 'door', offset: 2.0, width: 1.0, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'so-4', type: 'window', offset: 5.0, width: 1.5, height: 1.3, sillHeight: 0.8, isOpen: false },
        ],
      },
      {
        id: 'sw-4',
        start: { x: -3.5, z: 2.5 },
        end: { x: -3.5, z: -2.5 },
        thickness: 0.2,
        openings: [],
      },
      {
        id: 'sw-bath-1',
        start: { x: -3.5, z: -0.25 },
        end: { x: -1.25, z: -0.25 },
        thickness: 0.14,
        openings: [
          { id: 'so-5', type: 'door', offset: 1.15, width: 0.8, height: 2.05, sillHeight: 0, swingSide: -1, isOpen: false },
        ],
      },
      {
        id: 'sw-bath-2',
        start: { x: -1.25, z: -0.25 },
        end: { x: -1.25, z: -2.5 },
        thickness: 0.14,
        openings: [],
      },
    ],
  },
  {
    id: 'two-bedroom',
    name: 'Two-Bedroom Home',
    summary: '12 × 8.5 m 4-zone family plan',
    wallHeight: 2.85,
    defaultThickness: 0.24,
    defaultWallColor: '#e2d4be',
    walls: [
      {
        id: 'tb-north',
        start: { x: -6, z: -4.25 },
        end: { x: 6, z: -4.25 },
        thickness: 0.24,
        openings: [
          { id: 'tbo-1', type: 'window', offset: 2.4, width: 1.5, height: 1.2, sillHeight: 0.85, isOpen: false },
          { id: 'tbo-2', type: 'sliding-door', offset: 8.6, width: 2.2, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'tb-east',
        start: { x: 6, z: -4.25 },
        end: { x: 6, z: 4.25 },
        thickness: 0.24,
        openings: [
          { id: 'tbo-3', type: 'window', offset: 2.3, width: 1.6, height: 1.2, sillHeight: 0.85, isOpen: false },
          { id: 'tbo-4', type: 'window', offset: 6.2, width: 1.5, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'tb-south',
        start: { x: 6, z: 4.25 },
        end: { x: -6, z: 4.25 },
        thickness: 0.24,
        openings: [
          { id: 'tbo-5', type: 'window', offset: 1.8, width: 1.4, height: 1.15, sillHeight: 0.9, isOpen: false },
          { id: 'tbo-6', type: 'double-door', offset: 5.4, width: 1.6, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'tbo-7', type: 'window', offset: 9.6, width: 1.5, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'tb-west',
        start: { x: -6, z: 4.25 },
        end: { x: -6, z: -4.25 },
        thickness: 0.24,
        openings: [
          { id: 'tbo-8', type: 'window', offset: 1.8, width: 1.4, height: 1.2, sillHeight: 0.85, isOpen: false },
          { id: 'tbo-9', type: 'window', offset: 4.25, width: 0.9, height: 0.8, sillHeight: 1.3, isOpen: false },
          { id: 'tbo-10', type: 'window', offset: 6.7, width: 1.4, height: 1.2, sillHeight: 0.85, isOpen: false },
        ],
      },
      {
        id: 'tb-spine',
        start: { x: -1.2, z: -4.25 },
        end: { x: -1.2, z: 4.25 },
        thickness: 0.16,
        openings: [
          { id: 'tbo-11', type: 'door', offset: 1.6, width: 0.95, height: 2.1, sillHeight: 0, swingSide: -1, isOpen: false },
          { id: 'tbo-12', type: 'door', offset: 4.25, width: 0.85, height: 2.05, sillHeight: 0, swingSide: -1, isOpen: false },
          { id: 'tbo-13', type: 'door', offset: 6.9, width: 0.95, height: 2.1, sillHeight: 0, swingSide: -1, isOpen: false },
        ],
      },
      {
        id: 'tb-bath-n',
        start: { x: -6, z: -1.0 },
        end: { x: -1.2, z: -1.0 },
        thickness: 0.15,
        openings: [],
      },
      {
        id: 'tb-bath-s',
        start: { x: -6, z: 1.0 },
        end: { x: -1.2, z: 1.0 },
        thickness: 0.15,
        openings: [],
      },
      {
        id: 'tb-kitchen-div',
        start: { x: 2.4, z: 4.25 },
        end: { x: 2.4, z: 1.5 },
        thickness: 0.16,
        color: '#c87d65',
        openings: [],
      },
    ],
  },
  {
    id: 'office-suite',
    name: 'Office Suite',
    summary: '14 × 10 m commercial workspace',
    wallHeight: 3.1,
    defaultThickness: 0.24,
    defaultWallColor: '#f8fafc',
    walls: [
      {
        id: 'of-north',
        start: { x: -7, z: -5 },
        end: { x: 7, z: -5 },
        thickness: 0.24,
        openings: [
          { id: 'ofo-1', type: 'window', offset: 2.25, width: 2.2, height: 1.5, sillHeight: 0.75, isOpen: false },
          { id: 'ofo-2', type: 'window', offset: 7.0, width: 2.4, height: 1.5, sillHeight: 0.75, isOpen: false },
          { id: 'ofo-3', type: 'window', offset: 11.75, width: 2.2, height: 1.5, sillHeight: 0.75, isOpen: false },
        ],
      },
      {
        id: 'of-east',
        start: { x: 7, z: -5 },
        end: { x: 7, z: 5 },
        thickness: 0.24,
        openings: [
          { id: 'ofo-4', type: 'window', offset: 1.75, width: 1.6, height: 1.4, sillHeight: 0.8, isOpen: false },
          { id: 'ofo-5', type: 'window', offset: 7.0, width: 2.0, height: 1.5, sillHeight: 0.75, isOpen: false },
        ],
      },
      {
        id: 'of-south',
        start: { x: 7, z: 5 },
        end: { x: -7, z: 5 },
        thickness: 0.24,
        openings: [
          { id: 'ofo-6', type: 'window', offset: 2.25, width: 2.0, height: 1.5, sillHeight: 0.75, isOpen: false },
          { id: 'ofo-7', type: 'double-door', offset: 7.0, width: 1.8, height: 2.25, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'ofo-8', type: 'window', offset: 11.75, width: 2.0, height: 1.5, sillHeight: 0.75, isOpen: false },
        ],
      },
      {
        id: 'of-west',
        start: { x: -7, z: 5 },
        end: { x: -7, z: -5 },
        thickness: 0.24,
        openings: [
          { id: 'ofo-9', type: 'window', offset: 2.5, width: 2.0, height: 1.5, sillHeight: 0.75, isOpen: false },
          { id: 'ofo-10', type: 'window', offset: 7.5, width: 2.0, height: 1.5, sillHeight: 0.75, isOpen: false },
        ],
      },
      {
        id: 'of-west-wing',
        start: { x: -2.5, z: -5 },
        end: { x: -2.5, z: 5 },
        thickness: 0.16,
        color: '#94a3b8',
        openings: [
          { id: 'ofo-11', type: 'sliding-door', offset: 2.5, width: 2.1, height: 2.2, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'ofo-12', type: 'door', offset: 7.5, width: 0.95, height: 2.15, sillHeight: 0, swingSide: -1, isOpen: false },
        ],
      },
      {
        id: 'of-west-split',
        start: { x: -7, z: 0 },
        end: { x: -2.5, z: 0 },
        thickness: 0.16,
        openings: [],
      },
      {
        id: 'of-east-wing',
        start: { x: 2.5, z: -5 },
        end: { x: 2.5, z: 1.0 },
        thickness: 0.16,
        openings: [
          { id: 'ofo-13', type: 'door', offset: 1.75, width: 1.0, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'ofo-14', type: 'door', offset: 4.75, width: 0.9, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'of-east-split-1',
        start: { x: 2.5, z: -1.5 },
        end: { x: 7, z: -1.5 },
        thickness: 0.16,
        openings: [],
      },
      {
        id: 'of-east-split-2',
        start: { x: 2.5, z: 1.0 },
        end: { x: 7, z: 1.0 },
        thickness: 0.16,
        openings: [],
      },
      {
        id: 'of-reception',
        start: { x: -1.2, z: 2.0 },
        end: { x: 1.2, z: 2.0 },
        thickness: 0.22,
        color: '#475569',
        openings: [],
      },
    ],
  },
  {
    id: 'workshop',
    name: 'Workshop & Lab',
    summary: '16 × 11 m industrial complex',
    wallHeight: 3.4,
    defaultThickness: 0.26,
    defaultWallColor: '#94a3b8',
    walls: [
      {
        id: 'wk-north',
        start: { x: -8, z: -5.5 },
        end: { x: 8, z: -5.5 },
        thickness: 0.26,
        openings: [
          { id: 'wko-1', type: 'window', offset: 3.2, width: 2.2, height: 1.25, sillHeight: 1.15, isOpen: false },
          { id: 'wko-2', type: 'window', offset: 9.8, width: 2.2, height: 1.25, sillHeight: 1.15, isOpen: false },
          { id: 'wko-3', type: 'window', offset: 13.6, width: 2.2, height: 1.25, sillHeight: 1.15, isOpen: false },
        ],
      },
      {
        id: 'wk-east',
        start: { x: 8, z: -5.5 },
        end: { x: 8, z: 5.5 },
        thickness: 0.26,
        openings: [
          { id: 'wko-4', type: 'window', offset: 3.0, width: 2.0, height: 1.25, sillHeight: 1.15, isOpen: false },
          { id: 'wko-5', type: 'window', offset: 8.0, width: 2.0, height: 1.25, sillHeight: 1.15, isOpen: false },
        ],
      },
      {
        id: 'wk-south',
        start: { x: 8, z: 5.5 },
        end: { x: -8, z: 5.5 },
        thickness: 0.26,
        openings: [
          { id: 'wko-6', type: 'double-door', offset: 4.5, width: 2.4, height: 2.6, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'wko-7', type: 'door', offset: 12.75, width: 1.05, height: 2.2, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
      {
        id: 'wk-west',
        start: { x: -8, z: 5.5 },
        end: { x: -8, z: -5.5 },
        thickness: 0.26,
        openings: [
          { id: 'wko-8', type: 'window', offset: 2.0, width: 1.8, height: 1.3, sillHeight: 0.9, isOpen: false },
          { id: 'wko-9', type: 'window', offset: 5.5, width: 1.8, height: 1.3, sillHeight: 0.9, isOpen: false },
          { id: 'wko-10', type: 'window', offset: 9.0, width: 1.8, height: 1.3, sillHeight: 0.9, isOpen: false },
        ],
      },
      {
        id: 'wk-main-div',
        start: { x: -1.5, z: -5.5 },
        end: { x: -1.5, z: 5.5 },
        thickness: 0.18,
        color: '#475569',
        openings: [
          { id: 'wko-11', type: 'door', offset: 2.0, width: 0.95, height: 2.2, sillHeight: 0, swingSide: -1, isOpen: false },
          { id: 'wko-12', type: 'double-door', offset: 5.5, width: 1.65, height: 2.25, sillHeight: 0, swingSide: 1, isOpen: false },
          { id: 'wko-13', type: 'door', offset: 9.0, width: 0.95, height: 2.2, sillHeight: 0, swingSide: -1, isOpen: false },
        ],
      },
      {
        id: 'wk-crib',
        start: { x: -8, z: -1.5 },
        end: { x: -1.5, z: -1.5 },
        thickness: 0.16,
        color: '#eae6df',
        openings: [],
      },
      {
        id: 'wk-office',
        start: { x: -8, z: 1.5 },
        end: { x: -1.5, z: 1.5 },
        thickness: 0.16,
        color: '#eae6df',
        openings: [
          { id: 'wko-14', type: 'sliding-door', offset: 3.25, width: 1.8, height: 2.15, sillHeight: 0, swingSide: 1, isOpen: false },
        ],
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    summary: 'Empty grid for custom walls',
    wallHeight: 2.8,
    defaultThickness: 0.2,
    defaultWallColor: '#eae6df',
    walls: [],
  },
];

export function cloneWalls(walls: WallSegment[]): WallSegment[] {
  return walls.map((w) => ({
    ...w,
    start: { ...w.start },
    end: { ...w.end },
    openings: w.openings.map((o) => ({ ...o })),
  }));
}

export function getTemplateById(id: TemplateId): PlanTemplate {
  return PLAN_TEMPLATES.find((t) => t.id === id) ?? PLAN_TEMPLATES[0];
}

export function findWalkthroughSpawn(walls: WallSegment[]): { position: Point2D; yaw: number } {
  if (walls.length === 0) {
    return { position: { x: 0, z: 3 }, yaw: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minZ = Math.min(minZ, w.start.z, w.end.z);
    maxZ = Math.max(maxZ, w.start.z, w.end.z);
  }

  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  const candidates: Point2D[] = [
    { x: cx + 1.5, z: cz + 0.5 },
    { x: cx - 1.5, z: cz + 0.5 },
    { x: cx + 0.6, z: cz + 1.4 },
    { x: cx + 0.6, z: cz - 1.4 },
    { x: cx, z: cz },
    { x: cx + 2.8, z: cz },
    { x: cx - 2.8, z: cz },
  ];

  for (const cand of candidates) {
    let blocked = false;
    for (const w of walls) {
      const dx = w.end.x - w.start.x;
      const dz = w.end.z - w.start.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const ux = dx / len;
      const uz = dz / len;
      const relX = cand.x - w.start.x;
      const relZ = cand.z - w.start.z;
      const along = relX * ux + relZ * uz;
      const perp = Math.abs(-relX * uz + relZ * ux);
      if (along >= -0.4 && along <= len + 0.4 && perp < w.thickness * 0.5 + 0.5) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      return { position: cand, yaw: 0 };
    }
  }

  return { position: { x: cx, z: maxZ + 2.2 }, yaw: 0 };
}
