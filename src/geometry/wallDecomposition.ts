import {
  FURNITURE_KIND_INFO,
  isDoorOpening,
  JUNCTION_KIND_INFO,
  PLUMBING_FIXTURE_INFO,
  PLUMBING_TYPE_INFO,
  SECURITY_DEVICE_INFO,
  WIRE_BREAKER_PRESETS,
  WIRE_CIRCUIT_INFO,
  type CableSpec,
  type ClosedRoomInfo,
  type ElectricalJunction,
  type ElectricalWire,
  type FurnitureItem,
  type PlumbingFixture,
  type PlumbingPipe,
  type PlumbingPipeSpec,
  type PlumbingPipeType,
  type Point2D,
  type SecurityDevice,
  type SecurityDeviceKind,
  type SelectionTarget,
  type SnapMode,
  type SnapResult,
  type WallOpening,
  type WallSegment,
  type WireCircuitType,
  type WireMountRef,
  type WirePoint,
} from '../types/plan';

export interface DecomposedBox {
  /** Center along wall length from wall.start (meters) */
  localX: number;
  /** Center vertical height (meters) */
  localY: number;
  /** Width along wall (meters) */
  sizeX: number;
  /** Height (meters) */
  sizeY: number;
  /** Thickness across wall (meters) */
  sizeZ: number;
}

export interface OpeningPlacementInfo {
  opening: WallOpening;
  clampedOffset: number;
  clampedWidth: number;
}

export interface WallProjection {
  offset: number;
  distance: number;
  point: Point2D;
}

export interface InnerClearSpan {
  startS: number;
  endS: number;
  clearLength: number;
  startInset: number;
  endInset: number;
}

export interface WallOuterDimSpan {
  startS: number;
  endS: number;
  outerLength: number;
  outSide: 1 | -1;
}

export interface WallOuterDimensionsResult {
  /** Overall exposed exterior segment(s) along this wall (may be empty for pure interior partitions) */
  overallSpans: WallOuterDimSpan[];
  /** Individual room/bay exterior sub-spans when an interior T-divider splits a continuous outer wall */
  baySpans: WallOuterDimSpan[];
  /** Combined extend adjustment (start + end) when wall is single continuous exterior run */
  startExtend: number;
  endExtend: number;
  outerLength: number;
}

export interface WireSegment3D {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  mountedOnWall: boolean;
}

export function wallLength(wall: WallSegment): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
}

export function wallAngleRad(wall: WallSegment): number {
  return Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function getGridStepForSnapMode(mode: SnapMode): number {
  switch (mode) {
    case 'grid':
      return 0.25;
    case 'fine':
      return 0.05;
    case 'free':
      return 0;
  }
}

/**
 * Resolves effective snap behavior when Shift toggles the opposite of current SnapMode:
 * - When grid/fine snap is active, Shift temporarily switches to Free (unconstrained).
 * - When Free mode is active, Shift temporarily snaps to the 0.25 m Grid.
 */
export function resolveEffectiveSnapMode(mode: SnapMode, shiftKey: boolean): SnapMode {
  if (!shiftKey) return mode;
  return mode === 'free' ? 'grid' : 'free';
}

export interface ExtraSnapTarget {
  id?: string;
  snapPos: Point2D;
  hitPositions?: Point2D[];
}

export interface WireSnapTarget {
  wireId: string;
  label: string;
  points: Point2D[];
  renderedSegments?: Array<{ start: Point2D; end: Point2D }>;
}

function projectPointOntoSegment2D(
  point: Point2D,
  a: Point2D,
  b: Point2D,
): { offset: number; len: number; t: number; distance: number; point: Point2D } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) {
    return { offset: 0, len: 0, t: 0, distance: distance2D(point, a), point: { ...a } };
  }
  const ux = dx / len;
  const uz = dz / len;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * ux + (point.z - a.z) * uz) / len));
  const closest = {
    x: a.x + dx * t,
    z: a.z + dz * t,
  };
  return {
    offset: t * len,
    len,
    t,
    distance: distance2D(point, closest),
    point: closest,
  };
}

export function snapPointToGridAndEndpoints(
  raw: Point2D,
  anchor: Point2D | null,
  walls: WallSegment[],
  options: {
    snapMode?: SnapMode;
    gridStep?: number;
    endpointRadius?: number;
    shiftKey?: boolean;
    extraSnapPoints?: Point2D[];
    extraSnapTargets?: ExtraSnapTarget[];
    wireSnapTargets?: WireSnapTarget[];
  } = {},
): SnapResult {
  const baseSnapMode = options.snapMode ?? 'grid';
  const shiftKey = options.shiftKey ?? false;
  const effectiveSnap = resolveEffectiveSnapMode(baseSnapMode, shiftKey);
  const freeMode = effectiveSnap === 'free';
  const gridStep = options.gridStep ?? getGridStepForSnapMode(effectiveSnap);
  const endpointRadius = options.endpointRadius ?? 0.28;
  const guides: Array<{ from: Point2D; to: Point2D }> = [];

  // 0a. Magnetic snap to rich wall-mounted targets (checking both wall centerline & visible icon face)
  if (options.extraSnapTargets && options.extraSnapTargets.length > 0) {
    let bestTarget: ExtraSnapTarget | null = null;
    let bestTargetDist = Math.max(endpointRadius, 0.36);
    for (const target of options.extraSnapTargets) {
      const candidates = [target.snapPos, ...(target.hitPositions ?? [])];
      for (const hitPt of candidates) {
        const d = distance2D(raw, hitPt);
        if (d < bestTargetDist) {
          bestTargetDist = d;
          bestTarget = target;
        }
      }
    }
    if (bestTarget) {
      const angleDeg = anchor
        ? Math.round(
            (Math.atan2(bestTarget.snapPos.z - anchor.z, bestTarget.snapPos.x - anchor.x) * 180) /
              Math.PI,
          )
        : null;
      return {
        point: { x: bestTarget.snapPos.x, z: bestTarget.snapPos.z },
        snapKind: 'endpoint',
        angleDeg,
        guides,
        matchedTargetId: bestTarget.id,
      };
    }
  }

  // 0b. Magnetic snap to electrical junctions / outlet points when provided as plain points
  if (options.extraSnapPoints && options.extraSnapPoints.length > 0) {
    let bestExtra: Point2D | null = null;
    let bestExtraDist = Math.max(endpointRadius, 0.34);
    for (const pt of options.extraSnapPoints) {
      const d = distance2D(raw, pt);
      if (d < bestExtraDist) {
        bestExtraDist = d;
        bestExtra = pt;
      }
    }
    if (bestExtra) {
      const angleDeg = anchor
        ? Math.round((Math.atan2(bestExtra.z - anchor.z, bestExtra.x - anchor.x) * 180) / Math.PI)
        : null;
      return {
        point: { x: bestExtra.x, z: bestExtra.z },
        snapKind: 'endpoint',
        angleDeg,
        guides,
      };
    }
  }

  // 0c. Magnetic snap to existing wire endpoints / vertices (same UX as wall endpoint snapping)
  if (options.wireSnapTargets && options.wireSnapTargets.length > 0) {
    let bestWirePt: { wireId: string; point: Point2D; dist: number } | null = null;
    const wireEndpointTol = Math.max(endpointRadius, 0.3);

    for (const wt of options.wireSnapTargets) {
      for (const pt of wt.points) {
        const d = distance2D(raw, pt);
        if (d < wireEndpointTol && (!bestWirePt || d < bestWirePt.dist)) {
          bestWirePt = { wireId: wt.wireId, point: pt, dist: d };
        }
      }
      if (wt.renderedSegments) {
        for (const rSeg of wt.renderedSegments) {
          for (const endPair of [
            { r: rSeg.start, fallback: wt.points[0] },
            { r: rSeg.end, fallback: wt.points[wt.points.length - 1] },
          ]) {
            const d = distance2D(raw, endPair.r);
            if (d < wireEndpointTol * 0.85 && (!bestWirePt || d < bestWirePt.dist)) {
              let nearestLogical = endPair.fallback ?? endPair.r;
              let minLogD = Infinity;
              for (const lp of wt.points) {
                const ld = distance2D(endPair.r, lp);
                if (ld < minLogD) {
                  minLogD = ld;
                  nearestLogical = lp;
                }
              }
              bestWirePt = { wireId: wt.wireId, point: nearestLogical, dist: d };
            }
          }
        }
      }
    }

    if (bestWirePt) {
      const angleDeg = anchor
        ? Math.round(
            (Math.atan2(bestWirePt.point.z - anchor.z, bestWirePt.point.x - anchor.x) * 180) /
              Math.PI,
          )
        : null;
      return {
        point: {
          x: Number(bestWirePt.point.x.toFixed(3)),
          z: Number(bestWirePt.point.z.toFixed(3)),
        },
        snapKind: 'endpoint',
        angleDeg,
        guides,
        matchedWireId: bestWirePt.wireId,
      };
    }

    // 0d. Wire segment T-junction snap (hovering onto a passing wire's line taps into it)
    let bestWireSeg: {
      wireId: string;
      point: Point2D;
      dist: number;
      guide: { from: Point2D; to: Point2D } | null;
    } | null = null;
    const wireSegTol = 0.19;

    for (const wt of options.wireSnapTargets) {
      const segSource =
        wt.renderedSegments && wt.renderedSegments.length > 0
          ? wt.renderedSegments
          : wt.points.slice(0, -1).map((p, idx) => ({ start: p, end: wt.points[idx + 1] }));

      for (let sIdx = 0; sIdx < segSource.length; sIdx++) {
        const seg = segSource[sIdx];
        const proj = projectPointOntoSegment2D(raw, seg.start, seg.end);
        if (proj.len < 0.08 || proj.distance >= wireSegTol) continue;

        let snappedPt = {
          x: Number(proj.point.x.toFixed(3)),
          z: Number(proj.point.z.toFixed(3)),
        };
        let segGuide: { from: Point2D; to: Point2D } | null = null;

        if (anchor && distance2D(anchor, proj.point) > 0.2) {
          const anchorProj = projectPointOntoSegment2D(anchor, seg.start, seg.end);
          if (
            anchorProj.distance > 0.16 &&
            anchorProj.t >= 0.02 &&
            anchorProj.t <= 0.98 &&
            Math.abs(anchorProj.offset - proj.offset) < 0.32
          ) {
            snappedPt = {
              x: Number(anchorProj.point.x.toFixed(3)),
              z: Number(anchorProj.point.z.toFixed(3)),
            };
            segGuide = { from: anchor, to: snappedPt };
          }
        }

        // Map rendered point back to host wall centerline if this wire runs on a wall
        let bestWallProj: Point2D | null = null;
        let bestWallD = 0.28;
        for (const w of walls) {
          const wp = projectPointOntoWall(snappedPt, w);
          if (wp.distance < bestWallD) {
            bestWallD = wp.distance;
            bestWallProj = {
              x: Number(wp.point.x.toFixed(3)),
              z: Number(wp.point.z.toFixed(3)),
            };
          }
        }
        const finalPt = bestWallProj ?? snappedPt;

        if (!bestWireSeg || proj.distance < bestWireSeg.dist) {
          bestWireSeg = {
            wireId: wt.wireId,
            point: finalPt,
            dist: proj.distance,
            guide: segGuide ? { from: anchor!, to: finalPt } : null,
          };
        }
      }
    }

    if (bestWireSeg) {
      if (bestWireSeg.guide) guides.push(bestWireSeg.guide);
      const angleDeg = anchor
        ? Math.round(
            (Math.atan2(bestWireSeg.point.z - anchor.z, bestWireSeg.point.x - anchor.x) * 180) /
              Math.PI,
          )
        : null;
      return {
        point: bestWireSeg.point,
        snapKind: 'wall',
        angleDeg,
        guides,
        matchedWireId: bestWireSeg.wireId,
      };
    }
  }

  // 1. Magnetic snap to existing wall endpoints
  let bestEndpoint: Point2D | null = null;
  let bestDist = endpointRadius;

  for (const w of walls) {
    for (const pt of [w.start, w.end]) {
      const d = distance2D(raw, pt);
      if (d < bestDist) {
        bestDist = d;
        bestEndpoint = pt;
      }
    }
  }

  if (bestEndpoint) {
    const angleDeg = anchor
      ? Math.round((Math.atan2(bestEndpoint.z - anchor.z, bestEndpoint.x - anchor.x) * 180) / Math.PI)
      : null;
    return {
      point: { x: bestEndpoint.x, z: bestEndpoint.z },
      snapKind: 'endpoint',
      angleDeg,
      guides,
    };
  }

  // 2. Magnetic T-junction snap onto existing wall centerline segments.
  // Reaches slightly beyond half wall thickness so clicking near an inner face snaps cleanly to centerline.
  // When drafting from an anchor, prefers an exact perpendicular T-junction if aligned within 0.36 m.
  let bestWallPoint: Point2D | null = null;
  let bestWallDist = Infinity;
  let bestWallAnchorGuide: { from: Point2D; to: Point2D } | null = null;

  for (const w of walls) {
    const len = wallLength(w);
    if (len < 0.1) continue;
    const wallReach = Math.max(0.28, w.thickness * 0.5 + 0.16);
    const proj = projectPointOntoWall(raw, w);
    if (proj.offset >= 0.02 && proj.offset <= len - 0.02 && proj.distance < wallReach) {
      if (proj.distance < bestWallDist) {
        bestWallDist = proj.distance;
        const ux = (w.end.x - w.start.x) / len;
        const uz = (w.end.z - w.start.z) / len;

        let snappedPt: Point2D | null = null;
        if (anchor && distance2D(anchor, proj.point) > 0.25) {
          const anchorProj = projectPointOntoWall(anchor, w);
          if (
            anchorProj.distance > 0.2 &&
            anchorProj.offset >= 0.02 &&
            anchorProj.offset <= len - 0.02 &&
            Math.abs(anchorProj.offset - proj.offset) < 0.36
          ) {
            snappedPt = {
              x: Number((w.start.x + ux * anchorProj.offset).toFixed(3)),
              z: Number((w.start.z + uz * anchorProj.offset).toFixed(3)),
            };
            bestWallAnchorGuide = { from: anchor, to: snappedPt };
          }
        }

        if (!snappedPt) {
          if (gridStep > 0) {
            const qOffset = Math.max(
              0.04,
              Math.min(len - 0.04, Math.round(proj.offset / gridStep) * gridStep),
            );
            snappedPt = {
              x: Number((w.start.x + ux * qOffset).toFixed(3)),
              z: Number((w.start.z + uz * qOffset).toFixed(3)),
            };
          } else {
            snappedPt = {
              x: Number(proj.point.x.toFixed(3)),
              z: Number(proj.point.z.toFixed(3)),
            };
          }
          bestWallAnchorGuide = null;
        }

        bestWallPoint = snappedPt;
      }
    }
  }

  if (bestWallPoint) {
    if (bestWallAnchorGuide) {
      guides.push(bestWallAnchorGuide);
    }
    const angleDeg = anchor
      ? Math.round((Math.atan2(bestWallPoint.z - anchor.z, bestWallPoint.x - anchor.x) * 180) / Math.PI)
      : null;
    return {
      point: bestWallPoint,
      snapKind: 'wall',
      angleDeg,
      guides,
    };
  }

  // If Free mode (either chosen in TopBar or inverted via Shift when default is Grid), return clean unrounded point
  if (freeMode) {
    const pt = { x: Number(raw.x.toFixed(3)), z: Number(raw.z.toFixed(3)) };
    const angleDeg = anchor
      ? Math.round((Math.atan2(pt.z - anchor.z, pt.x - anchor.x) * 180) / Math.PI)
      : null;
    return { point: pt, snapKind: 'free', angleDeg, guides };
  }

  // Collect candidate X / Z alignment values from existing wall endpoints
  const alignTol = 0.2;
  const findNearestAxisAlign = (coord: number, axis: 'x' | 'z'): { val: number; refPt: Point2D } | null => {
    let best: { val: number; refPt: Point2D } | null = null;
    let bestDiff = alignTol;
    for (const w of walls) {
      for (const pt of [w.start, w.end]) {
        const diff = Math.abs(pt[axis] - coord);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = { val: pt[axis], refPt: pt };
        }
      }
    }
    return best;
  };

  // 3. Angle snap (15-degree increments) + orthogonal alignment guides when drawing from an anchor
  if (anchor) {
    const dx = raw.x - anchor.x;
    const dz = raw.z - anchor.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.12) {
      const rawAngle = Math.atan2(dz, dx);
      const snapStepRad = (15 * Math.PI) / 180;
      const snappedAngle = Math.round(rawAngle / snapStepRad) * snapStepRad;
      const cosA = Math.cos(snappedAngle);
      const sinA = Math.sin(snappedAngle);
      const angleDeg = Math.round((snappedAngle * 180) / Math.PI);

      if (Math.abs(sinA) < 0.08) {
        const alignX = findNearestAxisAlign(raw.x, 'x');
        if (alignX) {
          const pt = { x: alignX.val, z: Number(anchor.z.toFixed(3)) };
          guides.push({ from: alignX.refPt, to: pt });
          return { point: pt, snapKind: 'align', angleDeg, guides };
        }
      }

      if (Math.abs(cosA) < 0.08) {
        const alignZ = findNearestAxisAlign(raw.z, 'z');
        if (alignZ) {
          const pt = { x: Number(anchor.x.toFixed(3)), z: alignZ.val };
          guides.push({ from: alignZ.refPt, to: pt });
          return { point: pt, snapKind: 'align', angleDeg, guides };
        }
      }

      const step = gridStep > 0 ? gridStep : 0.25;
      const snappedLen = Math.max(step, Math.round(dist / step) * step);
      const px = Number((anchor.x + cosA * snappedLen).toFixed(3));
      const pz = Number((anchor.z + sinA * snappedLen).toFixed(3));
      return {
        point: { x: px, z: pz },
        snapKind: 'angle',
        angleDeg,
        guides,
      };
    }
  }

  // 4. Grid + axis alignment snap
  const alignX = findNearestAxisAlign(raw.x, 'x');
  const alignZ = findNearestAxisAlign(raw.z, 'z');
  const step = gridStep > 0 ? gridStep : 0.25;
  const roundCoord = (v: number) => Math.round(v / step) * step;

  const finalX = alignX ? alignX.val : roundCoord(raw.x);
  const finalZ = alignZ ? alignZ.val : roundCoord(raw.z);
  const pt = { x: finalX, z: finalZ };

  if (alignX) guides.push({ from: alignX.refPt, to: pt });
  if (alignZ) guides.push({ from: alignZ.refPt, to: pt });

  return {
    point: pt,
    snapKind: alignX || alignZ ? 'align' : 'grid',
    angleDeg: anchor
      ? Math.round((Math.atan2(pt.z - anchor.z, pt.x - anchor.x) * 180) / Math.PI)
      : null,
    guides,
  };
}

export function projectPointOntoWall(point: Point2D, wall: WallSegment): WallProjection {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) {
    return { offset: 0, distance: distance2D(point, wall.start), point: { ...wall.start } };
  }
  const ux = dx / len;
  const uz = dz / len;
  const relX = point.x - wall.start.x;
  const relZ = point.z - wall.start.z;
  const t = Math.max(0, Math.min(len, relX * ux + relZ * uz));
  const closest = { x: wall.start.x + ux * t, z: wall.start.z + uz * t };
  return {
    offset: t,
    distance: distance2D(point, closest),
    point: closest,
  };
}

function computeTJunctionEmbed(
  endpoint: Point2D,
  dirAwayX: number,
  dirAwayZ: number,
  wallThick: number,
  host: WallSegment,
): number {
  const oLen = wallLength(host);
  if (oLen < 0.05) return 0;
  const oux = (host.end.x - host.start.x) / oLen;
  const ouz = (host.end.z - host.start.z) / oLen;
  const onx = -ouz;
  const onz = oux;

  const p = projectPointOntoWall(endpoint, host);
  const maxApproachDist = Math.max(0.08, host.thickness * 0.5 + 0.08);
  if (
    p.distance > maxApproachDist ||
    p.offset < -host.thickness * 0.35 ||
    p.offset > oLen + host.thickness * 0.35
  ) {
    return 0;
  }

  // Signed distance of endpoint from host centerline along host normal
  const d0 = (endpoint.x - host.start.x) * onx + (endpoint.z - host.start.z) * onz;
  // Component of outward extension vector (-u at start, +u at end) along host normal
  const extDotNormal = dirAwayX * onx + dirAwayZ * onz;
  const absSin = Math.abs(extDotNormal);
  if (absSin < 0.25) return 0;

  const cosProj = Math.abs(dirAwayX * oux + dirAwayZ * ouz);
  const halfCapAlongNormal = wallThick * 0.5 * cosProj;
  const hostSafeHalf = Math.max(0.02, host.thickness * 0.46 - halfCapAlongNormal);
  const embedPastCenter = Math.min(hostSafeHalf, Math.min(host.thickness * 0.36, wallThick * 0.4));

  // If moving along extension direction moves TOWARD host centerline (opposite sign to d0)
  if (d0 * extDotNormal <= 1e-4) {
    const distToCenter = Math.abs(d0) / Math.max(0.45, absSin);
    const maxSafeExtend = distToCenter + hostSafeHalf / Math.max(0.45, absSin);
    return Math.min(maxSafeExtend, distToCenter + embedPastCenter / Math.max(0.45, absSin));
  }

  // Endpoint slightly past centerline on far half: embed without poking out far face
  const remainInside = Math.max(0, hostSafeHalf - Math.abs(d0));
  return Math.min(remainInside / Math.max(0.45, absSin), embedPastCenter / Math.max(0.45, absSin));
}

