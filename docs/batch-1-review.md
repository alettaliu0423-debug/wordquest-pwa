# Batch 1 review — 2026-11-02

Version: `0.1.0-batch.1`. New independent local Git repository on `main`; no commits, remote synchronization or deployment yet.

## Actual validation

- TypeScript: `npm run check` passed.
- Vitest: 2 test files, 64 tests passed (32 pure-rule/content cases and 32 database/service cases).
- Existing Chromium + Playwright: 9 scenarios passed against a local Vite server at a project subpath.
- Production build: `VITE_BASE_PATH=/wordquest-pwa/ npm run build` passed.
- Build fingerprint: `8b8b16e42c82773fcc4958584a9006721a61840a95d482d43ea7850cc1dad848`.

The browser scenarios verify English UI/Word Bank/hash-route refresh, portrait/landscape overflow, real IndexedDB transaction fault rollback, duplicate and stale cross-tab submissions, persisted fatal HP and dimension locks, teaching and partial-review gates, full-health retry with new contexts and unchanged history, unique victory reward without invented mastery/real progress, and actual browser-process restart with HP/question/history preserved.

The database tests cover strict settings, snapshots, HP 3/5/7/10 thresholds, eight-hit victory, the maximum-question boundary, assistance, content insufficiency, raw-answer retention, exposures, exhausted retests, all-task unlocking, scope/meaning isolation, content-seed rollback, reward/lock/evidence rollback and a failing schema upgrade without data loss.

No failure assertion was removed to pass the tests. An unused import and an impossible narrowed TypeScript comparison were corrected during implementation. After these changes and added rollback/reward cases, all 64 tests passed; browser validation and the production build then passed.

## Limits — not certified

- No GitHub Actions run has occurred for this separate project; only its build/test-only workflow has been authored.
- No interactive Battle, teaching/retest or parental screen is available yet. Core services are exercised directly in tests.
- Logical audio references exist, but audio assets are not bundled.
- Assistance permanently marks a battle instance; prevalidated replacement flow is pending before a UI can expose assistance.
- Manifest/base-path foundation exists; no service worker, full offline PWA, complete install icons, backup/restore or formal-project Huawei device acceptance has been completed.
- Fake IndexedDB migration tests do not establish target-device migration acceptance.

## Next batch

1. Integrate the transaction services with the independent Boss stage, both characters, HP, attack/hit feedback and full keyboard input. Persist before animation.
2. Bundle free, license-documented offline pronunciations; prevent any Listen & Spell challenge from starting without its actual audio resource.
3. Implement dimension-specific teaching/retest/retry UI, exhausted-content messaging and prevalidated assisted-instance replacement while retaining first-eight coverage.
4. Add Chinese PIN-protected parental settings and HP entry. Then implement complete backup/restore validation and PWA caching/update acceptance in subsequent batches.

This sequence preserves all remaining V2.0 requirements and does not start real textbook import or full-map development.

## GitHub setup after review

On GitHub, create a new independent public repository (suggested name `wordquest-pwa`) and initialize a README. Do not change any existing repository's visibility and do not reuse Delivery Test. Share the exact repository URL.

Before remote submission, review this batch's source-file list. Connector synchronization must explicitly exclude `.npm`, `node_modules`, `dist`, `test-results`, browser profiles, backups, private imports, credentials and all database files. Only original application/content, tests, config and docs may be sent. The existing CI workflow cannot deploy Pages. Pages publication remains a separate acceptance gate.
