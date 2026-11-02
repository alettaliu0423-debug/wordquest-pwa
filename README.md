# WordQuest: The Lost Crystal

Version `0.2.0-batch.2` — local review build. No GitHub synchronization or deployment has been performed for batch 2.

This project contains original demo code/content only. Never commit user records, parental PINs, database exports, private backups or licensed textbook content. It is independent of PWA Delivery Test and historical projects.

## Run locally

Requires Node 24.19 or later. All dependencies are free and open source.

```sh
npm ci
npm test
npm run check
npm run dev
```

Home opens a playable original Demo Boss challenge. Word Bank is available before a challenge. During a saved battle or independent check, answer-bearing routes and titles are protected. Spelling uses a full text keyboard; listening questions require completed playback of bundled local audio. Transactions persist before attack/hit feedback.

After defeat, Review Mistakes lists required meaning/context/spelling tasks. Read the teaching card, close it, then answer a different independent question. All tasks must pass before Retry Boss starts a new full-health run. Exhausted retest content retains the lock; there is no automatic pass or reset.

## Tests

```sh
npm run test:unit
npm run test:db
VITE_BASE_PATH=/wordquest-pwa/ npm run dev -- --port 4187 --strictPort
# In another terminal, using already available Python Playwright and Chromium:
python3 tests/browser_smoke.py
python3 tests/browser_interaction.py
python3 tests/browser_defect_regression.py
```

The browser scripts use new isolated profiles and only localhost. Learning/battle actions in `browser_interaction.py` use real UI controls; database reads are assertion-only. No real browser profile or learner data is used. Browser profiles/screenshots/reports stay in ignored `test-results/`.

## Production/offline build

```sh
VITE_BASE_PATH=/wordquest-pwa/ npm run build
python3 tests/browser_production.py
python3 tests/browser_crash_recovery.py
```

The production test starts its own local static server, verifies the actual build cache, stops that server, restarts Chromium and completes offline battle/review/retry interactions. For a future Pages repository, use `VITE_BASE_PATH=/YOUR-REPOSITORY-NAME/`; CI derives the repository path automatically. The generated service worker retains old caches and never deletes IndexedDB. No online TTS is used. See `docs/audio.md` for WAV provenance, checksums and license attribution.

## Data and remaining acceptance gates

Database: `wordquest-official-v1`, Dexie schema version 1. The 24 battle questions and 18 retests are original Demo content, not WW2 or RAZ material. Real challenges and practice mode remain explicitly rejected. Victories and remediation do not manufacture Mastered evidence. No remote learning-data synchronization is implemented.

Still pending: Chinese PIN-protected parental management/HP entry, parent content replenishment/import, full backup/restore, spaced/daily review scheduling, short story scenes, the wider adventure map and target Huawei acceptance. Optional word formation stays disabled until relationships and retests are reviewed. Formal battles provide no hint/answer-view control; assisted instances are archived and replaced transactionally with unused content, or safely paused if none remains.

The targeted fix review is in `docs/batch-2-fixes.md`. Review sessions are exclusive
across tasks and connections. Old pending checks without the new safety stamp are
invalidated with an audit trail and require teaching plus a fresh unused question.
Other windows do not automatically display teaching answers; a visible stale
card reports an exposure and invalidates affected pending checks.

Current local tests do not certify Huawei soft-keyboard behavior, speaker quality, standalone installation or long-term browser storage retention. The Delivery Test's device results do not certify this separate application.

## Publication boundary

The CI workflow tests/builds only: no Pages deployment action or `pages: write` permission is present. No deployment is authorized for this batch. Review the changes before any commit/synchronization. A future GitHub connector upload must use an explicit source-file allowlist; `.gitignore` alone does not protect API-based uploads.