export function getWallEndpointExtensions(
  wall: WallSegment,
  allWalls: WallSegment[],
): { startExtend: number; endExtend: number } {
  const tol = 0.055;
  let startExtend = 0;
  let endExtend = 0;

  const len = wallLength(wall);
  const wux = len > 0.05 ? (wall.end.x - wall.start.x) / len : 1;
  const wuz = len > 0.05 ? (wall.end.z - wall.start.z) / len : 0;

  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    const collinear = Math.abs(wux * oux + wuz * ouz) > 0.96;
    const sinTheta = Math.max(0.55, Math.abs(wux * ouz - wuz * oux));

    if (distance2D(wall.start, other.start) < tol || distance2D(wall.start, other.end) < tol) {
      if (!collinear) {
        const cornerNeed = Math.min(
          Math.max(wall.thickness, other.thickness) * 0.85,
          (other.thickness * 0.5) / sinTheta,
        );
        startExtend = Math.max(startExtend, wall.thickness * 0.5, cornerNeed);
      }
    } else if (!collinear) {
      const embed = computeTJunctionEmbed(wall.start, -wux, -wuz, wall.thickness, other);
      if (embed > 0) {
        startExtend = Math.max(startExtend, embed);
      }
    }

    if (distance2D(wall.end, other.start) < tol || distance2D(wall.end, other.end) < tol) {
      if (!collinear) {
        const cornerNeed = Math.min(
          Math.max(wall.thickness, other.thickness) * 0.85,
          (other.thickness * 0.5) / sinTheta,
        );
        endExtend = Math.max(endExtend, wall.thickness * 0.5, cornerNeed);
      }
    } else if (!collinear) {
      const embed = computeTJunctionEmbed(wall.end, wux, wuz, wall.thickness, other);
      if (embed > 0) {
        endExtend = Math.max(endExtend, embed);
      }
    }
  }

  return { startExtend, endExtend };
}

function buildEnclosureSegments(allWalls: WallSegment[]) {
  return allWalls
    .filter((w) => wallLength(w) >= 0.05)
    .map((w) => {
      const wLen = wallLength(w);
      const { startExtend, endExtend } = getWallEndpointExtensions(w, allWalls);
      const wux = (w.end.x - w.start.x) / wLen;
      const wuz = (w.end.z - w.start.z) / wLen;
      const padStart = startExtend + 0.05;
      const padEnd = endExtend + 0.05;
      return {
        id: w.id,
        ax: w.start.x - wux * padStart,
        az: w.start.z - wuz * padStart,
        bx: w.end.x + wux * padEnd,
        bz: w.end.z + wuz * padEnd,
      };
    });
}

function resolveEndpointOuterAdjustment(
  endpoint: Point2D,
  outwardAxisX: number,
  outwardAxisZ: number,
  outSideNormX: number,
  outSideNormZ: number,
  wall: WallSegment,
  allWalls: WallSegment[],
  enclosureSegs: Array<{ id: string; ax: number; az: number; bx: number; bz: number }>,
  otherWallsAtStation: WallSegment[],
): number {
  const len = wallLength(wall);
  const wux = (wall.end.x - wall.start.x) / Math.max(0.05, len);
  const wuz = (wall.end.z - wall.start.z) / Math.max(0.05, len);

  // Check if any collinear wall continues straight past this endpoint
  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(wux * oux + wuz * ouz) <= 0.96) continue;
    const proj = projectPointOntoWall(endpoint, other);
    if (proj.distance < 0.06) {
      // Collinear continuation exists here; only trim if a perpendicular exterior wing projects into outSide
      break;
    }
  }

  let bestHalfThick = 0;
  let crossesIntoOutSide = false;
  let crossesIntoInSide = false;
  let bestOtherHalf = 0;

  for (const other of otherWallsAtStation) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(wux * oux + wuz * ouz) > 0.96) continue;

    const sinTheta = Math.max(0.55, Math.abs(wux * ouz - wuz * oux));
    const otherHalf = Math.min(
      Math.max(wall.thickness, other.thickness) * 0.85,
      (other.thickness * 0.5) / sinTheta,
    );
    bestHalfThick = Math.max(bestHalfThick, wall.thickness * 0.5, otherHalf);
    bestOtherHalf = Math.max(bestOtherHalf, otherHalf);

    const proj = projectPointOntoWall(endpoint, other);
    if (proj.offset > 0.08) crossesIntoOutSide ||= ((other.start.x - endpoint.x) * outSideNormX + (other.start.z - endpoint.z) * outSideNormZ) > 0.1 || ((other.end.x - endpoint.x) * outSideNormX + (other.end.z - endpoint.z) * outSideNormZ) > 0.1;
    // Check both halves of `other` around `endpoint`
    const sExt = other.start;
    const eExt = other.end;
    const dStartOut = (sExt.x - endpoint.x) * outSideNormX + (sExt.z - endpoint.z) * outSideNormZ;
    const dEndOut = (eExt.x - endpoint.x) * outSideNormX + (eExt.z - endpoint.z) * outSideNormZ;
    if (dStartOut > 0.12 || dEndOut > 0.12) crossesIntoOutSide = true;
    if (dStartOut < -0.12 || dEndOut < -0.12) crossesIntoInSide = true;
  }

  if (otherWallsAtStation.length === 0) return 0;

  // Test past the endpoint along the outward tangent & exterior face:
  // If that corner zone lies inside another enclosed room, this is a re-entrant concave T/L corner!
  if (allWalls.length >= 3) {
    const probePast = bestOtherHalf + 0.18;
    const probeOut = wall.thickness * 0.5 + 0.2;
    const pTest = {
      x: endpoint.x + outwardAxisX * probePast + outSideNormX * probeOut,
      z: endpoint.z + outwardAxisZ * probePast + outSideNormZ * probeOut,
    };
    if (isPointEnclosedByOtherWalls(pTest, wall.id, enclosureSegs)) {
      return -Math.max(wall.thickness * 0.5, bestOtherHalf);
    }
  }

  if (crossesIntoOutSide && !crossesIntoInSide) {
    return -Math.max(wall.thickness * 0.5, bestOtherHalf);
  }

  // Check if collinear wall continues past endpoint when not concave
  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(wux * oux + wuz * ouz) <= 0.96) continue;
    if (distance2D(endpoint, other.start) < 0.055 || distance2D(endpoint, other.end) < 0.055) {
      return 0;
    }
  }

  return bestHalfThick;
}

/**
 * Computes accurate exterior dimensions along a wall, properly handling T-junctions,
 * L-shaped re-entrant corners (trimming to visible outer face rather than adding double thickness),
 * partial interior/exterior T-walls, and multi-room perimeter bay breakdowns.
 */
export function computeWallOuterDimensions(
  wall: WallSegment,
  allWalls: WallSegment[],
): WallOuterDimensionsResult {
  const len = wallLength(wall);
  if (len < 0.05) {
    return {
      overallSpans: [],
      baySpans: [],
      startExtend: 0,
      endExtend: 0,
      outerLength: len,
    };
  }

  const wux = (wall.end.x - wall.start.x) / len;
  const wuz = (wall.end.z - wall.start.z) / len;
  const nx = -wuz;
  const nz = wux;
  const enclosureSegs = buildEnclosureSegments(allWalls);

  interface StationEntry {
    s: number;
    walls: WallSegment[];
  }
  const rawStations: Array<{ s: number; wall: WallSegment }> = [];

  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(wux * oux + wuz * ouz) > 0.94) continue;

    // 1. Endpoint attachment on `wall`
    for (const pt of [other.start, other.end]) {
      const proj = projectPointOntoSegment2D(pt, wall.start, wall.end);
      if (proj.distance <= Math.max(0.08, wall.thickness * 0.5 + 0.06)) {
        rawStations.push({ s: proj.offset, wall: other });
      }
    }

    // 2. `wall` endpoint T-joining onto `other`
    for (const [endPt, sVal] of [
      [wall.start, 0],
      [wall.end, len],
    ] as const) {
      const projOther = projectPointOntoSegment2D(endPt, other.start, other.end);
      if (projOther.distance <= Math.max(0.08, other.thickness * 0.5 + 0.06)) {
        rawStations.push({ s: sVal, wall: other });
      }
    }

    // 3. Mid-span crossing intersection between wall and other
    const denom = wux * ouz - wuz * oux;
    if (Math.abs(denom) > 0.08) {
      const qpx = other.start.x - wall.start.x;
      const qpz = other.start.z - wall.start.z;
      const tWall = (qpx * ouz - qpz * oux) / denom;
      const tOther = (qpx * wuz - qpz * wux) / denom;
      if (tWall >= -0.06 && tWall <= len + 0.06 && tOther >= -0.06 && tOther <= oLen + 0.06) {
        rawStations.push({ s: Math.max(0, Math.min(len, tWall)), wall: other });
      }
    }
  }

  rawStations.sort((a, b) => a.s - b.s);
  const groupedStations: StationEntry[] = [];
  for (const item of rawStations) {
    const last = groupedStations[groupedStations.length - 1];
    if (last && Math.abs(item.s - last.s) < 0.07) {
      if (!last.walls.some((w) => w.id === item.wall.id)) {
        last.walls.push(item.wall);
      }
    } else {
      groupedStations.push({ s: item.s, walls: [item.wall] });
    }
  }

  // Ensure endpoints 0 and len exist as boundary stations
  if (groupedStations.length === 0 || groupedStations[0].s > 0.07) {
    groupedStations.unshift({ s: 0, walls: [] });
  } else {
    groupedStations[0].s = 0;
  }
  const tail = groupedStations[groupedStations.length - 1];
  if (len - tail.s > 0.07) {
    groupedStations.push({ s: len, walls: [] });
  } else {
    tail.s = len;
  }

  const probeDist = wall.thickness * 0.5 + 0.18;
  const fallbackOutSide = getWallOutwardSide(wall, allWalls);

  interface RawSubSpan {
    aIdx: number;
    bIdx: number;
    aS: number;
    bS: number;
    outSide: 1 | -1;
    exposed: boolean;
  }
  const subSpans: RawSubSpan[] = [];

  for (let i = 0; i < groupedStations.length - 1; i++) {
    const aS = groupedStations[i].s;
    const bS = groupedStations[i + 1].s;
    if (bS - aS < 0.18) continue;

    const midS = (aS + bS) * 0.5;
    const cx = wall.start.x + wux * midS;
    const cz = wall.start.z + wuz * midS;
    const pPlus = { x: cx + nx * probeDist, z: cz + nz * probeDist };
    const pMinus = { x: cx - nx * probeDist, z: cz - nz * probeDist };

    if (allWalls.length < 3) {
      subSpans.push({ aIdx: i, bIdx: i + 1, aS, bS, outSide: fallbackOutSide, exposed: true });
      continue;
    }

    const encPlus = isPointEnclosedByOtherWalls(pPlus, wall.id, enclosureSegs);
    const encMinus = isPointEnclosedByOtherWalls(pMinus, wall.id, enclosureSegs);

    if (encPlus && encMinus) {
      subSpans.push({ aIdx: i, bIdx: i + 1, aS, bS, outSide: fallbackOutSide, exposed: false });
    } else if (!encPlus && !encMinus) {
      subSpans.push({ aIdx: i, bIdx: i + 1, aS, bS, outSide: fallbackOutSide, exposed: true });
    } else {
      const side: 1 | -1 = encPlus ? -1 : 1;
      subSpans.push({ aIdx: i, bIdx: i + 1, aS, bS, outSide: side, exposed: true });
    }
  }

  // Group contiguous exposed sub-spans that face the same exterior side
  const overallSpans: WallOuterDimSpan[] = [];
  const baySpans: WallOuterDimSpan[] = [];

  let i = 0;
  while (i < subSpans.length) {
    if (!subSpans[i].exposed) {
      i++;
      continue;
    }
    const groupStartIdx = i;
    const groupOutSide = subSpans[i].outSide;
    while (
      i + 1 < subSpans.length &&
      subSpans[i + 1].exposed &&
      subSpans[i + 1].outSide === groupOutSide
    ) {
      i++;
    }
    const groupEndIdx = i;

    const firstSub = subSpans[groupStartIdx];
    const lastSub = subSpans[groupEndIdx];
    const outNormX = nx * groupOutSide;
    const outNormZ = nz * groupOutSide;

    const startStation = groupedStations[firstSub.aIdx];
    const endStation = groupedStations[lastSub.bIdx];

    const startPt = {
      x: wall.start.x + wux * startStation.s,
      z: wall.start.z + wuz * startStation.s,
    };
    const endPt = {
      x: wall.start.x + wux * endStation.s,
      z: wall.start.z + wuz * endStation.s,
    };

    const startAdj = resolveEndpointOuterAdjustment(
      startPt,
      -wux,
      -wuz,
      outNormX,
      outNormZ,
      wall,
      allWalls,
      enclosureSegs,
      startStation.walls,
    );
    const endAdj = resolveEndpointOuterAdjustment(
      endPt,
      wux,
      wuz,
      outNormX,
      outNormZ,
      wall,
      allWalls,
      enclosureSegs,
      endStation.walls,
    );

    const runStartS = startStation.s - startAdj;
    const runEndS = endStation.s + endAdj;
    if (runEndS - runStartS >= 0.25) {
      overallSpans.push({
        startS: runStartS,
        endS: runEndS,
        outerLength: runEndS - runStartS,
        outSide: groupOutSide,
      });

      // Emit individual per-room bay spans whenever interior T-walls subdivide this exposed facade
      if (groupEndIdx > groupStartIdx) {
        for (let k = groupStartIdx; k <= groupEndIdx; k++) {
          const bStart = k === groupStartIdx ? runStartS : subSpans[k].aS;
          const bEnd = k === groupEndIdx ? runEndS : subSpans[k].bS;
          if (bEnd - bStart >= 0.25) {
            baySpans.push({
              startS: bStart,
              endS: bEnd,
              outerLength: bEnd - bStart,
              outSide: groupOutSide,
            });
          }
        }
      }
    }

    i++;
  }

  if (overallSpans.length === 1 && Math.abs(overallSpans[0].startS) <= wall.thickness + 0.25 && Math.abs(overallSpans[0].endS - len) <= wall.thickness + 0.25) {
    const startExtend = -overallSpans[0].startS;
    const endExtend = overallSpans[0].endS - len;
    return {
      overallSpans,
      baySpans,
      startExtend,
      endExtend,
      outerLength: overallSpans[0].outerLength,
    };
  }

  const totalExposedLen = overallSpans.reduce((sum, sp) => sum + sp.outerLength, 0);
  const firstOverall = overallSpans[0];
  return {
    overallSpans,
    baySpans,
    startExtend: firstOverall ? -firstOverall.startS : 0,
    endExtend: firstOverall ? firstOverall.endS - len : 0,
    outerLength: overallSpans.length > 0 ? totalExposedLen : len,
  };
}

/**
 * Computes outer architectural dimension extents along a wall so exterior
 * dimension lines measure from the furthest outer corner edges (or exposed T-face).
 */
export function computeWallOuterExtent(
  wall: WallSegment,
  allWalls: WallSegment[],
): { startExtend: number; endExtend: number; outerLength: number } {
  const len = wallLength(wall);
  if (len < 0.05) {
    return { startExtend: 0, endExtend: 0, outerLength: len };
  }
  const dims = computeWallOuterDimensions(wall, allWalls);
  return {
    startExtend: dims.startExtend,
    endExtend: dims.endExtend,
    outerLength: dims.outerLength,
  };
}

export function normalizeWallOpenings(wall: WallSegment): OpeningPlacementInfo[] {
  const len = wallLength(wall);
  if (len < 0.4 || wall.openings.length === 0) return [];

  const minMargin = Math.max(0.15, wall.thickness * 0.6);
  const sorted = [...wall.openings].sort((a, b) => a.offset - b.offset);
  const results: OpeningPlacementInfo[] = [];

  let cursor = minMargin;
  for (const op of sorted) {
    const maxAllowedSpan = len - minMargin - cursor;
    if (maxAllowedSpan < 0.3) continue;

    const width = Math.min(op.width, maxAllowedSpan);
    const half = width * 0.5;
    const minCenter = cursor + half;
    const maxCenter = len - minMargin - half;
    if (minCenter > maxCenter) continue;

    const clampedOffset = Math.max(minCenter, Math.min(maxCenter, op.offset));
    results.push({
      opening: op,
      clampedOffset,
      clampedWidth: width,
    });
    cursor = clampedOffset + half + 0.08;
  }

  return results;
}

