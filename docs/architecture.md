# Architecture and invariants

## Boundaries

- `src/domain`: data contracts and pure rules. No UI, network or database access.
- `src/content`: original, explicitly scoped demo content and idempotent transactional seed.
- `src/db`: Dexie schema and runtime instance. No deletion/recreation recovery strategy.
- `src/services`: the transactional application boundary. Components must never settle HP, locks, mastery or rewards directly.
- `src/ui`: English child-facing shell. Chinese parental screens will be a separate route group with a local PIN gate.

The database and caches of the Delivery Test are not accessed. A repository subpath is not an origin boundary: separate names prevent accidental collisions, but other trusted apps on the same Pages origin are not security-isolated by their path.

## Routes

Currently rendered: `#/` and `#/words`. Planned: `#/learn`, `#/review`, `#/adventure`, `#/battle/:runId`, `#/parent`.

Hash routes avoid GitHub Pages server-side rewrite requirements. Manifest `id`, `scope`, `start_url`, icon paths and the Vite base are project-path-aware. A later, separately verified service worker must pre-cache the actual emitted chunks and audio, retain old caches during upgrades and never delete IndexedDB.

## Battle state machine

`preflight -> active -> won | lost -> mandatory review -> retry available -> new active run`

Preflight rejects practice mode and real challenges, checks the scope gate, validates HP and question binding/fingerprints, allocates all `8 + initialHp - 1` unique questions and saves the snapshot in one transaction. The first eight questions always cover meaning, context, listening/spelling and meaning/spelling for both core objectives.

Presentation persists exposure before returning a DTO without the answer or fingerprint. Effective submissions check run ID, question instance, run version, display state, assistance state and stable submission ID.

All relevant stores participate in the same IndexedDB read/write transaction. A valid answer appends raw answer and evidence, updates separate skill counts and HP, advances the question and, if terminal, creates the lock/tasks or unique reward and progress. Faults abort the whole transaction. UI effects must wait for the service promise to resolve successfully.

Primary answer IDs and a unique `[runId+settlementKey]` index enforce idempotency. Persisted run versions reject competing old tabs. A per-scope gate serializes starts and protects active/failure state across connections. The crystal ledger uses a unique chapter reward ID: repeated answers or repeated wins cannot mint another copy of the same crystal.

## Review state machine

`teaching-required -> teaching-open -> ready -> awaiting-answer -> passed | teaching-required`

No remaining unique retest: `ready -> exhausted`, with lock retained. Teaching must close before a retest can be displayed. Shown fingerprints are persisted before returning the prompt. Closing/reopening an in-flight task returns the same shown question, never marks it unseen.

Tasks are unique by failure run + objective + dimension. New retests match the same scoped word/objective/dimension and exclude previously shown content. Hints, exposed answers and wrong attempts require teaching again; none unlocks the task. All mandatory tasks must pass before the gate releases. Retry creates a new full-health snapshot with different content variants and retains the failed run and original raw answers.

The service never grants `Mastered` on battle victory or remediation. Cross-day evidence aggregation and spaced review scheduling will be implemented separately.

## Content identity

`qf1` is a canonical content string, not a probabilistic hash: it normalizes Unicode, case, punctuation, whitespace and option ordering; excludes IDs; and includes meaningful prompt, type, choices and answer. Therefore punctuation or choice reshuffling cannot manufacture unused content. Every word/objective binding is validated. Optional word-formation questions remain explicitly disabled until reviewed relationships and corresponding retests are added.

## Data/publication isolation

Every business store carries scope. Words are unique by scope + normalized spelling, preserving source associations and separate objectives. All batch-1 game services accept demo only. No real textbook data is included. Future parent imports and backup files remain local and are outside the source/published-asset allowlist.

No hard-coded PIN, user identity, telemetry, paid service, runtime API credential or remote learning-data endpoint is present.
