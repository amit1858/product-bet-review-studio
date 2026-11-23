import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode,
} from 'react';
import { Mic, Play, RotateCcw, Settings2, Square, Volume2, X } from 'lucide-react';
import { z } from 'zod';
import { type ProviderStatus, type Requester } from './api';
import { RECORDING_LIMIT, recordingToWav, speechChunks } from './audio';
import { useCredentialAccess } from './Credentials';

type Settings = { language: 'en-IN' | 'hi-IN'; voice: string; pace: number };
type Playback = { id: string; label: string; state: 'translating' | 'preparing' | 'playing' };
type Replay = { text: string; id: string; label: string };
type VoiceContextType = {
  enabled: boolean;
  capturing: string | null;
  setCapturing: (id: string | null) => void;
  releaseCapture: (id: string) => void;
  settings: Settings;
  playback: Playback | null;
  play: (text: string, id: string, label: string) => Promise<void>;
  stop: () => void;
  request: Requester;
  credentialEpoch: number;
};
const VoiceContext = createContext<VoiceContextType | null>(null);
const transcriptSchema = z.object({ transcript: z.string().trim().min(1).max(8000), language: z.string().nullable() });
const playbackSchema = z.object({ audios: z.array(z.string().min(1)).min(1) });
const translationSchema = z.object({ text: z.string().trim().min(1).max(5000) });

function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) throw new Error('Voice controls need a VoiceProvider.');
  return context;
}

function playAudio(url: string, signal: AbortSignal, onAudio: (audio: HTMLAudioElement) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    onAudio(audio);
    const cleanup = () => {
      audio.onended = null; audio.onerror = null;
      signal.removeEventListener('abort', abort);
      audio.pause(); audio.removeAttribute('src'); audio.load();
    };
    const abort = () => { cleanup(); reject(new DOMException('Playback stopped.', 'AbortError')); };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = () => { cleanup(); reject(new Error('This browser could not play the audio. Text remains available; try Replay.')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    void audio.play().catch(() => {
      cleanup(); reject(new Error('Playback was blocked by your browser. Tap Read aloud again to replay the prepared audio.'));
    });
  });
}

