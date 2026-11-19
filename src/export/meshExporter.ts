import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  computeFloorBounds,
  decomposeWallIntoBoxes,
  getWallEndpointExtensions,
  wallAngleRad,
} from '../geometry/wallDecomposition';
import type { ExportConfig, WallSegment } from '../types/plan';

export interface ExportMetrics {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  triangleCount: number;
  hasGeometry: boolean;
}

function buildPrintableGeometry(
  walls: WallSegment[],
  wallHeight: number,
  config: ExportConfig,
): THREE.BufferGeometry | null {
  if (walls.length === 0) return null;

  const geometries: THREE.BufferGeometry[] = [];
  const mmPerMeter = config.scale === 1 ? 1000 : 1000 / config.scale;
  const baseHeightMeters = config.includeBasePlate ? config.baseThicknessMm / mmPerMeter : 0;
  const exportWallHeight = Math.max(0.08, wallHeight);

  // Build structural wall sub-blocks (doors & windows remain true cutouts)
  for (const wall of walls) {
    const { startExtend, endExtend } = getWallEndpointExtensions(wall, walls);
    const { boxes } = decomposeWallIntoBoxes(wall, exportWallHeight, startExtend, endExtend, walls);
    const angle = wallAngleRad(wall);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    for (const box of boxes) {
      const geo = new THREE.BoxGeometry(box.sizeX, box.sizeY, box.sizeZ);
      const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
      geo.dispose();

      // Rotate around Y by -angle, then translate to world space
      const worldX = wall.start.x + box.localX * cosA;
      const worldZ = wall.start.z + box.localX * sinA;
      const worldY = baseHeightMeters + box.localY;

      const mat = new THREE.Matrix4();
      mat.makeRotationY(-angle);
      mat.setPosition(worldX, worldY, worldZ);
      nonIndexed.applyMatrix4(mat);

      geometries.push(nonIndexed);
    }
  }

  // Optional solid floor base plate underneath walls
  if (config.includeBasePlate && baseHeightMeters > 0) {
    const bounds = computeFloorBounds(walls, 0.35);
    const slab = new THREE.BoxGeometry(bounds.width, baseHeightMeters, bounds.depth);
    const nonIndexed = slab.index ? slab.toNonIndexed() : slab;
    slab.dispose();
    nonIndexed.translate(bounds.centerX, baseHeightMeters * 0.5, bounds.centerZ);
    geometries.push(nonIndexed);
  }

  if (geometries.length === 0) return null;

  const merged = mergeGeometries(geometries, false);
  for (const g of geometries) g.dispose();
  if (!merged) return null;

  // Convert from Three.js Y-up meters to 3D-Printer Z-up millimeters
  // Mapping: (x, y, z) -> (x * mm, -z * mm, y * mm) preserves right-handed winding
  const pos = merged.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * mmPerMeter;
    const y = pos.getY(i) * mmPerMeter;
    const z = pos.getZ(i) * mmPerMeter;
    pos.setXYZ(i, x, -z, y);
  }
  pos.needsUpdate = true;

  merged.computeBoundingBox();
  if (merged.boundingBox) {
    const center = new THREE.Vector3();
    merged.boundingBox.getCenter(center);
    const minZ = merged.boundingBox.min.z;
    merged.translate(-center.x, -center.y, -minZ);
  }

  merged.computeBoundingBox();
  merged.computeVertexNormals();
  return merged;
}

export function computeExportMetrics(
  walls: WallSegment[],
  wallHeight: number,
  config: ExportConfig,
): ExportMetrics {
  const geo = buildPrintableGeometry(walls, wallHeight, config);
  if (!geo || !geo.boundingBox) {
    geo?.dispose();
    return {
      widthMm: 0,
      depthMm: 0,
      heightMm: 0,
      triangleCount: 0,
      hasGeometry: false,
    };
  }

  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const triangleCount = Math.floor(geo.attributes.position.count / 3);
  geo.dispose();

  return {
    widthMm: Math.round(size.x * 10) / 10,
    depthMm: Math.round(size.y * 10) / 10,
    heightMm: Math.round(size.z * 10) / 10,
    triangleCount,
    hasGeometry: triangleCount > 0,
  };
}

