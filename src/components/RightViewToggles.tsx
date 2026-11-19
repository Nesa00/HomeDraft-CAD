import React from 'react';
import {
  Armchair,
  Building2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Eye,
  Home,
  LayoutGrid,
  List,
  MoveHorizontal,
  Ruler,
  Shield,
  Zap,
} from 'lucide-react';
import type { ViewMode } from '../types/plan';

interface RightViewTogglesProps {
  viewMode: ViewMode;
  hidden: boolean;
  showStructure: boolean;
  showWiring: boolean;
  showPlumbing: boolean;
  showSecurity: boolean;
  showInterior: boolean;
  xrayWalls: boolean;
  showRoomAreas: boolean;
  showRoomListCard: boolean;
  showCeiling: boolean;
  showDimensions: boolean;
  showInnerDimensions: boolean;
  showWalkDimensions: boolean;
  showObjectDistances: boolean;
  onToggleHidden: () => void;
  onToggleStructure: () => void;
  onToggleWiring: () => void;
  onTogglePlumbing: () => void;
  onToggleSecurity: () => void;
  onToggleInterior: () => void;
  onToggleXrayWalls: () => void;
  onToggleRoomAreas: () => void;
  onToggleRoomListCard: () => void;
  onToggleCeiling: () => void;
  onToggleDimensions: () => void;
  onToggleInnerDimensions: () => void;
  onToggleWalkDimensions: () => void;
  onToggleObjectDistances: () => void;
}

