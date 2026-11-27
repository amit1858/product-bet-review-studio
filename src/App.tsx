import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronLeft, CircleHelp, Clipboard, Download,
  FileText, FlaskConical, Layers3, Mic, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import {
  decisionPack, inputSchema, leadershipStory, sourcesFor, type Clarification,
  type Decision, type Review, type ReviewInput,
} from '../shared/schema';
import * as api from './api';
import { sampleClarification, sampleContext, sampleIdea, sampleReview } from './sample';
import { ReadAloud, SpeakInput, VoiceProvider } from './Voice';
import { useDraft } from './useDraft';
import { ProviderAccess, useCredentialAccess } from './Credentials';
import { DecisionTrail, Journey, MaterialTrail, QuestionsTrail, ReviewTrail } from './Journey';
import { Guide } from './Guide';
import { ThemeSelector } from './Theme';
import { BuilderGuide } from './BuilderGuide';
import { Walkthrough } from './Walkthrough';
import { PresenterDemo } from './PresenterDemo';

type Stage = 'welcome' | 'material' | 'clarify' | 'review' | 'pack';
const labels: Record<Decision, string> = { proceed: 'Proceed', test: 'Test first', reshape: 'Reshape', stop: 'Stop' };
const descriptions: Record<Decision, string> = {
  proceed: 'Commit with intention', test: 'Learn before you build',
  reshape: 'Keep the problem. Change the bet.', stop: 'Make room for a better bet',
};
const isGuideRoute = () => /^#guide(?:-(?:material|questions|review|decision|content))?$/.test(window.location.hash);
const isBuilderRoute = () => /^#builder(?:-(?:methodology|prd|states|prompt|tests|privacy|readiness|example|content))?$/.test(window.location.hash);
const learningRoute = () => isGuideRoute() ? 'guide' : isBuilderRoute() ? 'builder' : 'studio';

function StudioIllustration() {
  return <div className="studio-illustration" aria-label="Fictional example: a note about repeating last week's grocery order is a signal, not proof. Question whether convenience explains leaving, then propose a small test before deciding." role="img">
    <div className="illustration-top"><span className="eyebrow">THE THINKING CANVAS</span><span className="folio">FICTIONAL EXAMPLE</span></div>
    <div className="canvas-flow">
      <div className="illustration-note evidence-note"><span className="note-label"><FileText size={18} /> 01 / Signal</span><p>“I just want last week’s order.”</p><span className="note-foot">A supplied claim. Not proof.</span></div>
      <ArrowRight className="canvas-link link-one" size={24} />
      <div className="illustration-note challenge-note"><span className="note-label"><CircleHelp size={18} /> 02 / Question</span><p>Is convenience why they leave?</p><span className="note-foot">Keep the uncertainty visible.</span></div>
      <ArrowRight className="canvas-link link-two" size={24} />
      <div className="illustration-note test-note"><span className="note-label"><FlaskConical size={18} /> 03 / Test</span><p>Try a manual reorder.</p><span className="note-foot">Proposed only. Not run.</span></div>
      <ArrowRight className="canvas-link link-three" size={24} />
      <div className="illustration-note decision-note"><span className="note-label"><Check size={18} /> 04 / Decision</span><p>Learn first.<br />Then make the call.</p><span className="note-foot">A human choice. Not a verdict.</span></div>
    </div>
    <div className="illustration-bottom"><span>Signals become questions. Tests inform decisions.</span></div>
  </div>;
}

function ErrorNotice({ message, dismiss }: { message: string; dismiss: () => void }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notice.current?.focus({ preventScroll: true });
    notice.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
  }, [message]);
  return <div ref={notice} className="notice error" role="alert" aria-atomic="true" aria-labelledby="request-error-message" tabIndex={-1}><CircleHelp size={19} /><span id="request-error-message">{message}</span><button className="icon-button" onClick={dismiss} aria-label="Dismiss error"><X size={18} /></button></div>;
}

