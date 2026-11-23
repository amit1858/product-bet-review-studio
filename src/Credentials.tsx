import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { providerForPath, providerKeySchema, type Provider } from '../shared/credentials';
import { request, type ProviderStatus, type Requester } from './api';

type CredentialAccess = {
  configured: Record<Provider, boolean>;
  epoch: number;
  secure: boolean;
  request: Requester;
  configure: (provider: Provider, key: string) => void;
  clear: () => void;
};
const Credentials = createContext<CredentialAccess | null>(null);

export function useCredentialAccess() {
  const access = useContext(Credentials);
  if (!access) throw new Error('Provider access needs a CredentialProvider.');
  return access;
}

export function CredentialProvider({ children }: { children: ReactNode }) {
  const keys = useRef<Record<Provider, string>>({ claude: '', sarvam: '' });
  const lifetime = useRef(new AbortController());
  const generation = useRef(0);
  const [configured, setConfigured] = useState({ claude: false, sarvam: false });
  const [epoch, setEpoch] = useState(0);
  const clear = useCallback(() => {
    keys.current = { claude: '', sarvam: '' };
    generation.current++;
    lifetime.current.abort(); lifetime.current = new AbortController();
    setConfigured({ claude: false, sarvam: false }); setEpoch(value => value + 1);
  }, []);
  const configure = useCallback((provider: Provider, key: string) => {
    keys.current[provider] = key;
    generation.current++;
    lifetime.current.abort(); lifetime.current = new AbortController();
    setConfigured(value => ({ ...value, [provider]: !!key })); setEpoch(value => value + 1);
  }, []);
  useEffect(() => {
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      keys.current = { claude: '', sarvam: '' }; lifetime.current.abort();
    };
  }, [clear]);
  const version = generation.current;
  const transport: Requester = useCallback(async (path, init) => {
    const provider = providerForPath(path);
    if (!provider) return request(path, init);
    if (generation.current !== version) throw new DOMException('Provider access was cleared.', 'AbortError');
    const scope = lifetime.current;
    const key = keys.current[provider];
    const signal = init?.signal ? AbortSignal.any([init.signal, scope.signal]) : scope.signal;
    const result = await request(path, { ...init, signal }, key ? { provider, key } : undefined);
    if (scope.signal.aborted) throw new DOMException('Provider access was cleared.', 'AbortError');
    return result;
  }, [epoch]);
  return <Credentials.Provider value={{ configured, epoch, secure: window.location.protocol === 'https:', request: transport, configure, clear }}>
    {children}
  </Credentials.Provider>;
}

function KeyInput({ provider }: { provider: Provider }) {
  const access = useCredentialAccess();
  const field = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const name = provider === 'claude' ? 'Claude' : 'Sarvam';
  useEffect(() => {
    if (field.current) field.current.value = '';
    setError('');
  }, [access.epoch]);
  useEffect(() => {
    const clear = () => { if (field.current) field.current.value = ''; };
    window.addEventListener('pagehide', clear);
    return () => { clear(); window.removeEventListener('pagehide', clear); };
  }, []);
  return <div className="provider-key-input">
    <h3>{name}</h3>
    {access.configured[provider] ? <div><p>Your tab key is configured. Account access has not been verified.</p>
      <button className="text-button" onClick={() => access.configure(provider, '')}>Remove {name} tab key</button></div> :
      <form autoComplete="off" onSubmit={event => {
        event.preventDefault();
        if (!access.secure) { if (field.current) field.current.value = ''; setError('Open the approved HTTPS Studio URL before entering a key. Nothing was accepted or sent.'); return; }
        const value = field.current?.value || '';
        if (field.current) field.current.value = '';
        const parsed = providerKeySchema.safeParse(value);
        if (!parsed.success) { setError('Enter a single-line key of 1–512 visible characters. The input was cleared; nothing was sent.'); return; }
        access.configure(provider, parsed.data);
      }}>
        <label className="field-label" htmlFor={`provider-key-${provider}`}>{name} API key · optional</label>
        <input ref={field} id={`provider-key-${provider}`} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={512} disabled={!access.secure} data-lpignore="true" data-1p-ignore="true" />
        <button className="button secondary" type="submit" disabled={!access.secure}>Use {name} key in this tab</button>
        {error && <p className="notice error" role="alert">{error}</p>}
      </form>}
    <small>{provider === 'claude'
      ? 'Use a workspace-scoped Claude Console API key with Messages/model access and billing. A Claude chat subscription is not API credit.'
      : 'Use a Sarvam API subscription key with speech/translation access and quota.'}</small>
  </div>;
}

export function ProviderAccess({ providers }: { providers: ProviderStatus | null }) {
  const access = useCredentialAccess();
  const status = (provider: Provider, host: boolean) => access.configured[provider] ? 'Your tab key configured' : host ? 'Host/demo key configured' : 'Not configured';
  return <section className="provider-access" aria-label="Provider access">
    <div className="provider-access-summary"><div><strong>Provider access</strong>
      <p className="provider-key-status">Claude: {status('claude', !!providers?.ai)} · Sarvam: {status('sarvam', !!providers?.speech)}</p>
    </div><button className="button secondary" onClick={access.clear}>Clear keys</button></div>
    <details><summary>Use your own provider accounts · optional</summary>
      <p>Your key is held only in this tab’s memory and sent to this app’s same-origin backend over HTTPS for the corresponding provider request. The backend forwards it only to that provider and does not save it. Refreshing, leaving this page, or Clear keys removes your tab keys; a new tab starts without them. Nothing is stored in browser storage, cookies, URLs, exports, logs, or offline caches. Only use a backend/operator you trust.</p>
      <p>Your key takes precedence only for its provider. Clear keys restores any host/demo configuration; it cancels pending requests, but provider usage already started may still be billed. Configuration status is not an account-access check.</p>
      <p>If you do not want your key to pass through this backend, self-host the Studio and configure server environment variables instead. Typed material and the illustrative example remain available without keys.</p>
      {!access.secure && <p className="notice">Personal keys require HTTPS, including localhost. Key entry is disabled on this HTTP preview; typed material, the example, and optional host/demo configuration remain available.</p>}
      <div className="provider-key-grid"><KeyInput provider="claude" /><KeyInput provider="sarvam" /></div>
    </details>
  </section>;
}
