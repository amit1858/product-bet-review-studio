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
export type SpeechProvider = {
  transcribe(audio: Buffer, mode: 'codemix' | 'translate', signal: AbortSignal): Promise<{ transcript: string; language: string | null }>;
  speak(input: z.infer<typeof ttsInputSchema>, signal: AbortSignal): Promise<{ audios: string[] }>;
};

export function validateWav(buffer: Buffer): number {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) {
    throw new AppError(400, 'invalid_audio', 'Use a new recording. The audio is not a valid WAV file.');
  }
  let formatFound = false;
  let bytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new AppError(400, 'invalid_audio', 'The recording is incomplete. Please record again.');
    if (type === 'fmt ') {
      if (formatFound || size < 16 || buffer.readUInt16LE(start) !== 1 ||
        buffer.readUInt16LE(start + 2) !== 1 || buffer.readUInt32LE(start + 4) !== 16000 ||
        buffer.readUInt32LE(start + 8) !== 32000 || buffer.readUInt16LE(start + 12) !== 2 ||
        buffer.readUInt16LE(start + 14) !== 16) {
        throw new AppError(400, 'invalid_audio', 'Audio must be mono 16kHz, 16-bit PCM WAV. Record again using the Speak control.');
      }
      formatFound = true;
    }
    if (type === 'data') {
      if (bytes || size % 2) throw new AppError(400, 'invalid_audio', 'The recording contains invalid audio data.');
      bytes = size;
    }
    offset = start + size + (size % 2);
  }
  const duration = bytes / 32000;
  if (!formatFound || duration < 0.25 || duration > MAX_RECORDING_SECONDS) {
    throw new AppError(400, 'audio_duration', `Record between 0.25 and ${MAX_RECORDING_SECONDS} seconds. Longer ideas can be added in several turns or typed.`);
  }
  return duration;
}

const transcriptionResponse = z.object({ transcript: z.string().trim().min(1).max(8000), language_code: z.string().nullable().optional() });
const audioResponse = z.object({
  audios: z.array(z.string().min(60).max(8_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)).min(1).max(10),
});

export function createSarvam(config: Config, fetcher: typeof fetch = fetch): SpeechProvider {
  async function call(endpoint: string, body: BodyInit, json: boolean, signal: AbortSignal): Promise<unknown> {
    if (!config.sarvamKey) throw new AppError(503, 'speech_not_configured', 'Sarvam voice is not configured. Set SARVAM_API_KEY on the server; text input remains available.');
    try {
      const response = await fetcher(`https://api.sarvam.ai/${endpoint}`, {
        method: 'POST', signal,
        headers: { 'api-subscription-key': config.sarvamKey, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body,
      });
      if (!response.ok) throw { status: response.status };
      const result: unknown = await response.json();
      return result;
    } catch (error) { throw providerError(error, 'Sarvam'); }
  }
  return {
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
      if (!result.success || result.data.audios.some(audio => !Buffer.from(audio, 'base64').subarray(0, 4).equals(Buffer.from('RIFF')))) {
        throw new AppError(502, 'invalid_playback', 'Sarvam returned invalid speech audio. The text remains available; retry playback.');
      }
      return result.data;
    },
  };
}
