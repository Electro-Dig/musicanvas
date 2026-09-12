import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { CanvasDecoration } from './canvasDecoration.ts';
import type { LilyNode, QuadPadId } from './core.ts';
import { bindFeatherPoint, displaceFeatherPoint, sampleFeatherWind, subscribeFeatherPainter } from './featherSway.ts';

/** A display-only deformation: musical coordinates, timers and automation stay untouched. */
export function useFeatherSway(svgRef: RefObject<SVGSVGElement | null>, enabled: boolean,
  decoration: CanvasDecoration | undefined, nodes: readonly LilyNode[], padId: QuadPadId) {
  const latest = useRef(nodes);
  latest.current = nodes;
  const controller = useRef<{ setEnabled(on: boolean): void; unproject(p: { x: number; y: number }): { x: number; y: number } } | null>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const stem = decoration?.strokes.find(s => s.role === 'stem');
    if (!svg || !decoration || !stem) return;
    const root = { x: stem.points[0][0], y: stem.points[0][1] };
    const tipY = stem.points.at(-1)![1];
    const bind = (x: number, y: number) => bindFeatherPoint({ x, y }, root, tipY);
    const paths = [...svg.querySelectorAll<SVGPathElement>('.quad-canvas-decoration path')].map((el, i) => ({
      el, closed: decoration.strokes[i].role === 'outline',
      points: decoration.strokes[i].points.map(([x, y]) => bind(x, y)),
    }));
    let marks = new Map<string, { el: SVGGElement; range?: SVGCircleElement; point?: ReturnType<typeof bind> }>();
    const rebuildMarks = () => {
      const ranges = new Map([...svg.querySelectorAll<SVGCircleElement>('[data-range-node-id]')].map(el => [el.dataset.rangeNodeId!, el]));
      marks = new Map([...svg.querySelectorAll<SVGGElement>('.quad-lily-node')].map(el => [el.dataset.nodeId!, { el, range: ranges.get(el.dataset.nodeId!) }]));
    };
    rebuildMarks();
    let running = false, requested = false, visible = true, dragging = false, strength = 0, seconds = 0;
    let transitionAt = 0, transitionFrom = 0;
    let stopDeadline: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const phase = (padId.charCodeAt(0) - 65) * .28;
    const draw = () => {
      if (marks.size !== latest.current.length || latest.current.some(n => !marks.has(n.id))) rebuildMarks();
      const wind = sampleFeatherWind(seconds, phase);
      const points = new Map<string, { x: number; y: number }>();
      for (const node of latest.current) {
        const mark = marks.get(node.id);
        if (!mark) continue;
        if (!mark.point || mark.point.x !== node.x || mark.point.y !== node.y) mark.point = bind(node.x, node.y);
        const p = displaceFeatherPoint(mark.point, wind, strength);
        points.set(node.id, p);
        mark.el.setAttribute('transform', `translate(${p.x * 100} ${p.y * 100})`);
        mark.range?.setAttribute('cx', String(p.x * 100));
        mark.range?.setAttribute('cy', String(p.y * 100));
      }
      for (const path of paths) path.el.setAttribute('d', path.points.map((p, i) => {
        const q = displaceFeatherPoint(p, wind, strength);
        return `${i ? 'L' : 'M'}${strength ? (q.x * 100).toFixed(4) : q.x * 100},${strength ? (q.y * 100).toFixed(4) : q.y * 100}`;
      }).join(' ') + (path.closed ? ' Z' : ''));
      for (const edge of svg.querySelectorAll<SVGLineElement>('.quad-lily-pad__connections line')) {
        const a = points.get(edge.dataset.fromNodeId!), b = points.get(edge.dataset.toNodeId!);
        if (a && b) { edge.setAttribute('x1', String(a.x * 100)); edge.setAttribute('y1', String(a.y * 100)); edge.setAttribute('x2', String(b.x * 100)); edge.setAttribute('y2', String(b.y * 100)); }
      }
    };
    const stop = () => {
      clearTimeout(stopDeadline); stopDeadline = undefined;
      unsubscribe?.(); unsubscribe = undefined; running = false; strength = 0;
      draw(); svg.removeAttribute('data-sway-active');
    };
    const start = () => {
      if (running || !requested || reduced.matches || !visible) return;
      transitionAt = performance.now(); transitionFrom = strength;
      running = true; svg.setAttribute('data-sway-active', 'true');
      unsubscribe = subscribeFeatherPainter(dt => {
        const target = requested && !reduced.matches ? 1 : 0;
        const progress = Math.min(1, (performance.now() - transitionAt) / (target ? 1000 : 650));
        const ease = progress * progress * (3 - 2 * progress);
        strength = transitionFrom + (target - transitionFrom) * ease;
        if (!dragging) seconds += dt;
        draw();
        if (!target && progress === 1) { stop(); return false; }
        return true;
      });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) stop(); else start();
    });
    observer.observe(svg);
    const down = () => { dragging = true; };
    const up = () => { dragging = false; };
    const motionPreferenceChanged = () => { if (reduced.matches) stop(); else start(); };
    svg.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    reduced.addEventListener('change', motionPreferenceChanged);
    controller.current = {
      setEnabled(on) {
        clearTimeout(stopDeadline); stopDeadline = undefined;
        if (requested !== on) { transitionAt = performance.now(); transitionFrom = strength; }
        requested = on;
        if (on) start(); else if (!running) stop();
        // A hidden or occluded tab may stop delivering animation frames during the fade.
        else stopDeadline = setTimeout(stop, 700);
      },
      unproject(p) {
        const wind = sampleFeatherWind(seconds, phase);
        let q = { ...p };
        for (let i = 0; i < 5; i++) { const warped = displaceFeatherPoint(bind(q.x, q.y), wind, strength); q = { x: q.x + p.x - warped.x, y: q.y + p.y - warped.y }; }
        return q;
      },
    };
    return () => {
      observer.disconnect(); stop(); controller.current = null;
      svg.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      reduced.removeEventListener('change', motionPreferenceChanged);
    };
  }, [decoration, padId]);
  useLayoutEffect(() => { controller.current?.setEnabled(enabled); }, [enabled, decoration]);
  return (point: { x: number; y: number }) => controller.current?.unproject(point) ?? point;
}
