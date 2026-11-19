import React, { useEffect, useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
}

function formatNum(val: number, decimals: number): string {
  if (!Number.isFinite(val)) return '0';
  const rounded = Number(val.toFixed(decimals));
  return String(rounded);
}

function clamp(val: number, min?: number, max?: number): number {
  let out = val;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 0.05,
  decimals = 2,
  disabled = false,
  className = '',
  id,
  'aria-label': ariaLabel,
  placeholder,
}) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatNum(value, decimals));

  useEffect(() => {
    if (!focused) {
      setDraft(formatNum(value, decimals));
    }
  }, [value, decimals, focused]);

  const commitDraft = (raw: string) => {
    const normalized = raw.trim().replace(',', '.');
    if (normalized === '' || normalized === '-' || normalized === '.') {
      setDraft(formatNum(value, decimals));
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(formatNum(value, decimals));
      return;
    }
    const clamped = Number(clamp(parsed, min, max).toFixed(decimals));
    onChange(clamped);
    setDraft(formatNum(clamped, decimals));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? draft : formatNum(value, decimals)}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => {
        setFocused(true);
        setDraft(formatNum(value, decimals));
        e.currentTarget.select();
      }}
      onBlur={() => {
        setFocused(false);
        commitDraft(draft);
      }}
      onChange={(e) => {
        const nextRaw = e.target.value;
        // Allow digits, optional leading minus, and dot or comma
        if (!/^-?\d*[.,]?\d*$/.test(nextRaw)) return;
        setDraft(nextRaw);
        const normalized = nextRaw.trim().replace(',', '.');
        if (
          normalized !== '' &&
          normalized !== '-' &&
          normalized !== '.' &&
          !normalized.endsWith('.')
        ) {
          const parsed = Number(normalized);
          if (Number.isFinite(parsed)) {
            const withinMin = min === undefined || parsed >= min;
            const withinMax = max === undefined || parsed <= max;
            if (withinMin && withinMax) {
              onChange(Number(parsed.toFixed(decimals)));
            }
          }
        }
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          commitDraft(draft);
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(formatNum(value, decimals));
          setFocused(false);
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = e.key === 'ArrowUp' ? step : -step;
          const base = Number(draft.replace(',', '.'));
          const startVal = Number.isFinite(base) ? base : value;
          const nextVal = Number(clamp(startVal + delta, min, max).toFixed(decimals));
          onChange(nextVal);
          setDraft(formatNum(nextVal, decimals));
        }
      }}
      className={className}
    />
  );
};
