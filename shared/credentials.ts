import { z } from 'zod';

export type Provider = 'claude' | 'sarvam';
export const credentialHeaders: Record<Provider, string> = {
  claude: 'X-Studio-Claude-Key',
  sarvam: 'X-Studio-Sarvam-Key',
};
export const providerKeySchema = z.string().trim().min(1).max(512).regex(/^[\x21-\x7e]+$/).refine(value => !value.includes(','));

export function providerForPath(path: string): Provider | undefined {
  if (path === '/api/clarify' || path === '/api/review') return 'claude';
  if (['/api/speech/transcribe', '/api/speech/speak', '/api/speech/translate'].includes(path)) return 'sarvam';
}

export function containsCredential(value: unknown, key: string): boolean {
  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' && serialized.includes(JSON.stringify(key).slice(1, -1));
}