export function VoiceProvider({ children, providers, online, onCaptureChange, sessionKey }: {
  children: ReactNode; providers: ProviderStatus | null; online: boolean; onCaptureChange: (busy: boolean) => void; sessionKey: string;
}) {
  const access = useCredentialAccess();
  const request = access.request;
  const [settings, setSettings] = useState<Settings>({ language: 'en-IN', voice: '', pace: 1 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capturing, setCapturing] = useState<string | null>(null);
  const releaseCapture = useCallback((id: string) => setCapturing(current => current === id ? null : current), []);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState('');
  const [replay, setReplay] = useState<Replay | null>(null);
  const [translatedText, setTranslatedText] = useState('');
  const controller = useRef<AbortController | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cache = useRef<{ key: string; urls: string[] } | null>(null);
  const enabled = online && (access.configured.sarvam ? access.secure : !!providers?.speech);
  const stop = useCallback(() => {
    controller.current?.abort(); controller.current = null;
    audio.current?.pause(); audio.current = null; setPlayback(null);
  }, []);
  const clearCache = useCallback(() => {
    cache.current?.urls.forEach(url => URL.revokeObjectURL(url));
    cache.current = null;
  }, []);
  useEffect(() => { onCaptureChange(!!capturing); }, [capturing, onCaptureChange]);
  useEffect(() => { stop(); }, [sessionKey, online, access.epoch, stop]);
  useEffect(() => { clearCache(); setReplay(null); setTranslatedText(''); setError(''); }, [sessionKey, access.epoch, clearCache]);
  useEffect(() => {
    if (providers?.defaultVoice) setSettings(s => ({ ...s, voice: s.voice || providers.defaultVoice }));
  }, [providers?.defaultVoice]);
  useEffect(() => () => { controller.current?.abort(); audio.current?.pause(); clearCache(); }, [clearCache]);
  const play = useCallback(async (text: string, id: string, label: string) => {
    stop(); setError('');
    if (!enabled) { setError('Read aloud needs internet and Sarvam configuration; personal tab keys require HTTPS. The full text remains available.'); return; }
    if (text.length > 18000) { setError('This spoken section is too long. Read the individual findings aloud instead, or shorten your decision rationale.'); return; }
    const active = new AbortController();
    setReplay({ text, id, label });
    controller.current = active;
    const key = JSON.stringify({ text, settings });
    const pending: string[] = [];
    try {
      setPlayback({ id, label, state: 'preparing' });
      let urls = cache.current?.key === key ? cache.current.urls : null;
      if (!urls) {
        clearCache(); setTranslatedText('');
        let spokenText = text;
        if (settings.language === 'hi-IN') {
          setPlayback({ id, label, state: 'translating' });
          const translated: string[] = [];
          for (const chunk of speechChunks(text, 900)) {
            const response = translationSchema.safeParse(await request('/api/speech/translate', {
              method: 'POST', signal: active.signal, headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: chunk }),
            }));
            if (active.signal.aborted) return;
            if (!response.success) throw new Error('No usable Hindi translation was returned. No speech was generated; the written review is unchanged.');
            translated.push(response.data.text);
            if (translated.join('\n\n').length > 18000) throw new Error('The Hindi translation is too long for this spoken section. Read individual findings aloud instead; the written review is unchanged.');
          }
          spokenText = translated.join('\n\n');
          setTranslatedText(spokenText);
          setPlayback({ id, label, state: 'preparing' });
        }
        for (const chunk of speechChunks(spokenText)) {
          const response = playbackSchema.parse(await request('/api/speech/speak', {
            method: 'POST', signal: active.signal, headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk, ...settings }),
          }));
          if (active.signal.aborted) return;
          for (const encoded of response.audios) {
            const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
            pending.push(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
          }
        }
        urls = pending;
        cache.current = { key, urls };
      }
      setPlayback({ id, label, state: 'playing' });
      for (const url of urls) await playAudio(url, active.signal, value => { audio.current = value; });
    } catch (e) {
      if (!active.signal.aborted && !(e instanceof Error && e.name === 'AbortError')) setError(e instanceof z.ZodError
        ? 'The speech response was invalid. Your text is unchanged; retry playback.'
        : e instanceof Error ? e.message : 'Speech playback failed. Please retry.');
    } finally {
      if (cache.current?.urls !== pending) pending.forEach(url => URL.revokeObjectURL(url));
      if (controller.current === active) { controller.current = null; audio.current = null; setPlayback(null); }
    }
  }, [enabled, settings, stop, clearCache, request]);
  function changeSettings(next: Settings) {
    stop(); clearCache(); setReplay(null); setTranslatedText(''); setError(''); setSettings(next);
  }

  return <VoiceContext.Provider value={{ enabled, capturing, setCapturing, releaseCapture, settings, playback, play, stop, request, credentialEpoch: access.epoch }}>
    {children}
    <div className="voice-settings">
      <button className="text-button" onClick={() => setSettingsOpen(v => !v)} aria-expanded={settingsOpen}><Settings2 size={16} /> Voice & playback settings</button>
      {settingsOpen && <section aria-label="Voice settings" className="voice-settings-panel">
        <div><label htmlFor="spoken-language">Read-aloud language</label><select id="spoken-language" value={settings.language} onChange={e => changeSettings({ ...settings, language: e.target.value === 'hi-IN' ? 'hi-IN' : 'en-IN' })}><option value="en-IN">As written · English / mixed</option><option value="hi-IN">Hindi · translate before speech</option></select></div>
        <div><label htmlFor="voice">Sarvam voice</label><select id="voice" value={settings.voice} onChange={e => changeSettings({ ...settings, voice: e.target.value })}>{(providers?.voices ?? ['shubh_enhi_companion']).map(v => <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>)}</select></div>
        <div><label htmlFor="pace">Playback speed</label><select id="pace" value={settings.pace} onChange={e => changeSettings({ ...settings, pace: Number(e.target.value) })}><option value={0.8}>Unhurried · 0.8×</option><option value={1}>Natural · 1×</option><option value={1.2}>Brisk · 1.2×</option></select></div>
        <p>Hindi read-aloud translates selected text with Sarvam before speech. Machine translation may change nuance; the original review, source quotes, PM decision, and exports remain unchanged. Translation adds provider requests, in chunks of up to 900 characters. Speech input supports English, Hindi, mixing, or explicit translation to English. Recording ends after {RECORDING_LIMIT} seconds. Settings, translations, and replay audio stay in memory only.</p>
      </section>}
      {translatedText && <details className="voice-translation"><summary>Hindi read-aloud text · machine translation</summary><p>The original written review remains the decision record. Check this translation before relying on its wording.</p><p lang="hi">{translatedText}</p></details>}
      {!playback && replay && !error && <button className="text-button" disabled={!enabled || !!capturing} onClick={() => void play(replay.text, replay.id, replay.label)}><RotateCcw size={14} />{cache.current ? 'Replay last audio' : 'Retry read aloud'}</button>}
      {error && <div className="notice error playback-bar" role="alert"><Volume2 size={18} /><span>{error}{replay && <button className="text-button" disabled={!enabled || !!capturing} onClick={() => void play(replay.text, replay.id, replay.label)}>{cache.current ? 'Replay prepared audio' : 'Retry read aloud'}</button>}</span><button className="icon-button" aria-label="Dismiss playback error" onClick={() => setError('')}><X size={16} /></button></div>}
    </div>
    {playback && <div className="playback-bar" role="status"><Volume2 size={20} /><span><strong>{playback.state === 'translating' ? 'Translating to Hindi' : playback.state === 'preparing' ? 'Preparing speech' : 'Reading aloud'}</strong>{playback.label}{settings.language === 'hi-IN' && <small>Machine-translated audio; original record unchanged.</small>}</span><button className="button secondary" onClick={stop}><Square size={14} /> Stop playback</button></div>}
  </VoiceContext.Provider>;
}

