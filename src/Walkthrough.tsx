import { useEffect, useRef } from 'react';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import type { JourneyStage } from './Journey';

export const tourStages: JourneyStage[] = ['material', 'clarify', 'review', 'pack'];
const stops = [
  { title: 'Material', text: 'Bring a hypothesis and the supporting material you actually have. Paste or type it. Speak starts only when you choose it; accept or discard a transcript before moving on.', handoff: 'Your words become supplied signals and claims—not validated evidence.' },
  { title: 'Questions', text: 'Correct the interpretation and answer what you know. Leave unknowns blank. The questions become available only after you submit your material or continue the fictional example.', handoff: 'Accepted answers carry forward. Missing answers remain explicit unknowns.' },
  { title: 'Review', text: 'Read signals with their source and limitation. Open reasoning cards for full text. Consider assumptions, competing explanations and the smallest proposed test; none is independent research.', handoff: 'A counterargument and a small test inform the next human choice.' },
  { title: 'Decision', text: 'Choose proceed, test first, reshape or stop, and explain why. The agent recommendation is advisory. Copy or export only when you intend to share; nothing is published automatically.', handoff: 'Your rationale becomes the decision record. You remain responsible for the choice.' },
];

export function Walkthrough({ index, stage, locked, onIndex, onClose }: {
  index: number; stage: 'welcome' | JourneyStage; locked: boolean; onIndex: (index: number) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    next.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, []);
  useEffect(() => {
    if (index === 0 && document.activeElement === back.current) next.current?.focus();
  }, [index]);
  useEffect(() => {
    const escapeSpotlight = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && event.target instanceof Element && event.target.closest('[data-tour-highlight]')) {
        event.preventDefault(); onClose();
      }
    };
    window.addEventListener('keydown', escapeSpotlight);
    return () => window.removeEventListener('keydown', escapeSpotlight);
  }, [onClose]);
  useEffect(() => {
    const target = document.querySelector(`[data-tour-target="${tourStages[index]}"]`)
      ?? document.querySelector(`.journey li[data-stage="${tourStages[index]}"]`);
    const tabIndex = target?.getAttribute('tabindex');
    target?.setAttribute('data-tour-highlight', 'true');
    return () => {
      target?.removeAttribute('data-tour-highlight');
      if (tabIndex == null) target?.removeAttribute('tabindex');
      else target?.setAttribute('tabindex', tabIndex);
    };
  }, [index, stage]);
  function showStop() {
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${tourStages[index]}"]`)
      ?? document.querySelector<HTMLElement>(`.journey li[data-stage="${tourStages[index]}"]`);
    if (!target) return;
    const control = target.matches('textarea') ? target : target.querySelector<HTMLElement>('textarea:not(:disabled), button:not(:disabled), a[href]');
    if (control) control.focus({ preventScroll: true });
    else { target.tabIndex = -1; target.focus({ preventScroll: true }); }
    target.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }
  const stop = stops[index];
  return <section ref={panel} id="guided-tour" className="walkthrough" aria-labelledby="tour-heading" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
  }}>
    <header><span className="eyebrow">GUIDED TOUR / YOUR WORK IS UNCHANGED</span><span>Step {index + 1} of {stops.length}</span></header>
    <ol className="tour-progress" aria-label="Tour stops, not work progress">{stops.map((stop, position) => <li key={stop.title} aria-current={position === index ? 'step' : undefined}>{stop.title}</li>)}</ol>
    <div className="tour-copy" role="status" aria-live="polite" aria-atomic="true">
      <h2 id="tour-heading">{stop.title}</h2><p>{stop.text}</p><p className="tour-handoff"><ArrowRight size={16} aria-hidden="true" />{stop.handoff}</p>
    </div>
    <p className="tour-boundary">{stage === 'welcome' ? 'A preview of the four stages. The tour does not start or replace an idea.' : 'The outline marks this stop’s control or journey marker. Show highlighted area moves focus there without activating it. Return to tour is beside the journey map. Unavailable stages stay unavailable.'}</p>
    <div className="tour-controls">
      <button ref={back} className="button secondary" disabled={index === 0} onClick={() => onIndex(index - 1)}><ChevronLeft size={16} /> Back</button>
      <button ref={next} id="tour-next" className="button primary" onClick={() => index === stops.length - 1 ? onClose() : onIndex(index + 1)}>{index === stops.length - 1 ? 'Finish' : 'Next'}<ArrowRight size={16} /></button>
      <button className="text-button" onClick={onClose}>Skip tour</button>
      {stage !== 'welcome' && <button className="text-button" disabled={locked} onClick={showStop}>Show highlighted area</button>}
    </div>
  </section>;
}
