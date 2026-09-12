import { useUiText } from '../uiLocale';
import { useEffect, useRef, useState } from 'react';
import type { LibraryAsset } from './core.ts';
import { CANON_STUDIES, loadCanonStudy } from './studies.ts';

export function CanonStudyCards({ onLoad, onStatus }: {
  onLoad(asset: LibraryAsset): void;
  onStatus(message: string): void;
}) {
  const tr = useUiText();
  const request = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function load(id: typeof CANON_STUDIES[number]['id']) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(id);
    try {
      const asset = await loadCanonStudy(id, controller.signal);
      if (!controller.signal.aborted) onLoad(asset);
    } catch (error) {
      if (!controller.signal.aborted) onStatus(error instanceof Error ? tr(error.message) : tr("示例读取失败，请重试。"));
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(null);
      }
    }
  }

  return CANON_STUDIES.map(study => (
    <article className="library-card" key={study.id} data-study={study.id}>
      <header className="library-card__header">
        <span className="library-card__index">SET</span>
        <span className="library-card__author">MusiCanvas</span>
      </header>
      <img className="library-card__preview" src={`/studies/canon-${study.id}.svg`}
        alt={tr(study.description)} loading="lazy" width="200" height="136" />
      <div className="library-card__copy">
        <h3>{tr(study.name)}</h3>
        <div className="library-card__meta"><span>{tr("4 PAD · 48 秒 · 节选")}</span></div>
      </div>
      <footer className="library-card__actions">
        <button type="button" className="library-action library-action--primary"
          disabled={loading !== null} onClick={() => void load(study.id)}>
          {loading === study.id ? tr("读取中…") : tr("载入全部")}
        </button>
      </footer>
    </article>
  ));
}
