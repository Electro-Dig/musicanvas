import { IllustratedGuide } from './EnglishGuide';
export type OnboardingDemoId = 'start' | 'notes' | 'motion' | 'groups' | 'library';

export function OnboardingDemo({ scene, locale='zh' }: { scene: OnboardingDemoId; locale?:'zh'|'en' }) {
  return <IllustratedGuide scene={scene} locale={locale} />;
}