export function exportFloorPlanModel(
  walls: WallSegment[],
  wallHeight: number,
  config: ExportConfig,
): { blob: Blob; filename: string } | null {
  const geo = buildPrintableGeometry(walls, wallHeight, config);
  if (!geo) return null;

  const scaleLabel = config.scale === 1 ? '1-1' : `1-${config.scale}`;
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (config.format === 'stl') {
    const buffer = serializeBinarySTL(geo);
    geo.dispose();
    return {
      blob: new Blob([buffer], { type: 'application/octet-stream' }),
      filename: `homedraft-cad-house-${scaleLabel}-${dateStamp}.stl`,
    };
  }

  const objText = serializeOBJ(geo);
  geo.dispose();
  return {
    blob: new Blob([objText], { type: 'text/plain;charset=utf-8' }),
    filename: `homedraft-cad-house-${scaleLabel}-${dateStamp}.obj`,
  };
}

function serializeBinarySTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const triCount = Math.floor(pos.count / 3);
  const bufferLength = 84 + triCount * 50;
  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);

  // 80-byte ASCII header
  const header = 'HomeDraft-CAD Binary STL (Units: mm, Z-up)';
  for (let i = 0; i < Math.min(header.length, 80); i++) {
    view.setUint8(i, header.charCodeAt(i));
  }

  view.setUint32(80, triCount, true);

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const i3 = i * 3;
    a.fromBufferAttribute(pos, i3);
    b.fromBufferAttribute(pos, i3 + 1);
    c.fromBufferAttribute(pos, i3 + 2);

    cb.subVectors(c, b);
    ab.subVectors(a, b);
    cb.cross(ab).normalize();

    // Normal
    view.setFloat32(offset, cb.x, true);
    view.setFloat32(offset + 4, cb.y, true);
    view.setFloat32(offset + 8, cb.z, true);

    // Vertex A
    view.setFloat32(offset + 12, a.x, true);
    view.setFloat32(offset + 16, a.y, true);
    view.setFloat32(offset + 20, a.z, true);

    // Vertex B
    view.setFloat32(offset + 24, b.x, true);
    view.setFloat32(offset + 28, b.y, true);
    view.setFloat32(offset + 32, b.z, true);

    // Vertex C
    view.setFloat32(offset + 36, c.x, true);
    view.setFloat32(offset + 40, c.y, true);
    view.setFloat32(offset + 44, c.z, true);

    // Attribute byte count
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }

  return buffer;
}

function serializeOBJ(geometry: THREE.BufferGeometry): string {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const triCount = Math.floor(pos.count / 3);
  const lines: string[] = [
    '# HomeDraft-CAD OBJ Export (Units: mm, Z-up)',
    'o HousePlan',
  ];

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    lines.push(
      `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}`,
    );
  }

  for (let i = 0; i < triCount; i++) {
    const i3 = i * 3;
    a.fromBufferAttribute(pos, i3);
    b.fromBufferAttribute(pos, i3 + 1);
    c.fromBufferAttribute(pos, i3 + 2);

    cb.subVectors(c, b);
    ab.subVectors(a, b);
    cb.cross(ab).normalize();
    lines.push(`vn ${cb.x.toFixed(5)} ${cb.y.toFixed(5)} ${cb.z.toFixed(5)}`);
  }

  for (let i = 0; i < triCount; i++) {
    const v1 = i * 3 + 1;
    const v2 = i * 3 + 2;
    const v3 = i * 3 + 3;
    const n = i + 1;
    lines.push(`f ${v1}//${n} ${v2}//${n} ${v3}//${n}`);
  }

  return lines.join('\n');
}
