import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIO_ASSETS, verifyAudio } from '../src/audio/pronunciation';

describe('bundled offline pronunciation resources', () => {
  it.each(Object.entries(AUDIO_ASSETS))('%s is an intact, nonempty WAV file', async (_ref, asset) => {
    const data = readFileSync(new URL(`../public/${asset.file}`, import.meta.url));
    const bytes = new Uint8Array(data).buffer;
    await expect(verifyAudio(bytes, asset.sha256)).resolves.toBeUndefined();
    expect(bytes.byteLength).toBeGreaterThan(10000);
  });
  it('rejects a damaged recording rather than using online TTS', async () => {
    await expect(verifyAudio(new Uint8Array(100).buffer, AUDIO_ASSETS['demo-audio:happy'].sha256)).rejects.toThrow('integrity');
  });
});
