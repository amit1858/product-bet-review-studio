import test from 'node:test';
import assert from 'node:assert/strict';
import { createClaude } from '../server/claude';
import { createSarvam, validateWav } from '../server/speech';
import { readConfig } from '../server/config';
import { cloneReview, config, input, wav } from './fixtures';

test('Claude uses server-side structured outputs and rejects unsupported evidence', async () => {
  let returned = cloneReview();
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'claude-sonnet-5-5');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.output_config.format.schema.additionalProperties, false);
    assert.equal(body.max_tokens, 6500);
    assert.match(body.system, /untrusted data/);
    assert.ok(JSON.parse(body.messages[0].content).sources.some((s: { id: string }) => s.id === 'S2'));
    return new Response(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: JSON.stringify(returned) }],
      stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 100 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const claude = createClaude(config(), fetcher);
  assert.equal((await claude.review(input, AbortSignal.timeout(2000))).title, returned.title);
  returned.evidence[0].quote = 'Fabricated evidence';
  await assert.rejects(() => claude.review(input, AbortSignal.timeout(2000)), /failed its source checks/);
});

test('Claude authentication and incomplete outputs never return success-shaped analysis', async () => {
  const absent = createClaude(readConfig({}), async () => { throw new Error('Must not call'); });
  await assert.rejects(() => absent.review(input, AbortSignal.timeout(2000)), /not configured/);
  const auth = createClaude(config(), async () => new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'private upstream diagnostic' } }), { status: 401 }));
  await assert.rejects(() => auth.review(input, AbortSignal.timeout(2000)), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /authentication failed/);
    assert.ok(!error.message.includes('private upstream')); return true;
  });
  const incomplete = createClaude(config(), async () => new Response(JSON.stringify({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'test',
    content: [{ type: 'text', text: JSON.stringify(cloneReview()) }],
    stop_reason: 'max_tokens', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 100 },
  }), { headers: { 'Content-Type': 'application/json' } }));
  await assert.rejects(() => incomplete.review(input, AbortSignal.timeout(2000)));
});

test('WAV duration is verified from PCM, not caller metadata', () => {
  assert.equal(validateWav(wav(28)), 28);
  assert.throws(() => validateWav(wav(28.1)), /between/);
  assert.throws(() => validateWav(wav(0.1)), /between/);
  const stereo = wav(); stereo.writeUInt16LE(2, 22); stereo.writeUInt32LE(64000, 28); stereo.writeUInt16LE(4, 32);
  assert.throws(() => validateWav(stereo), /mono 16kHz/);
  assert.throws(() => validateWav(wav().subarray(0, 100)), /valid WAV/);
});

test('Sarvam rejects RIFF-shaped corrupt playback and malformed or empty transcripts without leaking content', async () => {
  for (const buffer of [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(100)]), wav().subarray(0, 80)]) {
    const speech = createSarvam(config(), async () => Response.json({ audios: [buffer.toString('base64')] }));
    await assert.rejects(() => speech.speak({ text: 'Synthetic test', language: 'en-IN', voice: 'shubh_enhi_companion', pace: 1 }, AbortSignal.timeout(2000)), /invalid|corrupt/);
  }
  const secretDiagnostic = 'synthetic diagnostic that must not be surfaced';
  const speech = createSarvam(config(), async () => Response.json({ transcript: { secretDiagnostic } }));
  await assert.rejects(() => speech.transcribe(wav(), 'translate', AbortSignal.timeout(2000)), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /invalid transcript/);
    assert.ok(!error.message.includes(secretDiagnostic));
    return true;
  });
});

test('Sarvam surfaces quota, configuration, and cancellation without retries', async () => {
  for (const [status, message] of [[429, /quota/], [422, /configuration/], [403, /authentication/]] as const) {
    let calls = 0;
    const speech = createSarvam(config(), async () => { calls++; return new Response('private upstream text', { status }); });
    await assert.rejects(() => speech.transcribe(wav(), 'codemix', AbortSignal.timeout(2000)), message);
    assert.equal(calls, 1);
  }
  const controller = new AbortController();
  const speech = createSarvam(config(), async (_url, init) => {
    assert.equal(init?.signal, controller.signal);
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(() => speech.transcribe(wav(), 'codemix', controller.signal), /took too long/);
  assert.equal(controller.signal.aborted, true);
});

test('Sarvam uses current model, codemix or translate, and validates response audio', async () => {
  const requestedModes: string[] = [];
  const speech = createSarvam(config(), async (url, init) => {
    if (String(url).endsWith('/speech-to-text')) {
      assert.ok(init?.body instanceof FormData);
      assert.equal(init.body.get('model'), 'saaras:v4');
      assert.equal(init.body.get('language_code'), 'unknown');
      requestedModes.push(String(init.body.get('mode')));
      return Response.json({ transcript: 'हम basket reorder करना चाहते हैं', language_code: 'hi-IN' });
    }
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'bulbul:v4-flash');
    assert.equal(body.language_code, 'hi-IN');
    assert.equal(body.speaker, 'shubh_enhi_companion');
    assert.equal(body.enable_cached_responses, false);
    assert.equal(body.output_audio_codec, 'wav');
    assert.equal(body.speech_sample_rate, 22050);
    return Response.json({ audios: [wav().toString('base64'), wav(0.5).toString('base64')] });
  });

  assert.match((await speech.transcribe(wav(), 'codemix', AbortSignal.timeout(2000))).transcript, /basket/);
  await speech.transcribe(wav(), 'translate', AbortSignal.timeout(2000));
  assert.deepEqual(requestedModes, ['codemix', 'translate']);
  assert.equal((await speech.speak({ text: 'A test', language: 'hi-IN', voice: 'shubh_enhi_companion', pace: 1 }, AbortSignal.timeout(2000))).audios.length, 2);
  await assert.rejects(() => speech.speak({ text: 'A test', language: 'en-IN', voice: 'not-configured', pace: 1 }, AbortSignal.timeout(2000)), /configured voices/);
  const invalid = createSarvam(config(), async () => Response.json({ transcript: ' ' }));
  await assert.rejects(() => invalid.transcribe(wav(), 'codemix', AbortSignal.timeout(2000)), /invalid transcript/);
});

test('Hindi translation uses the documented model, automatic source detection, bounds and safe failures', async () => {
  let calls = 0;
  const speech = createSarvam(config(), async (url, init) => {
    calls++;
    assert.equal(String(url), 'https://api.sarvam.ai/translate');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      input: 'Buy evidence before building.', source_language_code: 'auto', target_language_code: 'hi-IN',
      model: 'mayura:v1', mode: 'formal', output_script: 'fully-native', numerals_format: 'international',
    });
    return Response.json({ translated_text: 'निर्माण से पहले प्रमाण जुटाएँ।', source_language_code: 'en-IN' });
  });
  assert.deepEqual(await speech.translate(' Buy evidence before building. ', AbortSignal.timeout(2000)), { text: 'निर्माण से पहले प्रमाण जुटाएँ।' });
  await assert.rejects(() => speech.translate('x'.repeat(1001), AbortSignal.timeout(2000)));
  assert.equal(calls, 1);
  const invalid = createSarvam(config(), async () => Response.json({ translated_text: ' ' }));
  await assert.rejects(() => invalid.translate('Synthetic example', AbortSignal.timeout(2000)), /invalid Hindi translation/);
  let failedCalls = 0;
  const quota = createSarvam(config(), async () => { failedCalls++; return new Response('private diagnostic', { status: 429 }); });
  await assert.rejects(() => quota.translate('Synthetic example', AbortSignal.timeout(2000)), /quota/);
  assert.equal(failedCalls, 1);
});