export const RightViewToggles: React.FC<RightViewTogglesProps> = ({
  viewMode,
  hidden,
  showStructure,
  showWiring,
  showPlumbing,
  showSecurity,
  showInterior,
  xrayWalls,
  showRoomAreas,
  showRoomListCard,
  showCeiling,
  showDimensions,
  showInnerDimensions,
  showWalkDimensions,
  showObjectDistances,
  onToggleHidden,
  onToggleStructure,
  onToggleWiring,
  onTogglePlumbing,
  onToggleSecurity,
  onToggleInterior,
  onToggleXrayWalls,
  onToggleRoomAreas,
  onToggleRoomListCard,
  onToggleCeiling,
  onToggleDimensions,
  onToggleInnerDimensions,
  onToggleWalkDimensions,
  onToggleObjectDistances,
}) => {
  const is2D = viewMode === '2d';
  const dimensionsActive = is2D ? showDimensions : showWalkDimensions;
  const handleToggleDimensions = is2D ? onToggleDimensions : onToggleWalkDimensions;

  const layerItems: Array<{
    key: string;
    label: string;
    shortLabel: string;
    active: boolean;
    onClick: () => void;
    activeClass: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
  }> = [
    {
      key: 'structure',
      label: 'Structure',
      shortLabel: 'Struct',
      active: showStructure,
      onClick: onToggleStructure,
      activeClass: 'bg-slate-900 text-white border-slate-900',
      icon: Building2,
      title: 'Show/hide base structure (walls, openings, floor & ceiling)',
    },
    {
      key: 'wires',
      label: 'Wires',
      shortLabel: 'Wires',
      active: showWiring,
      onClick: onToggleWiring,
      activeClass: 'bg-amber-600 text-white border-amber-600',
      icon: Zap,
      title: 'Show/hide electrical wires, panels & lights',
    },
    {
      key: 'water',
      label: 'Water',
      shortLabel: 'Water',
      active: showPlumbing,
      onClick: onTogglePlumbing,
      activeClass: 'bg-sky-600 text-white border-sky-600',
      icon: Droplets,
      title: 'Show/hide water pipes & plumbing fixtures',
    },
    {
      key: 'security',
      label: 'Security',
      shortLabel: 'Sec',
      active: showSecurity,
      onClick: onToggleSecurity,
      activeClass: 'bg-teal-600 text-white border-teal-600',
      icon: Shield,
      title: 'Show/hide security cameras & sensors',
    },
    {
      key: 'interior',
      label: 'Interior',
      shortLabel: 'Inter',
      active: showInterior,
      onClick: onToggleInterior,
      activeClass: 'bg-orange-600 text-white border-orange-600',
      icon: Armchair,
      title: 'Show/hide interior furniture',
    },
  ];

  const visualItems: Array<{
    key: string;
    label: string;
    shortLabel: string;
    active: boolean;
    onClick: () => void;
    activeClass: string;
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    show?: boolean;
  }> = [
    {
      key: 'xray',
      label: 'X-Ray',
      shortLabel: 'X-Ray',
      active: xrayWalls,
      onClick: onToggleXrayWalls,
      activeClass: 'bg-slate-800 text-white border-slate-800',
      icon: Eye,
      title: 'Transparent X-Ray walls to inspect conduits & pipes',
    },
    {
      key: 'areas',
      label: 'Areas',
      shortLabel: 'Areas',
      active: showRoomAreas,
      onClick: onToggleRoomAreas,
      activeClass: 'bg-teal-700 text-white border-teal-700',
      icon: LayoutGrid,
      title: 'Show/hide room names & areas (m²) directly inside rooms',
    },
    {
      key: 'room-list',
      label: 'Room List',
      shortLabel: 'List',
      active: showRoomListCard,
      onClick: onToggleRoomListCard,
      activeClass: 'bg-teal-600 text-white border-teal-600',
      icon: List,
      title: 'Show/hide floating Room Areas summary card',
      show: showRoomAreas,
    },
    {
      key: 'ceiling',
      label: 'Ceiling',
      shortLabel: 'Ceil',
      active: showCeiling,
      onClick: onToggleCeiling,
      activeClass: 'bg-indigo-600 text-white border-indigo-600',
      icon: Home,
      title: 'Show/hide automatic closed-room ceiling & roof',
    },
    {
      key: 'dimensions',
      label: 'Dimensions',
      shortLabel: 'Dim',
      active: dimensionsActive,
      onClick: handleToggleDimensions,
      activeClass: 'bg-blue-600 text-white border-blue-600',
      icon: Ruler,
      title: is2D
        ? 'Show/hide architectural wall & opening dimensions'
        : 'Show/hide live measured dimension lines & tags in 3D view',
    },
    {
      key: 'inner-dims',
      label: 'Inner Dims',
      shortLabel: 'Inner',
      active: showInnerDimensions,
      onClick: onToggleInnerDimensions,
      activeClass: 'bg-cyan-700 text-white border-cyan-700',
      icon: Ruler,
      title: 'Show/hide inner clear room wall dimensions',
      show: is2D && showDimensions,
    },
    {
      key: 'distances',
      label: 'Distances',
      shortLabel: 'Dist',
      active: showObjectDistances,
      onClick: onToggleObjectDistances,
      activeClass: 'bg-violet-600 text-white border-violet-600',
      icon: MoveHorizontal,
      title: 'Measure Front / Back / Left / Right distance from selected object to closest object or wall',
    },
  ];

  if (hidden) {
    return (
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onToggleHidden}
        title="Show Layers & Views panel"
        aria-label="Show Layers & Views panel"
        className="fixed top-16 right-2 md:right-3 z-20 flex items-center gap-1 rounded-xl bg-white/95 border border-slate-200 px-2 py-2 shadow-sm text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden md:inline">Views</span>
      </button>
    );
  }

  return (
    <>
      {/* Desktop Vertical Right-Side View Toggles Rail (Top to Bottom) */}
      <aside
        aria-label="View & Layer Toggles"
        onPointerDown={(e) => e.stopPropagation()}
        className="hidden md:flex flex-col fixed top-16 right-3 z-20 w-[104px] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-xl bg-white/95 border border-slate-200 p-1.5 shadow-sm gap-1"
      >
        <div className="flex items-center justify-between gap-1 px-1 pt-0.5 pb-1 border-b border-slate-100">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Layers
          </span>
          <button
            type="button"
            onClick={onToggleHidden}
            title="Hide right side panel"
            aria-label="Hide right side panel"
            className="p-0.5 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {layerItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              title={item.title}
              aria-pressed={item.active}
              className={`min-h-[34px] w-full px-1.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                item.active
                  ? item.activeClass
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        <div className="px-1 pt-1.5 pb-1 mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-center border-t border-b border-slate-100">
          Views
        </div>
        {visualItems
          .filter((item) => item.show !== false)
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                title={item.title}
                aria-pressed={item.active}
                className={`min-h-[34px] w-full px-1.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  item.active
                    ? item.activeClass
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
      </aside>

      {/* Mobile Compact Vertical Edge Strip */}
      <div
        aria-label="Mobile View Toggles"
        onPointerDown={(e) => e.stopPropagation()}
        className="flex md:hidden flex-col fixed top-16 right-2 z-20 rounded-xl bg-white/95 border border-slate-200 p-1 shadow-sm gap-1 max-h-[calc(100vh-11rem)] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onToggleHidden}
          title="Hide views strip"
          aria-label="Hide views strip"
          className="w-9 h-7 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 flex items-center justify-center"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        {[...layerItems, ...visualItems.filter((item) => item.show !== false)].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              title={item.title}
              aria-label={item.label}
              aria-pressed={item.active}
              className={`w-9 h-9 rounded-lg border flex flex-col items-center justify-center text-[8px] font-semibold transition-colors ${
                item.active
                  ? item.activeClass
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="leading-none mt-0.5 truncate max-w-[32px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};

