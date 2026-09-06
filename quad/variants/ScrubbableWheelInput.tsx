import React, { useState, useRef, useEffect } from 'react';

export interface ScrubbableWheelInputProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  displayMultiplier?: number;
  sensitivity?: number; // Pixels of drag per step
  title?: string;
  formatValue?: (val: number) => string;
  parseValue?: (text: string) => number | null;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export const ScrubbableWheelInput: React.FC<ScrubbableWheelInputProps> = ({
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit = '',
  displayMultiplier = 1,
  sensitivity = 5,
  title,
  formatValue,
  parseValue,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startXRef = useRef<number>(0);
  const startValRef = useRef<number>(value);
  const isDraggingRef = useRef<boolean>(false);

  // Keep startValRef in sync when value changes from outside
  useEffect(() => {
    if (!isDraggingRef.current) {
      startValRef.current = value;
    }
  }, [value]);

  const displayedNumeric = Number((value * displayMultiplier).toFixed(2));

  const displayText = formatValue
    ? formatValue(value)
    : `${displayedNumeric}${unit ? ` ${unit}` : ''}`;

  const clamp = (val: number) => {
    let safe = Math.max(min, Math.min(max, val));
    // round to clean precision based on step
    const stepDecimals = (step.toString().split('.')[1] || '').length;
    return Number(safe.toFixed(stepDecimals + 2));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || isEditing || e.button !== 0) return;
    startXRef.current = e.clientX;
    startValRef.current = value;
    isDraggingRef.current = false;

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      if (!isDraggingRef.current && Math.abs(deltaX) >= 3) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        const fineTune = moveEvent.shiftKey ? 0.2 : 1;
        const stepsDelta = (deltaX / sensitivity) * fineTune;
        const rawDelta = (stepsDelta * step) / displayMultiplier;
        const nextVal = clamp(startValRef.current + rawDelta);
        onChange(nextVal);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      try {
        el.releasePointerCapture(upEvent.pointerId);
      } catch {}

      if (!isDraggingRef.current) {
        // User just clicked! Enter direct edit mode
        setDraftText(String(displayedNumeric));
        setIsEditing(true);
      }
      isDraggingRef.current = false;
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled || isEditing || isDraggingRef.current) return;
    setDraftText(String(displayedNumeric));
    setIsEditing(true);
  };

  const handleWheel = (e: React.WheelEvent<HTMLSpanElement>) => {
    if (disabled || isEditing) return;
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    const fineTune = e.shiftKey ? 0.2 : 1;
    const delta = (direction * step * fineTune) / displayMultiplier;
    const nextVal = clamp(value + delta);
    onChange(nextVal);
  };

  const commitDraft = () => {
    if (!isEditing) return;
    setIsEditing(false);
    const trimmed = draftText.trim();
    if (!trimmed) return;

    if (parseValue) {
      const parsed = parseValue(trimmed);
      if (parsed !== null && Number.isFinite(parsed)) {
        onChange(clamp(parsed));
      }
      return;
    }

    // Default numeric parser
    const cleanNum = parseFloat(trimmed.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(cleanNum)) {
      const rawVal = cleanNum / displayMultiplier;
      onChange(clamp(rawVal));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <span className={`quad-scrub-wrap is-editing ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={draftText}
          disabled={disabled}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={handleKeyDown}
          className="quad-scrub-input"
          aria-label={ariaLabel || title}
        />
        {unit ? <span className="quad-scrub-unit">{unit}</span> : null}
      </span>
    );
  }

  return (
    <span
      className={`quad-scrub-badge ${disabled ? 'is-disabled' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onWheel={handleWheel}
      title={title || '点击直接输入数字，或按住左右拖拽 / 滚轮滚动调整'}
      aria-label={ariaLabel || title}
      role="spinbutton"
      aria-valuenow={displayedNumeric}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDraftText(String(displayedNumeric));
          setIsEditing(true);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(clamp(value + step / displayMultiplier));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(clamp(value - step / displayMultiplier));
        }
      }}
    >
      <span className="quad-scrub-badge__text">{displayText}</span>
      <span className="quad-scrub-badge__icon" aria-hidden="true">⇋</span>
    </span>
  );
};
