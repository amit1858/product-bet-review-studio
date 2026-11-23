import { z } from 'zod';
import type { Config } from './config';
import { voicesFor } from './config';
import { AppError, providerError } from './errors';

export const MAX_RECORDING_SECONDS = 28;
export const MAX_AUDIO_BYTES = 16000 * 2 * MAX_RECORDING_SECONDS + 44;
export const ttsInputSchema = z.object({
  text: z.string().trim().min(1).max(2500),
  language: z.enum(['en-IN', 'hi-IN']),
  voice: z.string().max(100),
  pace: z.number().min(0.5).max(2),
}).strict();
export const sttOptionsSchema = z.object({
  mode: z.enum(['codemix', 'translate']),
}).strict();
export const translationInputSchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict();
export type SpeechProvider = {
  transcribe(audio: Buffer, mode: 'codemix' | 'translate', signal: AbortSignal): Promise<{ transcript: string; language: string | null }>;
  speak(input: z.infer<typeof ttsInputSchema>, signal: AbortSignal): Promise<{ audios: string[] }>;
  translate(text: string, signal: AbortSignal): Promise<{ text: string }>;
};

function pcmWav(buffer: Buffer): { duration: number; sampleRate: number; channels: number } {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new AppError(400, 'invalid_audio', 'Use a new recording. The audio is not a valid WAV file.');
  }
  let formatFound = false;
  let dataFound = false;
  let bytes = 0;
  let sampleRate = 0;
  let channels = 0;
  let byteRate = 0;
  let offset = 12;
  for (; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new AppError(400, 'invalid_audio', 'The recording is incomplete. Please record again.');
    if (type === 'fmt ') {
      if (formatFound || size < 16 || buffer.readUInt16LE(start) !== 1 || buffer.readUInt16LE(start + 14) !== 16) {
        throw new AppError(400, 'invalid_audio', 'Audio must be 16-bit PCM WAV. Record again using the Speak control.');
      }
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      byteRate = buffer.readUInt32LE(start + 8);
      if (![1, 2].includes(channels) || ![8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate) ||
        byteRate !== sampleRate * channels * 2 || buffer.readUInt16LE(start + 12) !== channels * 2) {
        throw new AppError(400, 'invalid_audio', 'The recording has an invalid PCM format. Please record again.');
      }
      formatFound = true;
    }
    if (type === 'data') {
      if (dataFound || !size || size % 2) throw new AppError(400, 'invalid_audio', 'The recording contains invalid audio data.');
      dataFound = true;
      bytes = size;
    }
    offset = start + size + (size % 2);
  }
  if (!formatFound || !dataFound || offset !== buffer.length || bytes % (channels * 2)) {
    throw new AppError(400, 'invalid_audio', 'The recording is incomplete or empty. Please record again.');
  }
  return { duration: bytes / byteRate, sampleRate, channels };
}

export function validateWav(buffer: Buffer): number {
  const { duration, sampleRate, channels } = pcmWav(buffer);
  if (sampleRate !== 16000 || channels !== 1) {
    throw new AppError(400, 'invalid_audio', 'Audio must be mono 16kHz, 16-bit PCM WAV. Record again using the Speak control.');
  }
  if (duration < 0.25 || duration > MAX_RECORDING_SECONDS) {
    throw new AppError(400, 'audio_duration', `Record between 0.25 and ${MAX_RECORDING_SECONDS} seconds. Longer ideas can be added in several turns or typed.`);
  }
  return duration;
}

const transcriptionResponse = z.object({ transcript: z.string().trim().min(1).max(8000), language_code: z.string().nullable().optional() });
const audioResponse = z.object({
  audios: z.array(z.string().min(60).max(8_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)).min(1).max(10),
});
const translationResponse = z.object({ translated_text: z.string().trim().min(1).max(5000) });

export function createSarvam(config: Config, fetcher: typeof fetch = fetch): SpeechProvider {
  async function call(endpoint: string, body: BodyInit, json: boolean, signal: AbortSignal): Promise<unknown> {
    if (!config.sarvamKey) throw new AppError(503, 'speech_not_configured', 'Sarvam voice is not configured. Add a tab key over HTTPS or configure SARVAM_API_KEY on your server; text input remains available.');
    try {
      const response = await fetcher(`https://api.sarvam.ai/${endpoint}`, {
        method: 'POST', signal, redirect: 'error',
        headers: { 'api-subscription-key': config.sarvamKey, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body,
      });
      if (!response.ok) throw { status: response.status };
      const result: unknown = await response.json();
      return result;
    } catch (error) { throw providerError(error, 'Sarvam'); }
  }
  return {
    async translate(text, signal) {
      const input = translationInputSchema.parse({ text }).text;
      const result = translationResponse.safeParse(await call('translate', JSON.stringify({
        input, source_language_code: 'auto', target_language_code: 'hi-IN',
        model: 'mayura:v1', mode: 'formal', output_script: 'fully-native', numerals_format: 'international',
      }), true, signal));
      if (!result.success) throw new AppError(502, 'invalid_translation', 'Sarvam returned an empty or invalid Hindi translation. No speech was generated; the written review is unchanged.');
      return { text: result.data.translated_text };
    },
    async transcribe(audio, mode, signal) {
      validateWav(audio);
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'recording.wav');
      form.append('model', 'saaras:v4');
      form.append('mode', mode);
      form.append('language_code', 'unknown');
      const result = transcriptionResponse.safeParse(await call('speech-to-text', form, false, signal));
      if (!result.success) throw new AppError(502, 'invalid_transcript', 'Sarvam returned an empty or invalid transcript. Try again in a quieter space, or type your answer.');
      return { transcript: result.data.transcript, language: result.data.language_code ?? null };
    },
    async speak(input, signal) {
      if (!voicesFor(config).includes(input.voice)) throw new AppError(400, 'invalid_voice', 'Choose one of the configured voices.');
      const result = audioResponse.safeParse(await call('text-to-speech', JSON.stringify({
        text: input.text,
        language_code: input.language,
        speaker: input.voice,
        model: config.ttsModel,
        pace: input.pace,
        speech_sample_rate: 22050,
        output_audio_codec: 'wav',
        enable_cached_responses: false,
      }), true, signal));
      if (!result.success) {
        throw new AppError(502, 'invalid_playback', 'Sarvam returned invalid speech audio. The text remains available; retry playback.');
      }
      try {
        for (const encoded of result.data.audios) pcmWav(Buffer.from(encoded, 'base64'));
      } catch {
        throw new AppError(502, 'invalid_playback', 'Sarvam returned corrupt or unsupported WAV audio. The text remains available; retry playback.');
      }
      return result.data;
    },
  };
}
