import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronLeft, CircleHelp, Clipboard, Download,
  FileText, FlaskConical, Layers3, Mic, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import {
  decisions, decisionPack, inputSchema, sourcesFor, type Clarification,
  type Decision, type Review, type ReviewInput,
} from '../shared/schema';
import * as api from './api';
import { sampleClarification, sampleContext, sampleIdea, sampleReview } from './sample';
import { ReadAloud, SpeakInput, VoiceProvider } from './Voice';
import { useDraft } from './useDraft';

type Stage = 'welcome' | 'material' | 'clarify' | 'review' | 'pack';
const labels: Record<Decision, string> = { proceed: 'Proceed', test: 'Test first', reshape: 'Reshape', stop: 'Stop' };
const descriptions: Record<Decision, string> = {
  proceed: 'Commit with intention', test: 'Learn before you build',
  reshape: 'Keep the problem. Change the bet.', stop: 'Make room for a better bet',
};

function StudioIllustration() {
  return <div className="studio-illustration" aria-label="A product bet moves from evidence through a challenge to a small test" role="img">
    <div className="illustration-top"><span className="eyebrow">THE THINKING TABLE</span><span className="folio">01 / 03</span></div>
    <div className="illustration-note evidence-note">
      <span className="note-label"><span className="status-dot" /> A signal</span>
      <p>“I just want last week’s order.”</p><span className="note-foot">CUSTOMER NOTE · NOT YET PROOF</span>
    </div>
    <div className="illustration-connector"><span /><ArrowRight size={22} /><span /></div>
    <div className="illustration-note challenge-note">
      <span className="note-label"><CircleHelp size={15} /> A better question</span>
      <p>Is convenience really<br />the reason they leave?</p>
    </div>
    <div className="illustration-test"><FlaskConical size={23} /><div><strong>One small test.</strong><span>Before one big commitment.</span></div><ArrowUpRight size={22} /></div>
    <div className="illustration-bottom"><span>Evidence → Challenge → Decision</span><span className="studio-stamp">BET<br />WISELY.</span></div>
  </div>;
}

function ErrorNotice({ message, dismiss }: { message: string; dismiss: () => void }) {
  return <div className="notice error" role="alert"><CircleHelp size={19} /><span>{message}</span><button className="icon-button" onClick={dismiss} aria-label="Dismiss error"><X size={18} /></button></div>;
}

