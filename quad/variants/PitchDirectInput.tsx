import React, { useState, useRef, useEffect } from 'react';
import { SCALES } from '../musicTheory';
import { createDeskPitchResolver } from '../pitch';

const NOTE_NAME_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, DB: 1,
  D: 2, 'D#': 3, EB: 3,
  E: 4,
  F: 5, 'F#': 6, GB: 6,
  G: 7, 'G#': 8, AB: 8,
  A: 9, 'A#': 10, BB: 10,
  B: 11,
};

export interface PitchDirectInputProps {
  scaleStep: number;
  noteName: string;
  rootMidi: number;
  scaleKey: string;
  octaveTranspose: number;
  disabled?: boolean;
  onChangeStep: (step: number) => void;
  className?: string;
  label?: string;
}

export const PitchDirectInput: React.FC<PitchDirectInputProps> = ({
  scaleStep,
  noteName,
  rootMidi,
  scaleKey,
  octaveTranspose,
  disabled = false,
  onChangeStep,
  className = '',
  label = '音高',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startXRef = useRef<number>(0);
  const startStepRef = useRef<number>(scaleStep);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isDraggingRef.current) {
      startStepRef.current = scaleStep;
    }
  }, [scaleStep]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const parseInputToStep = (text: string): number | null => {
    const trimmed = text.trim().toUpperCase();
    if (!trimmed) return null;

    // 1. Direct step number: "+2", "-1", "0", "3"
    const stepMatch = /^[+-]?\d+$/.exec(trimmed);
    if (stepMatch) {
      const num = parseInt(trimmed, 10);
      return Number.isFinite(num) ? num : null;
    }

    // 2. Note name with optional octave: "C4", "F#3", "DB5", "A"
    const noteMatch = /^([A-G])([#B]?)(-?\d+)?$/.exec(trimmed);
    if (noteMatch) {
      const letter = noteMatch[1];
      const accidental = noteMatch[2] || '';
      const octaveStr = noteMatch[3];
      const key = letter + accidental;
      const semitone = NOTE_NAME_TO_SEMITONE[key];
      if (semitone === undefined) return null;

      const octave = octaveStr !== undefined ? parseInt(octaveStr, 10) : 4; // default to octave 4
      const targetMidi = (octave + 1) * 12 + semitone;

      // Find closest scaleStep in current Pad scale
      const scale = SCALES.find((s) => s.key === scaleKey && s.intervals.length > 0)
        ?? SCALES.find((s) => s.key === 'major')!;
      const transposedRoot = rootMidi + octaveTranspose * 12;
      const resolver = createDeskPitchResolver({
        rootMidi: Math.max(0, Math.min(127, Math.round(transposedRoot))),
        intervals: scale.intervals,
      });

      let bestStep = 0;
      let minDiff = Infinity;
      for (let s = -24; s <= 24; s++) {
        const midi = resolver({ kind: 'scale-degree', degree: s });
        if (midi !== null) {
          const diff = Math.abs(midi - targetMidi);
          if (diff < minDiff) {
            minDiff = diff;
            bestStep = s;
          }
        }
      }
      return bestStep;
    }

    return null;
  };

  const commitDraft = () => {
    if (!isEditing) return;
    setIsEditing(false);
    const parsed = parseInputToStep(draft);
    if (parsed !== null) {
      onChangeStep(parsed);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || isEditing || e.button !== 0) return;
    startXRef.current = e.clientX;
    startStepRef.current = scaleStep;
    isDraggingRef.current = false;

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      if (!isDraggingRef.current && Math.abs(deltaX) >= 4) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        const stepDelta = Math.round(deltaX / 8);
        onChangeStep(startStepRef.current + stepDelta);
      }
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      try {
        el.releasePointerCapture(upEvent.pointerId);
      } catch {}

      if (!isDraggingRef.current) {
        setDraft(noteName);
        setIsEditing(true);
      }
      isDraggingRef.current = false;
    };

    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (disabled || isEditing || isDraggingRef.current) return;
    setDraft(noteName);
    setIsEditing(true);
  };

  const handleWheel = (e: React.WheelEvent<HTMLSpanElement>) => {
    if (disabled || isEditing) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    onChangeStep(scaleStep + dir);
  };

  if (isEditing) {
    return (
      <span className={`quad-pitch-input-wrap ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder="如 C4 或 +1"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setIsEditing(false);
            }
          }}
          className="quad-scrub-input"
          style={{ width: '80px', textAlign: 'center' }}
        />
      </span>
    );
  }

  const formatStep = (step: number) => (step > 0 ? `+${step}` : String(step));

  return (
    <span
      className={`quad-pitch-badge ${disabled ? 'is-disabled' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onWheel={handleWheel}
      title="点击直接输入音名(如 C4, D#3)或阶数(+2, -1)；或按住左右拖拽 / 滚轮滚动调音"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDraft(noteName);
          setIsEditing(true);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault();
          onChangeStep(scaleStep + 1);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault();
          onChangeStep(scaleStep - 1);
        }
      }}
    >
      <span className="quad-pitch-badge__note">{noteName}</span>
      <span className="quad-pitch-badge__step">({formatStep(scaleStep)})</span>
      <span className="quad-scrub-badge__icon" aria-hidden="true">⇋</span>
    </span>
  );
};
