export const AUDIO_ASSETS: Record<string, { file: string; sha256: string }> = {
  'demo-audio:crystal': { file: 'audio/crystal.wav', sha256: '80948028aad4233bfbda442e8034085ac8f3d707f18c94c5b500d62c86364c79' },
  'demo-audio:happy': { file: 'audio/happy.wav', sha256: 'a2bba862767b404d0afd47130068ae2151823702d63a1a3bda6905e8d5bedf7e' },
};

export async function verifyAudio(bytes: ArrayBuffer, expectedHash: string): Promise<void> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('The pronunciation file did not pass its integrity check.');
  const view = new DataView(bytes);
  if (bytes.byteLength < 44 || view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57415645) {
    throw new Error('The pronunciation file is not a valid WAV resource.');
  }
}

const base = () => new URL(import.meta.env.BASE_URL, location.origin);
const cacheName = () => `wordquest-official-audio-v1:${base().pathname}`;

export async function pronunciationBlob(ref: string): Promise<Blob> {
  const asset = AUDIO_ASSETS[ref];
  if (!asset) throw new Error('This pronunciation is not available.');
  if (!('caches' in globalThis)) throw new Error('Offline pronunciation storage is not available in this browser.');
  const url = new URL(asset.file, base()).href;
  const cache = await caches.open(cacheName());
  let response = await cache.match(url);
  if (!response) {
    const downloaded = await fetch(url, { cache: 'no-store' });
    if (!downloaded.ok) throw new Error('The pronunciation could not be downloaded. Please reconnect and try again.');
    const bytes = await downloaded.arrayBuffer();
    await verifyAudio(bytes, asset.sha256);
    response = new Response(bytes, { headers: { 'Content-Type': 'audio/wav' } });
    await cache.put(url, response.clone());
  }
  const bytes = await response.arrayBuffer();
  await verifyAudio(bytes, asset.sha256);
  return new Blob([bytes], { type: 'audio/wav' });
}

export async function preparePronunciations(): Promise<void> {
  // Runs before the battle transaction. There is no network wait inside IndexedDB transactions.
  for (const ref of Object.keys(AUDIO_ASSETS)) {
    const blob = await pronunciationBlob(ref);
    const decoder = new OfflineAudioContext(1, 1, 22050);
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.2) throw new Error('The pronunciation is too short to use.');
  }
}
