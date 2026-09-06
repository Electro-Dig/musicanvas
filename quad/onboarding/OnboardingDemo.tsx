export type OnboardingDemoId = 'start' | 'notes' | 'motion' | 'groups' | 'library';

export const GUIDE_IMAGE: Record<OnboardingDemoId, { src: string; alt: string }> = {
  start: { src: '/onboarding/guides/start.webp?v=brand-20260905', alt: '音乐画布播放、音色、四个画布与 MIDI 控件说明' },
  notes: { src: '/onboarding/guides/notes.webp?v=brand-20260905', alt: '音乐画布增删音符、编辑参数与 ROOT 声音起点说明' },
  motion: { src: '/onboarding/guides/motion.webp?v=brand-20260905', alt: '音乐画布音符轨迹模式与运动参数说明' },
  groups: { src: '/onboarding/guides/groups.webp?v=brand-20260905', alt: '音乐画布 Ctrl 多选、批量轨迹与统一编队运动说明' },
  library: { src: '/onboarding/guides/library.webp?v=brand-20260905', alt: '音乐画布从工作台进入图案库，并在 Seed Bank 保存、载入、导入导出与同步素材的说明' },
};

export function preloadOnboardingGuide(scene: OnboardingDemoId) {
  if (typeof Image === 'undefined') return;
  const image = new Image();
  image.src = GUIDE_IMAGE[scene].src;
}

export function OnboardingDemo({ scene }: { scene: OnboardingDemoId }) {
  const guide = GUIDE_IMAGE[scene];

  return (
    <figure className="onboarding-guide" data-scene={scene} data-ui-source="quad-lily-real-screenshot">
      <img
        src={guide.src}
        alt={guide.alt}
        width="1920"
        height="1080"
        draggable="false"
        decoding="async"
        fetchPriority={scene === 'start' ? 'high' : 'auto'}
      />
    </figure>
  );
}
