import { useUiText } from '../uiLocale';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import './softSelect.css';

export type SoftSelectOption = {
  value: string;
  label: string;
  category?: string;
};

export type SoftSelectProps = {
  value: string;
  options: SoftSelectOption[];
  categories?: {value:string;label:string}[];
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
  categories,
  onChange,
  'aria-label': ariaLabel,
  prefix,
  className = '',
  variant = 'default',
}: SoftSelectProps) {
  const tr = useUiText();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [category,setCategory] = useState('all');
  const visibleOptions = React.useMemo(()=>category==='all'||!categories ? options : options.filter(o=>o.category===category),[options,category,categories]);

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
    const width = Math.min(categories ? Math.max(260,preferredWidth) : preferredWidth, window.innerWidth - viewportPad * 2);
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
    const selectedIndex = visibleOptions.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, visibleOptions, value, variant]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if((event.target as HTMLElement)?.closest('.quad-soft-select__categories') && event.key!=='Escape')return;
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
          const next = Math.max(0, Math.min(visibleOptions.length - 1, (prev < 0 ? 0 : prev) + delta));
          return next;
        });
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (activeIndex >= 0 && activeIndex < visibleOptions.length) {
          event.preventDefault();
          onChange(visibleOptions[activeIndex].value);
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
  }, [open, visibleOptions, onChange, activeIndex]);

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
        <span className="quad-soft-select__value">{tr(displayLabel)}</span>
        <ChevronDown className="quad-soft-select__chevron" size={12} strokeWidth={2.4} aria-hidden />
      </button>

      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className={`quad-soft-select__menu quad-soft-select__menu--${variant}${categories ? ' quad-soft-select__menu--categorized' : ''}`}
              style={{
                top: pos.top,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
            >
              {categories && <div className="quad-soft-select__categories" role="group" aria-label={tr("音色分类")}>
                {[{value:'all',label:tr("全部")},...categories].map(c=><button key={c.value} type="button" aria-pressed={category===c.value} onClick={()=>{setCategory(c.value);setActiveIndex(0);}}>{tr(c.label)}</button>)}
              </div>}
              <ul id={listId} role="listbox" aria-label={ariaLabel} className="quad-soft-select__items">
              {visibleOptions.map((option, index) => {
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
                    {tr(option.label)}
                  </li>
                );
              })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
