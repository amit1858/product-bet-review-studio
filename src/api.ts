import { clarificationSchema, reviewSchema, type ReviewInput } from '../shared/schema';
import { z } from 'zod';
import { containsCredential, credentialHeaders, providerForPath, providerKeySchema, type Provider } from '../shared/credentials';

export const statusSchema = z.object({
  ai: z.boolean(), speech: z.boolean(),
  ttsModel: z.string(), voices: z.array(z.string()), defaultVoice: z.string(),
});
export type ProviderStatus = z.infer<typeof statusSchema>;
export type Requester = (path: string, init?: RequestInit) => Promise<unknown>;

export async function request(path: string, init?: RequestInit, credential?: { provider: Provider; key: string }): Promise<unknown> {
  if (!navigator.onLine) throw new Error('You are offline. AI and speech need an internet connection; your text is still editable.');
  const headers = new Headers(init?.headers);
  Object.values(credentialHeaders).forEach(header => headers.delete(header));
  if (credential) {
    if (window.location.protocol !== 'https:' || new URL(path, window.location.origin).origin !== window.location.origin) {
      throw new Error('Personal provider keys require HTTPS to this Studio backend. Your key was not sent; typed material and the example remain available.');
    }
    if (credential.provider !== providerForPath(path) || !providerKeySchema.safeParse(credential.key).success) {
      throw new Error('The provider credential does not match this request. No key was sent.');
    }
    headers.set(credentialHeaders[credential.provider], credential.key);
  }
  const timeout = AbortSignal.timeout(95000);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new Error(timeout.aborted
      ? 'The request timed out. Your text is unchanged; please retry.'
      : 'Could not reach the Studio server. Check your connection and retry; your text is unchanged.');
  }
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error('The server returned an unreadable response. Your input is unchanged; try again.'); }
  if (!response.ok) {
    if (credential) {
      const code = z.object({ code: z.string() }).safeParse(body);
      const provider = credential.provider === 'claude' ? 'Claude' : 'Sarvam';
      if (response.status === 429) throw new Error(`${provider} or this connection has reached a quota/request limit. Wait or use the illustrative example; nothing is retried automatically.`);
      if (code.success && code.data.code === 'provider_auth') throw new Error(`${provider} authentication failed. Replace or clear your tab key and check account access.`);
      if (response.status === 401 || response.status === 403) throw new Error(`${provider} access was denied. Use the approved HTTPS Studio URL and check your key/access.`);
      throw new Error(`${provider} request failed (${response.status}). Your text is unchanged; check your key, account/model access or input, then retry explicitly.`);
    }
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.error : 'The request failed. Your input is unchanged; try again.');
  }
  if (credential && containsCredential(body, credential.key)) {
    throw new Error('The provider returned unsafe content. No result was accepted; your text is unchanged.');
  }
  return body;
}

const post = (path: string, input: ReviewInput, transport: Requester, signal?: AbortSignal) =>
  transport(path, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

export async function clarify(input: ReviewInput, transport: Requester = request, signal?: AbortSignal) {
  return clarificationSchema.parse(await post('/api/clarify', input, transport, signal));
}
export async function review(input: ReviewInput, transport: Requester = request, signal?: AbortSignal) {
  return reviewSchema.parse(await post('/api/review', input, transport, signal));
}
