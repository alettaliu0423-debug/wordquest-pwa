# WordQuest: The Lost Crystal

Batch 1: independent project foundation, IndexedDB schema, transactional battle and mandatory-review rules.

This repository is intended for original demo code and content only. It must never contain user records, parental PINs, database exports, private backups or licensed textbook content. It is independent of the PWA Delivery Test and all historical projects.

## Local development

Requires Node 24.19 or later. All application dependencies are free and open source.

```sh
npm ci
npm test
npm run check
npm run dev
```

For a GitHub Pages project subpath:

```sh
VITE_BASE_PATH=/YOUR-REPOSITORY-NAME/ npm run build
```

The local browser stores data in `wordquest-official-v1`, database version 1. This name is different from the Delivery Test database. No network synchronization of learning data is implemented.

## Current review boundary

Implemented: React shell and original Word Bank, 24 battle questions, 18 independent retests, Dexie schema, strict HP validation, immutable battle snapshots, atomic answer/evidence/HP settlement, idempotency, stale-version rejection, defeat locks, dimension-specific teaching/retest transitions, fresh retry, scope separation and unique crystal awards.

Not yet ready for product acceptance: interactive battle UI, attack animations, bundled offline pronunciations, parental PIN/settings UI, complete review UI, backup/restore, offline service worker, installation icons, short stories and Huawei device acceptance. Audio references in this batch are logical content references; no pronunciation assets are bundled yet. Battle services are covered by tests; the public UI does not start a challenge until the teaching/audio/battle interface is complete.

Assisted battle answers never deal damage or advance a question. Their instance remains marked assisted. The next batch must provide a prevalidated replacement-question flow before exposing any assistance action. This batch exposes no battle hint or answer-view control.

Full spelling comparisons preserve letter order. Boundary spaces and letter case are normalized; internal spaces, missing letters and transpositions remain incorrect.

## Publication

No deployment is authorized by the current initialization batch. The CI workflow runs tests and builds only: it has no Pages deployment action or `pages: write` permission.

After reviewing this batch, create a new independent public GitHub repository with a README and share the exact repository URL. Synchronization must use an explicit source-file allowlist through the GitHub connector, never a blanket workspace upload. `.gitignore` alone does not protect API-based uploads.

See `docs/architecture.md`, `docs/requirements.md`, and `docs/migrations.md` for the rules and implementation boundaries.
