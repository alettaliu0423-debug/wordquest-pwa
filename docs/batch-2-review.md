# Batch 2 review — 2026-11-02

Version: `0.2.0-batch.2`. Baseline local commit: `cd1e035365e79a04f4444989cd9e2b33010519b5`. This batch is uncommitted and has not been synchronized or deployed.

This is the original batch-2 report. The subsequent independent review found a
cross-task teaching/retest defect and insufficient force-termination evidence.
Current fixes and corrected acceptance results are recorded in
`docs/batch-2-fixes.md`; the original results below remain historical evidence.

## Implemented

- Actual English Boss stage with explorer, guardian, persistent HP, required question types, correct/wrong attacks, immediate win/defeat and unique reward.
- Full keyboard spelling; case/boundary-space normalization only; auto-correction disabled. Listening must finish before submission. No formal hint or answer-view control.
- Required teaching, explicit card closure, new independent questions, wrong-answer reteaching, all-task retry gate and exhausted-content lock.
- Stable answer IDs, stale-tab rejection and transaction-before-animation. A failed save retains the form and causes no HP change or animation.
- Word Bank and historical-result navigation cannot reveal spelling answers during independent checks. Pending checks restore on first render without an answer-bearing task-list flash.
- Stable per-instance option shuffling; it does not create new fingerprints.
- Two bundled original-demo WAVs, local integrity/decoding preflight, project-scoped cached Blob playback and no online TTS fallback.
- Production build-aware service worker pre-caches all emitted files. No automatic cache/database deletion or clients.claim. Full offline UI recovery works after stopping the origin server and restarting the browser.
- Portrait touch targets and reduced-height input/submit/HP visibility checks.

## Actual tests

| Suite | Actual result |
| --- | --- |
| TypeScript | Passed |
| Unit/content/audio/option tests | 37 passed |
| Database/service tests | 34 passed |
| Original Chromium regressions | 9 passed |
| Real-control UI scenarios | 10 passed |
| Production/offline UI scenarios | 5 passed |
| Project-subpath production build | Passed |

The original 64 tests and the original browser regression script were retained without assertion changes. The new UI tests change learning/game state only through actual controls. Native IndexedDB reads supply assertions/oracles, not shortcuts for completion. Fault injection is limited to an isolated profile.

The production test stops the actual local origin server, closes/relaunches Chromium, restores exact battle state offline, plays cached WAVs, loses a battle offline, teaches and opens an independent check offline, restarts again with that same pending question and lock, completes required checks and starts a fresh full-health retry without restoring the server.

During test development, a reader initially confused Dexie's logical V1 with native IndexedDB's numeric version and was corrected to open the existing database without a version argument. No app data was reset. A route/first-render review found answer-flash risks; the UI was corrected and the DOM-observer and routing tests passed afterward.

Build shell ID: `44b48f4014e58cb232f6`.

Aggregate build fingerprint: `514461cb9e529dedfaf074ddd08a7e6bd398494d4fbac84e7e637be281ac01e7`.

## Evidence

Ignored local artifacts: `test-results/browser-report.json`, `interaction-report.json`, `production-browser-report.json`, `build-report.json` and `batch2-*.png`. Screenshots show the actual battle, portrait layout, teaching card, hidden-answer independent check, victory, exhausted review and offline pending check. Browser profiles and database files are excluded from source synchronization.

Reproduce using README's localhost commands and existing Chromium/Python Playwright. No paid API, human voice service, hosted database or new npm dependency was introduced.

## Not completed or not verified

- No formal-project Huawei device, physical soft keyboard, audio intelligibility/speaker or standalone installation acceptance has occurred.
- Formal multi-version PWA upgrades and long-term storage retention require separate acceptance; old caches are retained rather than automatically pruned.
- Chinese parental PIN/HP-entry management, parent question replenishment, backup/restore, real library import, daily/spaced review, short story scenes and the full adventure map remain future work.
- Already-assisted legacy battle-instance replacement remains unavailable; the formal interface exposes no assistance action and never awards such an instance an independent attack.
- No GitHub synchronization, Actions execution, Pages publication or external-site change occurred in batch 2.

No database schema or original demo-content migration was needed; schema V1, original IDs/fingerprints and raw history remain intact. Core V2.0 requirements are not removed or replaced with test-only claims.
