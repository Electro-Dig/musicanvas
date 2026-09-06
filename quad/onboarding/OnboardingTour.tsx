/**
 * 首次访问的五步创作引导。演示只挂载当前场景，避免首屏加载视频资源。
 */
import { Fragment, useEffect, useState } from 'react';
import { OnboardingDemo, preloadOnboardingGuide, type OnboardingDemoId } from './OnboardingDemo.tsx';
import './onboarding.css';

export const ONBOARDING_STORAGE_KEY = 'gemidi.quad-lily.onboarding.v5';

export const ONBOARDING_STEPS: readonly {
  title: string;
  body: string;
  scene: OnboardingDemoId;
}[] = [
  {
    title: '四个画布、音色选择与 MIDI 接口',
    body: '在 A–D 四个画布间切换，点击播放并选择音色；需要时连接或切换 MIDI。',
    scene: 'start',
  },
  {
    title: '随意增删音符，并自定义音符细节',
    body: '选中音符后可调整音高、双音符、静音、隐藏与传播范围；ROOT 是声音传递的起点。',
    scene: 'notes',
  },
  {
    title: '选择不同轨迹模式，让音符自由地动起来',
    body: '支持圆周、线段、手动绘制和闪烁，并可继续调整运动参数。',
    scene: 'motion',
  },
  {
    title: '不同音符可批量组合，并设置统一运动轨迹',
    body: 'Ctrl 多选音符后可批量设置；建立编队后，可通过 G1 整体移动和调整。',
    scene: 'groups',
  },
  {
    title: '进入图案库，保存素材或载入已有素材',
    body: '支持保存、载入和导入导出；登录后还可同步素材。',
    scene: 'library',
  },
];

export function resolveOnboardingVisibility(storedValue: string | null, search: string): boolean {
  const override = new URLSearchParams(search).get('onboarding');
  if (override === '1') return true;
  if (override === '0') return false;
  return storedValue !== 'done';
}

export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return resolveOnboardingVisibility(
      window.localStorage.getItem(ONBOARDING_STORAGE_KEY),
      window.location.search,
    );
  } catch {
    return false;
  }
}

export function resolveInitialOnboardingStep(search: string): number {
  const requested = Number(new URLSearchParams(search).get('onboardingStep'));
  return Number.isInteger(requested)
    ? Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, requested - 1))
    : 0;
}

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(() => (
    typeof window === 'undefined' ? 0 : resolveInitialOnboardingStep(window.location.search)
  ));

  useEffect(() => {
    setOpen(shouldShowOnboarding());
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = ONBOARDING_STEPS[step + 1];
    if (next) preloadOnboardingGuide(next.scene);
  }, [open, step]);

  if (!open) return null;

  const last = step >= ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step];

  const finish = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done');
    } catch {
      // localStorage may be blocked; closing the transient layer still works.
    }
    setOpen(false);
  };

  return (
    <div className="onboarding-layer" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="onboarding-meta">
          <p className="onboarding-kicker">
            {String(step + 1).padStart(2, '0')} / {String(ONBOARDING_STEPS.length).padStart(2, '0')}
          </p>
          <span>MUSICANVAS · FIRST SESSION</span>
        </div>
        <div className="onboarding-copy">
          <div>
            <h2 id="onboarding-title">{current.title}</h2>
            <p>{current.body}</p>
          </div>
          <div className="onboarding-dots" aria-label={`第 ${step + 1} 步，共 ${ONBOARDING_STEPS.length} 步`}>
            {ONBOARDING_STEPS.map((item, index) => (
              <button
                key={item.scene}
                type="button"
                aria-label={`查看第 ${index + 1} 步：${item.title}`}
                aria-current={index === step ? 'step' : undefined}
                data-active={index === step ? 'true' : 'false'}
                onClick={() => setStep(index)}
              />
            ))}
          </div>
        </div>
        <Fragment key={current.scene}>
          <OnboardingDemo scene={current.scene} />
        </Fragment>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={finish}>跳过引导</button>
          <div className="onboarding-actions__primary">
            {step > 0 && (
              <button type="button" className="onboarding-back" onClick={() => setStep((n) => n - 1)}>上一步</button>
            )}
            {last ? (
              <button type="button" className="onboarding-next" onClick={finish}>开始创作</button>
            ) : (
              <button type="button" className="onboarding-next" onClick={() => setStep((n) => n + 1)}>下一步</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