export function decomposeWallIntoBoxes(
  wall: WallSegment,
  wallHeight: number,
  startExtend = 0,
  endExtend = 0,
  allWalls?: WallSegment[],
): { boxes: DecomposedBox[]; normalizedOpenings: OpeningPlacementInfo[] } {
  const len = wallLength(wall);
  if (len < 0.05) return { boxes: [], normalizedOpenings: [] };

  const effectiveHeight = Math.max(0.04, wallHeight);
  const isFlatBlueprint = wallHeight <= 0.05;
  const normalizedOpenings = normalizeWallOpenings(wall);
  const boxes: DecomposedBox[] = [];

  const sMin = -startExtend;
  const sMax = len + endExtend;

  interface CutoutSpan {
    start: number;
    end: number;
    sillHeight: number;
    topHeight: number;
  }

  const rawCutouts: CutoutSpan[] = normalizedOpenings.map((item) => ({
    start: Math.max(sMin, item.clampedOffset - item.clampedWidth * 0.5),
    end: Math.min(sMax, item.clampedOffset + item.clampedWidth * 0.5),
    sillHeight: item.opening.sillHeight,
    topHeight: item.opening.sillHeight + item.opening.height,
  }));

  // Also subtract openings belonging to any collinear overlapping walls or intersecting walls
  // so no stray/duplicate wall slab ever appears solid inside a window or door opening.
  if (allWalls && allWalls.length > 1) {
    const wux = (wall.end.x - wall.start.x) / len;
    const wuz = (wall.end.z - wall.start.z) / len;
    const wnx = -wuz;
    const wnz = wux;

    for (const other of allWalls) {
      if (other.id === wall.id || other.openings.length === 0) continue;
      const oLen = wallLength(other);
      if (oLen < 0.05) continue;
      const oux = (other.end.x - other.start.x) / oLen;
      const ouz = (other.end.z - other.start.z) / oLen;
      const dot = wux * oux + wuz * ouz;

      if (Math.abs(dot) > 0.96) {
        // Collinear wall: check perpendicular distance between wall centerlines
        const perpDist = Math.abs(
          (other.start.x - wall.start.x) * wnx + (other.start.z - wall.start.z) * wnz,
        );
        if (perpDist <= (wall.thickness + other.thickness) * 0.58 + 0.04) {
          const otherOps = normalizeWallOpenings(other);
          for (const oItem of otherOps) {
            const halfW = oItem.clampedWidth * 0.5;
            const p1x = other.start.x + oux * (oItem.clampedOffset - halfW);
            const p1z = other.start.z + ouz * (oItem.clampedOffset - halfW);
            const p2x = other.start.x + oux * (oItem.clampedOffset + halfW);
            const p2z = other.start.z + ouz * (oItem.clampedOffset + halfW);

            const s1 = (p1x - wall.start.x) * wux + (p1z - wall.start.z) * wuz;
            const s2 = (p2x - wall.start.x) * wux + (p2z - wall.start.z) * wuz;
            const cStart = Math.max(sMin, Math.min(s1, s2));
            const cEnd = Math.min(sMax, Math.max(s1, s2));
            if (cEnd - cStart > 0.01) {
              rawCutouts.push({
                start: cStart,
                end: cEnd,
                sillHeight: oItem.opening.sillHeight,
                topHeight: oItem.opening.sillHeight + oItem.opening.height,
              });
            }
          }
        }
      } else {
        // Non-collinear wall: if this wall's endpoint extension pokes into an opening on `other`,
        // subtract that tiny overlap so a perpendicular wall stub never blocks a window/door.
        const denom = wux * ouz - wuz * oux;
        if (Math.abs(denom) > 0.1) {
          const qpx = other.start.x - wall.start.x;
          const qpz = other.start.z - wall.start.z;
          const tWall = (qpx * ouz - qpz * oux) / denom;
          const tOther = (qpx * wuz - qpz * wux) / denom;
          const halfCross = (other.thickness * 0.5) / Math.abs(denom);
          if (tWall + halfCross >= sMin && tWall - halfCross <= sMax) {
            const otherOps = normalizeWallOpenings(other);
            for (const oItem of otherOps) {
              const halfW = oItem.clampedWidth * 0.5;
              if (
                tOther >= oItem.clampedOffset - halfW - wall.thickness * 0.45 &&
                tOther <= oItem.clampedOffset + halfW + wall.thickness * 0.45
              ) {
                const cStart = Math.max(sMin, tWall - halfCross);
                const cEnd = Math.min(sMax, tWall + halfCross);
                if (cEnd - cStart > 0.01) {
                  rawCutouts.push({
                    start: cStart,
                    end: cEnd,
                    sillHeight: oItem.opening.sillHeight,
                    topHeight: oItem.opening.sillHeight + oItem.opening.height,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Merge overlapping cutouts into clean sorted non-overlapping intervals
  const validCutouts = rawCutouts
    .filter((c) => c.end - c.start > 0.005)
    .sort((a, b) => a.start - b.start);

  const mergedCutouts: CutoutSpan[] = [];
  for (const c of validCutouts) {
    const prev = mergedCutouts[mergedCutouts.length - 1];
    if (prev && c.start <= prev.end + 0.002) {
      prev.end = Math.max(prev.end, c.end);
      prev.sillHeight = Math.min(prev.sillHeight, c.sillHeight);
      prev.topHeight = Math.max(prev.topHeight, c.topHeight);
    } else {
      mergedCutouts.push({ ...c });
    }
  }

  let cursor = sMin;

  for (const cut of mergedCutouts) {
    const opStart = cut.start;
    const opEnd = cut.end;
    const opWidth = opEnd - opStart;
    const opCenter = (opStart + opEnd) * 0.5;

    if (opStart - cursor > 0.005) {
      const pierLen = opStart - cursor;
      boxes.push({
        localX: cursor + pierLen * 0.5,
        localY: effectiveHeight * 0.5,
        sizeX: pierLen,
        sizeY: effectiveHeight,
        sizeZ: wall.thickness,
      });
    }

    if (!isFlatBlueprint && opWidth > 0.005) {
      if (cut.sillHeight > 0.01) {
        const actualSill = Math.min(cut.sillHeight, effectiveHeight);
        boxes.push({
          localX: opCenter,
          localY: actualSill * 0.5,
          sizeX: opWidth,
          sizeY: actualSill,
          sizeZ: wall.thickness,
        });
      }

      if (effectiveHeight > cut.topHeight + 0.01) {
        const headerH = effectiveHeight - cut.topHeight;
        boxes.push({
          localX: opCenter,
          localY: cut.topHeight + headerH * 0.5,
          sizeX: opWidth,
          sizeY: headerH,
          sizeZ: wall.thickness,
        });
      }
    }

    cursor = Math.max(cursor, opEnd);
  }

  if (sMax - cursor > 0.005) {
    const pierLen = sMax - cursor;
    boxes.push({
      localX: cursor + pierLen * 0.5,
      localY: effectiveHeight * 0.5,
      sizeX: pierLen,
      sizeY: effectiveHeight,
      sizeZ: wall.thickness,
    });
  }

  return { boxes, normalizedOpenings };
}

export function computeFloorBounds(
  walls: WallSegment[],
  padding = 0.6,
): { minX: number; maxX: number; minZ: number; maxZ: number; width: number; depth: number; centerX: number; centerZ: number } {
  if (walls.length === 0) {
    return {
      minX: -5,
      maxX: 5,
      minZ: -4,
      maxZ: 4,
      width: 10,
      depth: 8,
      centerX: 0,
      centerZ: 0,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const w of walls) {
    const pad = w.thickness * 0.5;
    minX = Math.min(minX, w.start.x - pad, w.end.x - pad);
    maxX = Math.max(maxX, w.start.x + pad, w.end.x + pad);
    minZ = Math.min(minZ, w.start.z - pad, w.end.z - pad);
    maxZ = Math.max(maxZ, w.start.z + pad, w.end.z + pad);
  }

  minX -= padding;
  maxX += padding;
  minZ -= padding;
  maxZ += padding;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

export function resolveWalkthroughCollision(
  candidate: Point2D,
  walls: WallSegment[],
  wallHeight: number,
  playerRadius = 0.28,
): Point2D {
  if (wallHeight < 0.35 || walls.length === 0) {
    return candidate;
  }

  let px = candidate.x;
  let pz = candidate.z;

  for (let pass = 0; pass < 2; pass++) {
    for (const wall of walls) {
      const len = wallLength(wall);
      if (len < 0.05) continue;

      const ux = (wall.end.x - wall.start.x) / len;
      const uz = (wall.end.z - wall.start.z) / len;
      const nx = -uz;
      const nz = ux;

      const relX = px - wall.start.x;
      const relZ = pz - wall.start.z;

      const along = relX * ux + relZ * uz;
      const perp = relX * nx + relZ * nz;
      const halfThick = wall.thickness * 0.5 + playerRadius;

      if (along >= -playerRadius && along <= len + playerRadius && Math.abs(perp) < halfThick) {
        const openings = normalizeWallOpenings(wall);
        let insideDoor = false;
        for (const item of openings) {
          if (isDoorOpening(item.opening.type) && item.opening.isOpen) {
            const margin = Math.min(playerRadius * 0.55, item.clampedWidth * 0.25);
            const doorStart = item.clampedOffset - item.clampedWidth * 0.5 + margin;
            const doorEnd = item.clampedOffset + item.clampedWidth * 0.5 - margin;
            if (along >= doorStart && along <= doorEnd) {
              insideDoor = true;
              break;
            }
          }
        }

        if (!insideDoor) {
          const sign = perp >= 0 ? 1 : -1;
          const push = halfThick - Math.abs(perp);
          px += nx * sign * push;
          pz += nz * sign * push;
        }
      }
    }
  }

  return { x: px, z: pz };
}

export function getWallOutwardSide(wall: WallSegment, allWalls: WallSegment[]): 1 | -1 {
  const len = wallLength(wall);
  if (len < 0.05 || allWalls.length === 0) return 1;

  const angle = wallAngleRad(wall);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const localZWorldX = -Math.sin(angle);
  const localZWorldZ = Math.cos(angle);

  // Use true 2D planar ray-casting enclosure check when >= 3 walls exist
  // so concave L-shaped and T-shaped perimeter walls point strictly to open sky.
  if (allWalls.length >= 3) {
    const segs = buildEnclosureSegments(allWalls);
    const probeOffset = wall.thickness * 0.5 + 0.18;
    for (const tFrac of [0.5, 0.25, 0.75]) {
      const cx = wall.start.x + ux * (len * tFrac);
      const cz = wall.start.z + uz * (len * tFrac);
      const pPlus = { x: cx + localZWorldX * probeOffset, z: cz + localZWorldZ * probeOffset };
      const pMinus = { x: cx - localZWorldX * probeOffset, z: cz - localZWorldZ * probeOffset };

      const blockedPlus = allWalls.some(
        (o) => o.id !== wall.id && projectPointOntoWall(pPlus, o).distance < o.thickness * 0.5 + 0.03,
      );
      const blockedMinus = allWalls.some(
        (o) => o.id !== wall.id && projectPointOntoWall(pMinus, o).distance < o.thickness * 0.5 + 0.03,
      );
      if (blockedPlus && blockedMinus) continue;

      const encPlus = isPointEnclosedByOtherWalls(pPlus, wall.id, segs);
      const encMinus = isPointEnclosedByOtherWalls(pMinus, wall.id, segs);
      if (!encPlus && encMinus) return 1;
      if (encPlus && !encMinus) return -1;
    }
  }

  const bounds = computeFloorBounds(allWalls, 0);
  const midX = (wall.start.x + wall.end.x) * 0.5;
  const midZ = (wall.start.z + wall.end.z) * 0.5;

  const toCenterX = midX - bounds.centerX;
  const toCenterZ = midZ - bounds.centerZ;
  const dot = toCenterX * localZWorldX + toCenterZ * localZWorldZ;

  if (Math.abs(dot) < 0.15) {
    return localZWorldZ >= 0 ? 1 : -1;
  }
  return dot >= 0 ? 1 : -1;
}

export function computeWallInnerDimensions(
  wall: WallSegment,
  allWalls: WallSegment[],
): { inSide: 1 | -1; spans: InnerClearSpan[] } {
  const len = wallLength(wall);
  const outSide = getWallOutwardSide(wall, allWalls);
  const inSide: 1 | -1 = outSide === 1 ? -1 : 1;

  if (len < 0.45) {
    return { inSide, spans: [] };
  }

  const ux = (wall.end.x - wall.start.x) / len;
  const uz = (wall.end.z - wall.start.z) / len;

  const blocks: Array<{ min: number; max: number }> = [];
  const tol = 0.06;

  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.05) continue;

    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(ux * oux + uz * ouz) > 0.92) continue;

    // Case 1: Other wall's endpoint attaches onto this wall
    for (const pt of [other.start, other.end]) {
      const proj = projectPointOntoWall(pt, wall);
      if (proj.distance <= Math.max(tol, wall.thickness * 0.5 + 0.04)) {
        const halfThick = other.thickness * 0.5;
        blocks.push({
          min: Math.max(0, proj.offset - halfThick),
          max: Math.min(len, proj.offset + halfThick),
        });
      }
    }

    // Case 2: This wall's endpoint T-joins into / ends inside the host wall (e.g. inner divider)
    const endBlockTol = Math.max(tol, other.thickness * 0.5 + 0.05);
    const startOnOther = projectPointOntoWall(wall.start, other);
    if (startOnOther.distance <= endBlockTol && startOnOther.offset >= 0 && startOnOther.offset <= oLen) {
      const blockDepth = Math.max(0, other.thickness * 0.5 - startOnOther.distance * 0.5);
      if (blockDepth > 0.01) {
        blocks.push({ min: 0, max: Math.min(len, other.thickness * 0.5) });
      }
    }
    const endOnOther = projectPointOntoWall(wall.end, other);
    if (endOnOther.distance <= endBlockTol && endOnOther.offset >= 0 && endOnOther.offset <= oLen) {
      const blockDepth = Math.max(0, other.thickness * 0.5 - endOnOther.distance * 0.5);
      if (blockDepth > 0.01) {
        blocks.push({ min: Math.max(0, len - other.thickness * 0.5), max: len });
      }
    }
  }

  blocks.sort((a, b) => a.min - b.min);
  const merged: Array<{ min: number; max: number }> = [];
  for (const b of blocks) {
    if (merged.length === 0 || b.min > merged[merged.length - 1].max + 0.01) {
      merged.push({ ...b });
    } else {
      merged[merged.length - 1].max = Math.max(merged[merged.length - 1].max, b.max);
    }
  }

  const spans: InnerClearSpan[] = [];
  let cursor = 0;

  for (const blk of merged) {
    if (blk.min - cursor >= 0.35) {
      const startInset = cursor;
      const endInset = len - blk.min;
      spans.push({
        startS: cursor,
        endS: blk.min,
        clearLength: blk.min - cursor,
        startInset: cursor === 0 ? 0 : startInset,
        endInset,
      });
    }
    cursor = Math.max(cursor, blk.max);
  }

  if (len - cursor >= 0.35) {
    spans.push({
      startS: cursor,
      endS: len,
      clearLength: len - cursor,
      startInset: cursor,
      endInset: 0,
    });
  }

  if (spans.length === 1) {
    spans[0].startInset = spans[0].startS;
    spans[0].endInset = len - spans[0].endS;
  }

  return { inSide, spans };
}

function rayHitsSegment2D(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const sx = bx - ax;
  const sz = bz - az;
  const denom = dx * sz - dz * sx;
  if (Math.abs(denom) < 1e-6) return false;
  const qpx = ax - ox;
  const qpz = az - oz;
  const t = (qpx * sz - qpz * sx) / denom;
  const u = (qpx * dz - qpz * dx) / denom;
  return t > 0.005 && u >= -0.02 && u <= 1.02;
}

function isPointEnclosedByOtherWalls(
  pt: Point2D,
  excludeWallId: string,
  segments: Array<{ id: string; ax: number; az: number; bx: number; bz: number }>,
): boolean {
  const rayCount = 24;
  let misses = 0;
  for (let i = 0; i < rayCount; i++) {
    const theta = (i * Math.PI * 2) / rayCount;
    const dx = Math.cos(theta);
    const dz = Math.sin(theta);
    let hit = false;
    for (const seg of segments) {
      if (seg.id === excludeWallId) continue;
      if (rayHitsSegment2D(pt.x, pt.z, dx, dz, seg.ax, seg.az, seg.bx, seg.bz)) {
        hit = true;
        break;
      }
    }
    if (!hit) {
      misses++;
      if (misses > 1) return false;
    }
  }
  return true;
}

/**
 * Determines whether a wall is an interior partition wall (enclosed on both sides by outer walls
 * or spanning T-to-T inside other walls) so exterior "outer" dimension lines are suppressed.
 */
export function isInteriorMergedWall(wall: WallSegment, allWalls: WallSegment[]): boolean {
  if (allWalls.length < 3) return false;
  const len = wallLength(wall);
  if (len < 0.05) return false;

  const ux = (wall.end.x - wall.start.x) / len;
  const uz = (wall.end.z - wall.start.z) / len;
  const nx = -uz;
  const nz = ux;

  // Check if both ends T-join cleanly into the middle of non-collinear host walls
  let hasMidTStart = false;
  let hasMidTEnd = false;
  for (const other of allWalls) {
    if (other.id === wall.id) continue;
    const oLen = wallLength(other);
    if (oLen < 0.1) continue;
    const oux = (other.end.x - other.start.x) / oLen;
    const ouz = (other.end.z - other.start.z) / oLen;
    if (Math.abs(ux * oux + uz * ouz) > 0.94) continue;
    const attachTol = Math.max(0.08, other.thickness * 0.5 + 0.08);
    const pStart = projectPointOntoWall(wall.start, other);
    if (pStart.distance <= attachTol && pStart.offset >= 0.08 && pStart.offset <= oLen - 0.08) {
      hasMidTStart = true;
    }
    const pEnd = projectPointOntoWall(wall.end, other);
    if (pEnd.distance <= attachTol && pEnd.offset >= 0.08 && pEnd.offset <= oLen - 0.08) {
      hasMidTEnd = true;
    }
  }
  if (hasMidTStart && hasMidTEnd) return true;

  const segs = allWalls
    .filter((w) => wallLength(w) >= 0.05)
    .map((w) => {
      const wLen = wallLength(w);
      const { startExtend, endExtend } = getWallEndpointExtensions(w, allWalls);
      const wux = (w.end.x - w.start.x) / wLen;
      const wuz = (w.end.z - w.start.z) / wLen;
      const padStart = startExtend + 0.05;
      const padEnd = endExtend + 0.05;
      return {
        id: w.id,
        ax: w.start.x - wux * padStart,
        az: w.start.z - wuz * padStart,
        bx: w.end.x + wux * padEnd,
        bz: w.end.z + wuz * padEnd,
      };
    });

  // Sample non-obstructed midpoint/quarter points slightly off both faces of the wall
  const probeOffset = wall.thickness * 0.5 + 0.18;
  for (const tFrac of [0.5, 0.25, 0.75]) {
    const cx = wall.start.x + ux * (len * tFrac);
    const cz = wall.start.z + uz * (len * tFrac);
    const pPlus = { x: cx + nx * probeOffset, z: cz + nz * probeOffset };
    const pMinus = { x: cx - nx * probeOffset, z: cz - nz * probeOffset };

    const blockedPlus = allWalls.some(
      (o) => o.id !== wall.id && projectPointOntoWall(pPlus, o).distance < o.thickness * 0.5 + 0.03,
    );
    const blockedMinus = allWalls.some(
      (o) => o.id !== wall.id && projectPointOntoWall(pMinus, o).distance < o.thickness * 0.5 + 0.03,
    );
    if (blockedPlus || blockedMinus) continue;

    return (
      isPointEnclosedByOtherWalls(pPlus, wall.id, segs) &&
      isPointEnclosedByOtherWalls(pMinus, wall.id, segs)
    );
  }

  return false;
}

interface WallFootprintLocal {
  id: string;
  startX: number;
  startZ: number;
  cosA: number;
  sinA: number;
  minX: number;
  maxX: number;
  halfT: number;
}

function subtractInterval(
  intervals: Array<[number, number]>,
  cutStart: number,
  cutEnd: number,
): Array<[number, number]> {
  if (cutEnd <= cutStart + 1e-4) return intervals;
  const next: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    if (cutEnd <= a + 1e-4 || cutStart >= b - 1e-4) {
      next.push([a, b]);
    } else {
      if (cutStart - a > 1e-4) next.push([a, Math.min(b, cutStart)]);
      if (b - cutEnd > 1e-4) next.push([Math.max(a, cutEnd), b]);
    }
  }
  return next;
}

function clipSegmentAgainstOtherWalls(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  selfId: string,
  footprints: WallFootprintLocal[],
  outVerts: number[],
  y: number,
): void {
  const segLen = Math.hypot(bx - ax, bz - az);
  if (segLen < 0.006) return;

  let visible: Array<[number, number]> = [[0, 1]];
  const eps = 0.0025;

  for (const fp of footprints) {
    if (fp.id === selfId) continue;

    const dax = ax - fp.startX;
    const daz = az - fp.startZ;
    const dbx = bx - fp.startX;
    const dbz = bz - fp.startZ;

    const lax = dax * fp.cosA + daz * fp.sinA;
    const laz = -dax * fp.sinA + daz * fp.cosA;
    const lbx = dbx * fp.cosA + dbz * fp.sinA;
    const lbz = -dbx * fp.sinA + dbz * fp.cosA;

    // Preserve collinear outer boundary faces so flush outer edges stay drawn cleanly
    if (
      (Math.abs(laz - fp.halfT) < 0.005 && Math.abs(lbz - fp.halfT) < 0.005) ||
      (Math.abs(laz + fp.halfT) < 0.005 && Math.abs(lbz + fp.halfT) < 0.005) ||
      (Math.abs(lax - fp.minX) < 0.005 && Math.abs(lbx - fp.minX) < 0.005) ||
      (Math.abs(lax - fp.maxX) < 0.005 && Math.abs(lbx - fp.maxX) < 0.005)
    ) {
      continue;
    }

    const rMinX = fp.minX - eps;
    const rMaxX = fp.maxX + eps;
    const rMinZ = -fp.halfT - eps;
    const rMaxZ = fp.halfT + eps;

    const dx = lbx - lax;
    const dz = lbz - laz;
    let t0 = 0;
    let t1 = 1;

    const tests: Array<[number, number]> = [
      [-dx, lax - rMinX],
      [dx, rMaxX - lax],
      [-dz, laz - rMinZ],
      [dz, rMaxZ - laz],
    ];

    let hits = true;
    for (const [p, q] of tests) {
      if (Math.abs(p) < 1e-8) {
        if (q < 0) {
          hits = false;
          break;
        }
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) {
            hits = false;
            break;
          }
          if (r > t0) t0 = r;
        } else {
          if (r < t0) {
            hits = false;
            break;
          }
          if (r < t1) t1 = r;
        }
      }
    }

    if (hits && t1 - t0 > 1e-4) {
      visible = subtractInterval(visible, t0, t1);
      if (visible.length === 0) return;
    }
  }

  for (const [s0, s1] of visible) {
    if ((s1 - s0) * segLen < 0.008) continue;
    outVerts.push(
      ax + (bx - ax) * s0,
      y,
      az + (bz - az) * s0,
      ax + (bx - ax) * s1,
      y,
      az + (bz - az) * s1,
    );
  }
}

/**
 * Builds clean architectural 2D wall outline line-segment vertices by clipping away
 * overlapping interior seam lines and embedded end-caps at L-corners and T-junctions.
 */
export function buildClipped2DWallOutlineVertices(
  walls: WallSegment[],
  outlineY: number,
  selectedWallId: string | null,
): { regularVerts: number[]; selectedVerts: number[] } {
  const regularVerts: number[] = [];
  const selectedVerts: number[] = [];

  const wallEntries = walls
    .map((wall) => {
      const len = wallLength(wall);
      if (len < 0.05) return null;
      const angle = wallAngleRad(wall);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const { startExtend, endExtend } = getWallEndpointExtensions(wall, walls);
      const { boxes } = decomposeWallIntoBoxes(wall, 0.12, startExtend, endExtend, walls);
      return {
        wall,
        cosA,
        sinA,
        boxes,
        footprint: {
          id: wall.id,
          startX: wall.start.x,
          startZ: wall.start.z,
          cosA,
          sinA,
          minX: -startExtend,
          maxX: len + endExtend,
          halfT: wall.thickness * 0.5,
        } satisfies WallFootprintLocal,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const footprints = wallEntries.map((e) => e.footprint);

  for (const entry of wallEntries) {
    const { wall, cosA, sinA, boxes } = entry;
    const targetVerts = selectedWallId === wall.id ? selectedVerts : regularVerts;
    const y = selectedWallId === wall.id ? outlineY + 0.004 : outlineY;

    const toWorld = (lx: number, lz: number): [number, number] => [
      wall.start.x + cosA * lx - sinA * lz,
      wall.start.z + sinA * lx + cosA * lz,
    ];

    for (const box of boxes) {
      const x0 = box.localX - box.sizeX * 0.5;
      const x1 = box.localX + box.sizeX * 0.5;
      const ht = box.sizeZ * 0.5;

      const [p00x, p00z] = toWorld(x0, -ht);
      const [p10x, p10z] = toWorld(x1, -ht);
      const [p11x, p11z] = toWorld(x1, ht);
      const [p01x, p01z] = toWorld(x0, ht);

      clipSegmentAgainstOtherWalls(p00x, p00z, p10x, p10z, wall.id, footprints, targetVerts, y);
      clipSegmentAgainstOtherWalls(p01x, p01z, p11x, p11z, wall.id, footprints, targetVerts, y);
      clipSegmentAgainstOtherWalls(p00x, p00z, p01x, p01z, wall.id, footprints, targetVerts, y);
      clipSegmentAgainstOtherWalls(p10x, p10z, p11x, p11z, wall.id, footprints, targetVerts, y);
    }
  }

  return { regularVerts, selectedVerts };
}

function isPointTAttachedToWall(
  pt: Point2D,
  movingWall: WallSegment,
  hostWall: WallSegment,
): boolean {
  const hostLen = wallLength(hostWall);
  const movingLen = wallLength(movingWall);
  if (hostLen < 0.1 || movingLen < 0.05) return false;
  const hux = (hostWall.end.x - hostWall.start.x) / hostLen;
  const huz = (hostWall.end.z - hostWall.start.z) / hostLen;
  const mux = (movingWall.end.x - movingWall.start.x) / movingLen;
  const muz = (movingWall.end.z - movingWall.start.z) / movingLen;
  if (Math.abs(hux * mux + huz * muz) > 0.96) return false;

  const proj = projectPointOntoWall(pt, hostWall);
  const attachTol = Math.max(0.08, hostWall.thickness * 0.5 + 0.02);
  return (
    proj.distance <= attachTol &&
    proj.offset >= 0.02 &&
    proj.offset <= hostLen - 0.02
  );
}

/**
 * Moves a shared corner vertex on ALL walls connected to `cornerPos`,
 * OR if `onlyWallId` is specified, disconnects and moves ONLY that wall's corner endpoint.
 * Also keeps any interior T-junction walls attached to moving host walls instead of leaving gaps.
 */
export function moveConnectedCorner(
  walls: WallSegment[],
  cornerPos: Point2D,
  nextPos: Point2D,
  onlyWallId?: string | null,
): WallSegment[] {
  const tol = 0.06;
  const target: Point2D = {
    x: Number(nextPos.x.toFixed(3)),
    z: Number(nextPos.z.toFixed(3)),
  };

  const hostWallUpdates = new Map<string, { prev: WallSegment; next: WallSegment }>();

  const firstPass = walls.map((w) => {
    if (onlyWallId && w.id !== onlyWallId) return w;

    const moveStart = distance2D(w.start, cornerPos) < tol;
    const moveEnd = distance2D(w.end, cornerPos) < tol;
    if (!moveStart && !moveEnd) return w;

    const nextStart = moveStart ? target : w.start;
    const nextEnd = moveEnd ? target : w.end;
    const nextLen = Math.hypot(nextEnd.x - nextStart.x, nextEnd.z - nextStart.z);
    if (nextLen < 0.15) return w;

    const prevLen = wallLength(w);
    const startDeltaLen = moveStart && !moveEnd ? nextLen - prevLen : 0;

    const updated: WallSegment = {
      ...w,
      start: nextStart,
      end: nextEnd,
      openings: w.openings.map((op) => ({
        ...op,
        offset: Math.max(0.25, Math.min(Math.max(0.3, nextLen - 0.25), op.offset + startDeltaLen)),
      })),
    };
    hostWallUpdates.set(w.id, { prev: w, next: updated });
    return updated;
  });

  if (onlyWallId || hostWallUpdates.size === 0) {
    return firstPass;
  }

  return firstPass.map((w) => {
    if (hostWallUpdates.has(w.id)) return w;
    let nextStart = w.start;
    let nextEnd = w.end;
    let changed = false;

    for (const { prev: prevHost, next: nextHost } of hostWallUpdates.values()) {
      const prevLen = wallLength(prevHost);
      const nextLen = wallLength(nextHost);
      if (prevLen < 0.1 || nextLen < 0.1) continue;

      if (distance2D(w.start, cornerPos) >= tol && isPointTAttachedToWall(w.start, w, prevHost)) {
        const proj = projectPointOntoWall(w.start, prevHost);
        const t = Math.max(0.02, Math.min(0.98, proj.offset / prevLen));
        nextStart = {
          x: Number((nextHost.start.x + (nextHost.end.x - nextHost.start.x) * t).toFixed(3)),
          z: Number((nextHost.start.z + (nextHost.end.z - nextHost.start.z) * t).toFixed(3)),
        };
        changed = true;
      }

      if (distance2D(w.end, cornerPos) >= tol && isPointTAttachedToWall(w.end, w, prevHost)) {
        const proj = projectPointOntoWall(w.end, prevHost);
        const t = Math.max(0.02, Math.min(0.98, proj.offset / prevLen));
        nextEnd = {
          x: Number((nextHost.start.x + (nextHost.end.x - nextHost.start.x) * t).toFixed(3)),
          z: Number((nextHost.start.z + (nextHost.end.z - nextHost.start.z) * t).toFixed(3)),
        };
        changed = true;
      }
    }

    if (!changed) return w;
    const prevWLen = wallLength(w);
    const nextWLen = Math.hypot(nextEnd.x - nextStart.x, nextEnd.z - nextStart.z);
    if (nextWLen < 0.15) return w;
    const startDeltaLen =
      distance2D(nextStart, w.start) > 0.005 && distance2D(nextEnd, w.end) < 0.005
        ? nextWLen - prevWLen
        : 0;

    return {
      ...w,
      start: nextStart,
      end: nextEnd,
      openings: w.openings.map((op) => ({
        ...op,
        offset: Math.max(0.25, Math.min(Math.max(0.3, nextWLen - 0.25), op.offset + startDeltaLen)),
      })),
    };
  });
}

export function moveWallWithConnections(
  baseWalls: WallSegment[],
  wallId: string,
  dx: number,
  dz: number,
): WallSegment[] {
  const target = baseWalls.find((w) => w.id === wallId);
  if (!target) return baseWalls;

  const targetLen = wallLength(target);
  const endpointTol = 0.07;

  const isAttachedToTarget = (pt: Point2D, movingWall: WallSegment): boolean => {
    if (
      distance2D(pt, target.start) < endpointTol ||
      distance2D(pt, target.end) < endpointTol
    ) {
      return true;
    }
    return isPointTAttachedToWall(pt, movingWall, target);
  };

  return baseWalls.map((w) => {
    if (w.id === wallId) {
      return {
        ...w,
        start: {
          x: Number((w.start.x + dx).toFixed(3)),
          z: Number((w.start.z + dz).toFixed(3)),
        },
        end: {
          x: Number((w.end.x + dx).toFixed(3)),
          z: Number((w.end.z + dz).toFixed(3)),
        },
      };
    }

    const shiftStart = isAttachedToTarget(w.start, w);
    const shiftEnd = isAttachedToTarget(w.end, w);
    if (!shiftStart && !shiftEnd) return w;

    const nextStart = shiftStart
      ? { x: Number((w.start.x + dx).toFixed(3)), z: Number((w.start.z + dz).toFixed(3)) }
      : w.start;
    const nextEnd = shiftEnd
      ? { x: Number((w.end.x + dx).toFixed(3)), z: Number((w.end.z + dz).toFixed(3)) }
      : w.end;

    const prevLen = wallLength(w);
    const nextLen = Math.hypot(nextEnd.x - nextStart.x, nextEnd.z - nextStart.z);
    if (nextLen < 0.2) return w;

    const startDeltaLen = shiftStart && !shiftEnd ? nextLen - prevLen : 0;

    return {
      ...w,
      start: nextStart,
      end: nextEnd,
      openings: w.openings.map((op) => ({
        ...op,
        offset: Math.max(0.25, Math.min(Math.max(0.3, nextLen - 0.25), op.offset + startDeltaLen)),
      })),
    };
  });
}

export function resizeWallWithConnections(
  walls: WallSegment[],
  wallId: string,
  targetLength: number,
): WallSegment[] {
  const wall = walls.find((w) => w.id === wallId);
  if (!wall) return walls;

  const oldLen = wallLength(wall);
  if (oldLen < 0.05) return walls;

  const clampedLen = Math.max(0.4, Math.min(40, targetLength));
  if (Math.abs(clampedLen - oldLen) < 0.001) return walls;

  const ux = (wall.end.x - wall.start.x) / oldLen;
  const uz = (wall.end.z - wall.start.z) / oldLen;

  const oldEnd: Point2D = { ...wall.end };
  const newEnd: Point2D = {
    x: Number((wall.start.x + ux * clampedLen).toFixed(3)),
    z: Number((wall.start.z + uz * clampedLen).toFixed(3)),
  };
  const dx = newEnd.x - oldEnd.x;
  const dz = newEnd.z - oldEnd.z;

  const tol = 0.06;
  const verticesToShift: Point2D[] = [oldEnd];
  const hasVertex = (pt: Point2D) => verticesToShift.some((v) => distance2D(v, pt) < tol);

  let added = true;
  while (added) {
    added = false;
    for (const other of walls) {
      if (other.id === wallId) continue;
      const oLen = wallLength(other);
      if (oLen < 0.05) continue;
      const oux = (other.end.x - other.start.x) / oLen;
      const ouz = (other.end.z - other.start.z) / oLen;
      const isPerp = Math.abs(oux * ux + ouz * uz) < 0.18;
      if (!isPerp) continue;

      const startMatch = hasVertex(other.start);
      const endMatch = hasVertex(other.end);
      if (startMatch && !endMatch && distance2D(other.end, wall.start) >= tol) {
        verticesToShift.push({ ...other.end });
        added = true;
      } else if (endMatch && !startMatch && distance2D(other.start, wall.start) >= tol) {
        verticesToShift.push({ ...other.start });
        added = true;
      }
    }
  }

  const shiftedHosts: Array<{ prev: WallSegment; next: WallSegment; rigid: boolean }> = [];

  const firstPass = walls.map((w) => {
    if (w.id === wallId) {
      const maxOpMargin = 0.25;
      const updated: WallSegment = {
        ...w,
        end: newEnd,
        openings: w.openings.map((op) => ({
          ...op,
          offset: Math.max(maxOpMargin, Math.min(clampedLen - maxOpMargin, op.offset)),
        })),
      };
      shiftedHosts.push({ prev: w, next: updated, rigid: false });
      return updated;
    }

    const shiftStart = hasVertex(w.start);
    const shiftEnd = hasVertex(w.end);
    if (!shiftStart && !shiftEnd) return w;

    const nextStart = shiftStart
      ? { x: Number((w.start.x + dx).toFixed(3)), z: Number((w.start.z + dz).toFixed(3)) }
      : w.start;
    const nextEnd = shiftEnd
      ? { x: Number((w.end.x + dx).toFixed(3)), z: Number((w.end.z + dz).toFixed(3)) }
      : w.end;

    const prevLen = wallLength(w);
    const nextLen = Math.hypot(nextEnd.x - nextStart.x, nextEnd.z - nextStart.z);
    const startDeltaLen = shiftStart && !shiftEnd ? nextLen - prevLen : 0;

    const updated: WallSegment = {
      ...w,
      start: nextStart,
      end: nextEnd,
      openings: w.openings.map((op) => ({
        ...op,
        offset: Math.max(0.25, Math.min(Math.max(0.3, nextLen - 0.25), op.offset + startDeltaLen)),
      })),
    };
    shiftedHosts.push({ prev: w, next: updated, rigid: shiftStart && shiftEnd });
    return updated;
  });

  // Also keep any interior T-junction walls attached to translated/stretched host walls
  const shiftedIds = new Set(shiftedHosts.map((h) => h.prev.id));
  return firstPass.map((w) => {
    if (shiftedIds.has(w.id)) return w;

    let nextStart = w.start;
    let nextEnd = w.end;
    let changed = false;

    const updateTPoint = (pt: Point2D): Point2D | null => {
      for (const host of shiftedHosts) {
        if (!isPointTAttachedToWall(pt, w, host.prev)) continue;
        if (host.rigid) {
          return {
            x: Number((pt.x + dx).toFixed(3)),
            z: Number((pt.z + dz).toFixed(3)),
          };
        }
        const prevLen = wallLength(host.prev);
        const nextLen = wallLength(host.next);
        if (prevLen < 0.1 || nextLen < 0.1) continue;
        const proj = projectPointOntoWall(pt, host.prev);
        const clampedOff = Math.max(0.05, Math.min(nextLen - 0.05, proj.offset));
        const hux = (host.next.end.x - host.next.start.x) / nextLen;
        const huz = (host.next.end.z - host.next.start.z) / nextLen;
        return {
          x: Number((host.next.start.x + hux * clampedOff).toFixed(3)),
          z: Number((host.next.start.z + huz * clampedOff).toFixed(3)),
        };
      }
      return null;
    };

    const updS = updateTPoint(w.start);
    if (updS) {
      nextStart = updS;
      changed = true;
    }
    const updE = updateTPoint(w.end);
    if (updE) {
      nextEnd = updE;
      changed = true;
    }

    if (!changed) return w;
    const prevLen = wallLength(w);
    const nextLen = Math.hypot(nextEnd.x - nextStart.x, nextEnd.z - nextStart.z);
    if (nextLen < 0.2) return w;
    const startDeltaLen = updS && !updE ? nextLen - prevLen : 0;

    return {
      ...w,
      start: nextStart,
      end: nextEnd,
      openings: w.openings.map((op) => ({
        ...op,
        offset: Math.max(0.25, Math.min(Math.max(0.3, nextLen - 0.25), op.offset + startDeltaLen)),
      })),
    };
  });
}

export interface WallAnchorPoint {
  id: string;
  wallId: string;
  offset: number;
  x?: number;
  z?: number;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
  faceSide?: 1 | -1;
  connectedWireIds?: string[];
  disconnectedWireIds?: string[];
}

export interface AnchorWorldInfo<T extends WallAnchorPoint> {
  item: T;
  wall: WallSegment;
  centerPos: Point2D;
  chasePos: Point2D;
  facePos: Point2D;
  normal: Point2D;
  wallAngle: number;
  faceSide: 1 | -1;
  elevationY: number;
}

export interface JunctionWorldInfo {
  junction: ElectricalJunction;
  wall: WallSegment;
  centerPos: Point2D;
  chasePos: Point2D;
  facePos: Point2D;
  normal: Point2D;
  wallAngle: number;
  faceSide: 1 | -1;
  elevationY: number;
}

export interface FixtureWorldInfo {
  fixture: PlumbingFixture;
  wall: WallSegment;
  centerPos: Point2D;
  chasePos: Point2D;
  facePos: Point2D;
  normal: Point2D;
  wallAngle: number;
  faceSide: 1 | -1;
  elevationY: number;
}

export interface WireRenderData {
  wire: ElectricalWire;
  color: string;
  segments: WireSegment3D[];
  verticalDrops: Array<{ x: number; z: number; yStart: number; yEnd: number }>;
  nodePoints: Array<{ x: number; y: number; z: number }>;
}

export interface PlumbingRenderData {
  pipe: PlumbingPipe;
  color: string;
  segments: WireSegment3D[];
  verticalDrops: Array<{ x: number; z: number; yStart: number; yEnd: number }>;
  nodePoints: Array<{ x: number; y: number; z: number }>;
}

export interface WireLengthBreakdown {
  horizontalMeters: number;
  verticalDropsMeters: number;
  dropCount: number;
  totalMeters: number;
  elevationY: number;
}

export interface StructureSummary {
  wallCount: number;
  totalWallMeters: number;
  grossWallAreaSqM: number;
  netWallAreaSqM: number;
  footprintSqM: number;
  doorCount: number;
  doubleDoorCount: number;
  slidingDoorCount: number;
  garageDoorCount: number;
  windowCount: number;
}

export function getWireDisplayColor(circuit: WireCircuitType, breakerLabel: string): string {
  const normalized = breakerLabel.trim().toUpperCase();
  const preset = WIRE_BREAKER_PRESETS.find((p) => p.breakerLabel.toUpperCase() === normalized);
  if (preset) return preset.color;
  if (circuit === 'power' && normalized.includes('2')) return '#dc2626';
  if (circuit === 'power' && normalized.includes('3')) return '#9333ea';
  return WIRE_CIRCUIT_INFO[circuit].color;
}

export function getPlumbingDisplayColor(
  pipeType: PlumbingPipeType,
  pipeSpec: PlumbingPipeSpec,
): string {
  if (pipeType === 'cold' && pipeSpec === 'pex-20') return '#1d4ed8';
  if (pipeType === 'drain' && pipeSpec === 'pvc-110') return '#334155';
  return PLUMBING_TYPE_INFO[pipeType].color;
}

export function resolveMountElevation(
  mountRef: WireMountRef,
  dropFromTop: number,
  floorHeight: number,
  wallHeight: number,
): number {
  const refWallH = wallHeight >= 0.45 ? wallHeight : 2.6;
  if (mountRef === 'from-top') {
    return Math.max(0.12, Number((refWallH - dropFromTop).toFixed(3)));
  }
  return Math.max(0.1, Math.min(Math.max(0.25, refWallH - 0.08), floorHeight));
}

function getAnchorWorldInfo<T extends WallAnchorPoint>(
  item: T,
  walls: WallSegment[],
  wallHeight: number,
  slabTopY = 0,
): AnchorWorldInfo<T> | null {
  const wall = walls.find((w) => w.id === item.wallId);
  if (!wall) {
    // Support free ceiling-mounted junctions (e.g., ceiling-light placed inside a room)
    if (item.x !== undefined && item.z !== undefined) {
      const fallbackWall: WallSegment = walls[0] ?? {
        id: 'ceiling',
        start: { x: item.x - 0.5, z: item.z },
        end: { x: item.x + 0.5, z: item.z },
        thickness: 0.2,
        openings: [],
      };
      const centerPos: Point2D = {
        x: Number(item.x.toFixed(3)),
        z: Number(item.z.toFixed(3)),
      };
      const elevationY =
        slabTopY +
        resolveMountElevation(item.mountRef, item.dropFromTop, item.height, wallHeight);
      return {
        item,
        wall: fallbackWall,
        centerPos,
        chasePos: centerPos,
        facePos: centerPos,
        normal: { x: 0, z: 1 },
        wallAngle: 0,
        faceSide: 1,
        elevationY,
      };
    }
    return null;
  }
  const len = wallLength(wall);
  if (len < 0.1) return null;

  const angle = wallAngleRad(wall);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const nx = -uz;
  const nz = ux;

  const defaultInSide: 1 | -1 = getWallOutwardSide(wall, walls) === 1 ? -1 : 1;
  const faceSide: 1 | -1 = item.faceSide ?? defaultInSide;
  const clampedOffset = Math.max(0.08, Math.min(len - 0.08, item.offset));

  const centerPos: Point2D = {
    x: Number((wall.start.x + ux * clampedOffset).toFixed(3)),
    z: Number((wall.start.z + uz * clampedOffset).toFixed(3)),
  };
  const chaseDepth = faceSide * Math.max(0.005, wall.thickness * 0.5 - 0.034);
  const chasePos: Point2D = {
    x: Number((centerPos.x + nx * chaseDepth).toFixed(3)),
    z: Number((centerPos.z + nz * chaseDepth).toFixed(3)),
  };
  const faceOffset = faceSide * (wall.thickness * 0.5 + 0.026);
  const facePos: Point2D = {
    x: Number((centerPos.x + nx * faceOffset).toFixed(3)),
    z: Number((centerPos.z + nz * faceOffset).toFixed(3)),
  };

  const elevationY =
    slabTopY +
    resolveMountElevation(item.mountRef, item.dropFromTop, item.height, wallHeight);

  return {
    item,
    wall,
    centerPos,
    chasePos,
    facePos,
    normal: { x: nx, z: nz },
    wallAngle: angle,
    faceSide,
    elevationY,
  };
}

export function getJunctionWorldInfo(
  junction: ElectricalJunction,
  walls: WallSegment[],
  wallHeight: number,
  slabTopY = 0,
): JunctionWorldInfo | null {
  const info = getAnchorWorldInfo(junction, walls, wallHeight, slabTopY);
  if (!info) return null;
  return {
    junction: info.item,
    wall: info.wall,
    centerPos: info.centerPos,
    chasePos: info.chasePos,
    facePos: info.facePos,
    normal: info.normal,
    wallAngle: info.wallAngle,
    faceSide: info.faceSide,
    elevationY: info.elevationY,
  };
}

export function getFixtureWorldInfo(
  fixture: PlumbingFixture,
  walls: WallSegment[],
  wallHeight: number,
  slabTopY = 0,
): FixtureWorldInfo | null {
  const info = getAnchorWorldInfo(fixture, walls, wallHeight, slabTopY);
  if (!info) return null;
  return {
    fixture: info.item,
    wall: info.wall,
    centerPos: info.centerPos,
    chasePos: info.chasePos,
    facePos: info.facePos,
    normal: info.normal,
    wallAngle: info.wallAngle,
    faceSide: info.faceSide,
    elevationY: info.elevationY,
  };
}

function findBestHostWallForSegment(
  a: Point2D,
  b: Point2D,
  walls: WallSegment[],
): WallSegment | null {
  let hostWall: WallSegment | null = null;
  let bestScore = Infinity;
  for (const w of walls) {
    if (wallLength(w) < 0.05) continue;
    const pa = projectPointOntoWall(a, w);
    const pb = projectPointOntoWall(b, w);
    const maxReach = w.thickness * 0.5 + 0.34;
    if (pa.distance <= maxReach && pb.distance <= maxReach) {
      const score = pa.distance + pb.distance;
      if (score < bestScore) {
        bestScore = score;
        hostWall = w;
      }
    }
  }
  return hostWall;
}

/**
 * Binds each vertex of a newly drawn wire/pipe run to its nearest junction/fixture target,
 * existing connected wire, or host wall segment (including corner pinStart/pinEnd) so routes stick when walls move.
 */
export function bindWirePointsToWalls(
  points: Array<Point2D | WirePoint>,
  walls: WallSegment[],
  targets: WallAnchorPoint[] = [],
  existingRoutes: Array<{ id: string; points: WirePoint[] }> = [],
): WirePoint[] {
  const targetInfos = targets
    .map((t) => getAnchorWorldInfo(t, walls, 2.6, 0))
    .filter((info): info is AnchorWorldInfo<WallAnchorPoint> => info !== null);

  return points.map((pt, idx) => {
    const existingWp = pt as WirePoint;
    let connectedWireId = existingWp.connectedWireId;

    if (!connectedWireId && existingRoutes.length > 0) {
      for (const er of existingRoutes) {
        for (const ep of er.points) {
          if (distance2D(pt, ep) < 0.08) {
            connectedWireId = er.id;
            break;
          }
        }
        if (connectedWireId) break;
      }
    }

    // 1. Bind directly to a snapped wall junction or plumbing fixture if nearby
    let bestTarget: AnchorWorldInfo<WallAnchorPoint> | null = null;
    let bestTargetDist = 0.2;
    for (const ti of targetInfos) {
      const d = distance2D(pt, ti.centerPos);
      if (d < bestTargetDist) {
        bestTargetDist = d;
        bestTarget = ti;
      }
    }
    if (bestTarget) {
      return {
        x: bestTarget.centerPos.x,
        z: bestTarget.centerPos.z,
        anchorTargetId: bestTarget.item.id,
        wallId: bestTarget.item.wallId,
        offset: bestTarget.item.offset,
        ...(connectedWireId ? { connectedWireId } : {}),
      };
    }

    // 2. Bind to host wall (preferring a wall shared with an adjacent vertex on the same run)
    const neighborPrev = idx > 0 ? points[idx - 1] : null;
    const neighborNext = idx < points.length - 1 ? points[idx + 1] : null;

    if (neighborPrev) {
      const segHost = findBestHostWallForSegment(neighborPrev, pt, walls);
      if (segHost) {
        const len = wallLength(segHost);
        const proj = projectPointOntoWall(pt, segHost);
        const pinEnd =
          proj.offset <= 0.06 ? 'start' : proj.offset >= len - 0.06 ? 'end' : undefined;
        return {
          x: Number(pt.x.toFixed(3)),
          z: Number(pt.z.toFixed(3)),
          wallId: segHost.id,
          offset: Number(proj.offset.toFixed(3)),
          ...(pinEnd ? { pinEnd } : {}),
          ...(connectedWireId ? { connectedWireId } : {}),
        };
      }
    }

    if (neighborNext) {
      const segHost = findBestHostWallForSegment(pt, neighborNext, walls);
      if (segHost) {
        const len = wallLength(segHost);
        const proj = projectPointOntoWall(pt, segHost);
        const pinEnd =
          proj.offset <= 0.06 ? 'start' : proj.offset >= len - 0.06 ? 'end' : undefined;
        return {
          x: Number(pt.x.toFixed(3)),
          z: Number(pt.z.toFixed(3)),
          wallId: segHost.id,
          offset: Number(proj.offset.toFixed(3)),
          ...(pinEnd ? { pinEnd } : {}),
          ...(connectedWireId ? { connectedWireId } : {}),
        };
      }
    }

    let bestWall: WallSegment | null = null;
    let bestProjDist = 0.34;
    let bestOffset = 0;
    for (const w of walls) {
      const len = wallLength(w);
      if (len < 0.05) continue;
      const proj = projectPointOntoWall(pt, w);
      const reach = Math.max(bestProjDist, w.thickness * 0.5 + 0.25);
      if (proj.distance <= reach && proj.distance < bestProjDist + 0.15) {
        bestProjDist = proj.distance;
        bestWall = w;
        bestOffset = proj.offset;
      }
    }

    if (bestWall) {
      const len = wallLength(bestWall);
      const pinEnd =
        bestOffset <= 0.06 ? 'start' : bestOffset >= len - 0.06 ? 'end' : undefined;
      return {
        x: Number(pt.x.toFixed(3)),
        z: Number(pt.z.toFixed(3)),
        wallId: bestWall.id,
        offset: Number(bestOffset.toFixed(3)),
        ...(pinEnd ? { pinEnd } : {}),
        ...(connectedWireId ? { connectedWireId } : {}),
      };
    }

    return {
      x: Number(pt.x.toFixed(3)),
      z: Number(pt.z.toFixed(3)),
      ...(connectedWireId ? { connectedWireId } : {}),
    };
  });
}

function getWallStartDeltaMap(
  prevWalls: WallSegment[],
  nextWalls: WallSegment[],
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const nextW of nextWalls) {
    const prevW = prevWalls.find((w) => w.id === nextW.id);
    if (!prevW) continue;
    const startMoved = distance2D(prevW.start, nextW.start) >= 0.01;
    const endFixed = distance2D(prevW.end, nextW.end) < 0.01;
    if (startMoved && endFixed) {
      deltas.set(nextW.id, wallLength(nextW) - wallLength(prevW));
    }
  }
  return deltas;
}

export function syncWallPointsWithWalls<T extends WallAnchorPoint>(
  items: T[],
  prevWalls: WallSegment[],
  nextWalls: WallSegment[],
): T[] {
  const deltas = getWallStartDeltaMap(prevWalls, nextWalls);
  return items.map((item) => {
    const nextW = nextWalls.find((w) => w.id === item.wallId);
    if (!nextW) return item;
    const nextLen = wallLength(nextW);
    const delta = deltas.get(item.wallId) ?? 0;
    const nextOffset = Math.max(0.1, Math.min(Math.max(0.12, nextLen - 0.1), item.offset + delta));
    return {
      ...item,
      offset: Number(nextOffset.toFixed(3)),
    };
  });
}

export function syncRoutesWithWallsAndTargets<T extends { points: WirePoint[] }>(
  routes: T[],
  prevWalls: WallSegment[],
  nextWalls: WallSegment[],
  targets: WallAnchorPoint[] = [],
): T[] {
  const deltas = getWallStartDeltaMap(prevWalls, nextWalls);
  const targetInfos = new Map<string, AnchorWorldInfo<WallAnchorPoint>>();
  for (const t of targets) {
    const info = getAnchorWorldInfo(t, nextWalls, 2.6, 0);
    if (info) targetInfos.set(t.id, info);
  }

  return routes.map((route) => ({
    ...route,
    points: route.points.map((pt) => {
      if (pt.anchorTargetId) {
        const ti = targetInfos.get(pt.anchorTargetId);
        if (ti) {
          return {
            ...pt,
            x: ti.centerPos.x,
            z: ti.centerPos.z,
            wallId: ti.item.wallId,
            offset: ti.item.offset,
          };
        }
      }

      if (pt.wallId) {
        const nextW = nextWalls.find((w) => w.id === pt.wallId);
        if (nextW) {
          const nextLen = wallLength(nextW);
          if (nextLen >= 0.05) {
            if (pt.pinEnd === 'start') {
              return {
                ...pt,
                x: nextW.start.x,
                z: nextW.start.z,
                offset: 0,
              };
            }
            if (pt.pinEnd === 'end') {
              return {
                ...pt,
                x: nextW.end.x,
                z: nextW.end.z,
                offset: Number(nextLen.toFixed(3)),
              };
            }
            const ux = (nextW.end.x - nextW.start.x) / nextLen;
            const uz = (nextW.end.z - nextW.start.z) / nextLen;
            const delta = deltas.get(nextW.id) ?? 0;
            const nextOff = Math.max(0, Math.min(nextLen, (pt.offset ?? 0) + delta));
            return {
              ...pt,
              x: Number((nextW.start.x + ux * nextOff).toFixed(3)),
              z: Number((nextW.start.z + uz * nextOff).toFixed(3)),
              offset: Number(nextOff.toFixed(3)),
            };
          }
        }
      }

      return pt;
    }),
  }));
}

interface GenericRouteLayoutInput {
  id: string;
  points: WirePoint[];
  color: string;
  mountRef: WireMountRef;
  dropFromTop: number;
  height: number;
}

function computeGenericRouteLayout(
  routes: GenericRouteLayoutInput[],
  targets: WallAnchorPoint[],
  walls: WallSegment[],
  wallHeight: number,
  slabTopY: number,
  isFlatBlueprint: boolean,
  options: {
    y2dBase: number;
    chaseDepthInset: number;
    verticalStep3D: number;
    flatSlotOffsetStart: number;
    flatSlotStep: number;
  },
): Array<{
  id: string;
  color: string;
  segments: WireSegment3D[];
  verticalDrops: Array<{ x: number; z: number; yStart: number; yEnd: number }>;
  nodePoints: Array<{ x: number; y: number; z: number }>;
}> {
  const targetInfos = targets
    .map((t) => getAnchorWorldInfo(t, walls, wallHeight, 0))
    .filter((info): info is AnchorWorldInfo<WallAnchorPoint> => info !== null);

  const getRouteBaseY = (r: GenericRouteLayoutInput): number => {
    const baseElev = resolveMountElevation(r.mountRef, r.dropFromTop, r.height, wallHeight);
    return slabTopY + Math.min(Math.max(0.1, wallHeight - 0.06), baseElev);
  };
  const routeBaseYMap = new Map<string, number>();
  for (const r of routes) {
    routeBaseYMap.set(r.id, getRouteBaseY(r));
  }

  const wallRouteUsers = new Map<string, string[]>();
  for (const r of routes) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      if (distance2D(a, b) < 0.04) continue;
      const host = findBestHostWallForSegment(a, b, walls);
      if (host) {
        const list = wallRouteUsers.get(host.id) ?? [];
        if (!list.includes(r.id)) {
          list.push(r.id);
          wallRouteUsers.set(host.id, list);
        }
      }
    }
  }

  // Assign a single consistent slot per route (via wall-conflict graph coloring)
  // so multi-segment runs stay on one continuous horizontal elevation around corners
  const routeConflicts = new Map<string, Set<string>>();
  for (const r of routes) {
    routeConflicts.set(r.id, new Set());
  }
  for (const users of wallRouteUsers.values()) {
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        const idA = users[i];
        const idB = users[j];
        const yA = routeBaseYMap.get(idA) ?? 0;
        const yB = routeBaseYMap.get(idB) ?? 0;
        if (isFlatBlueprint || Math.abs(yA - yB) < 0.22) {
          routeConflicts.get(idA)?.add(idB);
          routeConflicts.get(idB)?.add(idA);
        }
      }
    }
  }
  const routeSlotMap = new Map<string, number>();
  for (const r of routes) {
    const usedSlots = new Set<number>();
    const neighbors = routeConflicts.get(r.id);
    if (neighbors) {
      for (const nId of neighbors) {
        const s = routeSlotMap.get(nId);
        if (s !== undefined) usedSlots.add(s);
      }
    }
    let slot = 0;
    while (usedSlots.has(slot)) slot++;
    routeSlotMap.set(r.id, slot);
  }

  const computedLayouts = routes.map((route) => {
    const baseY3D = routeBaseYMap.get(route.id) ?? getRouteBaseY(route);
    const slotIdx = routeSlotMap.get(route.id) ?? 0;
    const routeYSeg = isFlatBlueprint
      ? slabTopY + options.y2dBase + slotIdx * 0.004
      : Math.max(slabTopY + 0.08, baseY3D - slotIdx * options.verticalStep3D);

    const segments: Array<WireSegment3D & { dirX?: number; dirZ?: number }> = [];
    const verticalDrops: Array<{ x: number; z: number; yStart: number; yEnd: number }> = [];
    const nodePoints: Array<{ x: number; y: number; z: number }> = [];

    const pointSlotCoords: Array<{ x: number; y: number; z: number } | null> = route.points.map(
      () => null,
    );

    let lastHostWallId: string | null = null;
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      if (distance2D(a, b) < 0.04) continue;

      const hostWall = findBestHostWallForSegment(a, b, walls);
      if (hostWall) {
        const len = wallLength(hostWall);
        const ux = (hostWall.end.x - hostWall.start.x) / len;
        const uz = (hostWall.end.z - hostWall.start.z) / len;
        const nx = -uz;
        const nz = ux;
        const inSide = getWallOutwardSide(hostWall, walls) === 1 ? -1 : 1;

        const pa = projectPointOntoWall(a, hostWall);
        const pb = projectPointOntoWall(b, hostWall);

        const ySeg = routeYSeg;

        // In 3D, bury cables/pipes well inside the wall core so they never bleed through non-X-ray walls
        const chaseDepth = Math.max(
          0.004,
          hostWall.thickness * 0.5 - options.chaseDepthInset - Math.min(0.016, slotIdx * 0.005),
        );
        const faceOffset = isFlatBlueprint
          ? inSide * (hostWall.thickness * 0.5 + options.flatSlotOffsetStart + slotIdx * options.flatSlotStep)
          : inSide * chaseDepth;

        const startPt = {
          x: pa.point.x + nx * faceOffset,
          y: ySeg,
          z: pa.point.z + nz * faceOffset,
        };
        const endPt = {
          x: pb.point.x + nx * faceOffset,
          y: ySeg,
          z: pb.point.z + nz * faceOffset,
        };

        if (segments.length > 0) {
          const prevSeg = segments[segments.length - 1];
          const prevEnd = prevSeg.end;
          let mitered = false;

          // Compute clean 2D miter intersection when turning a corner from one wall onto another
          if (
            lastHostWallId &&
            lastHostWallId !== hostWall.id &&
            prevSeg.dirX !== undefined &&
            prevSeg.dirZ !== undefined
          ) {
            const det = prevSeg.dirX * nz - prevSeg.dirZ * nx;
            const cross = prevSeg.dirX * uz - prevSeg.dirZ * ux;
            if (Math.abs(cross) > 0.15) {
              const dxOff = startPt.x - prevEnd.x;
              const dzOff = startPt.z - prevEnd.z;
              const tMiter = (dxOff * uz - dzOff * ux) / cross;
              const mx = prevEnd.x + prevSeg.dirX * tMiter;
              const mz = prevEnd.z + prevSeg.dirZ * tMiter;
              if (Math.hypot(mx - a.x, mz - a.z) <= 0.55) {
                prevSeg.end = { x: mx, y: prevEnd.y, z: mz };
                startPt.x = mx;
                startPt.z = mz;
                if (!isFlatBlueprint && Math.abs(prevEnd.y - startPt.y) > 0.025) {
                  verticalDrops.push({
                    x: mx,
                    z: mz,
                    yStart: prevEnd.y,
                    yEnd: startPt.y,
                  });
                }
                mitered = true;
              }
            }
            void det;
          }

          if (!mitered && Math.hypot(prevEnd.x - startPt.x, prevEnd.y - startPt.y, prevEnd.z - startPt.z) > 0.012) {
            // Orthogonal corner bridge rather than slanted diagonal when turning between offset tracks
            const gapXZ = Math.hypot(prevEnd.x - startPt.x, prevEnd.z - startPt.z);
            if (gapXZ > 0.012) {
              segments.push({
                start: prevEnd,
                end: { x: startPt.x, y: isFlatBlueprint ? startPt.y : prevEnd.y, z: startPt.z },
                mountedOnWall: true,
              });
            }
            if (!isFlatBlueprint && Math.abs(prevEnd.y - startPt.y) > 0.025) {
              verticalDrops.push({
                x: startPt.x,
                z: startPt.z,
                yStart: prevEnd.y,
                yEnd: startPt.y,
              });
            }
          }
        }

        segments.push({ start: startPt, end: endPt, mountedOnWall: true, dirX: ux, dirZ: uz });
        pointSlotCoords[i] = startPt;
        pointSlotCoords[i + 1] = endPt;
        lastHostWallId = hostWall.id;
      } else {
        const ySeg = routeYSeg;
        const startPt = { x: a.x, y: ySeg, z: a.z };
        const endPt = { x: b.x, y: ySeg, z: b.z };
        if (segments.length > 0) {
          const prevEnd = segments[segments.length - 1].end;
          if (Math.hypot(prevEnd.x - startPt.x, prevEnd.y - startPt.y, prevEnd.z - startPt.z) > 0.012) {
            const gapXZ = Math.hypot(prevEnd.x - startPt.x, prevEnd.z - startPt.z);
            if (gapXZ > 0.012) {
              segments.push({
                start: prevEnd,
                end: { x: startPt.x, y: isFlatBlueprint ? startPt.y : prevEnd.y, z: startPt.z },
                mountedOnWall: false,
              });
            }
            if (!isFlatBlueprint && Math.abs(prevEnd.y - startPt.y) > 0.025) {
              verticalDrops.push({
                x: startPt.x,
                z: startPt.z,
                yStart: prevEnd.y,
                yEnd: startPt.y,
              });
            }
          }
        }
        segments.push({ start: startPt, end: endPt, mountedOnWall: false });
        if (!pointSlotCoords[i]) pointSlotCoords[i] = startPt;
        pointSlotCoords[i + 1] = endPt;
        lastHostWallId = null;
      }
    }

    const handledDropKeys = new Set<string>();
    const addTargetDropAndStub = (
      nearTarget: AnchorWorldInfo<WallAnchorPoint>,
      anchorCoord: { x: number; y: number; z: number },
    ) => {
      handledDropKeys.add(nearTarget.item.id);
      const tUx = Math.cos(nearTarget.wallAngle);
      const tUz = Math.sin(nearTarget.wallAngle);

      if (isFlatBlueprint) {
        if (distance2D(anchorCoord, nearTarget.facePos) > 0.015) {
          // Route orthogonally along target wall axis then perpendicular into fixture/junction face
          const relX = anchorCoord.x - nearTarget.facePos.x;
          const relZ = anchorCoord.z - nearTarget.facePos.z;
          const alongDist = relX * tUx + relZ * tUz;
          const teePt = {
            x: nearTarget.facePos.x + tUx * alongDist,
            y: anchorCoord.y,
            z: nearTarget.facePos.z + tUz * alongDist,
          };
          const perpPt = {
            x: nearTarget.facePos.x + tUx * 0 + (anchorCoord.x - nearTarget.facePos.x - tUx * alongDist),
            y: anchorCoord.y,
            z: nearTarget.facePos.z + tUz * 0 + (anchorCoord.z - nearTarget.facePos.z - tUz * alongDist),
          };
          if (Math.abs(alongDist) > 0.015 && distance2D(anchorCoord, teePt) > 0.015) {
            segments.push({ start: anchorCoord, end: perpPt, mountedOnWall: true });
            nodePoints.push(perpPt);
            segments.push({
              start: perpPt,
              end: { x: nearTarget.facePos.x, y: anchorCoord.y, z: nearTarget.facePos.z },
              mountedOnWall: true,
            });
          } else {
            segments.push({
              start: anchorCoord,
              end: {
                x: nearTarget.facePos.x,
                y: anchorCoord.y,
                z: nearTarget.facePos.z,
              },
              mountedOnWall: true,
            });
          }
        }
        return;
      }

      const jY =
        slabTopY + Math.min(Math.max(0.12, wallHeight - 0.05), nearTarget.elevationY);
      if (distance2D(anchorCoord, nearTarget.chasePos) > 0.012) {
        const relX = anchorCoord.x - nearTarget.chasePos.x;
        const relZ = anchorCoord.z - nearTarget.chasePos.z;
        const alongDist = relX * tUx + relZ * tUz;
        const alignedOnWall = {
          x: anchorCoord.x - tUx * alongDist,
          y: anchorCoord.y,
          z: anchorCoord.z - tUz * alongDist,
        };
        if (Math.abs(alongDist) > 0.018 && distance2D(alignedOnWall, nearTarget.chasePos) > 0.018) {
          segments.push({ start: anchorCoord, end: alignedOnWall, mountedOnWall: true });
          nodePoints.push(alignedOnWall);
          segments.push({
            start: alignedOnWall,
            end: { x: nearTarget.chasePos.x, y: anchorCoord.y, z: nearTarget.chasePos.z },
            mountedOnWall: true,
          });
        } else {
          segments.push({
            start: anchorCoord,
            end: {
              x: nearTarget.chasePos.x,
              y: anchorCoord.y,
              z: nearTarget.chasePos.z,
            },
            mountedOnWall: true,
          });
        }
      }
      if (Math.abs(anchorCoord.y - jY) > 0.04) {
        // Drop/riser inside wall chase, then stub out to the flush box/valve face
        verticalDrops.push({
          x: nearTarget.chasePos.x,
          z: nearTarget.chasePos.z,
          yStart: anchorCoord.y,
          yEnd: jY,
        });
      }
      if (distance2D(nearTarget.chasePos, nearTarget.facePos) > 0.01) {
        segments.push({
          start: {
            x: nearTarget.chasePos.x,
            y: jY,
            z: nearTarget.chasePos.z,
          },
          end: {
            x: nearTarget.facePos.x,
            y: jY,
            z: nearTarget.facePos.z,
          },
          mountedOnWall: true,
        });
      }
    };

    const pointRenderedCoords: Array<{ x: number; y: number; z: number }> = [];
    route.points.forEach((pt, idx) => {
      const renderedCoord = pointSlotCoords[idx] ?? {
        x: pt.x,
        y: isFlatBlueprint ? slabTopY + options.y2dBase : baseY3D,
        z: pt.z,
      };
      pointRenderedCoords.push(renderedCoord);
      nodePoints.push(renderedCoord);

      const nearTarget =
        (pt.anchorTargetId
          ? targetInfos.find(
              (ti) =>
                ti.item.id === pt.anchorTargetId &&
                !ti.item.disconnectedWireIds?.includes(route.id),
            )
          : undefined) ??
        targetInfos.find(
          (ti) =>
            !ti.item.disconnectedWireIds?.includes(route.id) &&
            distance2D(ti.centerPos, pt) < 0.22,
        );

      if (nearTarget && !handledDropKeys.has(nearTarget.item.id)) {
        addTargetDropAndStub(nearTarget, renderedCoord);
      }
    });

    // Also branch off the nearest point on this route to any wall-mounted target explicitly connected via connectedWireIds
    const baseSegments = [...segments];
    for (const ti of targetInfos) {
      if (handledDropKeys.has(ti.item.id)) continue;
      if (!ti.item.connectedWireIds?.includes(route.id)) continue;

      let bestAnchor: { x: number; y: number; z: number } | null = null;
      let bestDist = Infinity;

      for (const seg of baseSegments) {
        const sdx = seg.end.x - seg.start.x;
        const sdz = seg.end.z - seg.start.z;
        const sLenSq = sdx * sdx + sdz * sdz;
        const t =
          sLenSq > 1e-6
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((ti.centerPos.x - seg.start.x) * sdx + (ti.centerPos.z - seg.start.z) * sdz) /
                    sLenSq,
                ),
              )
            : 0;
        const cx = seg.start.x + sdx * t;
        const cy = seg.start.y + (seg.end.y - seg.start.y) * t;
        const cz = seg.start.z + sdz * t;
        const d = Math.hypot(ti.centerPos.x - cx, ti.centerPos.z - cz);
        if (d < bestDist) {
          bestDist = d;
          bestAnchor = { x: cx, y: cy, z: cz };
        }
      }

      if (!bestAnchor && route.points.length > 0) {
        const p0 = route.points[0];
        bestAnchor = {
          x: p0.x,
          y: isFlatBlueprint ? slabTopY + options.y2dBase : baseY3D,
          z: p0.z,
        };
      }

      if (bestAnchor) {
        nodePoints.push(bestAnchor);
        addTargetDropAndStub(ti, bestAnchor);
      }
    }

    return {
      id: route.id,
      route,
      color: route.color,
      segments,
      baseSegments,
      verticalDrops,
      nodePoints,
      pointRenderedCoords,
    };
  });

  // Second pass: visually bridge wire-to-wire splice vertices onto target wire conduits in 2D and 3D
  const layoutById = new Map(computedLayouts.map((l) => [l.id, l]));
  for (const layout of computedLayouts) {
    layout.route.points.forEach((pt, idx) => {
      if (!pt.connectedWireId) return;
      const targetLayout = layoutById.get(pt.connectedWireId);
      if (!targetLayout) return;
      const ownCoord = layout.pointRenderedCoords[idx];
      if (!ownCoord) return;

      let bestBridge: { x: number; y: number; z: number } | null = null;
      let bestDist = Infinity;
      for (const seg of targetLayout.baseSegments) {
        const sdx = seg.end.x - seg.start.x;
        const sdz = seg.end.z - seg.start.z;
        const sLenSq = sdx * sdx + sdz * sdz;
        const t =
          sLenSq > 1e-6
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((ownCoord.x - seg.start.x) * sdx + (ownCoord.z - seg.start.z) * sdz) / sLenSq,
                ),
              )
            : 0;
        const cx = seg.start.x + sdx * t;
        const cy = seg.start.y + (seg.end.y - seg.start.y) * t;
        const cz = seg.start.z + sdz * t;
        const d = Math.hypot(ownCoord.x - cx, ownCoord.z - cz);
        if (d < bestDist) {
          bestDist = d;
          bestBridge = { x: cx, y: cy, z: cz };
        }
      }

      if (bestBridge) {
        if (Math.hypot(ownCoord.x - bestBridge.x, ownCoord.z - bestBridge.z) > 0.015) {
          layout.segments.push({
            start: ownCoord,
            end: {
              x: bestBridge.x,
              y: isFlatBlueprint ? Math.max(ownCoord.y, bestBridge.y) : ownCoord.y,
              z: bestBridge.z,
            },
            mountedOnWall: true,
          });
        }
        if (!isFlatBlueprint && Math.abs(ownCoord.y - bestBridge.y) > 0.03) {
          layout.verticalDrops.push({
            x: bestBridge.x,
            z: bestBridge.z,
            yStart: ownCoord.y,
            yEnd: bestBridge.y,
          });
        }
        layout.nodePoints.push(bestBridge);
      }
    });
  }

  return computedLayouts.map(({ id, color, segments, verticalDrops, nodePoints }) => ({
    id,
    color,
    segments,
    verticalDrops,
    nodePoints,
  }));
}

