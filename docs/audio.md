# Offline demo pronunciations

The only words are original demo targets `crystal` and `happy`. No textbook audio or third-party human recording is included.

Both PCM WAV assets were synthesized locally with the existing FFmpeg `flite` filter, voice `slt`. No online TTS, paid API, new runtime dependency or subscription is required. Playback uses standard browser audio. The engine binary is not distributed with the application.

Generation commands (do not overwrite existing files):

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i 'flite=text=crystal:voice=slt' -ar 22050 -ac 1 -c:a pcm_s16le -n public/audio/crystal.wav
ffmpeg -hide_banner -loglevel error -f lavfi -i 'flite=text=happy:voice=slt' -ar 22050 -ac 1 -c:a pcm_s16le -n public/audio/happy.wav
```

| File | Bytes | Duration | SHA-256 |
| --- | ---: | ---: | --- |
| crystal.wav | 45942 | 1.040 seconds | 80948028aad4233bfbda442e8034085ac8f3d707f18c94c5b500d62c86364c79 |
| happy.wav | 38446 | 0.870 seconds | a2bba862767b404d0afd47130068ae2151823702d63a1a3bda6905e8d5bedf7e |

CMU Flite project: http://cmuflite.org/ . The engine's permissive license notice is retained in `public/audio/LICENSE.txt`. This notice attributes the speech engine; it does not imply endorsement.

Before a UI-started challenge, the injected asset preflight verifies both files' SHA-256 hashes, WAV headers and browser decoding. Integrity-checked resources are retained in a project-path-scoped CacheStorage cache. Later playback reads a local Blob URL; it does not call speechSynthesis or an online TTS endpoint. Listening questions require the audio `ended` event before submission is enabled. A playback failure does not settle a question or damage either fighter.

The production build additionally pre-caches the actual emitted application chunks, manifest, icon and audio through a generated project-scoped service worker. Old shell and pronunciation caches are not deleted on activation. Same-build checks reuse their existing cache names; distinct future builds retain resources until a separately approved cleanup policy is implemented.

Automated decoding and playback-event tests do not constitute a human pronunciation-quality or Huawei-speaker acceptance test. Those checks remain explicit device acceptance items.

## Voice-specific license verification — 2026-11-02

Installed synthesis packages: `libflite1 2.2-7` and `ffmpeg 7:7.1.5-0+deb13u1`.
The two WAVs were not regenerated during this verification.

Official Flite tag `v2.2` was checked for the **slt voice**, not just the engine:

- `lang/cmu_us_slt/cmu_us_slt.c` identifies `slt` / `cmu_us_slt` and carries
  the CMU 1999–2007 permissive use and distribution notice.
- Its Makefile identifies the voice's model sources and `flite_cmu_us_slt` library.
- `COPYING` licenses all distribution files except its listed exceptions; the slt
  directory is not an exception. Use, modification and distribution are permitted
  without fees, including commercial use.
- Local Debian copyright documentation agrees with that distribution license.
  No engine/model binary or third-party human recording is shipped.

Exact retrieved texts, URLs, time and SHA-256 records are retained in
`docs/license-evidence/`. Voice-specific attribution was added to the shipped
`public/audio/LICENSE.txt`. Both WAV hashes remain unchanged. This completes the
technical license-source check for these locally synthesized demo assets; human
pronunciation-quality and Huawei-speaker acceptance remain pending.

The initial restricted-shell request could not reach the proxy. The supported
permission escalation allowed official-source access through the inherited proxy.
No proxy, CA, route or network configuration was changed.
