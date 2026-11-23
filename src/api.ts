import { clarificationSchema, reviewSchema, type ReviewInput } from '../shared/schema';
import { z } from 'zod';

export const statusSchema = z.object({
  ai: z.boolean(), speech: z.boolean(),
  ttsModel: z.string(), voices: z.array(z.string()), defaultVoice: z.string(),
});
export type ProviderStatus = z.infer<typeof statusSchema>;

export async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!navigator.onLine) throw new Error('You are offline. AI and speech need an internet connection; your text is still editable.');
  const timeout = AbortSignal.timeout(95000);
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
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
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(error.success ? error.data.error : 'The request failed. Your input is unchanged; try again.');
  }
  return body;
}

const post = (path: string, input: ReviewInput) =>
  request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

export async function clarify(input: ReviewInput) {
  return clarificationSchema.parse(await post('/api/clarify', input));
}
export async function review(input: ReviewInput) {
  return reviewSchema.parse(await post('/api/review', input));
}