/**
 * Computes 2D/3D conduit layout for all electrical wires, burying 3D conduits slightly under the wall skin
 * and staggering parallel breaker runs on the same wall so they never overlap.
 */
export function computeAllWireRenderData(
  wires: ElectricalWire[],
  junctions: ElectricalJunction[],
  walls: WallSegment[],
  wallHeight: number,
  slabTopY: number,
  isFlatBlueprint: boolean,
): WireRenderData[] {
  const layouts = computeGenericRouteLayout(
    wires.map((w) => ({
      id: w.id,
      points: w.points,
      color: getWireDisplayColor(w.circuit, w.breakerLabel),
      mountRef: w.mountRef,
      dropFromTop: w.dropFromTop,
      height: w.height,
    })),
    junctions,
    walls,
    wallHeight,
    slabTopY,
    isFlatBlueprint,
    {
      y2dBase: 0.175,
      chaseDepthInset: 0.034,
      verticalStep3D: 0.044,
      flatSlotOffsetStart: 0.075,
      flatSlotStep: 0.085,
    },
  );
  return layouts.map((layout, idx) => ({
    wire: wires[idx],
    color: layout.color,
    segments: layout.segments,
    verticalDrops: layout.verticalDrops,
    nodePoints: layout.nodePoints,
  }));
}

