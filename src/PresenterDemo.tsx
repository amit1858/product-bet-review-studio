import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, RotateCcw, X } from 'lucide-react';
import { leadershipStory } from '../shared/schema';
import { Journey, ReviewTrail, type JourneyStage } from './Journey';
import { sampleClarification, sampleContext, sampleIdea, sampleReview } from './sample';

const stops: { stage: JourneyStage; title: string; subtitle: string; narration: string }[] = [
  { stage: 'material', title: 'Start with a bet. Keep its limits.', subtitle: 'A fictional grocery reorder idea and the material behind it.', narration: 'We start with a hypothesis, not a feature request. The numbers and interview notes here are authored fiction. They show how to bring material with its limits, not how to prove demand.' },
  { stage: 'clarify', title: 'Ask what could change the bet.', subtitle: 'Pre-authored questions expose the assumptions. Unknowns stay unknown.', narration: 'A complaint about rebuilding a basket is not necessarily a reason customers leave. In the real workspace you can correct the interpretation and answer what you know. This demo leaves the important questions open.' },
  { stage: 'review', title: 'Connect the signal to the challenge.', subtitle: 'Source-linked reasoning, an alternative explanation, and a proposed small test.', narration: 'The review keeps a quotation beside its limitation. It challenges the leap from convenience to retention, then proposes a cheap way to learn. Neither the review nor the test is validated research.' },
  { stage: 'pack', title: 'A human decision. Not an AI verdict.', subtitle: 'A prewritten fictional decision record for a team conversation.', narration: 'Our fictional PM chooses Test first and records why. A real user can disagree with the agent. Exporting is deliberate; nothing is published automatically. This presenter copy never changes your decision.' },
];
const demoRationale = 'Test first. Learn why lapsed shoppers leave before building a new channel. Confirm stock manually, interview non-buyers, and reconsider if price or availability is the real barrier.';

export function PresenterDemo({ onExit }: { onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const stop = stops[index];
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    document.getElementById('presenter-content')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [index]);
  function replay() {
    setIndex(0);
    heading.current?.focus({ preventScroll: true });
    document.getElementById('presenter-content')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  return <section id="presenter-content" className="presenter" tabIndex={-1} aria-label="Presenter Demo" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit(); }
  }}>
    <header className="presenter-bar">
      <div><span className="eyebrow">PRESENTER DEMO / FICTIONAL &amp; UNVERIFIED</span><p>No AI, backend requests or recording. Your workspace is unchanged.</p></div>
      <div className="presenter-controls" aria-label="Presenter controls">
        <button className="button secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} aria-hidden="true" /> Back</button>
        <button className="button primary" disabled={index === stops.length - 1} onClick={() => setIndex(index + 1)}>Next <ArrowRight size={16} aria-hidden="true" /></button>
        <button className="text-button" onClick={replay}><RotateCcw size={16} aria-hidden="true" /> Replay</button>
        <button className="text-button" onClick={onExit}><X size={16} aria-hidden="true" /> Exit demo</button>
      </div>
    </header>
    <p className="presenter-progress" role="status" aria-atomic="true">Demo stop {index + 1} of {stops.length}: {['Material', 'Questions', 'Review', 'Decision'][index]}. Illustrative, not a live result.</p>
    <Journey stage={stop.stage} clarified={index >= 1} reviewed={index >= 2} decided={index >= 3} locked={false} onGo={stage => setIndex(stops.findIndex(stop => stop.stage === stage))} />
    <div className="presenter-heading page-heading"><p className="eyebrow">THE SECOND BASKET / PREWRITTEN EXAMPLE</p><h1 ref={heading} tabIndex={-1}>{stop.title}</h1><p>{stop.subtitle}</p></div>
    <div className="presenter-notes">
      <button className="text-button" aria-expanded={notes} aria-controls="presenter-talking-points" onClick={() => setNotes(!notes)}>{notes ? 'Hide talking points' : 'Show talking points'}</button>
      <p id="presenter-talking-points" hidden={!notes}>{stop.narration}</p>
    </div>
    <div className="presenter-screen" key={stop.stage}>
      {index === 0 && <div className="presenter-grid">
        <article className="presenter-card"><span className="eyebrow">THE PRODUCT BET / HYPOTHESIS</span><h2>A shorter path to the second basket</h2><p>{sampleIdea}</p><aside>Voice is optional in the real workspace. Exit the demo, configure your own Sarvam access over HTTPS, then explicitly choose Speak. Nothing here requests microphone access.</aside></article>
        <article className="presenter-card"><h2>Supporting material</h2><p className="presenter-source">{sampleContext}</p></article>
      </div>}
      {index === 1 && <div className="presenter-grid">
        <article className="presenter-card"><span className="eyebrow">WORKING INTERPRETATION / PREWRITTEN</span><h2>The bet, as understood</h2><p>{sampleClarification.bet}</p><aside>These questions and this interpretation were authored in advance. No model is responding, and the demo does not collect answers.</aside></article>
        <article className="presenter-card"><h2>Three useful unknowns</h2><ol className="presenter-questions">{sampleClarification.questions.map(question => <li key={question.id}><h3>{question.question}</h3><p>{question.why}</p><span className="eyebrow">LEFT UNKNOWN IN THIS DEMO</span></li>)}</ol></article>
      </div>}
      {index === 2 && <>
        <ReviewTrail review={sampleReview} illustrative />
        <div className="presenter-grid">
          <article className="presenter-card"><span className="eyebrow">STRONGEST CHALLENGE / AN INFERENCE</span><h2>{sampleReview.challenge.title}</h2><p>{sampleReview.challenge.why}</p></article>
          <article className="presenter-card"><span className="eyebrow">SMALL TEST / PROPOSED, NOT RUN</span><h2>{sampleReview.test.title}</h2><p>{sampleReview.test.method}</p></article>
        </div>
      </>}
      {index === 3 && <div className="presenter-grid">
        <article className="presenter-card presenter-decision"><span className="eyebrow">FICTIONAL PM DECISION / PREWRITTEN, NOT YOUR CHOICE</span><h2>Test first</h2><p>{demoRationale}</p><h3>Agent recommendation / advisory</h3><p>{sampleReview.recommendation.basis}</p><aside>In the real workspace, choose your direction and rationale, then deliberately copy or export Markdown. Demo controls never export or share anything.</aside></article>
        <article className="presenter-card"><h2>The story for the room</h2><dl className="presenter-story">{leadershipStory(sampleReview).map(beat => <div key={beat.label}><dt>{beat.label}</dt><dd>{beat.text}</dd></div>)}</dl></article>
      </div>}
    </div>
    <p className="presenter-boundary">All figures, quotes, questions, analysis and decisions are illustrative and unverified. No test has been run. Exit returns to your unchanged workspace; Replay resets only this demo.</p>
  </section>;
}