export function App() {
  const access = useCredentialAccess();
  const [stage, setStage] = useState<Stage>('welcome');
  const [page, setPage] = useState(learningRoute);
  const guideOpen = page === 'guide';
  const builderOpen = page === 'builder';
  const learningOpen = guideOpen || builderOpen;
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const tourEntry = useRef<HTMLButtonElement | null>(null);
  const [presenting, setPresenting] = useState(false);
  const presenterEntry = useRef<HTMLButtonElement | null>(null);
  const presentingRef = useRef(false);
  presentingRef.current = presenting;
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
  const [updateReady, setUpdateReady] = useState(false);
  const draft = useDraft(idea, context);
  const heading = useRef<HTMLHeadingElement>(null);
  const ideaField = useRef<HTMLTextAreaElement>(null);
  const analysis = useRef<AbortController | null>(null);
  const acceptedFragment = useRef(window.location.hash);
  const aiReady = access.configured.claude ? access.secure : !!providers?.ai;
  useEffect(() => {
    const changed = () => {
      if (presentingRef.current && window.location.hash === '#presenter-content') return;
      if ((busy || capturing) && learningRoute() !== 'studio') {
        window.history.replaceState(null, '', acceptedFragment.current || '#studio');
        setFeedback(capturing ? 'Add or discard your transcript before opening the guide.' : 'Wait for the current request to finish before opening the guide.');
        return;
      }
      acceptedFragment.current = window.location.hash;
      setPage(learningRoute());
      setTourIndex(null);
      setPresenting(false);
      if (presentingRef.current && learningRoute() === 'studio') {
        requestAnimationFrame(() => presenterEntry.current?.focus());
      }
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, [busy, capturing]);
  useEffect(() => {
    analysis.current?.abort(); analysis.current = null; setBusy('');
  }, [access.epoch]);
  useEffect(() => () => analysis.current?.abort(), []);

  async function refreshStatus() {
    try {
      setProviders(api.statusSchema.parse(await api.request('/api/status')));
      setStatusError('');
    } catch { setProviders(null); setStatusError('Server status unavailable. Live features may not be ready.'); }
  }
  useEffect(() => {
    void refreshStatus();
    const on = () => { setOnline(true); if (!presentingRef.current) void refreshStatus(); };
    const off = () => setOnline(false);
    const unavailable = () => setError('Offline installation could not be enabled in this browser. The Studio works online; do not rely on offline access.');
    const updated = () => setUpdateReady(true);
    const updateFailed = () => setError('The new version could not be installed. Your current version and work remain available. Reconnect and reopen after exporting your work to try the update again.');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('studio-offline-unavailable', unavailable);
    window.addEventListener('studio-update-ready', updated);
    window.addEventListener('studio-update-failed', updateFailed);
    return () => {
      window.removeEventListener('online', on); window.removeEventListener('offline', off);
      window.removeEventListener('studio-offline-unavailable', unavailable);
      window.removeEventListener('studio-update-ready', updated);
      window.removeEventListener('studio-update-failed', updateFailed);
    };
  }, []);
  useEffect(() => {
    setError(''); setFeedback('');
    const guideSection = learningOpen && /^#(?:guide-(material|questions|review|decision)|builder-(methodology|prd|states|prompt|tests|privacy|readiness|example))$/.test(window.location.hash)
      ? document.getElementById(window.location.hash.slice(1)) : null;
    if (guideSection) {
      guideSection.focus({ preventScroll: true });
      guideSection.scrollIntoView({ behavior: 'instant', block: 'start' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    heading.current?.focus();
  }, [stage, page]);

  const locked = !!busy || capturing;
  function startTour(entry: HTMLButtonElement) {
    if (locked) return;
    tourEntry.current = entry; setTourIndex(0);
    document.getElementById('tour-next')?.focus();
  }
  function closeTour() {
    setTourIndex(null);
    if (tourEntry.current?.isConnected && !tourEntry.current.disabled) tourEntry.current.focus();
    else heading.current?.focus({ preventScroll: true });
  }
  function startPresenter(entry: HTMLButtonElement) {
    if (locked) return;
    presenterEntry.current = entry; setPresenting(true);
  }
  function closePresenter() {
    setPresenting(false);
    requestAnimationFrame(() => {
      if (presenterEntry.current?.isConnected && !presenterEntry.current.disabled) presenterEntry.current.focus();
      else heading.current?.focus();
    });
  }
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
    const active = new AbortController(); analysis.current = active;
    try {
      const value = inputSchema.parse({ idea, context, answers: [] });
      const next = illustrative ? sampleClarification : await api.clarify(value, access.request, active.signal);
      if (active.signal.aborted) return;
      setClarification(next); setUnderstanding(next.bet); setAnswers({});
      setStage('clarify');
    } catch (e) {
      if (active.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof Error ? (e.name === 'ZodError' ? 'Check your input: the bet needs 10–4,000 characters; supporting material can be up to 14,000.' : e.message) : 'Clarification failed. Please retry.');
    } finally { if (analysis.current === active) { analysis.current = null; setBusy(''); } }
  }
  async function runReview() {
    setError(''); setBusy('Separating signals from assumptions. Challenging the bet. Designing the smallest test…');
    const active = new AbortController(); analysis.current = active;
    try {
      const value = input();
      const next = illustrative ? sampleReview : await api.review(value, access.request, active.signal);
      if (active.signal.aborted) return;
      setResult(next); setReviewInput(value); setDecision(null); setRationale(''); setStage('review');
    } catch (e) {
      if (active.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      setError(e instanceof Error ? (e.name === 'ZodError' ? 'The input or review could not be validated. Check text limits and retry; your material is unchanged.' : e.message) : 'Review failed. Please retry.');
    } finally { if (analysis.current === active) { analysis.current = null; setBusy(''); } }
  }
  function preview() {
    draft.pauseSaving();
    setIdea(sampleIdea); setContext(sampleContext); setIllustrative(true);
    setClarification(sampleClarification); setUnderstanding(sampleClarification.bet);
    setAnswers({}); setResult(sampleReview); setDecision(null); setRationale('');
    setReviewInput({ idea: sampleIdea, context: sampleContext, answers: [] });
    go('review');
  }
  const sources = reviewInput ? sourcesFor(reviewInput) : [];
  const guideUrl = new URL('/#guide', window.location.origin).href;
  const pack = result && decision ? `${decisionPack(result, decision, rationale, sources, illustrative)}\n\n## Build your own Product Bet\n\n[Open the static Product Bet guide](${guideUrl})\n\nThe hosted guide remains subject to this Studio's access policy.` : '';
  const story = result ? leadershipStory(result) : [];
  const spokenPack = result && decision ? [
    illustrative ? 'Illustrative example. Not verified research.' : 'AI-assisted review. Not independently verified.',
    result.title, `The PM's decision: ${decision}.`, `The PM's rationale: ${rationale}`,
    ...story.map(beat => `${beat.label}: ${beat.text}`),
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

  return <VoiceProvider providers={providers} online={online} suspended={presenting} onCaptureChange={setCapturing} sessionKey={presenting ? 'presenter' : learningOpen ? page : stage}><div className="app">
    <a className="skip-link" href={presenting ? '#presenter-content' : guideOpen ? '#guide-content' : builderOpen ? '#builder-content' : '#main'}>Skip to content</a>
    <header className="site-header">
      <button className="brand" onClick={() => { if (presenting) { closePresenter(); return; } if (!locked) { go('welcome'); if (learningOpen) window.location.hash = 'studio'; } }} disabled={locked} aria-label="Product Bet Review Studio home">
        <span className="brand-mark"><Layers3 size={24} /></span><span>Product Bet<span className="brand-sub">REVIEW STUDIO</span></span>
      </button>
      <div className="header-right"><span className="edition">A WORKSPACE FOR BETTER JUDGMENT</span><span className="private-pill"><ShieldCheck size={14} /> Private by default</span><ThemeSelector /></div>
    </header>
    <div hidden={presenting}>{!learningOpen && <ProviderAccess providers={providers} />}</div>
    {!online && !presenting && <div className="connectivity" role="status">You’re offline. The example and text editing work; AI and speech require internet. Unsent text is not saved automatically.</div>}
    <main id="main">
      {presenting && <PresenterDemo onExit={closePresenter} />}
      <div className="studio-workspace" hidden={presenting}>
      {guideOpen ? <Guide heading={heading} /> : builderOpen ? <BuilderGuide heading={heading} /> : <>
      {stage !== 'welcome' && <Journey stage={stage} clarified={!!clarification} reviewed={!!result} decided={!!decision && !!rationale.trim()} locked={locked} onGo={go} />}
      {stage !== 'welcome' && <div className="learning-actions"><button className="text-button" disabled={locked} onClick={event => startTour(event.currentTarget)}>Take a guided tour</button><a className="text-button" href="#builder" aria-disabled={locked} onClick={event => { if (locked) event.preventDefault(); }}>Build an app like this <ArrowUpRight size={15} /></a>{tourIndex !== null && <button className="text-button" onClick={() => { document.getElementById('tour-next')?.focus(); }}>Return to tour</button>}</div>}
      {error && <ErrorNotice message={error} dismiss={() => setError('')} />}
      {updateReady && <div className="notice" role="status"><Sparkles size={18} /><span>A new Studio version is ready. Finish and export your decision, then close all Studio tabs and reopen. We won’t reload or discard your work automatically.</span></div>}
      {feedback && <div className="notice" role="status"><Check size={18} /><span>{feedback}</span></div>}
      {draft.error && <div className="notice error" role="alert"><ShieldCheck size={18} /><span>{draft.error}</span><button className="text-button" onClick={draft.forget}>Delete stored draft</button></div>}
      {draft.saved && !draft.keeping && (stage === 'welcome' || stage === 'material') && <div className="notice"><FileText size={18} /><span>You previously chose to keep a draft on this device. It has not been submitted or automatically restored.</span><button className="text-button" onClick={restoreDraft} disabled={locked}>Restore draft</button><button className="text-button" onClick={draft.forget}>Delete</button></div>}
      {busy && <div className="notice loading" role="status"><span className="spinner" /><span>{busy}<small>You can keep your material. Nothing is submitted twice automatically.</small></span></div>}
      {tourIndex !== null && <Walkthrough index={tourIndex} stage={stage} locked={locked} onIndex={setTourIndex} onClose={closeTour} />}
      {stage === 'welcome' && <>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span className="tiny-line" /> GOOD PRODUCTS START WITH BETTER QUESTIONS</p>
            <h1 tabIndex={-1} ref={heading}>Before you build,<br />make a <em>better bet.</em></h1>
            <p className="hero-description">An idea is a starting point. Not a verdict.<br className="desktop-break" /> Turn your rough notes into a thoughtful challenge, a small test, and a decision you can stand behind.</p>
            <div className="hero-actions"><button className="button primary" onClick={() => begin(true)}>Try an example <ArrowRight size={18} /></button><button className="button secondary" onClick={() => begin(false)}><Clipboard size={17} /> Paste my idea</button></div>
            <button className="text-button speak-entry" onClick={() => { begin(false); setFeedback('Use Speak below the idea field. You choose when recording starts; English, Hindi, and mixed speech are supported.'); }}><Mic size={17} /> Prefer to talk it through? <span>Speak your idea</span><ArrowUpRight size={15} /></button>
            <a className="text-button guide-entry" href="#guide"><FileText size={17} /> Build your own Product Bet <ArrowUpRight size={15} /></a>
            <div className="hero-promise"><span>No accounts.</span><span>No automatic saving.</span><span>You make the call.</span></div>
          </div>
          <StudioIllustration />
        </section>
        <section className="hero-learning" aria-label="Choose your path">
          <article><span className="path-icon"><CircleHelp size={22} aria-hidden="true" /></span><div><button className="text-button" onClick={event => startTour(event.currentTarget)}>Take a guided tour <ArrowRight size={16} aria-hidden="true" /></button><p>Learn the controls with your own work. Nothing is advanced for you.</p></div></article>
          <article><span className="path-icon"><Layers3 size={22} aria-hidden="true" /></span><div><button className="text-button" onClick={event => startPresenter(event.currentTarget)}>Presenter Demo <ArrowRight size={16} aria-hidden="true" /></button><p>Show a separate, preloaded fictional journey. Your workspace stays intact.</p></div></article>
          <article><span className="path-icon"><FlaskConical size={22} aria-hidden="true" /></span><div><a className="text-button" href="#builder">Build an app like this <ArrowUpRight size={16} aria-hidden="true" /></a><p>A disciplined method and reusable templates for builders.</p></div></article>
        </section>
        <section className="try-yourself" aria-labelledby="try-yourself-heading">
          <span className="eyebrow">TRY IT YOURSELF / NO PROVIDER KEYS NEEDED</span><h2 id="try-yourself-heading">One fictional bet. Your own pace.</h2>
          <p>Protected staging: sign in directly if prompted; never share the passphrase. The unchanged example needs no provider keys. All sample claims and outputs are illustrative, not validated evidence.</p>
          <details><summary>How to try the example, step by step</summary><ol><li>Choose <strong>Try an example</strong>. Leave the fictional material unchanged to stay on the pre-authored, no-provider path.</li><li>Continue with the example, review the questions, then choose <strong>Put the bet under pressure</strong>. Select a decision and add a fictional rationale to create a pack.</li><li>Use <strong>Take a guided tour</strong> for control explanations. Open <strong>Build an app like this</strong> for the separate methodology and static Markdown pack.</li></ol></details>
          <p className="try-boundary">Editing the bet or interpretation requires Claude for analysis; speech requires Sarvam. Configure your own providers separately over HTTPS, only when you intend to use them.</p>
        </section>
        <section className="journey-intro" aria-label="How the studio works">
          <details><summary>From a hunch to a human decision</summary>
          <p className="quiet">One considered review. Not another chat.</p>
          <div className="principle-grid">
            <article><span className="principle-number">01</span><h3>Bring the messy middle.</h3><p>A product idea, a customer quote, a metric. Paste it or talk it through.</p></article>
            <article><span className="principle-number">02</span><h3>Put the bet under pressure.</h3><p>Separate evidence from assumptions. Find the question that could change everything.</p></article>
            <article><span className="principle-number">03</span><h3>Choose what happens next.</h3><p>Proceed, test, reshape, or stop. Leave with a concise decision pack—not a wall of text.</p></article>
          </div>
          </details>
        </section>
        <section className="example-feature">
          <div className="example-visual"><span className="eyebrow">THE SECOND BASKET</span><div className="basket-art" aria-hidden="true"><span /><span /><span /><span /><div /></div><span className="visual-caption">Same groceries.<br /><em>A different product bet.</em></span></div>
          <div className="example-copy"><span className="eyebrow">A READY-TO-EXPLORE EXAMPLE · FICTIONAL</span><h2>“What if reordering groceries<br />was just a WhatsApp away?”</h2><p>Eight interviews. A retention gap. Two weeks to learn. Is a new channel the answer—or are we asking the wrong question?</p><div className="example-signals"><span><strong>6 / 8</strong>report basket friction</span><span><strong>42%</strong>order a second time</span><span><strong>2 weeks</strong>to test the bet</span></div><button className="text-button" onClick={preview}>Explore the illustrative review <ArrowRight size={17} /></button><small>Sample claims and analysis are authored examples, not verified research or a live model response.</small></div>
        </section>
      </>}
      {stage === 'material' && <section className="workspace input-workspace">
        <div className="page-heading"><p className="eyebrow">01 / THE MATERIAL</p><h1 tabIndex={-1} ref={heading}>Bring your bet.<br /><em>And what’s behind it.</em></h1><p>Rough is fine. The useful part is separating what you’ve seen from what you hope is true.</p></div>
        {illustrative && <div className="notice"><Sparkles size={18} /><span>You’re exploring a fictional example. Editing the material switches to live Claude analysis.{aiReady && <button className="text-button" onClick={() => setIllustrative(false)} disabled={locked}>Run this example with Claude <ArrowRight size={15} /></button>}</span></div>}
        <div className="input-layout"><div className="material-form">
          <label className="field-label" htmlFor="idea">What’s the product bet?<span>The problem, the people, and the change you have in mind.</span></label>
          <textarea id="idea" data-tour-target="material" ref={ideaField} value={idea} onChange={e => editMaterial(e.target.value, 'idea')} maxLength={4000} rows={5} disabled={!!busy} placeholder="We believe that helping [which people] do [what] will improve [which outcome], because…" />
          <SpeakInput label="idea" onApply={text => appendTranscript(text, 'idea')} disabled={!!busy} />
          <div className="field-meta"><span>English, Hindi, or a mix. Your words, first.</span><span>{idea.length.toLocaleString()} / 4,000</span></div>
          <label className="field-label" htmlFor="context">What material supports it? <span className="optional">Optional</span><span>Customer feedback, numbers, observations, constraints. Include where each came from.</span></label>
          <textarea id="context" value={context} onChange={e => editMaterial(e.target.value, 'context')} maxLength={14000} rows={9} disabled={!!busy} placeholder={'Customer feedback: “…” — from three interviews last week\nMetrics: … — from our funnel report\nConstraints: …\nWhat we don’t know yet: …'} />
          <SpeakInput label="supporting material" onApply={text => appendTranscript(text, 'context')} disabled={!!busy} />
          <div className="field-meta"><span>No uploads or external research. Just what you bring.</span><span>{context.length.toLocaleString()} / 14,000</span></div>
          <MaterialTrail idea={idea} context={context} illustrative={illustrative} />
          <div className="draft-consent"><label><input type="checkbox" checked={draft.keeping} onChange={e => draft.choose(e.target.checked)} /><span>Keep this unsent draft on this device</span></label><small>Optional. Saves only the idea and supporting text in this browser. Browser storage is not encrypted. No recordings, answers, reviews, or decisions. Uncheck to delete it; anyone using this browser may read it.</small></div>
          <div className="form-actions"><button className="button primary" onClick={() => void runClarification()} disabled={locked || (!illustrative && (!online || !aiReady))}>{illustrative ? 'Continue with the example' : 'Find the useful questions'}<ArrowRight size={18} /></button><span>{capturing ? 'Add or discard your transcript first.' : 'Up to four questions.'}<br />No endless interview.</span></div>
          {!illustrative && !aiReady && <div className="notice"><CircleHelp size={18} /><span>{access.configured.claude ? 'Your tab key cannot be sent from HTTP. Open the HTTPS Studio URL, or remove it to use any host/demo configuration.' : statusError || 'Live Claude is not configured. Add an optional tab key over HTTPS or configure ANTHROPIC_API_KEY on your own server; the illustrative example is available without it.'}<button className="text-button" onClick={() => void refreshStatus()}>Check connection again</button></span></div>}
        </div><aside className="margin-note"><span className="eyebrow">A GOOD BET HAS A CRACK IN IT.</span><h3>What would convince you<br />you’re wrong?</h3><p>That’s not pessimism. It’s how you avoid spending a quarter proving something you could learn in a week.</p><hr /><ShieldCheck size={21} /><h4>Your material stays yours.</h4><p>Nothing is saved by default. Live analysis sends your text to Anthropic; voice sends audio or text to Sarvam. Their data policies apply. We don’t log your material.</p></aside></div>
      </section>}
      {stage === 'clarify' && clarification && <section className="workspace">
        <div className="page-heading"><p className="eyebrow">02 / THE QUESTIONS</p><h1 tabIndex={-1} ref={heading}>A little clarity.<br /><em>A stronger review.</em></h1><p>Answer what you can. Leave the rest blank—we’ll keep it as an unknown, not fill it in.</p></div>
        {illustrative && <div className="notice"><Sparkles size={18} /><span>Illustrative walkthrough. These questions and the next review are pre-authored; answers are not analyzed by Claude. Use your own bet for live analysis.</span></div>}
        <div className="understanding-card" data-tour-target="clarify"><label className="field-label" htmlFor="understanding">The bet, as understood<span>Correct this interpretation before the review.</span></label><textarea id="understanding" value={understanding} maxLength={2000} rows={3} disabled={!!busy} onChange={e => { setUnderstanding(e.target.value); invalidateReview(); if (illustrative) { setIllustrative(false); setFeedback('Corrected interpretation will be analyzed by live Claude.'); } }} /></div>
        <div className="questions">{clarification.questions.map((q, index) => <article className="question-card" key={q.id}>
          <span className="question-number">0{index + 1}</span><div><h3>{q.question}</h3><ReadAloud text={q.question} label={`question ${index + 1}`} /><p className="quiet">{q.why}</p><label className="sr-only" htmlFor={q.id}>Answer to question {index + 1}</label><textarea id={q.id} rows={3} maxLength={2000} placeholder="What you know—or what you still need to find out…" value={answers[q.id] ?? ''} disabled={!!busy} onChange={e => answerQuestion(q.id, e.target.value)} /><SpeakInput label={`answer ${index + 1}`} disabled={!!busy} onApply={text => {
            const current = answers[q.id] ?? ''; const value = current ? `${current}\n\n${text}` : text;
            if (value.length > 2000) return false;
            answerQuestion(q.id, value); return true;
          }} /><div className="field-meta"><span>Blank = unknown, not assumed.</span><span>{(answers[q.id] ?? '').length} / 2,000</span></div></div>
        </article>)}</div>
        {!clarification.questions.length && <div className="notice"><Check size={18} /><span>Your supplied material covers the essential questions. You can correct the interpretation and move to the review.</span></div>}
        <QuestionsTrail clarification={clarification} understanding={understanding} answers={answers} />
        <div className="form-actions"><button className="button primary" onClick={() => void runReview()} disabled={locked || (!illustrative && (!online || !aiReady))}>Put the bet under pressure <ArrowRight size={18} /></button><button className="text-button" onClick={() => go('material')} disabled={locked}><ChevronLeft size={17} /> Revisit material</button></div>
      </section>}
      {stage === 'review' && result && <section className="workspace review-workspace">
        <div className="review-title"><div><p className="eyebrow">03 / THE REVIEW</p><h1 tabIndex={-1} ref={heading}>{result.title}</h1><p>A thoughtful challenge. Not a verdict.</p></div><div className="review-origin"><span className="status-dot" />{illustrative ? 'ILLUSTRATIVE EXAMPLE' : 'CLAUDE-ASSISTED REVIEW'}<small>Not independently verified</small></div></div>
        <div className="review-topline"><span><FileText size={16} /> {sources.length} supplied sources</span><span><CircleHelp size={16} /> {result.assumptions.length} assumptions to challenge</span><button className="text-button" onClick={() => go('clarify')}>Correct the bet <ArrowUpRight size={16} /></button></div>
        <div className="bet-summary"><span className="eyebrow">THE BET AS UNDERSTOOD</span><p>{result.bet}</p><ReadAloud text={result.bet} label="the bet as understood" /></div>
        <ReviewTrail review={result} illustrative={illustrative} />
        <nav className="review-anchors" data-tour-target="review" aria-label="Review sections"><a href="#signals">Signals & gaps</a><a href="#challenge">The challenge</a><a href="#premortem">Pre-mortem</a><a href="#test">Smallest test</a><a href="#decision">Your call</a></nav>
        <section id="signals" className="review-section">
          <div className="section-title"><span className="section-number">01</span><div><h2>What we know. What we don’t.</h2><p>User-provided claims are signals—not independently verified facts.</p></div></div>
          <div className="evidence-grid">{result.evidence.map((e, i) => <article className="evidence-card" key={i}>
            <span className="card-label evidence-label"><Check size={15} /> PROVIDED EVIDENCE <span>{e.sourceId}</span></span>
            <h3>{e.claim}</h3><blockquote>“{e.quote}”</blockquote><p className="limitation">{e.limitation}</p>
            <ReadAloud text={`User-supplied evidence, not independently verified. ${e.claim}\nSource ${e.sourceId}: ${e.quote}\nLimitation: ${e.limitation}`} label={`evidence ${i + 1} and its limitation`} />
            <details><summary>View source material</summary><p>{sources.find(s => s.id === e.sourceId)?.text}</p></details>
          </article>)}</div>
          {!result.evidence.length && <div className="notice"><CircleHelp size={18} /><span>No supporting evidence supplied. The review is based on a hypothesis, not validation.</span></div>}
          <div className="gap-grid"><div className="gap-group"><span className="card-label"><Layers3 size={15} /> ASSUMPTIONS / TO BE CHALLENGED</span>{result.assumptions.map((a, i) => <article key={i}>
            <h3>{a.claim}</h3><p>{a.why}</p><p className="falsifier"><strong>Would break if</strong> {a.invalidatedBy}</p>
            <ReadAloud text={`Assumption, not a fact. ${a.claim}\n${a.why}\nWould break if: ${a.invalidatedBy}`} label={`assumption ${i + 1}`} />
          </article>)}</div><div className="gap-group unknown-group"><span className="card-label"><CircleHelp size={15} /> UNKNOWNS / NOT FILLED IN</span>{result.unknowns.map((u, i) => <article key={i}>
            <h3>{u.question}</h3><p>{u.why}</p><ReadAloud text={`Unknown, not filled in. ${u.question}\n${u.why}`} label={`unknown ${i + 1}`} />
          </article>)}{!result.unknowns.length && <p>No additional gaps identified. That does not establish certainty.</p>}</div></div>
        </section>
        <section id="challenge" className="challenge-panel"><div className="challenge-kicker"><span className="eyebrow">02 / THE STRONGEST CHALLENGE</span><CircleHelp size={24} /></div><h2>{result.challenge.title}</h2><p>{result.challenge.why}</p><ReadAloud text={`${result.challenge.title}\n${result.challenge.why}\nWhat could invalidate the bet: ${result.challenge.invalidatedBy}`} label="the strongest challenge" /><div className="challenge-bottom"><span>WHAT COULD INVALIDATE THE BET</span><p>{result.challenge.invalidatedBy}</p></div><small>Based on {result.challenge.sourceIds.join(', ') || 'the stated hypothesis; no supplied evidence'} · An inference, not a finding</small></section>
        <section id="premortem" className="review-section"><div className="section-title"><span className="section-number">03</span><div><h2>It’s six months later. This failed.</h2><p>Proposed failure paths—not predictions. Look for the early signal.</p></div></div><div className="premortem-grid">{result.premortem.map((p, i) => <article className="failure-card" key={i}>
          <span className="failure-index">FAILURE PATH 0{i + 1}</span><h3>{p.path}</h3>
          <div><span>EARLY SIGNAL</span><p>{p.signal}</p></div><div><span>REDUCE THE RISK</span><p>{p.mitigation}</p></div>
          <ReadAloud text={`Proposed failure path, not a prediction. ${p.path}\nEarly signal: ${p.signal}\nReduce the risk: ${p.mitigation}`} label={`pre-mortem path ${i + 1}`} />
        </article>)}</div></section>
        <section id="test" className="test-canvas"><div className="test-heading"><FlaskConical size={27} /><div><span className="eyebrow">04 / THE CHEAPEST MEANINGFUL TEST</span><h2>{result.test.title}</h2></div><span className="test-tag">PROPOSED · NOT RUN</span></div><p className="test-hypothesis">{result.test.hypothesis}</p><ReadAloud text={`Proposed test, not run. ${result.test.title}\n${result.test.method}\nContinue if: ${result.test.success}\nStop if: ${result.test.stop}`} label="the proposed test" /><div className="test-method"><span className="card-label">HOW TO LEARN</span><p>{result.test.method}</p></div><div className="test-criteria"><div><span className="card-label evidence-label">A REASON TO CONTINUE</span><p>{result.test.success}</p></div><div><span className="card-label">A REASON TO STOP OR RESHAPE</span><p>{result.test.stop}</p></div></div><div className="test-footer"><span><strong>Timebox</strong>{result.test.timebox}</span><span><strong>Estimated effort</strong>{result.test.cost}</span></div></section>
        <section id="decision" className="decision-section"><div className="section-title"><span className="section-number">05</span><div><h2>The agent advises. You decide.</h2><p>The recommendation is a starting point. Your decision is the record.</p></div></div><DecisionTrail review={result} decision={decision} rationale={rationale} /><div className="recommendation"><span className="eyebrow">AGENT RECOMMENDATION</span><div><strong>{labels[result.recommendation.decision]}</strong><span className="confidence">{result.recommendation.confidence} confidence</span></div><p>{result.recommendation.basis}</p><ReadAloud text={`Agent recommendation, advisory only: ${result.recommendation.decision}. ${result.recommendation.confidence} confidence. ${result.recommendation.basis}\nWould change if: ${result.recommendation.wouldChangeIf}`} label="the agent recommendation" /><details><summary>What would change this recommendation?</summary><p>{result.recommendation.wouldChangeIf}</p></details></div><fieldset className="decision-options"><legend>Your next move</legend>{result.options.map(o => <label key={o.decision} className={`decision-option ${decision === o.decision ? 'selected' : ''}`}><input type="radio" name="decision" value={o.decision} checked={decision === o.decision} onChange={() => setDecision(o.decision)} /><span className="radio-mark">{decision === o.decision && <Check size={14} />}</span><strong>{labels[o.decision]}</strong><span>{descriptions[o.decision]}</span><p>{o.rationale}</p></label>)}</fieldset><label className="field-label" htmlFor="rationale">Why this decision?<span>Your reasoning, conditions, and what should happen next. This is your voice, not the agent’s.</span></label><textarea id="rationale" value={rationale} onChange={e => setRationale(e.target.value)} rows={4} maxLength={3000} placeholder="I’m choosing this direction because… We’ll reconsider if…" /><div className="form-actions"><button className="button primary" disabled={!decision || !rationale.trim()} onClick={() => go('pack')}>Create my decision pack <ArrowRight size={18} /></button><span>Select a direction and record your rationale.<br />No decision is made for you.</span></div></section>
      </section>}
      {stage === 'pack' && result && decision && <section className="workspace pack-workspace">
        <div className="page-heading">
          <p className="eyebrow">04 / YOUR DECISION PACK</p>
          <h1 tabIndex={-1} ref={heading}>A decision worth<br /><em>putting on the table.</em></h1>
          <p>Ready for a team conversation. Nothing is published automatically.</p>
        </div>
        <a className="text-button guide-entry" href="#guide"><FileText size={17} /> Build your own Product Bet <ArrowUpRight size={15} /></a>
        <div className="pack-actions" data-tour-target="pack">
          <button className="button primary" onClick={() => void copyPack()}><Clipboard size={17} /> Copy pack</button>
          <button className="button secondary" onClick={downloadPack}><Download size={17} /> Export Markdown</button>
          <ReadAloud text={spokenPack} label="the final decision pack" />
          <button className="text-button" onClick={() => go('review')}>Edit decision <ArrowUpRight size={16} /></button>
        </div>
        <DecisionTrail review={result} decision={decision} rationale={rationale} />
        <article className="decision-document">
          <div className="document-masthead"><span>PRODUCT BET / DECISION RECORD</span><span>{illustrative ? 'ILLUSTRATIVE EXAMPLE' : 'AI-ASSISTED · UNVERIFIED'}</span></div>
          <h2>{result.title}</h2>
          <section className="leadership-story" aria-label="Leadership story">
            <h3>The story for the room</h3>
            <p>Drawn from this review—not new research or independent verification.</p>
            {story.map(beat => <div className="story-beat" key={beat.label}><h4>{beat.label}</h4><p>{beat.text}</p></div>)}
            <ReadAloud text={story.map(beat => `${beat.label}: ${beat.text}`).join('\n\n')} label="the leadership story" />
          </section>
          <div className="human-decision"><span className="eyebrow">THE PM’S DECISION</span><h3>{labels[decision]}</h3><p>{rationale}</p></div>
          <div className="document-section"><h3>The bet</h3><p>{result.bet}</p></div>
          <div className="document-section"><h3>Agent recommendation · advisory</h3><p><strong>{labels[result.recommendation.decision]}</strong> · {result.recommendation.confidence} confidence</p><p>{result.recommendation.basis}</p></div>
          <div className="document-section"><h3>The risk we are accepting</h3><p>{result.challenge.title}</p><p>{result.challenge.invalidatedBy}</p></div>
          <div className="document-section"><h3>The next useful test · proposed</h3><p>{result.test.method}</p><p><strong>Continue if:</strong> {result.test.success}</p><p><strong>Stop or reshape if:</strong> {result.test.stop}</p><p>{result.test.timebox} · {result.test.cost}</p></div>
          <details className="full-pack"><summary>Full pack with evidence, assumptions, pre-mortem & source material</summary><pre>{pack}</pre></details>
          <div className="document-footer"><ShieldCheck size={17} /><span>PM-owned decision. Source-linked analysis. No automatic sharing.</span></div>
        </article>
      </section>}
      {stage !== 'welcome' && <div className="learning-actions presenter-entry"><button className="text-button" disabled={locked} onClick={event => startPresenter(event.currentTarget)}>Presenter Demo</button><span>Show a separate fictional journey without replacing this work.</span></div>}
      </>}
      </div>
    </main>
    <footer className="site-footer"><span className="footer-brand">Better questions. Smaller risks. Human decisions.</span>{!learningOpen && !presenting && <div><span>Claude for thinking · Sarvam for voice</span><span>{access.configured.claude ? 'Claude: your tab key' : providers?.ai ? 'Claude: host/demo key' : 'Claude not configured'} / {access.configured.sarvam ? 'Sarvam: your tab key' : providers?.speech ? 'Sarvam: host/demo key' : 'Voice not configured'}</span></div>}<p>{presenting ? 'Presenter Demo uses static fiction only. No live AI, speech, exports or automatic sharing.' : 'Session-only by default. AI and speech need internet. Provider retention policies apply.'}</p></footer>
  </div></VoiceProvider>;
}