export function ReadAloud({ text, label }: { text: string; label: string }) {
  const id = useId();
  const voice = useVoice();
  const active = voice.playback?.id === id;
  return <button className="text-button read-aloud" disabled={!voice.enabled || !!voice.capturing} title={!voice.enabled ? 'Requires internet and a configured Sarvam key' : undefined}
    onClick={() => { if (active) voice.stop(); else void voice.play(text, id, label); }}
    aria-label={active ? `Stop reading: ${label}` : `Read aloud: ${label}`}>
    {active ? <Square size={14} /> : <Volume2 size={15} />}{active ? 'Stop' : 'Read aloud'}
  </button>;
}

type CaptureState = 'idle' | 'permission' | 'recording' | 'processing' | 'transcript' | 'error';
export function SpeakInput({ label, onApply, disabled = false }: {
  label: string; onApply: (text: string) => boolean; disabled?: boolean;
}) {
  const id = useId();
  const voice = useVoice();
  const [state, setState] = useState<CaptureState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [mode, setMode] = useState<'codemix' | 'translate'>('codemix');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [trimmed, setTrimmed] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recording = useRef<Blob | null>(null);
  const controller = useRef<AbortController | null>(null);
  const cancelled = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const supported = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
  const release = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; cancelled.current = true; generation.current++; controller.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release(); recording.current = null;
      voiceRef.current.releaseCapture(id);
    };
  }, [id, release]);

  async function transcribe(blob: Blob) {
    const active = new AbortController(); controller.current = active;
    setState('processing'); setError(''); voice.setCapturing(id);
    try {
      const form = new FormData(); form.append('audio', blob, 'recording.wav'); form.append('mode', mode);
      const response = transcriptSchema.parse(await voice.request('/api/speech/transcribe', { method: 'POST', body: form, signal: active.signal }));
      if (mounted.current && !active.signal.aborted) { setTranscript(response.transcript); setState('transcript'); }
    } catch (e) {
      if (mounted.current && !active.signal.aborted && !(e instanceof Error && e.name === 'AbortError')) {
        setError(e instanceof z.ZodError
          ? 'No usable transcript was returned. Retry this recording, record again, or type your answer.'
          : e instanceof Error ? e.message : 'Transcription failed. Retry or type your answer.');
        setState('error'); voice.releaseCapture(id);
      }
    } finally { if (controller.current === active) controller.current = null; }
  }
  async function start() {
    const attempt = ++generation.current;
    voice.stop(); cancelled.current = false; setError(''); setSeconds(0); setTrimmed(false);
    setState('permission'); voice.setCapturing(id); recording.current = null;
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true }, video: false });
      if (!mounted.current || cancelled.current || generation.current !== attempt) { next.getTracks().forEach(t => t.stop()); return; }
      stream.current = next;
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(next, mime ? { mimeType: mime } : undefined);
      recorder.current = rec; const chunks: BlobPart[] = [];
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onerror = () => {
        if (generation.current !== attempt || !mounted.current) return;
        cancelled.current = true; release(); voice.releaseCapture(id);
        setError('Recording was interrupted. Please record again or type your answer.'); setState('error');
      };
      rec.onstop = async () => {
        if (cancelled.current || !mounted.current || generation.current !== attempt) return;
        release();
        setState('processing');
        try {
          const wav = await recordingToWav(new Blob(chunks, { type: rec.mimeType }));
          if (!mounted.current || cancelled.current || generation.current !== attempt) return;
          recording.current = wav.audio; setTrimmed(current => current || wav.trimmed); await transcribe(wav.audio);
        } catch (e) {
          if (mounted.current && !cancelled.current && generation.current === attempt) {
            setError(e instanceof Error ? e.message : 'This browser could not process the recording. Text input remains available.'); setState('error'); voice.releaseCapture(id);
          }
        }
      };
      rec.start(); setState('recording');
      const started = performance.now();
      timer.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000);
        setSeconds(Math.min(elapsed, RECORDING_LIMIT));
        if (elapsed >= RECORDING_LIMIT && rec.state === 'recording') { setTrimmed(true); rec.stop(); }
      }, 200);
    } catch (e) {
      if (!mounted.current || cancelled.current || generation.current !== attempt) return;
      release(); voice.releaseCapture(id);
      const name = e instanceof Error ? e.name : '';
      setError(name === 'NotAllowedError'
        ? 'Microphone permission was denied. Enable it in your browser’s site settings and retry, or keep typing.'
        : name === 'NotFoundError' ? 'No microphone was found. Connect one and retry, or type your answer.'
          : 'The microphone could not start. Close other apps using it and retry, or use text.');
      setState('error');
    }
  }
  const discard = useCallback(() => {
    cancelled.current = true; generation.current++; controller.current?.abort();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    release(); recording.current = null; setTranscript(''); setTrimmed(false); setState('idle'); setError(''); voiceRef.current.releaseCapture(id);
  }, [id, release]);
  useEffect(() => { discard(); }, [voice.credentialEpoch, discard]);
  function apply() {
    if (onApply(transcript.trim())) discard();
    else setError('This transcript does not fit the field’s text limit. Shorten it here; your recording and transcript have not been discarded.');
  }
  const ownCapture = voice.capturing === id;
  return <div className={`speak-control ${state === 'recording' ? 'recording' : ''}`}>
    <div className="speak-toolbar">
      {state === 'recording' ? <button className="button secondary" onClick={() => recorder.current?.stop()}><Square size={14} /> Stop & transcribe · {seconds}s</button> :
        <button className="text-button" onClick={() => void start()} disabled={disabled || !supported || !voice.enabled || (!!voice.capturing && !ownCapture) || ['permission', 'processing', 'transcript'].includes(state)} aria-label={`Speak: ${label}`}><Mic size={16} />{state === 'error' ? 'Record again' : 'Speak'}</button>}
      {['idle', 'error'].includes(state) && <label className="speech-mode"><span className="sr-only">Transcription mode for {label}</span><select value={mode} onChange={e => setMode(e.target.value === 'translate' ? 'translate' : 'codemix')} disabled={!!voice.capturing || disabled}><option value="codemix">Keep mixed language</option><option value="translate">Translate to English</option></select></label>}
      {['permission', 'recording', 'processing', 'transcript'].includes(state) && <button className="text-button" onClick={discard}>Discard</button>}
    </div>
    {state === 'idle' && <small>{!supported ? 'Microphone is unavailable in this browser. Text input is fully supported.' : !voice.enabled ? 'Voice needs internet and Sarvam configuration; personal tab keys require HTTPS. You can keep typing.' : 'English, Hindi, or both. Tap to start, tap to finish. Up to 28 seconds. No background recording.'}</small>}
    {trimmed && <p className="recording-limit" role="status">This turn was limited to its first 28 seconds. Add another turn for anything beyond that.</p>}
    {state === 'permission' && <p role="status">Waiting for microphone permission. Nothing is recording yet.</p>}
    {state === 'recording' && <p role="status"><span className="record-dot" /> Recording · {RECORDING_LIMIT - seconds}s remaining. Audio goes to Sarvam when you finish; not to Claude.</p>}
    {state === 'processing' && <p role="status"><span className="spinner" /> Preparing your editable transcript…</p>}
    {state === 'error' && <div role="alert"><p>{error}</p>{recording.current && <button className="text-button" disabled={!voice.enabled || !!voice.capturing} onClick={() => { if (recording.current) void transcribe(recording.current); }}><RotateCcw size={14} /> Retry this recording</button>}<button className="text-button" onClick={discard}>Discard recording & use text</button></div>}
    {state === 'transcript' && <div className="transcript-review"><label className="field-label" htmlFor={`${id}-transcript`}>Review your {mode === 'translate' ? 'English translation' : 'mixed-language transcript'}<span>Nothing reaches the analysis until you choose to add this text.</span></label><textarea id={`${id}-transcript`} rows={4} value={transcript} onChange={e => setTranscript(e.target.value)} maxLength={8000} />{error && <p role="alert">{error}</p>}<button className="button secondary" onClick={apply} disabled={!transcript.trim()}>Add transcript to {label} <Play size={14} /></button></div>}
  </div>;
}
