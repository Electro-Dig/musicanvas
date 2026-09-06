import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import './softSelect.css';

export type SoftSelectOption = {
  value: string;
  label: string;
};

export type SoftSelectProps = {
  value: string;
  options: SoftSelectOption[];
  onChange: (value: string) => void;
  'aria-label': string;
  /** 触发器左侧小标签，如「音色」「通道」 */
  prefix?: string;
  className?: string;
  /** channel：窄宽居中数字；default：常规；pro：侧栏表单全宽 */
  variant?: 'default' | 'channel' | 'pro' | 'midi';
};

type MenuPos = { top: number; left: number; width: number; maxHeight: number };

/**
 * 柔和自定义下拉：替代原生 select 的系统弹出层（字体/贴边/白底无法统一）。
 * 菜单用 fixed 定位，避免被 stage overflow 裁切。
 */
export function SoftSelect({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  prefix,
  className = '',
  variant = 'default',
}: SoftSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = options.find((option) => option.value === value) ?? options[0];
  const displayLabel = selected?.label ?? value;

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPad = 8;
    // 菜单宽度固定，不随当前选中项变宽
    const preferredWidth =
      variant === 'channel'
        ? 48
        : variant === 'pro'
          ? Math.max(rect.width, 132)
          : variant === 'midi'
            ? Math.max(rect.width, 168)
            : 168; // default / 音色：固定宽，长名单行
    const width = Math.min(preferredWidth, window.innerWidth - viewportPad * 2);
    let left = rect.left;
    if (variant === 'channel' || variant === 'default') {
      left = rect.left + rect.width / 2 - width / 2;
    }
    left = Math.max(viewportPad, Math.min(left, window.innerWidth - width - viewportPad));
    const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
    const spaceAbove = rect.top - viewportPad;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(240, openUp ? spaceAbove - 4 : spaceBelow - 4);
    const top = openUp ? Math.max(viewportPad, rect.top - maxHeight - 4) : rect.bottom + 4;
    setPos({ top, left, width, maxHeight });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    const selectedIndex = options.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, options, value, variant]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((prev) => {
          const next = Math.max(0, Math.min(options.length - 1, (prev < 0 ? 0 : prev) + delta));
          return next;
        });
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (activeIndex >= 0 && activeIndex < options.length) {
          event.preventDefault();
          onChange(options[activeIndex].value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    const onReposition = () => updatePosition();
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, options, onChange, activeIndex]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const item = menuRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <div
      ref={rootRef}
      className={`quad-soft-select quad-soft-select--${variant}${open ? ' is-open' : ''} ${className}`.trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        className="quad-soft-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
      >
        {prefix ? <span className="quad-soft-select__prefix">{prefix}</span> : null}
        <span className="quad-soft-select__value">{displayLabel}</span>
        <ChevronDown className="quad-soft-select__chevron" size={12} strokeWidth={2.4} aria-hidden />
      </button>

      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              id={listId}
              className={`quad-soft-select__menu quad-soft-select__menu--${variant}`}
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              {options.map((option, index) => {
                const selectedOption = option.value === value;
                const active = index === activeIndex;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={selectedOption}
                    data-index={index}
                    className={`quad-soft-select__option${selectedOption ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    {option.label}
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