/**
 * Computes 2D/3D pipe layout for plumbing lines, burying 3D pipes under the wall skin
 * and generating vertical risers/drops to connected fixtures.
 */
export function computeAllPlumbingRenderData(
  pipes: PlumbingPipe[],
  fixtures: PlumbingFixture[],
  walls: WallSegment[],
  wallHeight: number,
  slabTopY: number,
  isFlatBlueprint: boolean,
): PlumbingRenderData[] {
  const layouts = computeGenericRouteLayout(
    pipes.map((p) => ({
      id: p.id,
      points: p.points,
      color: getPlumbingDisplayColor(p.pipeType, p.pipeSpec),
      mountRef: p.mountRef,
      dropFromTop: p.dropFromTop,
      height: p.height,
    })),
    fixtures,
    walls,
    wallHeight,
    slabTopY,
    isFlatBlueprint,
    {
      y2dBase: 0.172,
      chaseDepthInset: 0.034,
      verticalStep3D: 0.052,
      flatSlotOffsetStart: 0.095,
      flatSlotStep: 0.09,
    },
  );
  return layouts.map((layout, idx) => ({
    pipe: pipes[idx],
    color: layout.color,
    segments: layout.segments,
    verticalDrops: layout.verticalDrops,
    nodePoints: layout.nodePoints,
  }));
}

