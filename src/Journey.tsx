import { ArrowRight, Check, CircleHelp, FileText, FlaskConical, Layers3 } from 'lucide-react';
import type { Clarification, Decision, Review } from '../shared/schema';

export type JourneyStage = 'material' | 'clarify' | 'review' | 'pack';
const steps = [
  { stage: 'material', label: 'The material', output: 'Signals & claims' },
  { stage: 'clarify', label: 'The questions', output: 'Assumptions & unknowns' },
  { stage: 'review', label: 'The review', output: 'Challenge & small test' },
  { stage: 'pack', label: 'Your decision', output: 'Human choice' },
] as const;

export function Journey({ stage, clarified, reviewed, decided, locked, onGo }: {
  stage: JourneyStage; clarified: boolean; reviewed: boolean; decided: boolean;
  locked: boolean; onGo: (stage: JourneyStage) => void;
}) {
  const available = { material: true, clarify: clarified, review: reviewed, pack: decided };
  const complete = { material: clarified, clarify: reviewed, review: decided, pack: decided };
  return <nav className="journey" aria-label="Review stages"><ol>
    {steps.map((step, index) => {
      const state = stage === step.stage ? 'current' : complete[step.stage] ? 'complete' : available[step.stage] ? 'available' : 'upcoming';
      return <li key={step.stage} data-stage={step.stage} data-state={state}>
        <button disabled={!available[step.stage] || locked} onClick={() => onGo(step.stage)} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="step-marker" aria-hidden="true">{complete[step.stage] ? <Check size={16} /> : `0${index + 1}`}</span>
          <span className="step-label">{step.label}</span>
          <span className="step-output">{step.output}</span>
          <span className="sr-only">{state === 'complete' ? 'Completed' : state === 'upcoming' ? 'Not available yet' : ''}</span>
        </button>
      </li>;
    })}
  </ol><p className="journey-status" role="status" aria-live="polite">Current stage: {steps.find(step => step.stage === stage)!.label}. {steps.filter(step => complete[step.stage]).length} of 4 stages completed.</p></nav>;
}

type TrailNode = {
  label: string;
  text: string;
  note: string;
  icon: typeof FileText;
};

function ReasoningTrail({ title, note, nodes }: { title: string; note: string; nodes: TrailNode[] }) {
  return <section className="reasoning-trail" aria-label={title}>
    <header><span className="eyebrow">{title}</span><p>{note}</p></header>
    <ol>{nodes.map((node, index) => <li key={node.label}>
      <div className="trail-heading"><node.icon size={18} aria-hidden="true" /><h3>{node.label}</h3>
        {index < nodes.length - 1 && <ArrowRight className="trail-arrow" size={16} aria-hidden="true" />}
      </div>
      <p className="trail-preview">{node.text}</p>
      <span className="trail-note">{node.note}</span>
      <details><summary>Read full {node.label.toLowerCase()}</summary><p>{node.text}</p></details>
    </li>)}</ol>
  </section>;
}

export function MaterialTrail({ idea, context, illustrative }: { idea: string; context: string; illustrative: boolean }) {
  return <ReasoningTrail title="From material to useful questions" note={illustrative ? 'Fictional example. These supplied claims are not verified findings.' : 'Your words first. Adding material does not validate the bet.'} nodes={[
    { label: 'The bet', text: idea.trim() || 'Start with the people, their problem, and the change you hope to make.', note: 'A hypothesis, not a conclusion', icon: FileText },
    { label: 'Supplied signals', text: context.trim() || 'No supporting material supplied yet. You can still explore a hypothesis.', note: 'Quotes, claims, observations or constraints', icon: Layers3 },
    { label: 'Questions next', text: 'Which claims need evidence? What is assumed? What could change your mind?', note: 'Next stage · not generated yet', icon: CircleHelp },
  ]} />;
}

export function QuestionsTrail({ clarification, understanding, answers }: {
  clarification: Clarification; understanding: string; answers: Record<string, string>;
}) {
  const open = clarification.questions.filter(question => !answers[question.id]?.trim());
  return <ReasoningTrail title="Make the uncertainty visible" note="An answer adds context. A blank stays unknown; it is not permission to invent a fact." nodes={[
    { label: 'Working interpretation', text: understanding, note: 'Editable before review', icon: FileText },
    { label: 'Still open', text: open[0]?.question || 'No unanswered clarification questions. This does not establish certainty.', note: `${open.length} unanswered clarification${open.length === 1 ? '' : 's'}`, icon: CircleHelp },
    { label: 'Review next', text: 'The review will connect supplied claims to their sources and challenge assumptions. It is not independent research.', note: 'Your accepted text moves forward', icon: Layers3 },
  ]} />;
}

export function ReviewTrail({ review, illustrative }: { review: Review; illustrative: boolean }) {
  const signal = review.evidence[0];
  return <ReasoningTrail title="Follow the reasoning" note={`${illustrative ? 'Fictional example. ' : ''}Drawn from this review, not new research. Open any card for its full text.`} nodes={[
    { label: 'Supplied signal', text: signal ? `“${signal.quote}”` : 'No supporting evidence supplied. The review starts from a hypothesis.', note: signal ? `Source ${signal.sourceId} · user-supplied, unverified` : 'No evidence-backed conclusion', icon: FileText },
    { label: 'Claim & boundary', text: signal ? `${signal.claim}\nLimitation: ${signal.limitation}` : 'Demand, causality and outcomes have not been established.', note: 'A quote is not proof of causation', icon: Layers3 },
    { label: 'Counterargument', text: `${review.challenge.title}\n${review.challenge.why}`, note: 'An inference to challenge, not a finding', icon: CircleHelp },
    { label: 'Next learning step', text: `${review.test.title}\n${review.test.method}`, note: 'Proposed test · not run', icon: FlaskConical },
  ]} />;
}

export function DecisionTrail({ review, decision, rationale }: { review: Review; decision: Decision | null; rationale: string }) {
  const names: Record<Decision, string> = { proceed: 'Proceed', test: 'Test first', reshape: 'Reshape', stop: 'Stop' };
  return <ReasoningTrail title="A small test. A human decision." note="The proposed test is a learning option, not an instruction to proceed." nodes={[
    { label: 'Uncertainty to resolve', text: review.challenge.invalidatedBy, note: 'What could change the bet', icon: CircleHelp },
    { label: 'Proposed test path', text: `${review.test.title}\nContinue if: ${review.test.success}\nStop or reshape if: ${review.test.stop}`, note: `${review.test.timebox} · proposed, not observed`, icon: FlaskConical },
    { label: 'Your call', text: decision ? `${names[decision]}\n${rationale.trim() || 'Add your rationale to complete the record.'}` : 'No human decision recorded. Choose proceed, test, reshape or stop, then explain why.', note: 'PM-owned · separate from the agent recommendation', icon: Check },
  ]} />;
}
