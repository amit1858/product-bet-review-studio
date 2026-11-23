import { z } from 'zod';

const schema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
  host: z.string().min(1),
  origin: z.url(),
  anthropicKey: z.string(),
  anthropicModel: z.string().min(1),
  sarvamKey: z.string(),
  ttsModel: z.enum(['bulbul:v4-flash', 'bulbul:v3']),
  ttsSpeaker: z.string().min(1),
  hourlyLimit: z.coerce.number().int().min(1).max(10000),
  ipLimit: z.coerce.number().int().min(1).max(1000),
  concurrency: z.coerce.number().int().min(1).max(20),
});
export type Config = z.infer<typeof schema>;

export function readConfig(env = process.env): Config {
  const ttsModel = env.SARVAM_TTS_MODEL || 'bulbul:v4-flash';
  const result = schema.safeParse({
    port: env.PORT || 3000,
    host: env.HOST || '127.0.0.1',
    origin: env.APP_ORIGIN || `http://localhost:${env.PORT || 3000}`,
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    sarvamKey: env.SARVAM_API_KEY?.trim() || '',
    ttsModel,
    ttsSpeaker: env.SARVAM_TTS_SPEAKER || (ttsModel === 'bulbul:v3' ? 'shubh' : 'shubh_enhi_companion'),
    hourlyLimit: env.MAX_REQUESTS_PER_HOUR || 300,
    ipLimit: env.MAX_REQUESTS_PER_IP_10_MIN || 60,
    concurrency: env.MAX_CONCURRENT_REQUESTS || 4,
  });
  if (!result.success) {
    // Never serialize config validation errors: they can contain credential input.
    throw new Error(`Invalid server configuration fields: ${result.error.issues.map(i => i.path.join('.')).join(', ')}`);
  }
  if (new URL(result.data.origin).origin !== result.data.origin) {
    throw new Error('APP_ORIGIN must be an origin without a path or trailing slash.');
  }
  return result.data;
}

export function voicesFor(config: Config): string[] {
  const standard = config.ttsModel === 'bulbul:v3'
    ? ['shubh', 'simran', 'ritu']
    : ['shubh_enhi_companion', 'simran_enhi_companion', 'ishita_enhi_companion'];
  return [...new Set([config.ttsSpeaker, ...standard])];
}