export function computeDraftRouteLength(
  points: Point2D[],
  mountRef: WireMountRef,
  dropFromTop: number,
  floorHeight: number,
  targets: WallAnchorPoint[],
  walls: WallSegment[],
  wallHeight: number,
  routeId?: string,
): WireLengthBreakdown {
  let horizontalMeters = 0;
  for (let i = 0; i < points.length - 1; i++) {
    horizontalMeters += distance2D(points[i], points[i + 1]);
  }

  const elevationY = resolveMountElevation(mountRef, dropFromTop, floorHeight, wallHeight);
  const targetInfos = targets
    .map((t) => getAnchorWorldInfo(t, walls, wallHeight, 0))
    .filter((info): info is AnchorWorldInfo<WallAnchorPoint> => info !== null);

  let verticalDropsMeters = 0;
  let dropCount = 0;
  const countedTargets = new Set<string>();

  for (const pt of points) {
    const wp = pt as WirePoint;
    const match =
      (wp.anchorTargetId
        ? targetInfos.find(
            (ti) =>
              ti.item.id === wp.anchorTargetId &&
              !(routeId && ti.item.disconnectedWireIds?.includes(routeId)),
          )
        : undefined) ??
      targetInfos.find(
        (ti) =>
          !(routeId && ti.item.disconnectedWireIds?.includes(routeId)) &&
          distance2D(ti.centerPos, pt) < 0.22,
      );

    if (match && !countedTargets.has(match.item.id)) {
      countedTargets.add(match.item.id);
      const diff = Math.abs(elevationY - match.elevationY);
      if (diff > 0.04) {
        verticalDropsMeters += diff;
        dropCount += 1;
      }
    }
  }

  if (routeId) {
    for (const ti of targetInfos) {
      if (countedTargets.has(ti.item.id)) continue;
      if (!ti.item.connectedWireIds?.includes(routeId)) continue;
      countedTargets.add(ti.item.id);

      let minSegDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const sdx = b.x - a.x;
        const sdz = b.z - a.z;
        const lenSq = sdx * sdx + sdz * sdz;
        const t =
          lenSq > 1e-6
            ? Math.max(
                0,
                Math.min(1, ((ti.centerPos.x - a.x) * sdx + (ti.centerPos.z - a.z) * sdz) / lenSq),
              )
            : 0;
        const d = Math.hypot(ti.centerPos.x - (a.x + sdx * t), ti.centerPos.z - (a.z + sdz * t));
        if (d < minSegDist) minSegDist = d;
      }
      if (Number.isFinite(minSegDist) && minSegDist > 0.2) {
        horizontalMeters += minSegDist;
      }

      const diff = Math.abs(elevationY - ti.elevationY);
      if (diff > 0.04) {
        verticalDropsMeters += diff;
        dropCount += 1;
      }
    }
  }

  return {
    horizontalMeters: Number(horizontalMeters.toFixed(2)),
    verticalDropsMeters: Number(verticalDropsMeters.toFixed(2)),
    dropCount,
    totalMeters: Number((horizontalMeters + verticalDropsMeters).toFixed(2)),
    elevationY: Number(elevationY.toFixed(2)),
  };
}

export function computeDraftWireLength(
  points: Point2D[],
  mountRef: WireMountRef,
  dropFromTop: number,
  floorHeight: number,
  junctions: ElectricalJunction[],
  walls: WallSegment[],
  wallHeight: number,
): WireLengthBreakdown {
  return computeDraftRouteLength(
    points,
    mountRef,
    dropFromTop,
    floorHeight,
    junctions,
    walls,
    wallHeight,
  );
}

export function computeWireLengthBreakdown(
  wire: ElectricalWire,
  junctions: ElectricalJunction[],
  walls: WallSegment[],
  wallHeight: number,
): WireLengthBreakdown {
  return computeDraftRouteLength(
    wire.points,
    wire.mountRef,
    wire.dropFromTop,
    wire.height,
    junctions,
    walls,
    wallHeight,
    wire.id,
  );
}

export function doesWireTraverseWall(
  wire: ElectricalWire,
  wallId: string,
  walls: WallSegment[],
): boolean {
  if (wire.points.some((p) => p.wallId === wallId)) return true;
  const targetWall = walls.find((w) => w.id === wallId);
  if (!targetWall) return false;
  for (let i = 0; i < wire.points.length - 1; i++) {
    const host = findBestHostWallForSegment(wire.points[i], wire.points[i + 1], walls);
    if (host?.id === wallId) return true;
  }
  return false;
}

export function getJunctionConnectedWireIds(
  junction: ElectricalJunction,
  wires: ElectricalWire[],
  walls: WallSegment[],
): { vertexWireIds: string[]; tapWireIds: string[]; allWireIds: string[] } {
  const jInfo = getJunctionWorldInfo(junction, walls, 2.6, 0);
  const vertexWireIds: string[] = [];
  const tapWireIds: string[] = [];

  for (const w of wires) {
    if (junction.disconnectedWireIds?.includes(w.id)) {
      continue;
    }
    const hasVertex = w.points.some(
      (pt) =>
        pt.anchorTargetId === junction.id ||
        (jInfo ? distance2D(jInfo.centerPos, pt) < 0.22 : false),
    );
    if (hasVertex) {
      vertexWireIds.push(w.id);
    } else if (junction.connectedWireIds?.includes(w.id)) {
      tapWireIds.push(w.id);
    }
  }

  return {
    vertexWireIds,
    tapWireIds,
    allWireIds: [...vertexWireIds, ...tapWireIds],
  };
}

export function getWireConnectedJunctionIds(
  wire: ElectricalWire,
  junctions: ElectricalJunction[],
  walls: WallSegment[],
): string[] {
  const result: string[] = [];
  for (const j of junctions) {
    if (j.disconnectedWireIds?.includes(wire.id)) {
      continue;
    }
    const jInfo = getJunctionWorldInfo(j, walls, 2.6, 0);
    const hasVertex = wire.points.some(
      (pt) =>
        pt.anchorTargetId === j.id ||
        (jInfo ? distance2D(jInfo.centerPos, pt) < 0.22 : false),
    );
    if (hasVertex || j.connectedWireIds?.includes(wire.id)) {
      result.push(j.id);
    }
  }
  return result;
}

export function computePipeLengthBreakdown(
  pipe: PlumbingPipe,
  fixtures: PlumbingFixture[],
  walls: WallSegment[],
  wallHeight: number,
): WireLengthBreakdown {
  return computeDraftRouteLength(
    pipe.points,
    pipe.mountRef,
    pipe.dropFromTop,
    pipe.height,
    fixtures,
    walls,
    wallHeight,
  );
}

export function computeStructureSummary(
  walls: WallSegment[],
  wallHeight: number,
): StructureSummary {
  const effectiveH = Math.max(0.12, wallHeight);
  let totalWallMeters = 0;
  let openingAreaSqM = 0;
  let doorCount = 0;
  let doubleDoorCount = 0;
  let slidingDoorCount = 0;
  let garageDoorCount = 0;
  let windowCount = 0;

  for (const w of walls) {
    totalWallMeters += wallLength(w);
    for (const op of w.openings) {
      openingAreaSqM += op.width * Math.min(op.height, effectiveH);
      if (op.type === 'door') doorCount += 1;
      else if (op.type === 'double-door') doubleDoorCount += 1;
      else if (op.type === 'sliding-door') slidingDoorCount += 1;
      else if (op.type === 'garage-door') garageDoorCount += 1;
      else if (op.type === 'window') windowCount += 1;
    }
  }

  const grossWallAreaSqM = totalWallMeters * effectiveH;
  const netWallAreaSqM = Math.max(0, grossWallAreaSqM - openingAreaSqM);
  const bounds = computeFloorBounds(walls, 0);
  const footprintSqM = walls.length > 0 ? bounds.width * bounds.depth : 0;

  return {
    wallCount: walls.length,
    totalWallMeters: Number(totalWallMeters.toFixed(2)),
    grossWallAreaSqM: Number(grossWallAreaSqM.toFixed(2)),
    netWallAreaSqM: Number(netWallAreaSqM.toFixed(2)),
    footprintSqM: Number(footprintSqM.toFixed(2)),
    doorCount,
    doubleDoorCount,
    slidingDoorCount,
    garageDoorCount,
    windowCount,
  };
}

export function getWireConnectedWireIds(
  wire: ElectricalWire,
  allWires: ElectricalWire[],
): string[] {
  const result = new Set<string>();
  for (const pt of wire.points) {
    if (pt.connectedWireId && pt.connectedWireId !== wire.id) {
      result.add(pt.connectedWireId);
    }
  }
  for (const other of allWires) {
    if (other.id === wire.id) continue;
    if (other.points.some((pt) => pt.connectedWireId === wire.id)) {
      result.add(other.id);
    }
  }
  return Array.from(result);
}

/**
 * Legacy single-wire helper retained for compatibility.
 */
export function computeWireSegments3D(
  wire: ElectricalWire,
  walls: WallSegment[],
  wallHeight: number,
  slabTopY: number,
): WireSegment3D[] {
  return computeAllWireRenderData([wire], [], walls, wallHeight, slabTopY, false)[0]?.segments ?? [];
}

/* ---------------- SECURITY DEVICES & FOV COVERAGE RAYCASTING ---------------- */

export interface SecurityCoverageResult {
  origin: Point2D;
  polygon: Point2D[];
  boundaryPoints: Point2D[];
  areaSqM: number;
  unobstructedAreaSqM: number;
  coveragePct: number;
}

export function getSecurityDeviceWorldInfo(
  device: SecurityDevice,
  walls: WallSegment[],
): {
  x: number;
  z: number;
  yawDeg: number;
  wall: WallSegment | null;
  wallAngle: number | null;
  faceSide: 1 | -1;
} {
  if (device.wallId) {
    const wall = walls.find((w) => w.id === device.wallId) ?? null;
    if (wall) {
      const len = wallLength(wall);
      if (len >= 0.1) {
        const ang = wallAngleRad(wall);
        const ux = Math.cos(ang);
        const uz = Math.sin(ang);
        const nx = -uz;
        const nz = ux;
        const inSide: 1 | -1 = getWallOutwardSide(wall, walls) === 1 ? -1 : 1;
        const faceSide: 1 | -1 = device.faceSide ?? inSide;
        const clampedOff = Math.max(0.08, Math.min(len - 0.08, device.offset ?? len * 0.5));
        const faceOffset = faceSide * (wall.thickness * 0.5 + 0.05);
        return {
          x: Number((wall.start.x + ux * clampedOff + nx * faceOffset).toFixed(3)),
          z: Number((wall.start.z + uz * clampedOff + nz * faceOffset).toFixed(3)),
          yawDeg: device.yawDeg,
          wall,
          wallAngle: ang,
          faceSide,
        };
      }
    }
  }
  return {
    x: device.x,
    z: device.z,
    yawDeg: device.yawDeg,
    wall: null,
    wallAngle: null,
    faceSide: device.faceSide ?? 1,
  };
}

export function syncSecurityDevicesWithWalls(
  devices: SecurityDevice[],
  prevWalls: WallSegment[],
  nextWalls: WallSegment[],
): SecurityDevice[] {
  const deltas = getWallStartDeltaMap(prevWalls, nextWalls);
  return devices.map((dev) => {
    if (!dev.wallId) return dev;
    const prevW = prevWalls.find((w) => w.id === dev.wallId);
    const nextW = nextWalls.find((w) => w.id === dev.wallId);
    if (!nextW) {
      // Wall deleted — detach cleanly as free device at last position
      return { ...dev, wallId: undefined, offset: undefined };
    }
    const nextLen = wallLength(nextW);
    if (nextLen < 0.1) return dev;
    const delta = deltas.get(nextW.id) ?? 0;
    const baseOff = dev.offset ?? nextLen * 0.5;
    const nextOffset = Math.max(0.1, Math.min(Math.max(0.12, nextLen - 0.1), baseOff + delta));

    let nextYawDeg = dev.yawDeg;
    if (prevW && wallLength(prevW) >= 0.1) {
      const prevAng = wallAngleRad(prevW);
      const nextAng = wallAngleRad(nextW);
      const rotDeg = ((nextAng - prevAng) * 180) / Math.PI;
      if (Math.abs(rotDeg) > 0.05) {
        nextYawDeg = ((nextYawDeg + rotDeg) % 360 + 360) % 360;
      }
    }

    const ang = wallAngleRad(nextW);
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    const nx = -uz;
    const nz = ux;
    const inSide: 1 | -1 = getWallOutwardSide(nextW, nextWalls) === 1 ? -1 : 1;
    const faceSide: 1 | -1 = dev.faceSide ?? inSide;
    const faceOffset = faceSide * (nextW.thickness * 0.5 + 0.05);

    return {
      ...dev,
      offset: Number(nextOffset.toFixed(3)),
      yawDeg: Number(nextYawDeg.toFixed(1)),
      x: Number((nextW.start.x + ux * nextOffset + nx * faceOffset).toFixed(3)),
      z: Number((nextW.start.z + uz * nextOffset + nz * faceOffset).toFixed(3)),
    };
  });
}

export function getSecurityPlacementSnap(
  raw: Point2D,
  kind: SecurityDeviceKind,
  walls: WallSegment[],
  snapMode: SnapMode,
  shiftKey: boolean,
): Omit<SecurityDevice, 'id'> {
  const info = SECURITY_DEVICE_INFO[kind];
  const effectiveSnap = resolveEffectiveSnapMode(snapMode, shiftKey);

  // Snap onto a nearby wall face pointing inward into the room unless Shift is held or placing 360° ceiling PIR
  let bestWall: WallSegment | null = null;
  let bestProj: WallProjection | null = null;
  let bestDist = shiftKey ? 0 : kind === 'ceiling-pir' ? 0.14 : 0.65;

  for (const w of walls) {
    if (wallLength(w) < 0.25) continue;
    const proj = projectPointOntoWall(raw, w);
    if (proj.distance < bestDist) {
      bestDist = proj.distance;
      bestWall = w;
      bestProj = proj;
    }
  }

  if (bestWall && bestProj) {
    const len = wallLength(bestWall);
    const ang = wallAngleRad(bestWall);
    const ux = Math.cos(ang);
    const uz = Math.sin(ang);
    const nx = -uz;
    const nz = ux;

    // Determine which side of the wall the pointer is on, defaulting to inward side
    const relX = raw.x - bestProj.point.x;
    const relZ = raw.z - bestProj.point.z;
    const pointerSideDot = relX * nx + relZ * nz;
    const defaultInSide: 1 | -1 = getWallOutwardSide(bestWall, walls) === 1 ? -1 : 1;
    const faceSide: 1 | -1 =
      Math.abs(pointerSideDot) > 0.08 ? (pointerSideDot >= 0 ? 1 : -1) : defaultInSide;

    const clampedRaw = Math.max(0.12, Math.min(len - 0.12, bestProj.offset));
    const offset =
      effectiveSnap === 'free'
        ? Number(clampedRaw.toFixed(2))
        : Math.max(0.12, Math.min(len - 0.12, Math.round(clampedRaw / 0.05) * 0.05));

    const faceOff = faceSide * (bestWall.thickness * 0.5 + 0.05);
    const x = Number((bestWall.start.x + ux * offset + nx * faceOff).toFixed(3));
    const z = Number((bestWall.start.z + uz * offset + nz * faceOff).toFixed(3));
    const yawDeg =
      ((Math.round((Math.atan2(nz * faceSide, nx * faceSide) * 180) / Math.PI) % 360) + 360) % 360;

    return {
      kind,
      x,
      z,
      wallId: bestWall.id,
      offset,
      faceSide,
      yawDeg,
      tiltDeg: info.defaultTiltDeg,
      fovDeg: info.defaultFovDeg,
      rangeMeters: info.defaultRangeMeters,
      mountHeight: info.defaultMountHeight,
    };
  }

  const step = getGridStepForSnapMode(effectiveSnap);
  const x =
    step > 0 ? Number((Math.round(raw.x / step) * step).toFixed(3)) : Number(raw.x.toFixed(3));
  const z =
    step > 0 ? Number((Math.round(raw.z / step) * step).toFixed(3)) : Number(raw.z.toFixed(3));

  return {
    kind,
    x,
    z,
    yawDeg: 90,
    tiltDeg: info.defaultTiltDeg,
    fovDeg: info.defaultFovDeg,
    rangeMeters: info.defaultRangeMeters,
    mountHeight: info.defaultMountHeight,
  };
}

interface OccluderSeg2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function buildSecurityOccluders(
  walls: WallSegment[],
  seesThroughGlass: boolean,
  hostWallId?: string,
): OccluderSeg2D[] {
  const segs: OccluderSeg2D[] = [];

  for (const wall of walls) {
    const len = wallLength(wall);
    if (len < 0.05) continue;
    const ux = (wall.end.x - wall.start.x) / len;
    const uz = (wall.end.z - wall.start.z) / len;
    const nx = -uz;
    const nz = ux;
    const { startExtend, endExtend } = getWallEndpointExtensions(wall, walls);
    const sMin = -startExtend;
    const sMax = len + endExtend;
    const openings = normalizeWallOpenings(wall);

    // Solid piers + closed openings block rays
    const blockedIntervals: Array<{ a: number; b: number }> = [];
    let cursor = sMin;

    for (const item of openings) {
      const opStart = item.clampedOffset - item.clampedWidth * 0.5;
      const opEnd = item.clampedOffset + item.clampedWidth * 0.5;
      if (opStart - cursor > 0.01) {
        blockedIntervals.push({ a: cursor, b: opStart });
      }
      const isWindow = item.opening.type === 'window';
      const isPassThrough =
        (isDoorOpening(item.opening.type) && Boolean(item.opening.isOpen)) ||
        (isWindow && (seesThroughGlass || Boolean(item.opening.isOpen)));
      if (!isPassThrough) {
        blockedIntervals.push({ a: opStart, b: opEnd });
      }
      cursor = opEnd;
    }

    if (sMax - cursor > 0.01) {
      blockedIntervals.push({ a: cursor, b: sMax });
    }

    // Use both front and back faces of walls (or only back/centerline for own host wall so lens isn't occluded by own surface)
    const halfT = wall.thickness * 0.5;
    const faceOffsets = wall.id === hostWallId ? [0] : [-halfT, halfT];

    for (const interval of blockedIntervals) {
      for (const fOff of faceOffsets) {
        segs.push({
          ax: wall.start.x + ux * interval.a + nx * fOff,
          az: wall.start.z + uz * interval.a + nz * fOff,
          bx: wall.start.x + ux * interval.b + nx * fOff,
          bz: wall.start.z + uz * interval.b + nz * fOff,
        });
      }
      if (wall.id !== hostWallId) {
        // End caps for solid ends
        segs.push({
          ax: wall.start.x + ux * interval.a - nx * halfT,
          az: wall.start.z + uz * interval.a - nz * halfT,
          bx: wall.start.x + ux * interval.a + nx * halfT,
          bz: wall.start.z + uz * interval.a + nz * halfT,
        });
        segs.push({
          ax: wall.start.x + ux * interval.b - nx * halfT,
          az: wall.start.z + uz * interval.b - nz * halfT,
          bx: wall.start.x + ux * interval.b + nx * halfT,
          bz: wall.start.z + uz * interval.b + nz * halfT,
        });
      }
    }
  }

  return segs;
}

function normalizeSignedAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function raySegmentIntersectDist(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  seg: OccluderSeg2D,
): number | null {
  const sx = seg.bx - seg.ax;
  const sz = seg.bz - seg.az;
  const denom = dx * sz - dz * sx;
  if (Math.abs(denom) < 1e-8) return null;
  const qx = seg.ax - ox;
  const qz = seg.az - oz;
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * dz - qz * dx) / denom;
  if (t > 0.025 && u >= -1e-4 && u <= 1 + 1e-4) {
    return t;
  }
  return null;
}

export function computeSecurityCoverage(
  device: SecurityDevice,
  walls: WallSegment[],
  _wallHeight = 2.6,
): SecurityCoverageResult {
  const origin = { x: device.x, z: device.z };
  const fovDeg = Math.max(0, Math.min(360, device.fovDeg));
  const range = Math.max(0, device.rangeMeters);

  if (fovDeg < 1 || range < 0.2) {
    return {
      origin,
      polygon: [],
      boundaryPoints: [],
      areaSqM: 0,
      unobstructedAreaSqM: 0,
      coveragePct: 0,
    };
  }

  const info = SECURITY_DEVICE_INFO[device.kind];
  const yawRad = (device.yawDeg * Math.PI) / 180;
  const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
  const isFullCircle = fovDeg >= 359;

  const occluders = buildSecurityOccluders(walls, info.seesThroughGlass, device.wallId);
  const relAngles: number[] = [];

  const stepRad = (2.0 * Math.PI) / 180;
  const steps = Math.max(6, Math.ceil((halfFovRad * 2) / stepRad));
  for (let i = 0; i <= steps; i++) {
    const rel = -halfFovRad + (i / steps) * (halfFovRad * 2);
    relAngles.push(rel);
  }

  // Add corner-hugging rays around obstacle endpoints inside the FOV for crisp wall shadows
  const maxCheckSq = (range + 0.5) * (range + 0.5);
  for (const seg of occluders) {
    for (const ep of [
      { x: seg.ax, z: seg.az },
      { x: seg.bx, z: seg.bz },
    ]) {
      const dx = ep.x - origin.x;
      const dz = ep.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < 1e-4 || dSq > maxCheckSq) continue;
      const absAng = Math.atan2(dz, dx);
      const rel = normalizeSignedAngle(absAng - yawRad);
      if (isFullCircle || Math.abs(rel) <= halfFovRad + 0.002) {
        const clampedMinus = isFullCircle
          ? rel - 0.0008
          : Math.max(-halfFovRad, rel - 0.0008);
        const clampedPlus = isFullCircle
          ? rel + 0.0008
          : Math.min(halfFovRad, rel + 0.0008);
        relAngles.push(clampedMinus, rel, clampedPlus);
      }
    }
  }

  relAngles.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const a of relAngles) {
    if (deduped.length === 0 || a - deduped[deduped.length - 1] > 0.0003) {
      deduped.push(a);
    }
  }

  const boundaryPoints: Point2D[] = [];
  for (const rel of deduped) {
    const absAng = yawRad + rel;
    const dx = Math.cos(absAng);
    const dz = Math.sin(absAng);
    let bestT = range;
    for (const seg of occluders) {
      const hitT = raySegmentIntersectDist(origin.x, origin.z, dx, dz, seg);
      if (hitT !== null && hitT < bestT) {
        bestT = hitT;
      }
    }
    boundaryPoints.push({
      x: origin.x + dx * bestT,
      z: origin.z + dz * bestT,
    });
  }

  const polygon = isFullCircle ? [...boundaryPoints] : [origin, ...boundaryPoints];

  // Exact shoelace area of visibility polygon
  let area2 = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area2 += a.x * b.z - b.x * a.z;
  }
  const areaSqM = Math.abs(area2) * 0.5;
  const unobstructedAreaSqM = 0.5 * range * range * ((fovDeg * Math.PI) / 180);
  const coveragePct =
    unobstructedAreaSqM > 0.01
      ? Math.min(100, Math.round((areaSqM / unobstructedAreaSqM) * 100))
      : 0;

  return {
    origin,
    polygon,
    boundaryPoints,
    areaSqM: Number(areaSqM.toFixed(2)),
    unobstructedAreaSqM: Number(unobstructedAreaSqM.toFixed(2)),
    coveragePct,
  };
}

export function isPointInPolygon(pt: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect =
      zi > pt.z !== zj > pt.z &&
      pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function evaluateSecurityTriggers(
  targetPos: Point2D | null,
  devices: SecurityDevice[],
  walls: WallSegment[],
  wallHeight: number,
): Set<string> {
  const triggered = new Set<string>();

  for (const dev of devices) {
    // Magnetic door/window contacts trigger whenever an opening near them is opened
    if (dev.kind === 'door-contact') {
      let openTriggered = false;
      for (const w of walls) {
        const len = wallLength(w);
        if (len < 0.05) continue;
        const ux = (w.end.x - w.start.x) / len;
        const uz = (w.end.z - w.start.z) / len;
        for (const op of w.openings) {
          if (!op.isOpen) continue;
          const ox = w.start.x + ux * op.offset;
          const oz = w.start.z + uz * op.offset;
          if (Math.hypot(dev.x - ox, dev.z - oz) <= op.width * 0.5 + 0.65) {
            openTriggered = true;
            break;
          }
        }
        if (openTriggered) break;
      }
      if (openTriggered) {
        triggered.add(dev.id);
        continue;
      }
    }

    if (targetPos && dev.fovDeg > 0 && dev.rangeMeters > 0) {
      const distSq = (targetPos.x - dev.x) ** 2 + (targetPos.z - dev.z) ** 2;
      if (distSq <= dev.rangeMeters * dev.rangeMeters + 0.05) {
        const cov = computeSecurityCoverage(dev, walls, wallHeight);
        if (isPointInPolygon(targetPos, cov.polygon)) {
          triggered.add(dev.id);
        }
      }
    }
  }

  return triggered;
}

function signedPolygonAreaXZ(poly: Point2D[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return sum * 0.5;
}

function polygonPerimeterXZ(poly: Point2D[]): number {
  if (poly.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

function computePolygonInteriorPoint(poly: Point2D[]): Point2D {
  const n = poly.length;
  if (n === 0) return { x: 0, z: 0 };
  let area2 = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const cross = a.x * b.z - b.x * a.z;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  if (Math.abs(area2) > 1e-5) {
    const candidate = { x: cx / (3 * area2), z: cz / (3 * area2) };
    if (isPointInPolygon(candidate, poly)) {
      return candidate;
    }
  }

  // Fallback for concave L/U-shaped rooms: midpoint of widest horizontal chord
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  let bestMid: Point2D = {
    x: poly.reduce((s, p) => s + p.x, 0) / n,
    z: poly.reduce((s, p) => s + p.z, 0) / n,
  };
  let bestWidth = -1;
  for (let step = 1; step <= 9; step++) {
    const z = minZ + ((maxZ - minZ) * step) / 10;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z)) {
        const x = a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z);
        xs.push(x);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (w > bestWidth) {
        bestWidth = w;
        bestMid = { x: (xs[k] + xs[k + 1]) * 0.5, z };
      }
    }
  }
  return bestMid;
}

function offsetRoomPolygonXZ(
  poly: Point2D[],
  edgeOffsets: number[],
  inward: boolean,
): Point2D[] {
  const n = poly.length;
  if (n < 3) return poly;
  const dirs: Array<{ ux: number; uz: number; nx: number; nz: number; d: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const len = Math.max(1e-5, Math.hypot(b.x - a.x, b.z - a.z));
    const ux = (b.x - a.x) / len;
    const uz = (b.z - a.z) / len;
    const nx = inward ? -uz : uz;
    const nz = inward ? ux : -ux;
    dirs.push({ ux, uz, nx, nz, d: edgeOffsets[i] ?? 0.1 });
  }

  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const e1 = dirs[prev];
    const e2 = dirs[i];
    const p = poly[i];

    const q1x = p.x + e1.nx * e1.d;
    const q1z = p.z + e1.nz * e1.d;
    const q2x = p.x + e2.nx * e2.d;
    const q2z = p.z + e2.nz * e2.d;

    const det = -(e1.ux * e2.uz - e1.uz * e2.ux);
    if (Math.abs(det) > 0.12) {
      const dx = q2x - q1x;
      const dz = q2z - q1z;
      const t = (dz * e2.ux - dx * e2.uz) / det;
      const ix = q1x + t * e1.ux;
      const iz = q1z + t * e1.uz;
      const maxReach = Math.max(e1.d, e2.d, 0.1) * 3.5;
      if (Math.hypot(ix - p.x, iz - p.z) <= maxReach) {
        out.push({ x: ix, z: iz });
        continue;
      }
    }

    out.push({
      x: (q1x + q2x) * 0.5,
      z: (q1z + q2z) * 0.5,
    });
  }
  return out;
}

/**
 * Extracts all minimal closed room polygons bounded by walls using planar noding
 * (handling T-junctions & crossings) and half-edge minimal face traversal.
 */
export function detectClosedRooms(
  walls: WallSegment[],
  customRoomNames?: Record<string, string>,
): ClosedRoomInfo[] {
  const validWalls = walls.filter((w) => wallLength(w) >= 0.08);
  if (validWalls.length < 3) return [];

  const endpoints = validWalls.map((w) => ({
    start: { ...w.start },
    end: { ...w.end },
    thickness: w.thickness,
  }));

  const splitParams: number[][] = validWalls.map(() => [0, 1]);

  // 1. Collect crossings and T-junction split points along every wall
  for (let i = 0; i < validWalls.length; i++) {
    const wi = validWalls[i];
    const lenI = wallLength(wi);
    const ax = wi.start.x;
    const az = wi.start.z;
    const rdx = wi.end.x - ax;
    const rdz = wi.end.z - az;

    for (let j = i + 1; j < validWalls.length; j++) {
      const wj = validWalls[j];
      const lenJ = wallLength(wj);
      const cx = wj.start.x;
      const cz = wj.start.z;
      const sdx = wj.end.x - cx;
      const sdz = wj.end.z - cz;

      const denom = rdx * sdz - rdz * sdx;
      if (Math.abs(denom) > 1e-5) {
        const t = ((cx - ax) * sdz - (cz - az) * sdx) / denom;
        const u = ((cx - ax) * rdz - (cz - az) * rdx) / denom;
        if (t >= -0.015 && t <= 1.015 && u >= -0.015 && u <= 1.015) {
          splitParams[i].push(Math.max(0, Math.min(1, t)));
          splitParams[j].push(Math.max(0, Math.min(1, u)));
        }
      } else {
        // Collinear endpoints
        for (const pt of [wj.start, wj.end]) {
          const proj = projectPointOntoWall(pt, wi);
          if (proj.distance <= 0.08 && proj.offset >= -0.02 && proj.offset <= lenI + 0.02) {
            splitParams[i].push(Math.max(0, Math.min(1, proj.offset / lenI)));
          }
        }
        for (const pt of [wi.start, wi.end]) {
          const proj = projectPointOntoWall(pt, wj);
          if (proj.distance <= 0.08 && proj.offset >= -0.02 && proj.offset <= lenJ + 0.02) {
            splitParams[j].push(Math.max(0, Math.min(1, proj.offset / lenJ)));
          }
        }
      }
    }

    // T-junction face-snap bridging (when inner wall endpoint lands on side face of host wall)
    for (const endKey of ['start', 'end'] as const) {
      const pt = endpoints[i][endKey];
      for (let j = 0; j < validWalls.length; j++) {
        if (j === i) continue;
        const host = validWalls[j];
        const hostLen = wallLength(host);
        const proj = projectPointOntoWall(pt, host);
        const tHost = proj.offset / hostLen;
        if (
          proj.distance <= Math.max(0.085, host.thickness * 0.5 + 0.04) &&
          tHost > 0.015 &&
          tHost < 0.985
        ) {
          splitParams[j].push(Math.max(0, Math.min(1, tHost)));
          if (proj.distance > 0.015) {
            endpoints[i][endKey] = { ...proj.point };
          }
        }
      }
    }
  }

  // 2. Cluster vertices within SNAP_TOL so nearly-touching corners fuse cleanly
  const SNAP_TOL = 0.085;
  const clusterSums: Array<{ x: number; z: number; count: number }> = [];
  const getVertexId = (pt: Point2D): number => {
    for (let idx = 0; idx < clusterSums.length; idx++) {
      const c = clusterSums[idx];
      const cx = c.x / c.count;
      const cz = c.z / c.count;
      if (Math.hypot(pt.x - cx, pt.z - cz) <= SNAP_TOL) {
        c.x += pt.x;
        c.z += pt.z;
        c.count += 1;
        return idx;
      }
    }
    clusterSums.push({ x: pt.x, z: pt.z, count: 1 });
    return clusterSums.length - 1;
  };

  interface UndirectedEdge {
    u: number;
    v: number;
    thickness: number;
  }
  const edgeMap = new Map<string, UndirectedEdge>();

  for (let i = 0; i < validWalls.length; i++) {
    const rawT = [...splitParams[i]].sort((a, b) => a - b);
    const dedupT: number[] = [];
    for (const t of rawT) {
      if (dedupT.length === 0 || t - dedupT[dedupT.length - 1] > 0.008) {
        dedupT.push(t);
      }
    }
    if (dedupT.length < 2) continue;

    const p0 = endpoints[i].start;
    const p1 = endpoints[i].end;
    for (let k = 0; k + 1 < dedupT.length; k++) {
      const ta = dedupT[k];
      const tb = dedupT[k + 1];
      const pa = { x: p0.x + (p1.x - p0.x) * ta, z: p0.z + (p1.z - p0.z) * ta };
      const pb = { x: p0.x + (p1.x - p0.x) * tb, z: p0.z + (p1.z - p0.z) * tb };
      if (Math.hypot(pb.x - pa.x, pb.z - pa.z) < 0.05) continue;
      const u = getVertexId(pa);
      const v = getVertexId(pb);
      if (u === v) continue;
      const a = Math.min(u, v);
      const b = Math.max(u, v);
      const key = `${a}:${b}`;
      const existing = edgeMap.get(key);
      if (existing) {
        existing.thickness = Math.max(existing.thickness, endpoints[i].thickness);
      } else {
        edgeMap.set(key, { u: a, v: b, thickness: endpoints[i].thickness });
      }
    }
  }

  const vertices: Point2D[] = clusterSums.map((c) => ({
    x: c.x / c.count,
    z: c.z / c.count,
  }));
  let edges = Array.from(edgeMap.values());

  // 3. Iteratively prune open degree-1 stubs
  let changed = true;
  while (changed && edges.length > 0) {
    changed = false;
    const deg = new Array<number>(vertices.length).fill(0);
    for (const e of edges) {
      deg[e.u] += 1;
      deg[e.v] += 1;
    }
    const nextEdges = edges.filter((e) => deg[e.u] >= 2 && deg[e.v] >= 2);
    if (nextEdges.length !== edges.length) {
      edges = nextEdges;
      changed = true;
    }
  }

  if (edges.length < 3) return [];

  // 4. Planar half-edge left-turn face extraction
  interface HalfEdge {
    id: number;
    from: number;
    to: number;
    twin: number;
    angle: number;
    thickness: number;
  }
  const halfEdges: HalfEdge[] = [];
  const outgoing = new Map<number, number[]>();
  const addOut = (v: number, heId: number) => {
    const arr = outgoing.get(v);
    if (arr) arr.push(heId);
    else outgoing.set(v, [heId]);
  };

  for (const e of edges) {
    const idA = halfEdges.length;
    const idB = idA + 1;
    const pu = vertices[e.u];
    const pv = vertices[e.v];
    halfEdges.push({
      id: idA,
      from: e.u,
      to: e.v,
      twin: idB,
      angle: Math.atan2(pv.z - pu.z, pv.x - pu.x),
      thickness: e.thickness,
    });
    halfEdges.push({
      id: idB,
      from: e.v,
      to: e.u,
      twin: idA,
      angle: Math.atan2(pu.z - pv.z, pu.x - pv.x),
      thickness: e.thickness,
    });
    addOut(e.u, idA);
    addOut(e.v, idB);
  }

  const posInOutgoing = new Int32Array(halfEdges.length);
  outgoing.forEach((list) => {
    list.sort((a, b) => halfEdges[a].angle - halfEdges[b].angle);
    list.forEach((heId, idx) => {
      posInOutgoing[heId] = idx;
    });
  });

  const visited = new Uint8Array(halfEdges.length);
  const rawRooms: Array<{
    centerlinePolygon: Point2D[];
    innerPolygon: Point2D[];
    ceilingPolygon: Point2D[];
    centroid: Point2D;
    netAreaSqM: number;
    grossAreaSqM: number;
    perimeterM: number;
  }> = [];

  for (let startHe = 0; startHe < halfEdges.length; startHe++) {
    if (visited[startHe]) continue;
    const cycleHes: HalfEdge[] = [];
    let curr = startHe;
    let closed = false;
    const maxSteps = halfEdges.length + 2;

    for (let step = 0; step < maxSteps; step++) {
      if (visited[curr]) {
        closed = curr === startHe && cycleHes.length >= 3;
        break;
      }
      visited[curr] = 1;
      const he = halfEdges[curr];
      cycleHes.push(he);

      const outs = outgoing.get(he.to);
      if (!outs || outs.length === 0) break;
      const twinPos = posInOutgoing[he.twin];
      const nextIdx = (twinPos - 1 + outs.length) % outs.length;
      curr = outs[nextIdx];
    }

    if (!closed || cycleHes.length < 3) continue;

    // Simplify consecutive collinear vertices along straight walls while preserving corner/edge thicknesses
    const rawPoly = cycleHes.map((he) => vertices[he.from]);
    const rawThicks = cycleHes.map((he) => he.thickness);
    const grossArea = signedPolygonAreaXZ(rawPoly);
    // Only keep positive-area minimal bounded cycles (rejects unbounded exterior & inner courtyards)
    if (grossArea <= 0.25) continue;

    const cleanPoly: Point2D[] = [];
    const cleanThicks: number[] = [];
    const m = rawPoly.length;
    for (let i = 0; i < m; i++) {
      const prevPt = rawPoly[(i - 1 + m) % m];
      const curPt = rawPoly[i];
      const nextPt = rawPoly[(i + 1) % m];
      const v1x = curPt.x - prevPt.x;
      const v1z = curPt.z - prevPt.z;
      const v2x = nextPt.x - curPt.x;
      const v2z = nextPt.z - curPt.z;
      const l1 = Math.hypot(v1x, v1z);
      const l2 = Math.hypot(v2x, v2z);
      if (l1 > 1e-4 && l2 > 1e-4) {
        const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
        const cross = Math.abs(v1x * v2z - v1z * v2x) / (l1 * l2);
        if (dot > 0.998 && cross < 0.04) {
          continue;
        }
      }
      cleanPoly.push(curPt);
      cleanThicks.push(rawThicks[i]);
    }

    if (cleanPoly.length < 3) continue;

    const halfThicks = cleanThicks.map((t) => t * 0.5);
    const innerPoly = offsetRoomPolygonXZ(cleanPoly, halfThicks, true);
    const ceilingPoly = offsetRoomPolygonXZ(cleanPoly, halfThicks, false);

    let netArea = signedPolygonAreaXZ(innerPoly);
    if (netArea <= 0.05) {
      let wallStrip = 0;
      for (let i = 0; i < cleanPoly.length; i++) {
        const a = cleanPoly[i];
        const b = cleanPoly[(i + 1) % cleanPoly.length];
        wallStrip += Math.hypot(b.x - a.x, b.z - a.z) * halfThicks[i];
      }
      netArea = Math.max(0.1, grossArea - wallStrip);
    }

    const centroid = computePolygonInteriorPoint(
      signedPolygonAreaXZ(innerPoly) > 0.05 ? innerPoly : cleanPoly,
    );
    const perimeterM = polygonPerimeterXZ(
      signedPolygonAreaXZ(innerPoly) > 0.05 ? innerPoly : cleanPoly,
    );

    rawRooms.push({
      centerlinePolygon: cleanPoly,
      innerPolygon: signedPolygonAreaXZ(innerPoly) > 0.05 ? innerPoly : cleanPoly,
      ceilingPolygon: ceilingPoly,
      centroid,
      netAreaSqM: Number(netArea.toFixed(2)),
      grossAreaSqM: Number(grossArea.toFixed(2)),
      perimeterM: Number(perimeterM.toFixed(2)),
    });
  }

  rawRooms.sort((a, b) => {
    const dz = Math.round(a.centroid.z * 2) - Math.round(b.centroid.z * 2);
    if (dz !== 0) return dz;
    return a.centroid.x - b.centroid.x;
  });

  return rawRooms.map((r, idx) => {
    const id = `room-${idx + 1}`;
    const customName = customRoomNames?.[id]?.trim();
    return {
      id,
      name: customName && customName.length > 0 ? customName : `Room ${idx + 1}`,
      ...r,
    };
  });
}

/* ---------------- BREAKER PANEL AUTO-BREAKER & CONNECTED DEVICE TRACE ---------------- */

export interface PanelBreakerCircuitSummary {
  breakerLabel: string;
  circuit: WireCircuitType;
  cableSpec: CableSpec;
  color: string;
  isOn: boolean;
  wireIds: string[];
  totalMeters: number;
  connectedJunctions: ElectricalJunction[];
}

