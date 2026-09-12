/**
 * 首次访问的五步创作引导。演示只挂载当前场景，避免首屏加载视频资源。
 */
import { Fragment, useEffect, useState } from 'react';
import { OnboardingDemo, type OnboardingDemoId } from './OnboardingDemo.tsx';
import './onboarding.css';
import type { AppLocale } from '../i18n';

export const ONBOARDING_STORAGE_KEY = 'gemidi.quad-lily.onboarding.v5';

export const ONBOARDING_STEPS: readonly {
  title: string;
  body: string;
  scene: OnboardingDemoId;
}[] = [
  {
    title: '四个画布，开启你的创作',
    body: '切换画布、挑选音色，按需连接 MIDI。',
    scene: 'start',
  },
  {
    title: '放下音符，塑造旋律',
    body: '从 ROOT 出发，用音高、位置和连接谱出旋律。',
    scene: 'notes',
  },
  {
    title: '画一条路，让音符动起来',
    body: '圆形、线段、手绘与闪烁，让连接随着运动变化。',
    scene: 'motion',
  },
  {
    title: '把多个音符，变成一个组合',
    body: '一起编辑、一起运动，也可以一起发声。',
    scene: 'groups',
  },
  {
    title: '从图案出发，把灵感留下',
    body: '在广场寻找起点，在我的素材里保存创作。',
    scene: 'library',
  },
];

export const ONBOARDING_STEPS_EN = [
  {scene:'start',title:'Four canvases, sounds and MIDI',body:'Build across four pads. Choose sounds and connect MIDI when needed.'},
  {scene:'notes',title:'Place notes and shape the melody',body:'Start at ROOT. Shape the melody with pitch, position and connections.'},
  {scene:'motion',title:'Give your notes a path to follow',body:'Explore orbits, lines, drawn paths and blinking to change connections.'},
  {scene:'groups',title:'Move several notes as one',body:'Select, group and explore shared motion or chords.'},
  {scene:'library',title:'Save an idea or start from a pattern',body:'Explore Pattern Plaza. Make it yours. Save it for later.'},
] as const;

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

export function OnboardingTour({locale='zh',onToggleLocale}:{locale?:AppLocale;onToggleLocale?:()=>void}) {
  const steps=locale==='en'?ONBOARDING_STEPS_EN:ONBOARDING_STEPS;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(() => (
    typeof window === 'undefined' ? 0 : resolveInitialOnboardingStep(window.location.search)
  ));

  useEffect(() => {
    setOpen(shouldShowOnboarding());
  }, []);


  if (!open) return null;

  const last = step >= ONBOARDING_STEPS.length - 1;
  const current = steps[step];

  const finish = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done');
    } catch {
      // localStorage may be blocked; closing the transient layer still works.
    }
    setOpen(false);
  };

  return (
    <div className="onboarding-layer" lang={locale==='zh'?'zh-CN':'en'} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <div className="onboarding-meta">
          <p className="onboarding-kicker">
            {String(step + 1).padStart(2, '0')} / {String(ONBOARDING_STEPS.length).padStart(2, '0')}
          </p>
          <span>{locale==='zh'?'音乐画布 · 初次创作':'MUSICANVAS · FIRST SESSION'}</span>
          <button type="button" className="quad-studio-locale-toggle" data-locale={locale} onClick={onToggleLocale}
            aria-label={locale==='zh'?'引导切换为英文':'Switch guide to Chinese'}>
            <span aria-hidden="true" data-on={locale==='zh'}>中</span>
            <span aria-hidden="true" data-on={locale==='en'}>EN</span>
          </button>
        </div>
        <div className="onboarding-copy">
          <div>
            <h2 id="onboarding-title">{current.title}</h2>
            <p>{current.body}</p>
          </div>
          <div className="onboarding-dots" aria-label={locale==='zh'?`第 ${step + 1} 步，共 ${steps.length} 步`:`Step ${step+1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <button
                key={item.scene}
                type="button"
                aria-label={locale==='zh'?`查看第 ${index + 1} 步：${item.title}`:`View step ${index+1}: ${item.title}`}
                aria-current={index === step ? 'step' : undefined}
                data-active={index === step ? 'true' : 'false'}
                onClick={() => setStep(index)}
              />
            ))}
          </div>
        </div>
        <Fragment key={current.scene}>
          <OnboardingDemo scene={current.scene} locale={locale} />
        </Fragment>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={finish}>{locale==='zh'?'跳过引导':'Skip tour'}</button>
          <div className="onboarding-actions__primary">
            {step > 0 && (
              <button type="button" className="onboarding-back" onClick={() => setStep((n) => n - 1)}>{locale==='zh'?'上一步':'Back'}</button>
            )}
            {last ? (
              <button type="button" className="onboarding-next" onClick={finish}>{locale==='zh'?'开始创作':'Start creating'}</button>
            ) : (
              <button type="button" className="onboarding-next" onClick={() => setStep((n) => n + 1)}>{locale==='zh'?'下一步':'Next'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
