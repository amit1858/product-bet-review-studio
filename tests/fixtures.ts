import { readConfig } from '../server/config';
import { sampleContext, sampleIdea, sampleReview } from '../src/sample';

export const config = () => readConfig({
  APP_ORIGIN: 'http://localhost:3000', ANTHROPIC_API_KEY: 'test-placeholder', SARVAM_API_KEY: 'test-placeholder',
});
export const input = { idea: sampleIdea, context: sampleContext, answers: [] };
export const cloneReview = () => structuredClone(sampleReview);

export function wav(seconds = 1): Buffer {
  const length = Math.round(16000 * seconds);
  const buffer = Buffer.alloc(44 + length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 16000) * 1000), 44 + i * 2);
  return buffer;
}