function buildWireAdjacencyGraph(
  wires: ElectricalWire[],
  junctions: ElectricalJunction[],
  walls: WallSegment[],
) {
  const wireNeighbors = new Map<string, Set<string>>();
  for (const w of wires) wireNeighbors.set(w.id, new Set());

  // 1. Direct wire-to-wire taps (pt.connectedWireId)
  for (const w of wires) {
    for (const pt of w.points) {
      if (pt.connectedWireId && wireNeighbors.has(pt.connectedWireId)) {
        wireNeighbors.get(w.id)!.add(pt.connectedWireId);
        wireNeighbors.get(pt.connectedWireId)!.add(w.id);
      }
    }
  }

  // 2. Through non-panel junctions/junction-boxes/switches
  const wireToJunctions = new Map<string, ElectricalJunction[]>();
  for (const w of wires) wireToJunctions.set(w.id, []);

  for (const j of junctions) {
    const { allWireIds } = getJunctionConnectedWireIds(j, wires, walls);
    for (const wId of allWireIds) {
      wireToJunctions.get(wId)?.push(j);
    }
    if (j.kind !== 'panel' && allWireIds.length > 1) {
      for (let a = 0; a < allWireIds.length; a++) {
        for (let b = a + 1; b < allWireIds.length; b++) {
          wireNeighbors.get(allWireIds[a])?.add(allWireIds[b]);
          wireNeighbors.get(allWireIds[b])?.add(allWireIds[a]);
        }
      }
    }
  }

  return { wireNeighbors, wireToJunctions };
}

/**
 * Discovers every breaker feeder connected to a Distribution Panel (`kind === 'panel'`),
 * traversing connected wires & daisy-chained junctions to list every socket, switch, and light
 * fed by each automatically registered breaker.
 */
export function getPanelBreakerCircuitSummaries(
  panel: ElectricalJunction,
  wires: ElectricalWire[],
  junctions: ElectricalJunction[],
  walls: WallSegment[],
): PanelBreakerCircuitSummary[] {
  if (panel.kind !== 'panel' || wires.length === 0) return [];
  const { allWireIds: panelDirectWires } = getJunctionConnectedWireIds(panel, wires, walls);
  if (panelDirectWires.length === 0) return [];

  const { wireNeighbors, wireToJunctions } = buildWireAdjacencyGraph(wires, junctions, walls);
  const wireMap = new Map(wires.map((w) => [w.id, w]));

  const groupMap = new Map<
    string,
    {
      breakerLabel: string;
      circuit: WireCircuitType;
      cableSpec: CableSpec;
      color: string;
      wireIds: Set<string>;
      junctionIds: Set<string>;
    }
  >();

  // Traverse from each wire attached to the panel, keyed by feeder wire's breakerLabel
  for (const rootWireId of panelDirectWires) {
    const rootWire = wireMap.get(rootWireId);
    if (!rootWire) continue;
    const label = rootWire.breakerLabel?.trim() || 'B1';
    let entry = groupMap.get(label);
    if (!entry) {
      entry = {
        breakerLabel: label,
        circuit: rootWire.circuit,
        cableSpec: rootWire.cableSpec || WIRE_CIRCUIT_INFO[rootWire.circuit].defaultCableSpec,
        color: getWireDisplayColor(rootWire.circuit, label),
        wireIds: new Set<string>(),
        junctionIds: new Set<string>(),
      };
      groupMap.set(label, entry);
    }

    const queue = [rootWireId];
    const visited = new Set<string>([rootWireId]);
    while (queue.length > 0) {
      const curId = queue.shift()!;
      const curWire = wireMap.get(curId);
      if (!curWire) continue;
      entry.wireIds.add(curId);
      const jList = wireToJunctions.get(curId) ?? [];
      for (const j of jList) {
        if (j.id !== panel.id && j.kind !== 'panel') {
          entry.junctionIds.add(j.id);
        }
      }
      const nextSet = wireNeighbors.get(curId);
      if (nextSet) {
        for (const nId of nextSet) {
          if (visited.has(nId)) continue;
          const nWire = wireMap.get(nId);
          if (!nWire) continue;
          // Follow branch taps & downstream runs sharing this circuit or blank/tapped wire
          if (
            nWire.breakerLabel === rootWire.breakerLabel ||
            nWire.points.some((p) => p.connectedWireId === curId) ||
            curWire.points.some((p) => p.connectedWireId === nId)
          ) {
            visited.add(nId);
            queue.push(nId);
          }
        }
      }
    }
  }

  const junctionMap = new Map(junctions.map((j) => [j.id, j]));
  const summaries: PanelBreakerCircuitSummary[] = [];
  for (const entry of groupMap.values()) {
    const isOn = panel.breakerStates?.[entry.breakerLabel] !== false;
    let totalMeters = 0;
    const wireIdArr = Array.from(entry.wireIds);
    for (const wId of wireIdArr) {
      const w = wireMap.get(wId);
      if (w) {
        totalMeters += computeWireLengthBreakdown(w, junctions, walls, 2.7).totalMeters;
      }
    }
    const connectedJunctions = Array.from(entry.junctionIds)
      .map((id) => junctionMap.get(id))
      .filter((j): j is ElectricalJunction => Boolean(j));

    summaries.push({
      breakerLabel: entry.breakerLabel,
      circuit: entry.circuit,
      cableSpec: entry.cableSpec,
      color: entry.color,
      isOn,
      wireIds: wireIdArr,
      totalMeters: Number(totalMeters.toFixed(2)),
      connectedJunctions,
    });
  }

  summaries.sort((a, b) => a.breakerLabel.localeCompare(b.breakerLabel, undefined, { numeric: true }));
  return summaries;
}

/**
 * Checks whether a light/device junction has power from any connected panel breaker
 * (returns true if standalone or fed by an ON breaker; returns false if fed ONLY by tripped/OFF breaker(s)).
 */
export function isJunctionPoweredByBreaker(
  junctionId: string,
  wires: ElectricalWire[],
  junctions: ElectricalJunction[],
  walls: WallSegment[],
): boolean {
  const panels = junctions.filter((j) => j.kind === 'panel');
  if (panels.length === 0) return true;

  let foundFedPanelBreaker = false;
  let anyBreakerOn = false;

  for (const panel of panels) {
    const summaries = getPanelBreakerCircuitSummaries(panel, wires, junctions, walls);
    for (const brk of summaries) {
      if (brk.connectedJunctions.some((cj) => cj.id === junctionId)) {
        foundFedPanelBreaker = true;
        if (brk.isOn) anyBreakerOn = true;
      }
    }
  }

  if (!foundFedPanelBreaker) return true;
  return anyBreakerOn;
}

/**
 * Subtracts any collinear overlapping sections already covered by existing walls
 * so drawing a wall or rectangle room adjacent to an existing wall never stacks duplicate walls.
 */
export function subtractCollinearWallOverlaps(
  start: Point2D,
  end: Point2D,
  existingWalls: WallSegment[],
  thickness: number,
): Array<[Point2D, Point2D]> {
  const len = distance2D(start, end);
  if (len < 0.15) return [];

  const ux = (end.x - start.x) / len;
  const uz = (end.z - start.z) / len;
  const nx = -uz;
  const nz = ux;

  let remaining: Array<[number, number]> = [[0, len]];

  for (const w of existingWalls) {
    const oLen = wallLength(w);
    if (oLen < 0.05) continue;
    const oux = (w.end.x - w.start.x) / oLen;
    const ouz = (w.end.z - w.start.z) / oLen;
    if (Math.abs(ux * oux + uz * ouz) < 0.97) continue;

    const perpDist = Math.abs((w.start.x - start.x) * nx + (w.start.z - start.z) * nz);
    if (perpDist > Math.max(thickness, w.thickness) * 0.6 + 0.05) continue;

    const s1 = (w.start.x - start.x) * ux + (w.start.z - start.z) * uz;
    const s2 = (w.end.x - start.x) * ux + (w.end.z - start.z) * uz;
    const cutMin = Math.min(s1, s2) - 0.02;
    const cutMax = Math.max(s1, s2) + 0.02;
    remaining = subtractInterval(remaining, cutMin, cutMax);
    if (remaining.length === 0) break;
  }

  return remaining
    .filter(([a, b]) => b - a >= 0.15)
    .map(([a, b]): [Point2D, Point2D] => [
      {
        x: Number((start.x + ux * a).toFixed(3)),
        z: Number((start.z + uz * a).toFixed(3)),
      },
      {
        x: Number((start.x + ux * b).toFixed(3)),
        z: Number((start.z + uz * b).toFixed(3)),
      },
    ]);
}

export interface ObjectClearanceRay {
  side: 'front' | 'back' | 'left' | 'right';
  shortLabel: 'F' | 'B' | 'L' | 'R';
  start: Point2D;
  end: Point2D;
  distance: number;
  y: number;
  targetLabel?: string;
}

interface ObstacleObb2D {
  id: string;
  label: string;
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  vx: number;
  vz: number;
  halfU: number;
  halfV: number;
}

function rayIntersectObb2D(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  obb: ObstacleObb2D,
): number | null {
  const rx = ox - obb.cx;
  const rz = oz - obb.cz;

  const lu = rx * obb.ux + rz * obb.uz;
  const lv = rx * obb.vx + rz * obb.vz;
  const du = dx * obb.ux + dz * obb.uz;
  const dv = dx * obb.vx + dz * obb.vz;

  let tMin = -Infinity;
  let tMax = Infinity;

  if (Math.abs(du) < 1e-7) {
    if (lu < -obb.halfU || lu > obb.halfU) return null;
  } else {
    let t1 = (-obb.halfU - lu) / du;
    let t2 = (obb.halfU - lu) / du;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }

  if (Math.abs(dv) < 1e-7) {
    if (lv < -obb.halfV || lv > obb.halfV) return null;
  } else {
    let t1 = (-obb.halfV - lv) / dv;
    let t2 = (obb.halfV - lv) / dv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }

  if (tMax < 0 || tMin > tMax) return null;
  const hitT = tMin >= 0 ? tMin : tMax;
  return hitT >= 0 ? hitT : null;
}

/**
 * Measures Front, Back, Left, and Right clearances from the currently selected element
 * to the closest wall or neighboring object on each of its 4 sides.
 */
export function computeObjectClearances(
  selected: SelectionTarget,
  walls: WallSegment[],
  furniture: FurnitureItem[],
  fixtures: PlumbingFixture[],
  junctions: ElectricalJunction[],
  securityDevices: SecurityDevice[],
  wallHeight: number,
  slabTopY: number,
): ObjectClearanceRay[] {
  if (!selected) return [];

  let selCx = 0;
  let selCz = 0;
  // right axis = (rx, rz), front axis = (fx, fz)
  let rx = 1;
  let rz = 0;
  let fx = 0;
  let fz = 1;
  let halfRight = 0.2;
  let halfFront = 0.2;
  let lineY = slabTopY + 0.45;
  let excludeId = '';
  let excludeHostWallId = '';

  if (selected.kind === 'furniture') {
    const item = furniture.find((f) => f.id === selected.furnitureId);
    if (!item) return [];
    const yawRad = (item.rotationDeg * Math.PI) / 180;
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    selCx = item.x;
    selCz = item.z;
    rx = cosY;
    rz = sinY;
    fx = -sinY;
    fz = cosY;
    halfRight = Math.max(0.15, item.width * 0.5);
    halfFront = Math.max(0.15, item.depth * 0.5);
    lineY = slabTopY + Math.max(0.28, Math.min(item.height * 0.55, 0.95));
    excludeId = `furn:${item.id}`;
  } else if (selected.kind === 'fixture') {
    const fix = fixtures.find((f) => f.id === selected.fixtureId);
    if (!fix) return [];
    const info = getFixtureWorldInfo(fix, walls, wallHeight, slabTopY);
    if (!info) return [];
    selCx = info.facePos.x;
    selCz = info.facePos.z;
    rx = Math.cos(info.wallAngle);
    rz = Math.sin(info.wallAngle);
    fx = info.normal.x;
    fz = info.normal.z;
    halfRight = fix.kind === 'boiler' ? 0.17 : fix.kind === 'wc' ? 0.14 : 0.12;
    halfFront = fix.kind === 'boiler' ? 0.08 : 0.1;
    lineY = Math.max(slabTopY + 0.3, Math.min(slabTopY + wallHeight - 0.15, info.elevationY));
    excludeId = `fix:${fix.id}`;
    excludeHostWallId = fix.wallId;
  } else if (selected.kind === 'junction') {
    const j = junctions.find((item) => item.id === selected.junctionId);
    if (!j) return [];
    const info = getJunctionWorldInfo(j, walls, wallHeight, slabTopY);
    if (!info) return [];
    selCx = info.facePos.x;
    selCz = info.facePos.z;
    rx = Math.cos(info.wallAngle);
    rz = Math.sin(info.wallAngle);
    fx = info.normal.x;
    fz = info.normal.z;
    halfRight = j.kind === 'panel' ? 0.16 : 0.08;
    halfFront = j.kind === 'panel' ? 0.06 : 0.06;
    lineY = Math.max(slabTopY + 0.25, Math.min(slabTopY + wallHeight - 0.12, info.elevationY));
    excludeId = `junc:${j.id}`;
    excludeHostWallId = j.wallId;
  } else if (selected.kind === 'security') {
    const dev = securityDevices.find((d) => d.id === selected.securityId);
    if (!dev) return [];
    const yawRad = (dev.yawDeg * Math.PI) / 180;
    selCx = dev.x;
    selCz = dev.z;
    fx = Math.cos(yawRad);
    fz = Math.sin(yawRad);
    rx = -fz;
    rz = fx;
    halfRight = 0.1;
    halfFront = 0.1;
    lineY = slabTopY + Math.max(0.35, Math.min(wallHeight - 0.12, dev.mountHeight));
    excludeId = `sec:${dev.id}`;
    if (dev.wallId) excludeHostWallId = dev.wallId;
  } else if (selected.kind === 'opening') {
    const wall = walls.find((w) => w.id === selected.wallId);
    if (!wall) return [];
    const op = wall.openings.find((o) => o.id === selected.openingId);
    if (!op) return [];
    const len = wallLength(wall);
    if (len < 0.1) return [];
    const ux = (wall.end.x - wall.start.x) / len;
    const uz = (wall.end.z - wall.start.z) / len;
    selCx = wall.start.x + ux * op.offset;
    selCz = wall.start.z + uz * op.offset;
    rx = ux;
    rz = uz;
    fx = -uz;
    fz = ux;
    halfRight = Math.max(0.2, op.width * 0.5);
    halfFront = Math.max(0.08, wall.thickness * 0.5);
    lineY = slabTopY + Math.max(0.45, Math.min(wallHeight - 0.25, op.sillHeight + op.height * 0.5));
    excludeHostWallId = wall.id;
  } else {
    return [];
  }

  const obstacles: ObstacleObb2D[] = [];

  // Walls as obstacle OBBs
  for (const w of walls) {
    if (w.id === excludeHostWallId) continue;
    const len = wallLength(w);
    if (len < 0.05) continue;
    const { startExtend, endExtend } = getWallEndpointExtensions(w, walls);
    const ux = (w.end.x - w.start.x) / len;
    const uz = (w.end.z - w.start.z) / len;
    const vx = -uz;
    const vz = ux;
    const totalLen = len + startExtend + endExtend;
    const centerS = (len + endExtend - startExtend) * 0.5;
    obstacles.push({
      id: `wall:${w.id}`,
      label: 'Wall',
      cx: w.start.x + ux * centerS,
      cz: w.start.z + uz * centerS,
      ux,
      uz,
      vx,
      vz,
      halfU: totalLen * 0.5,
      halfV: w.thickness * 0.5,
    });
  }

  // Furniture items as obstacle OBBs
  for (const f of furniture) {
    const oid = `furn:${f.id}`;
    if (oid === excludeId) continue;
    const yawRad = (f.rotationDeg * Math.PI) / 180;
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    obstacles.push({
      id: oid,
      label: f.label?.trim() || FURNITURE_KIND_INFO[f.kind].label,
      cx: f.x,
      cz: f.z,
      ux: cosY,
      uz: sinY,
      vx: -sinY,
      vz: cosY,
      halfU: Math.max(0.15, f.width * 0.5),
      halfV: Math.max(0.15, f.depth * 0.5),
    });
  }

  // Plumbing fixtures as obstacle OBBs
  for (const fix of fixtures) {
    const oid = `fix:${fix.id}`;
    if (oid === excludeId) continue;
    const info = getFixtureWorldInfo(fix, walls, wallHeight, slabTopY);
    if (!info) continue;
    obstacles.push({
      id: oid,
      label: PLUMBING_FIXTURE_INFO[fix.kind].label,
      cx: info.facePos.x,
      cz: info.facePos.z,
      ux: Math.cos(info.wallAngle),
      uz: Math.sin(info.wallAngle),
      vx: info.normal.x,
      vz: info.normal.z,
      halfU: fix.kind === 'boiler' ? 0.17 : 0.12,
      halfV: fix.kind === 'boiler' ? 0.08 : 0.08,
    });
  }

  // Electrical junctions (non-ceiling when measuring floor furniture, or all when measuring electrical)
  for (const j of junctions) {
    const oid = `junc:${j.id}`;
    if (oid === excludeId) continue;
    if (selected.kind === 'furniture' && j.kind === 'ceiling-light') continue;
    const info = getJunctionWorldInfo(j, walls, wallHeight, slabTopY);
    if (!info) continue;
    obstacles.push({
      id: oid,
      label: j.label?.trim() || JUNCTION_KIND_INFO[j.kind].label,
      cx: info.facePos.x,
      cz: info.facePos.z,
      ux: Math.cos(info.wallAngle),
      uz: Math.sin(info.wallAngle),
      vx: info.normal.x,
      vz: info.normal.z,
      halfU: j.kind === 'panel' ? 0.16 : 0.06,
      halfV: 0.05,
    });
  }

  // Security devices (only if measuring another security device or low-mounted)
  if (selected.kind === 'security') {
    for (const dev of securityDevices) {
      const oid = `sec:${dev.id}`;
      if (oid === excludeId) continue;
      const yawRad = (dev.yawDeg * Math.PI) / 180;
      const dx = Math.cos(yawRad);
      const dz = Math.sin(yawRad);
      obstacles.push({
        id: oid,
        label: dev.label?.trim() || SECURITY_DEVICE_INFO[dev.kind].label,
        cx: dev.x,
        cz: dev.z,
        ux: dx,
        uz: dz,
        vx: -dz,
        vz: dx,
        halfU: 0.1,
        halfV: 0.1,
      });
    }
  }

  const sides: Array<{
    side: 'front' | 'back' | 'left' | 'right';
    shortLabel: 'F' | 'B' | 'L' | 'R';
    dx: number;
    dz: number;
    faceOffset: number;
    spanAxisX: number;
    spanAxisZ: number;
    halfSpan: number;
  }> = [
    {
      side: 'front',
      shortLabel: 'F',
      dx: fx,
      dz: fz,
      faceOffset: halfFront,
      spanAxisX: rx,
      spanAxisZ: rz,
      halfSpan: halfRight,
    },
    {
      side: 'back',
      shortLabel: 'B',
      dx: -fx,
      dz: -fz,
      faceOffset: halfFront,
      spanAxisX: rx,
      spanAxisZ: rz,
      halfSpan: halfRight,
    },
    {
      side: 'right',
      shortLabel: 'R',
      dx: rx,
      dz: rz,
      faceOffset: halfRight,
      spanAxisX: fx,
      spanAxisZ: fz,
      halfSpan: halfFront,
    },
    {
      side: 'left',
      shortLabel: 'L',
      dx: -rx,
      dz: -rz,
      faceOffset: halfRight,
      spanAxisX: fx,
      spanAxisZ: fz,
      halfSpan: halfFront,
    },
  ];

  const maxRange = 20;
  const sampleFracs = [0, -0.35, 0.35, -0.7, 0.7, -0.94, 0.94];
  const results: ObjectClearanceRay[] = [];

  for (const s of sides) {
    let bestDist = Infinity;
    let bestStart: Point2D | null = null;
    let bestEnd: Point2D | null = null;
    let bestTargetLabel: string | undefined;

    let centerDist = Infinity;
    let centerStart: Point2D | null = null;
    let centerEnd: Point2D | null = null;
    let centerLabel: string | undefined;

    for (let i = 0; i < sampleFracs.length; i++) {
      const frac = sampleFracs[i];
      const lateral = frac * s.halfSpan;
      const sx = selCx + s.dx * s.faceOffset + s.spanAxisX * lateral;
      const sz = selCz + s.dz * s.faceOffset + s.spanAxisZ * lateral;
      // Nudge ray origin slightly forward to avoid self-touch numerical noise
      const ox = sx + s.dx * 0.004;
      const oz = sz + s.dz * 0.004;

      let rayBest = Infinity;
      let rayLabel: string | undefined;
      for (const obb of obstacles) {
        const hitT = rayIntersectObb2D(ox, oz, s.dx, s.dz, obb);
        if (hitT !== null && hitT < maxRange && hitT < rayBest) {
          rayBest = hitT;
          rayLabel = obb.label;
        }
      }

      if (rayBest < Infinity) {
        const trueDist = rayBest + 0.004;
        const hitPt = { x: ox + s.dx * rayBest, z: oz + s.dz * rayBest };
        if (i === 0) {
          centerDist = trueDist;
          centerStart = { x: sx, z: sz };
          centerEnd = hitPt;
          centerLabel = rayLabel;
        }
        if (trueDist < bestDist) {
          bestDist = trueDist;
          bestStart = { x: sx, z: sz };
          bestEnd = hitPt;
          bestTargetLabel = rayLabel;
        }
      }
    }

    // Prefer the centered line when the center ray is within 2cm of the minimum hit distance
    if (centerStart && centerEnd && centerDist <= bestDist + 0.02) {
      results.push({
        side: s.side,
        shortLabel: s.shortLabel,
        start: centerStart,
        end: centerEnd,
        distance: centerDist,
        y: lineY,
        targetLabel: centerLabel,
      });
    } else if (bestStart && bestEnd && bestDist < Infinity) {
      results.push({
        side: s.side,
        shortLabel: s.shortLabel,
        start: bestStart,
        end: bestEnd,
        distance: bestDist,
        y: lineY,
        targetLabel: bestTargetLabel,
      });
    }
  }

  return results;
}



