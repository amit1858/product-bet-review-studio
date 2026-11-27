import { useState, type RefObject } from 'react';
import { ArrowRight, Clipboard, FileText, CircleHelp, Layers3, FlaskConical } from 'lucide-react';

const guideStages = [
  {
    title: 'Material', icon: FileText, bring: 'Bring one product hypothesis and the material you actually have. Include source labels and limits.',
    prompts: ['Who has the problem, and what are they doing today?', 'What change do you expect, and why?', 'Which quotes, observations or metrics support it? What is missing?'],
    output: 'A product bet and a clearly attributed set of supplied signals, claims and constraints.',
    next: 'These give the questions something specific to clarify, rather than asking the model to invent context.',
    example: 'For a fictional grocery app, busy first-order shoppers may forget to reorder. A fictional interview note says, “I remember when the cupboard is empty.” This is a story for practice, not customer evidence.',
  },
  {
    title: 'Questions', icon: CircleHelp, bring: 'Correct the interpretation. Answer what you know; leave the rest blank.',
    prompts: ['What would we need to know before committing?', 'Which statement is an assumption rather than an observation?', 'What answer could change the direction of this bet?'],
    output: 'A corrected interpretation, accepted answers, and uncertainty that remains explicitly unknown.',
    next: 'The review uses that accepted text. An unanswered question stays a gap, not an invented answer.',
    example: 'We do not know the normal reorder interval. Leave that question unanswered rather than assuming a weekly purchase cycle.',
  },
  {
    title: 'Review', icon: Layers3, bring: 'Read the source-linked signals alongside their limitations, the strongest challenge and the proposed failure paths.',
    prompts: ['Does each quotation support the claim made from it?', 'What else could explain the observation?', 'What small test would distinguish the competing explanations?'],
    output: 'A critical review, explicit assumptions and unknowns, and a proposed small test with continue/stop criteria.',
    next: 'This informs a decision. The agent recommendation is advisory; it does not make that decision for you.',
    example: 'A reminder might help, but price or availability could be the real barrier. Propose an opt-in concierge test and measure annoyance as well as reorders. No uplift has been demonstrated.',
  },
  {
    title: 'Decision', icon: FlaskConical, bring: 'Choose proceed, test first, reshape or stop. Record your reasoning and what would make you reconsider.',
    prompts: ['What risk are we choosing to accept?', 'Who owns the next learning step, and when will we revisit it?', 'What would cause us to stop or reshape instead?'],
    output: 'A PM-owned decision pack: rationale, evidence boundaries, a proposed next test and the supplied sources.',
    next: 'Use the pack for a deliberate team discussion. Export only where you intend to share; nothing is published automatically.',
    example: 'Test first: learn the actual reorder interval and try one manual reminder before building. Revisit after observing usefulness, annoyance and alternative barriers. This is a proposed plan, not a result.',
  },
];

export const starterTemplate = `PRODUCT BET STARTER

MATERIAL
For [specific people] who [problem / current workaround],
we believe [change] will help them [outcome], because [reason].
Supplied signal: [quote / observation / metric, source, date].
What this does NOT establish: [limitation].
Constraints: [time / people / effort].

QUESTIONS
Our working interpretation: [...]
What we know: [...]
What we assume: [...]
What remains unknown: [...]

REVIEW
Strongest counterargument: [...]
Another explanation for the signal: [...]
Smallest meaningful test: [...]
Proposed continue criterion (not an observed result): [...]
Stop / reshape if: [...]

HUMAN DECISION
Proceed / Test first / Reshape / Stop
My rationale: [...]
Owner and timebox: [...]
Revisit when: [...]`;

export function Guide({ heading }: { heading: RefObject<HTMLHeadingElement | null> }) {
  const [message, setMessage] = useState('');
  const [copyFailed, setCopyFailed] = useState(false);
  return <section id="guide-content" className="workspace guide-workspace">
    <a className="text-button" href="#studio">Return to the Studio <ArrowRight size={16} /></a>
    <div className="page-heading"><p className="eyebrow">A FIELD GUIDE / NO PERFECT PITCH REQUIRED</p>
      <h1 ref={heading} tabIndex={-1}>Build your own<br /><em>Product Bet</em></h1>
      <p>A useful bet is not a prediction. It is a clear hypothesis, its evidence boundaries, and a choice about what to learn next.</p>
    </div>
    <div className="guide-boundary"><strong>Use this guide without sharing an idea.</strong><p>This page is static. Its fictional example and template do not use your current material, provider keys or decision. On hosted staging, the existing access gate still applies.</p></div>
    <nav className="guide-index" aria-label="Guide stages">{guideStages.map((stage, index) => <a key={stage.title} href={`#guide-${stage.title.toLowerCase()}`}>{`0${index + 1}`} {stage.title}</a>)}</nav>
    <p className="guide-example-label">ONE FICTIONAL EXAMPLE THROUGH FOUR STAGES · NOT VERIFIED RESEARCH</p>
    {guideStages.map((stage, index) => <section key={stage.title} id={`guide-${stage.title.toLowerCase()}`} className="guide-stage" tabIndex={-1} aria-labelledby={`guide-heading-${stage.title.toLowerCase()}`}>
      <header><span className="guide-stage-icon"><stage.icon size={22} aria-hidden="true" /></span><div><span className="eyebrow">STAGE 0{index + 1}</span><h2 id={`guide-heading-${stage.title.toLowerCase()}`}>{stage.title}</h2></div></header>
      <p>{stage.bring}</p>
      <div className="guide-stage-grid"><div><h3>Ask yourself</h3><ul>{stage.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></div>
        <div><h3>What you leave with</h3><p>{stage.output}</p><h3>How it carries forward</h3><p>{stage.next}</p></div></div>
      <aside className="guide-example"><span className="eyebrow">FICTIONAL / GROCERY REMINDER</span><p>{stage.example}</p></aside>
    </section>)}
    <section className="guide-template" aria-labelledby="template-heading"><p className="eyebrow">START ROUGH. KEEP THE UNKNOWNS.</p><h2 id="template-heading">A starting point, not a script.</h2>
      <p>Copy this blank template into your own notes. Keep confidential material out of a showcase. Copying does not submit anything.</p>
      <button className="button primary" onClick={async () => {
        try { await navigator.clipboard.writeText(starterTemplate); setCopyFailed(false); setMessage('Starter template copied. No current Studio material was included.'); }
        catch { setCopyFailed(true); setMessage('Clipboard access is unavailable. Select and copy the template text below.'); }
      }}><Clipboard size={16} /> Copy starter template</button>
      {message && <p className={`notice${copyFailed ? ' error' : ''}`} role={copyFailed ? 'alert' : 'status'}>{message}</p>}
      <pre tabIndex={0} aria-label="Product Bet starter template">{starterTemplate}</pre>
    </section>
    <a className="text-button" href="#studio">Return to your Studio <ArrowRight size={16} /></a>
  </section>;
}
