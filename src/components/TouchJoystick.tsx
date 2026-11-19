import React, { useRef, useState } from 'react';

interface TouchJoystickProps {
  moveVectorRef: React.MutableRefObject<{ x: number; y: number }>;
}

export const TouchJoystick: React.FC<TouchJoystickProps> = ({ moveVectorRef }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const maxRadius = 38;

  const updateFromPointer = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobOffset({ x: dx, y: dy });
    moveVectorRef.current = {
      x: dx / maxRadius,
      y: -dy / maxRadius,
    };
  };

  const resetStick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    moveVectorRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={baseRef}
      role="region"
      aria-label="Walkthrough movement joystick"
      className="relative w-28 h-28 rounded-full bg-slate-900/60 border border-white/25 shadow-lg touch-none select-none flex items-center justify-center"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        activePointerId.current = e.pointerId;
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        e.stopPropagation();
        updateFromPointer(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        e.stopPropagation();
        resetStick();
      }}
      onPointerCancel={(e) => {
        if (activePointerId.current !== e.pointerId) return;
        resetStick();
      }}
    >
      <div className="absolute inset-3 rounded-full border border-white/15 pointer-events-none" />
      <div
        className="w-11 h-11 rounded-full bg-white border-2 border-blue-600 shadow-md pointer-events-none transition-transform duration-75"
        style={{
          transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
        }}
      />
      <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-[11px] font-medium text-slate-700 bg-white/95 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap pointer-events-none">
        Move
      </span>
    </div>
  );
};
