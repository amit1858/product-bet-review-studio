export const RECORDING_LIMIT = 28;

export async function recordingToWav(blob: Blob): Promise<{ audio: Blob; trimmed: boolean }> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const length = Math.min(Math.ceil(decoded.duration * 16000), 16000 * RECORDING_LIMIT);
    if (length < 4000) throw new Error('That recording was too short. Speak for at least a second, or type your answer.');
    const offline = new OfflineAudioContext(1, length, 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => {
      const s = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    });
    return { audio: new Blob([buffer], { type: 'audio/wav' }), trimmed: decoded.duration > RECORDING_LIMIT };
  } finally { await context.close(); }
}

export function speechChunks(text: string, limit = 2400): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length) {
    if (remaining.length <= limit) { chunks.push(remaining); break; }
    const prefix = remaining.slice(0, limit);
    const breakAt = Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('. '), prefix.lastIndexOf(' '));
    let end = breakAt > limit / 2 ? breakAt + 1 : limit;
    const last = remaining.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks;
}