export function App() {
  const [stage, setStage] = useState<Stage>('welcome');
  const [idea, setIdea] = useState('');
  const [context, setContext] = useState('');
  const [illustrative, setIllustrative] = useState(false);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [understanding, setUnderstanding] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Review | null>(null);
  const [reviewInput, setReviewInput] = useState<ReviewInput | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [providers, setProviders] = useState<api.ProviderStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const draft = useDraft(idea, context);
  const heading = useRef<HTMLHeadingElement>(null);
  const ideaField = useRef<HTMLTextAreaElement>(null);

  async function refreshStatus() {
    try {
      setProviders(api.statusSchema.parse(await api.request('/api/status')));
      setStatusError('');
    } catch { setStatusError('Server status unavailable. Live features may not be ready.'); }
  }
  useEffect(() => {
    void refreshStatus();
    const on = () => { setOnline(true); void refreshStatus(); };
    const off = () => setOnline(false);
    const unavailable = () => setError('Offline installation could not be enabled in this browser. The Studio works online; do not rely on offline access.');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('studio-offline-unavailable', unavailable);
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off);
      window.removeEventListener('studio-offline-unavailable', unavailable);
    };
  }, []);
  useEffect(() => {
    setError(''); setFeedback('');
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus();
  }, [stage]);

  const locked = !!busy || capturing;
  function go(next: Stage) { if (!locked) setStage(next); }
  function resetAnalysis() {
    setClarification(null); setResult(null); setDecision(null); setReviewInput(null); setAnswers({}); setRationale('');
  }
  function invalidateReview() {
    setResult(null); setDecision(null); setReviewInput(null); setRationale('');
  }
  function answerQuestion(id: string, value: string) {
    setAnswers(a => ({ ...a, [id]: value })); invalidateReview();
  }
  function begin(example: boolean) {
    draft.pauseSaving();
    setIllustrative(example); setIdea(example ? sampleIdea : ''); setContext(example ? sampleContext : '');
    resetAnalysis(); go('material');
  }
  function editMaterial(value: string, field: 'idea' | 'context') {
    if (illustrative) { setIllustrative(false); setFeedback('You changed the example. The next review will use live Claude, not the illustrative answer.'); }
    if (field === 'idea') setIdea(value); else setContext(value);
    resetAnalysis();
  }
  function input(): ReviewInput {
    return inputSchema.parse({
      idea, context, understanding,
      answers: clarification?.questions.map(q => ({ id: q.id, question: q.question, answer: answers[q.id] ?? '' })) ?? [],
    });
  }
  async function runClarification() {
    setError(''); setBusy('Reading your material and finding the questions that matter…');
    try {
      const value = inputSchema.parse({ idea, context, answers: [] });
      const next = illustrative ? sampleClarification : await api.clarify(value);
      setClarification(next); setUnderstanding(next.bet); setAnswers({});
      setStage('clarify');
    } catch (e) {
      setError(e instanceof Error ? (e.name === 'ZodError' ? 'Check your input: the bet needs 10–4,000 characters; supporting material can be up to 14,000.' : e.message) : 'Clarification failed. Please retry.');
    } finally { setBusy(''); }
  }
  async function runReview() {
    setError(''); setBusy('Separating signals from assumptions. Challenging the bet. Designing the smallest test…');
    try {
      const value = input();
      const next = illustrative ? sampleReview : await api.review(value);
      setResult(next); setReviewInput(value); setDecision(null); setRationale(''); setStage('review');
    } catch (e) {
      setError(e instanceof Error ? (e.name === 'ZodError' ? 'The input or review could not be validated. Check text limits and retry; your material is unchanged.' : e.message) : 'Review failed. Please retry.');
    } finally { setBusy(''); }
  }
  function preview() {
    setIdea(sampleIdea); setContext(sampleContext); setIllustrative(true);
    setClarification(sampleClarification); setUnderstanding(sampleClarification.bet);
    setAnswers({}); setResult(sampleReview); setDecision(null); setRationale('');
    setReviewInput({ idea: sampleIdea, context: sampleContext, answers: [] });
    go('review');
  }
  const sources = reviewInput ? sourcesFor(reviewInput) : [];
  const pack = result && decision ? decisionPack(result, decision, rationale, sources, illustrative) : '';
  const spokenPack = result && decision ? [
    illustrative ? 'Illustrative example. Not verified research.' : 'AI-assisted review. Not independently verified.',
    result.title, `The PM's decision: ${decision}.`, `The PM's rationale: ${rationale}`,
    `The bet: ${result.bet}`,
    `Agent recommendation, advisory only: ${result.recommendation.decision}. ${result.recommendation.confidence} confidence. ${result.recommendation.basis}`,
    `Key risk: ${result.challenge.title} ${result.challenge.invalidatedBy}`,
    `Proposed next test: ${result.test.method}`,
    `Continue if: ${result.test.success} Stop or reshape if: ${result.test.stop}`,
    `Timebox: ${result.test.timebox}. Estimated effort: ${result.test.cost}.`,
  ].join('\n\n') : '';
  function appendTranscript(text: string, field: 'idea' | 'context'): boolean {
    const current = field === 'idea' ? idea : context;
    const value = current ? `${current}\n\n${text}` : text;
    if (value.length > (field === 'idea' ? 4000 : 14000)) return false;
    editMaterial(value, field); return true;
  }

  async function copyPack() {
    try { await navigator.clipboard.writeText(pack); setFeedback('Decision pack copied. Only paste it where you intend to share this material.'); }
    catch { setError('Clipboard access is unavailable. Download the pack or select the text to copy it.'); }
  }
  function downloadPack() {
    const url = URL.createObjectURL(new Blob([pack], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'product-bet-decision.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback('Downloaded to your device. The pack includes your source material; share deliberately.');
  }

  function restoreDraft() {
    if (!draft.saved) return;
    setIdea(draft.saved.idea); setContext(draft.saved.context); setIllustrative(false);
    resetAnalysis(); draft.resumeSaving(); go('material');
  }

  return <VoiceProvider providers={providers} online={online} onCaptureChange={setCapturing} sessionKey={stage}><div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <button className="brand" onClick={() => go('welcome')} disabled={locked} aria-label="Product Bet Review Studio home">
        <span className="brand-mark"><Layers3 size={24} /></span><span>Product Bet<span className="brand-sub">REVIEW STUDIO</span></span>
      </button>
      <div className="header-right"><span className="edition">A WORKSPACE FOR BETTER JUDGMENT</span><span className="private-pill"><ShieldCheck size={14} /> Private by default</span></div>
    </header>
    {!online && <div className="connectivity" role="status">You’re offline. The example and text editing work; AI and speech require internet. Unsent text is not saved automatically.</div>}
    <main id="main">
      {stage !== 'welcome' && <nav className="journey" aria-label="Review stages">
        {([{ s: 'material', n: '01', label: 'The material', enabled: true }, { s: 'clarify', n: '02', label: 'The questions', enabled: !!clarification }, { s: 'review', n: '03', label: 'The review', enabled: !!result }, { s: 'pack', n: '04', label: 'Your decision', enabled: !!decision }] as const).map(item =>
          <button key={item.s} className={stage === item.s ? 'current' : ''} disabled={!item.enabled || locked} onClick={() => go(item.s)} aria-current={stage === item.s ? 'step' : undefined}><span>{item.n}</span>{item.label}</button>)}
      </nav>}
      {error && <ErrorNotice message={error} dismiss={() => setError('')} />}
      {feedback && <div className="notice" role="status"><Check size={18} /><span>{feedback}</span></div>}
      {draft.error && <div className="notice error" role="alert"><ShieldCheck size={18} /><span>{draft.error}</span><button className="text-button" onClick={draft.forget}>Delete stored draft</button></div>}
      {draft.saved && !draft.keeping && (stage === 'welcome' || stage === 'material') && <div className="notice"><FileText size={18} /><span>You previously chose to keep a draft on this device. It has not been submitted or automatically restored.</span><button className="text-button" onClick={restoreDraft} disabled={locked}>Restore draft</button><button className="text-button" onClick={draft.forget}>Delete</button></div>}
      {busy && <div className="notice loading" role="status"><span className="spinner" /><span>{busy}<small>You can keep your material. Nothing is submitted twice automatically.</small></span></div>}
      {stage === 'welcome' && <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="tiny-line" /> GOOD PRODUCTS START WITH BETTER QUESTIONS</p>
            <h1 tabIndex={-1} ref={heading}>Before you build,<br />make a <em>better bet.</em></h1>
            <p className="hero-description">An idea is a starting point. Not a verdict.<br className="desktop-break" /> Turn your rough notes into a thoughtful challenge, a small test, and a decision you can stand behind.</p>
            <div className="hero-actions"><button className="button primary" onClick={() => begin(true)}>Try an example <ArrowRight size={18} /></button><button className="button secondary" onClick={() => begin(false)}><Clipboard size={17} /> Paste my idea</button></div>
            <button className="text-button speak-entry" onClick={() => { begin(false); setFeedback('Use Speak below the idea field. You choose when recording starts; English, Hindi, and mixed speech are supported.'); }}><Mic size={17} /> Prefer to talk it through? <span>Speak your idea</span><ArrowUpRight size={15} /></button>
            <div className="hero-promise"><span>No accounts.</span><span>No automatic saving.</span><span>You make the call.</span></div>
          </div>
          <StudioIllustration />
        </section>
        <section className="journey-intro" aria-label="How the studio works">
          <div className="section-heading"><span className="eyebrow">FROM A HUNCH TO A HUMAN DECISION</span><span className="quiet">One considered review. Not another chat.</span></div>
          <div className="principle-grid">
            <article><span className="principle-number">01</span><h3>Bring the messy middle.</h3><p>A product idea, a customer quote, a metric. Paste it or talk it through.</p></article>
            <article><span className="principle-number">02</span><h3>Put the bet under pressure.</h3><p>Separate evidence from assumptions. Find the question that could change everything.</p></article>
            <article><span className="principle-number">03</span><h3>Choose what happens next.</h3><p>Proceed, test, reshape, or stop. Leave with a concise decision pack—not a wall of text.</p></article>
          </div>
        </section>
        <section className="example-feature">
          <div className="example-visual"><span className="eyebrow">THE SECOND BASKET</span><div className="basket-art" aria-hidden="true"><span /><span /><span /><span /><div /></div><span className="visual-caption">Same groceries.<br /><em>A different product bet.</em></span></div>
          <div className="example-copy"><span className="eyebrow">A READY-TO-EXPLORE EXAMPLE · FICTIONAL</span><h2>“What if reordering groceries<br />was just a WhatsApp away?”</h2><p>Eight interviews. A retention gap. Two weeks to learn. Is a new channel the answer—or are we asking the wrong question?</p><div className="example-signals"><span><strong>6 / 8</strong>report basket friction</span><span><strong>42%</strong>order a second time</span><span><strong>2 weeks</strong>to test the bet</span></div><button className="text-button" onClick={preview}>Explore the illustrative review <ArrowRight size={17} /></button><small>Sample claims and analysis are authored examples, not verified research or a live model response.</small></div>
        </section>
      </>}
      {stage === 'material' && <section className="workspace input-workspace">
        <div className="page-heading"><p className="eyebrow">01 / THE MATERIAL</p><h1 tabIndex={-1} ref={heading}>Bring your bet.<br /><em>And what’s behind it.</em></h1><p>Rough is fine. The useful part is separating what you’ve seen from what you hope is true.</p></div>
        {illustrative && <div className="notice"><Sparkles size={18} /><span>You’re exploring a fictional example. Editing the material switches to live Claude analysis.{providers?.ai && <button className="text-button" onClick={() => setIllustrative(false)} disabled={locked}>Run this example with Claude <ArrowRight size={15} /></button>}</span></div>}
        <div className="input-layout"><div className="material-form">
          <label className="field-label" htmlFor="idea">What’s the product bet?<span>The problem, the people, and the change you have in mind.</span></label>
          <textarea id="idea" ref={ideaField} value={idea} onChange={e => editMaterial(e.target.value, 'idea')} maxLength={4000} rows={5} disabled={!!busy} placeholder="We believe that helping [which people] do [what] will improve [which outcome], because…" />
          <SpeakInput label="idea" onApply={text => appendTranscript(text, 'idea')} disabled={!!busy} />
          <div className="field-meta"><span>English, Hindi, or a mix. Your words, first.</span><span>{idea.length.toLocaleString()} / 4,000</span></div>
          <label className="field-label" htmlFor="context">What material supports it? <span className="optional">Optional</span><span>Customer feedback, numbers, observations, constraints. Include where each came from.</span></label>
          <textarea id="context" value={context} onChange={e => editMaterial(e.target.value, 'context')} maxLength={14000} rows={9} disabled={!!busy} placeholder={'Customer feedback: “…” — from three interviews last week\nMetrics: … — from our funnel report\nConstraints: …\nWhat we don’t know yet: …'} />
          <SpeakInput label="supporting material" onApply={text => appendTranscript(text, 'context')} disabled={!!busy} />
          <div className="field-meta"><span>No uploads or external research. Just what you bring.</span><span>{context.length.toLocaleString()} / 14,000</span></div>
          <div className="draft-consent"><label><input type="checkbox" checked={draft.keeping} onChange={e => draft.choose(e.target.checked)} /><span>Keep this unsent draft on this device</span></label><small>Optional. Saves only the idea and supporting text in this browser. No recordings, answers, reviews, or decisions. Uncheck to delete it; anyone using this browser may read it.</small></div>
          <div className="form-actions"><button className="button primary" onClick={() => void runClarification()} disabled={locked || (!illustrative && (!online || !providers?.ai))}>{illustrative ? 'Continue with the example' : 'Find the useful questions'}<ArrowRight size={18} /></button><span>{capturing ? 'Add or discard your transcript first.' : 'Up to four questions.'}<br />No endless interview.</span></div>
          {!illustrative && !providers?.ai && <div className="notice"><CircleHelp size={18} /><span>{statusError || 'Live Claude is not configured. Set ANTHROPIC_API_KEY on the server; the illustrative example is available without it.'}<button className="text-button" onClick={() => void refreshStatus()}>Check connection again</button></span></div>}
        </div><aside className="margin-note"><span className="eyebrow">A GOOD BET HAS A CRACK IN IT.</span><h3>What would convince you<br />you’re wrong?</h3><p>That’s not pessimism. It’s how you avoid spending a quarter proving something you could learn in a week.</p><hr /><ShieldCheck size={21} /><h4>Your material stays yours.</h4><p>Nothing is saved by default. Live analysis sends your text to Anthropic; voice sends audio or text to Sarvam. Their data policies apply. We don’t log your material.</p></aside></div>
      </section>}
      {stage === 'clarify' && clarification && <section className="workspace">
        <div className="page-heading"><p className="eyebrow">02 / THE QUESTIONS</p><h1 tabIndex={-1} ref={heading}>A little clarity.<br /><em>A stronger review.</em></h1><p>Answer what you can. Leave the rest blank—we’ll keep it as an unknown, not fill it in.</p></div>
        {illustrative && <div className="notice"><Sparkles size={18} /><span>Illustrative walkthrough. These questions and the next review are pre-authored; answers are not analyzed by Claude. Use your own bet for live analysis.</span></div>}
        <div className="understanding-card"><label className="field-label" htmlFor="understanding">The bet, as understood<span>Correct this interpretation before the review.</span></label><textarea id="understanding" value={understanding} maxLength={2000} rows={3} disabled={!!busy} onChange={e => { setUnderstanding(e.target.value); invalidateReview(); if (illustrative) { setIllustrative(false); setFeedback('Corrected interpretation will be analyzed by live Claude.'); } }} /></div>
        <div className="questions">{clarification.questions.map((q, index) => <article className="question-card" key={q.id}>
          <span className="question-number">0{index + 1}</span><div><h3>{q.question}</h3><ReadAloud text={q.question} label={`question ${index + 1}`} /><p className="quiet">{q.why}</p><label className="sr-only" htmlFor={q.id}>Answer to question {index + 1}</label><textarea id={q.id} rows={3} maxLength={2000} placeholder="What you know—or what you still need to find out…" value={answers[q.id] ?? ''} disabled={!!busy} onChange={e => answerQuestion(q.id, e.target.value)} /><SpeakInput label={`answer ${index + 1}`} disabled={!!busy} onApply={text => {
            const current = answers[q.id] ?? ''; const value = current ? `${current}\n\n${text}` : text;
            if (value.length > 2000) return false;
            answerQuestion(q.id, value); return true;
          }} /><div className="field-meta"><span>Blank = unknown, not assumed.</span><span>{(answers[q.id] ?? '').length} / 2,000</span></div></div>
        </article>)}</div>
        {!clarification.questions.length && <div className="notice"><Check size={18} /><span>Your supplied material covers the essential questions. You can correct the interpretation and move to the review.</span></div>}
        <div className="form-actions"><button className="button primary" onClick={() => void runReview()} disabled={locked || (!illustrative && (!online || !providers?.ai))}>Put the bet under pressure <ArrowRight size={18} /></button><button className="text-button" onClick={() => go('material')} disabled={locked}><ChevronLeft size={17} /> Revisit material</button></div>
      </section>}
      {stage === 'review' && result && <section className="workspace review-workspace">
        <div className="review-title"><div><p className="eyebrow">03 / THE REVIEW</p><h1 tabIndex={-1} ref={heading}>{result.title}</h1><p>A thoughtful challenge. Not a verdict.</p></div><div className="review-origin"><span className="status-dot" />{illustrative ? 'ILLUSTRATIVE EXAMPLE' : 'CLAUDE-ASSISTED REVIEW'}<small>Not independently verified</small></div></div>
        <div className="review-topline"><span><FileText size={16} /> {sources.length} supplied sources</span><span><CircleHelp size={16} /> {result.assumptions.length} assumptions to challenge</span><button className="text-button" onClick={() => go('clarify')}>Correct the bet <ArrowUpRight size={16} /></button></div>
        <div className="bet-summary"><span className="eyebrow">THE BET AS UNDERSTOOD</span><p>{result.bet}</p><ReadAloud text={result.bet} label="the bet as understood" /></div>
        <nav className="review-anchors" aria-label="Review sections"><a href="#signals">Signals & gaps</a><a href="#challenge">The challenge</a><a href="#premortem">Pre-mortem</a><a href="#test">Smallest test</a><a href="#decision">Your call</a></nav>
        <section id="signals" className="review-section">
          <div className="section-title"><span className="section-number">01</span><div><h2>What we know. What we don’t.</h2><p>User-provided claims are signals—not independently verified facts.</p></div></div>
          <div className="evidence-grid">{result.evidence.map((e, i) => <article className="evidence-card" key={i}><span className="card-label evidence-label"><Check size={15} /> PROVIDED EVIDENCE <span>{e.sourceId}</span></span><h3>{e.claim}</h3><blockquote>“{e.quote}”</blockquote><p className="limitation">{e.limitation}</p><details><summary>View source material</summary><p>{sources.find(s => s.id === e.sourceId)?.text}</p></details></article>)}</div>
          {!result.evidence.length && <div className="notice"><CircleHelp size={18} /><span>No supporting evidence supplied. The review is based on a hypothesis, not validation.</span></div>}
          <div className="gap-grid"><div className="gap-group"><span className="card-label"><Layers3 size={15} /> ASSUMPTIONS / TO BE CHALLENGED</span>{result.assumptions.map((a, i) => <article key={i}><h3>{a.claim}</h3><p>{a.why}</p><p className="falsifier"><strong>Would break if</strong> {a.invalidatedBy}</p></article>)}</div><div className="gap-group unknown-group"><span className="card-label"><CircleHelp size={15} /> UNKNOWNS / NOT FILLED IN</span>{result.unknowns.map((u, i) => <article key={i}><h3>{u.question}</h3><p>{u.why}</p></article>)}{!result.unknowns.length && <p>No additional gaps identified. That does not establish certainty.</p>}</div></div>
        </section>
        <section id="challenge" className="challenge-panel"><div className="challenge-kicker"><span className="eyebrow">02 / THE STRONGEST CHALLENGE</span><CircleHelp size={24} /></div><h2>{result.challenge.title}</h2><p>{result.challenge.why}</p><ReadAloud text={`${result.challenge.title}\n${result.challenge.why}\nWhat could invalidate the bet: ${result.challenge.invalidatedBy}`} label="the strongest challenge" /><div className="challenge-bottom"><span>WHAT COULD INVALIDATE THE BET</span><p>{result.challenge.invalidatedBy}</p></div><small>Based on {result.challenge.sourceIds.join(', ') || 'the stated hypothesis; no supplied evidence'} · An inference, not a finding</small></section>
        <section id="premortem" className="review-section"><div className="section-title"><span className="section-number">03</span><div><h2>It’s six months later. This failed.</h2><p>Proposed failure paths—not predictions. Look for the early signal.</p></div></div><div className="premortem-grid">{result.premortem.map((p, i) => <article className="failure-card" key={i}><span className="failure-index">FAILURE PATH 0{i + 1}</span><h3>{p.path}</h3><div><span>EARLY SIGNAL</span><p>{p.signal}</p></div><div><span>REDUCE THE RISK</span><p>{p.mitigation}</p></div></article>)}</div></section>
        <section id="test" className="test-canvas"><div className="test-heading"><FlaskConical size={27} /><div><span className="eyebrow">04 / THE CHEAPEST MEANINGFUL TEST</span><h2>{result.test.title}</h2></div><span className="test-tag">PROPOSED · NOT RUN</span></div><p className="test-hypothesis">{result.test.hypothesis}</p><ReadAloud text={`Proposed test, not run. ${result.test.title}\n${result.test.method}\nContinue if: ${result.test.success}\nStop if: ${result.test.stop}`} label="the proposed test" /><div className="test-method"><span className="card-label">HOW TO LEARN</span><p>{result.test.method}</p></div><div className="test-criteria"><div><span className="card-label evidence-label">A REASON TO CONTINUE</span><p>{result.test.success}</p></div><div><span className="card-label">A REASON TO STOP OR RESHAPE</span><p>{result.test.stop}</p></div></div><div className="test-footer"><span><strong>Timebox</strong>{result.test.timebox}</span><span><strong>Estimated effort</strong>{result.test.cost}</span></div></section>
        <section id="decision" className="decision-section"><div className="section-title"><span className="section-number">05</span><div><h2>The agent advises. You decide.</h2><p>The recommendation is a starting point. Your decision is the record.</p></div></div><div className="recommendation"><span className="eyebrow">AGENT RECOMMENDATION</span><div><strong>{labels[result.recommendation.decision]}</strong><span className="confidence">{result.recommendation.confidence} confidence</span></div><p>{result.recommendation.basis}</p><ReadAloud text={`Agent recommendation, advisory only: ${result.recommendation.decision}. ${result.recommendation.confidence} confidence. ${result.recommendation.basis}\nWould change if: ${result.recommendation.wouldChangeIf}`} label="the agent recommendation" /><details><summary>What would change this recommendation?</summary><p>{result.recommendation.wouldChangeIf}</p></details></div><fieldset className="decision-options"><legend>Your next move</legend>{result.options.map(o => <label key={o.decision} className={`decision-option ${decision === o.decision ? 'selected' : ''}`}><input type="radio" name="decision" value={o.decision} checked={decision === o.decision} onChange={() => setDecision(o.decision)} /><span className="radio-mark">{decision === o.decision && <Check size={14} />}</span><strong>{labels[o.decision]}</strong><span>{descriptions[o.decision]}</span><p>{o.rationale}</p></label>)}</fieldset><label className="field-label" htmlFor="rationale">Why this decision?<span>Your reasoning, conditions, and what should happen next. This is your voice, not the agent’s.</span></label><textarea id="rationale" value={rationale} onChange={e => setRationale(e.target.value)} rows={4} maxLength={3000} placeholder="I’m choosing this direction because… We’ll reconsider if…" /><div className="form-actions"><button className="button primary" disabled={!decision || !rationale.trim()} onClick={() => go('pack')}>Create my decision pack <ArrowRight size={18} /></button><span>Select a direction and record your rationale.<br />No decision is made for you.</span></div></section>
      </section>}
      {stage === 'pack' && result && decision && <section className="workspace pack-workspace"><div className="page-heading"><p className="eyebrow">04 / YOUR DECISION PACK</p><h1 tabIndex={-1} ref={heading}>A decision worth<br /><em>putting on the table.</em></h1><p>Ready for a team conversation. Nothing is published automatically.</p></div><div className="pack-actions"><button className="button primary" onClick={() => void copyPack()}><Clipboard size={17} /> Copy pack</button><button className="button secondary" onClick={downloadPack}><Download size={17} /> Export Markdown</button><ReadAloud text={spokenPack} label="the final decision pack" /><button className="text-button" onClick={() => go('review')}>Edit decision <ArrowUpRight size={16} /></button></div><article className="decision-document"><div className="document-masthead"><span>PRODUCT BET / DECISION RECORD</span><span>{illustrative ? 'ILLUSTRATIVE EXAMPLE' : 'AI-ASSISTED · UNVERIFIED'}</span></div><h2>{result.title}</h2><div className="human-decision"><span className="eyebrow">THE PM’S DECISION</span><h3>{labels[decision]}</h3><p>{rationale}</p></div><div className="document-section"><h3>The bet</h3><p>{result.bet}</p></div><div className="document-section"><h3>Agent recommendation · advisory</h3><p><strong>{labels[result.recommendation.decision]}</strong> · {result.recommendation.confidence} confidence</p><p>{result.recommendation.basis}</p></div><div className="document-section"><h3>The risk we are accepting</h3><p>{result.challenge.title}</p><p>{result.challenge.invalidatedBy}</p></div><div className="document-section"><h3>The next useful test · proposed</h3><p>{result.test.method}</p><p><strong>Continue if:</strong> {result.test.success}</p><p><strong>Stop or reshape if:</strong> {result.test.stop}</p><p>{result.test.timebox} · {result.test.cost}</p></div><details className="full-pack"><summary>Full pack with evidence, assumptions, pre-mortem & source material</summary><pre>{pack}</pre></details><div className="document-footer"><ShieldCheck size={17} /><span>PM-owned decision. Source-linked analysis. No automatic sharing.</span></div></article></section>}
    </main>
    <footer className="site-footer"><span className="footer-brand">Better questions. Smaller risks. Human decisions.</span><div><span>Claude for thinking · Sarvam for voice</span><span>{providers ? `${providers.ai ? 'Claude configured' : 'Claude not configured'} / ${providers.speech ? 'Voice configured' : 'Voice not configured'}` : 'Provider configuration status unavailable'}</span></div><p>Session-only by default. AI and speech need internet. Provider retention policies apply.</p></footer>
  </div></VoiceProvider>;
}
