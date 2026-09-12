import { useUiText } from '../uiLocale';
import React, { useState } from 'react';
import { UI_VARIANTS, type UiVariant } from './types';

interface UiVariantSwitcherProps {
  currentVariant: UiVariant;
  onChangeVariant: (variant: UiVariant) => void;
}

export const UiVariantSwitcher: React.FC<UiVariantSwitcherProps> = ({
  currentVariant,
  onChangeVariant,
}) => {
  const tr = useUiText();
  const [collapsed, setCollapsed] = useState(false);

  const activeSpec = UI_VARIANTS.find(spec => spec.id === currentVariant) ?? UI_VARIANTS[0];

  const handleClick = (variant: UiVariant) => {
    onChangeVariant(variant);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ui', variant);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  return (
    <aside
      className={`quad-ui-switcher ${collapsed ? 'is-collapsed' : ''}`}
      aria-label={tr("UI 方案对比切换器")}
    >
      <div className="quad-ui-switcher__header">
        <span className="quad-ui-switcher__tag">{tr("🎨 UI 方案测试")}</span>
        <button
          type="button"
          className="quad-ui-switcher__collapse-btn"
          aria-label={collapsed ? tr("展开 UI 方案切换器") : tr("折叠 UI 方案切换器")}
          onClick={() => setCollapsed(prev => !prev)}
        >
          {collapsed ? tr("展开 ▾") : tr("收起 ▴")}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="quad-ui-switcher__buttons" role="group" aria-label={tr("选择 UI 布局方案")}>
            {UI_VARIANTS.map(spec => {
              const isActive = spec.id === currentVariant;
              return (
                <button
                  key={spec.id}
                  type="button"
                  data-active={isActive ? 'true' : 'false'}
                  className={`quad-ui-switcher__btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleClick(spec.id)}
                  title={spec.description}
                >
                  <span className="quad-ui-switcher__btn-num">{spec.number}</span>
                  <span className="quad-ui-switcher__btn-text">{spec.label}</span>
                </button>
              );
            })}
          </div>
          <div className="quad-ui-switcher__desc">
            <strong>{activeSpec.tagline}</strong>: {activeSpec.description}
          </div>
        </>
      )}
    </aside>
  );
};
