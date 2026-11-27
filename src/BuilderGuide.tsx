import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowRight, Clipboard, Download } from 'lucide-react';
import { buildPackMarkdown, buildSections, methodology } from './buildPack';

export function BuilderGuide({ heading }: { heading: RefObject<HTMLHeadingElement | null> }) {
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice?.failed) {
      noticeRef.current?.focus({ preventScroll: true });
      noticeRef.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [notice]);
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ failed: false, message: `${label} copied. Only static builder content was included.` });
    } catch {
      setNotice({ failed: true, message: 'Clipboard access is unavailable. Open the relevant text below to select and copy it, or download the Markdown pack.' });
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([buildPackMarkdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'product-building-pack.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ failed: false, message: 'Static build pack downloaded. No current Studio work was included.' });
  }
  return <section id="builder-content" className="workspace guide-workspace builder-workspace">
    <a className="text-button" href="#studio">Return to the Studio <ArrowRight size={16} /></a>
    <div className="page-heading"><p className="eyebrow">FOR BUILDERS / A METHOD, NOT A CLONE</p>
      <h1 ref={heading} tabIndex={-1}>Build an app<br /><em>like this</em></h1>
      <p>Start with a real problem. Build in small slices. Put the work—and the review—under pressure.</p>
    </div>
    <div className="guide-boundary"><strong>Two different jobs.</strong><p>This guide helps builders create a similar product using a disciplined methodology. To examine your own idea, use <a href="#guide">Build your own Product Bet</a>. This static pack contains no current user material, credentials, source code or private deployment settings. The existing hosted access gate still applies.</p></div>
    <div className="builder-actions">
      <button className="button primary" onClick={() => void copy(buildPackMarkdown, 'Build pack')}><Clipboard size={16} /> Copy build pack</button>
      <button className="button secondary" onClick={download}><Download size={16} /> Download build pack</button>
      <button className="text-button" onClick={() => void copy(buildSections.find(section => section.id === 'prompt')!.text, 'Build prompt')}>Copy build prompt</button>
    </div>
    {notice && <p ref={noticeRef} className={`notice${notice.failed ? ' error' : ''}`} role={notice.failed ? 'alert' : 'status'} aria-atomic="true" tabIndex={notice.failed ? -1 : undefined}>{notice.message}</p>}
    <nav className="guide-index builder-index" aria-label="Builder guide sections">
      <a href="#builder-methodology">Methodology</a>
      {buildSections.map(section => <a key={section.id} href={`#builder-${section.id}`}>{section.title}</a>)}
    </nav>
    <section id="builder-methodology" className="guide-stage" tabIndex={-1} aria-labelledby="builder-methodology-heading">
      <h2 id="builder-methodology-heading">From problem to reviewed product.</h2>
      <ol className="methodology-flow">{methodology.map(([title, text], index) => <li key={title}>
        <span className="step-marker" aria-hidden="true">{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div>
      </li>)}</ol>
    </section>
    {buildSections.map(section => <section key={section.id} id={`builder-${section.id}`} className="guide-stage guide-template" tabIndex={-1} aria-labelledby={`builder-heading-${section.id}`}>
      <h2 id={`builder-heading-${section.id}`}>{section.title}</h2><p>{section.intro}</p>
      <details><summary>Read {section.title.toLowerCase()}</summary><pre tabIndex={0} aria-label={section.title}>{section.text}</pre></details>
    </section>)}
    <a className="text-button" href="#studio">Return to your Studio <ArrowRight size={16} /></a>
  </section>;
}
